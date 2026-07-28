/**
 * getOrCreateRutaHoy — fuente única de verdad para obtener/crear la ruta del día
 * de un empleado (rol: entregas).
 *
 * Fixes v2:
 *  - ayerStr calculado en zona Bogotá (no UTC)
 *  - inicioDiaBogota/finDiaBogota para ayer usa fecha string, no resta ms
 *  - Race condition mitigada: segundo findFirst antes de crear
 *  - No acepta tx (incompatibilidad de tipos Prisma) — siempre corre fuera de tx
 *    El llamador en bodega acepta esto: la ruta es idempotente y no es core financiero
 */

import { prisma } from '@/lib/prisma'
import { nowBogota, fechaBogotaStr, inicioDiaBogota, finDiaBogota, haceNDiasBogota } from '@/lib/fechas'

export async function getOrCreateRutaHoy(
  empleadoId: string,
  empresaId: string
): Promise<string> {
  const ahoraBog = nowBogota()
  const hoyStr = fechaBogotaStr(ahoraBog)
  const hoyInicio = inicioDiaBogota(ahoraBog)           // fecha hoy 00:00 Bogotá = 05:00 UTC
  const mananaInicio = finDiaBogota(ahoraBog)            // fecha mañana 00:00 Bogotá

  // 1. Buscar ruta abierta de HOY
  const rutaExistente = await prisma.rutaEmpleado.findFirst({
    where: {
      empleadoId,
      ruta: { cerrada: false, empresaId, fecha: { gte: hoyInicio, lt: mananaInicio } }
    },
    select: { rutaId: true }
  })
  if (rutaExistente) return rutaExistente.rutaId

  // 2. Datos del empleado
  const empleado = await prisma.empleado.findUnique({
    where: { id: empleadoId },
    select: { nombre: true }
  })

  // 3. Rezagos del día anterior
  const ayerDate = haceNDiasBogota(1)
  const rutasAyer = await prisma.ruta.findMany({
    where: {
      empresaId,
      fecha: { gte: inicioDiaBogota(ayerDate), lte: finDiaBogota(ayerDate) },
      empleados: { some: { empleadoId } }
    },
    include: { clientes: { where: { rezago: true }, orderBy: { orden: 'asc' } } }
  })
  const rezagos = rutasAyer.flatMap(r => r.clientes)

  // 4. Nombre único del día
  const dd = String(ahoraBog.getDate()).padStart(2, '0')
  const mm = String(ahoraBog.getMonth() + 1).padStart(2, '0')
  const yyyy = ahoraBog.getFullYear()
  const nombreBase = `${empleado?.nombre || 'Repartidor'}-${dd}-${mm}-${yyyy}`

  const nombresExistentes = await prisma.ruta.findMany({
    where: { empresaId, fecha: { gte: hoyInicio, lt: mananaInicio } },
    select: { nombre: true }
  })
  const nombresSet = new Set(nombresExistentes.map(r => r.nombre))
  let nombreFinal = nombreBase
  let contador = 1
  while (nombresSet.has(nombreFinal) && contador <= 20) {
    nombreFinal = `${nombreBase} (${contador++})`
  }

  // 5. Guardia anti-race: segundo check justo antes de crear
  const rutaRace = await prisma.rutaEmpleado.findFirst({
    where: {
      empleadoId,
      ruta: { cerrada: false, empresaId, fecha: { gte: hoyInicio, lt: mananaInicio } }
    },
    select: { rutaId: true }
  })
  if (rutaRace) return rutaRace.rutaId

  // 6. Crear ruta — IDs por Prisma (cuid)
  const nuevaRuta = await prisma.ruta.create({
    data: {
      nombre: nombreFinal,
      fecha: hoyInicio,
      empresaId,
      empleados: { create: [{ empleadoId }] },
      clientes: {
        create: rezagos.map((rc, i) => ({
          clienteId: rc.clienteId,
          orden: i,
          rezago: true
        }))
      }
    },
    select: { id: true }
  })

  return nuevaRuta.id
}
