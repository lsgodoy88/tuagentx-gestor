/**
 * getOrCreateRutaHoy — fuente única para obtener/crear la ruta del repartidor
 *
 * Lógica posible_entrega:
 *  - Ruta HOY no iniciada → posible_entrega = hoy
 *  - Ruta HOY iniciada    → busca/crea ruta MAÑANA → posible_entrega = mañana
 *  - Sin ruta hoy         → crea ruta HOY → posible_entrega = hoy
 */

import { prisma } from '@/lib/prisma'
import { nowBogota, fechaBogotaStr, inicioDiaBogota, finDiaBogota } from '@/lib/fechas'

export async function getOrCreateRutaHoy(
  empleadoId: string,
  empresaId: string
): Promise<{ rutaId: string; posible_entrega: Date }> {
  const ahoraBog = nowBogota()
  const hoyStr   = fechaBogotaStr(ahoraBog)
  const hoyInicio = inicioDiaBogota(ahoraBog)
  const mananaInicio = finDiaBogota(ahoraBog)   // 00:00 mañana Bogotá
  const pasadoInicio = finDiaBogota(new Date(ahoraBog.getTime() + 24 * 60 * 60 * 1000))

  // 1. Buscar ruta HOY del empleado
  const rutaHoyLink = await prisma.rutaEmpleado.findFirst({
    where: {
      empleadoId,
      ruta: { cerrada: false, empresaId, fecha: { gte: hoyInicio, lt: mananaInicio } }
    },
    select: { rutaId: true, ruta: { select: { iniciada: true } } }
  })

  // Ruta HOY existe y NO iniciada → orden cae aquí
  if (rutaHoyLink && !rutaHoyLink.ruta.iniciada) {
    return { rutaId: rutaHoyLink.rutaId, posible_entrega: hoyInicio }
  }

  // Ruta HOY iniciada → orden cae en ruta MAÑANA
  if (rutaHoyLink && rutaHoyLink.ruta.iniciada) {
    const rutaMañanaLink = await prisma.rutaEmpleado.findFirst({
      where: {
        empleadoId,
        ruta: { cerrada: false, empresaId, fecha: { gte: mananaInicio, lt: pasadoInicio } }
      },
      select: { rutaId: true }
    })
    if (rutaMañanaLink) {
      return { rutaId: rutaMañanaLink.rutaId, posible_entrega: mananaInicio }
    }
    // Crear ruta MAÑANA
    const empleado = await prisma.empleado.findUnique({ where: { id: empleadoId }, select: { nombre: true } })
    const mañana = new Date(ahoraBog)
    mañana.setDate(mañana.getDate() + 1)
    const dd = String(mañana.getDate()).padStart(2, '0')
    const mm = String(mañana.getMonth() + 1).padStart(2, '0')
    const yyyy = mañana.getFullYear()
    const nuevaRuta = await prisma.ruta.create({
      data: {
        nombre: `${empleado?.nombre || 'Repartidor'}-${dd}-${mm}-${yyyy}`,
        fecha: mananaInicio,
        empresaId,
        empleados: { create: [{ empleadoId }] }
      },
      select: { id: true }
    })
    return { rutaId: nuevaRuta.id, posible_entrega: mananaInicio }
  }

  // Sin ruta HOY → crear
  // Anti-race: segundo check
  const rutaRace = await prisma.rutaEmpleado.findFirst({
    where: {
      empleadoId,
      ruta: { cerrada: false, empresaId, fecha: { gte: hoyInicio, lt: mananaInicio } }
    },
    select: { rutaId: true }
  })
  if (rutaRace) return { rutaId: rutaRace.rutaId, posible_entrega: hoyInicio }

  const empleado = await prisma.empleado.findUnique({ where: { id: empleadoId }, select: { nombre: true } })
  const dd = String(ahoraBog.getDate()).padStart(2, '0')
  const mm = String(ahoraBog.getMonth() + 1).padStart(2, '0')
  const yyyy = ahoraBog.getFullYear()

  // Nombres únicos
  const nombresExistentes = await prisma.ruta.findMany({
    where: { empresaId, fecha: { gte: hoyInicio, lt: mananaInicio } },
    select: { nombre: true }
  })
  const nombresSet = new Set(nombresExistentes.map((r: any) => r.nombre))
  const nombreBase = `${empleado?.nombre || 'Repartidor'}-${dd}-${mm}-${yyyy}`
  let nombreFinal = nombreBase
  let contador = 1
  while (nombresSet.has(nombreFinal) && contador <= 20) {
    nombreFinal = `${nombreBase} (${contador++})`
  }

  const nuevaRuta = await prisma.ruta.create({
    data: {
      nombre: nombreFinal,
      fecha: hoyInicio,
      empresaId,
      empleados: { create: [{ empleadoId }] }
    },
    select: { id: true }
  })
  return { rutaId: nuevaRuta.id, posible_entrega: hoyInicio }
}
