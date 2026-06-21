/**
 * rutas-dia — lógica extraída de:
 *   /api/rutas/procesar-dia/route.ts   → runRutasDia()
 *   /api/turnos/procesar-dia/route.ts  → runTurnosDia()
 *
 * Sin dependencia de gestor HTTP — accede directo a BD
 * Usada por: workers/index.ts (rutas-dia, cerrar-rutas)
 *            /api/rutas/procesar-dia/route.ts
 *            /api/turnos/procesar-dia/route.ts
 */
import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { Prisma } from '@/app/generated/prisma'
import { nowBogota as ahoraBogota, fechaBogotaStr, inicioDiaBogota, finDiaBogota } from '@/lib/fechas'
import { audit } from '@/lib/audit'

function horaEnMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}

// ── runRutasDia — abre y cierra rutas de entrega ─────────────────────────────
export async function runRutasDia(empresaIdFiltro?: string | null, forzar = false): Promise<{
  procesadas: number
  rutasCreadas: number
  rutasCerradas: number
  rezagosMigrados: number
}> {
  const empresas: Array<{
    id: string
    horaInicioRuta: string
    horaFinRuta: string
    autoCrearRuta: boolean
    autoCerrarRuta: boolean
  }> = empresaIdFiltro
    ? await prisma.$queryRaw`SELECT id, "horaInicioRuta", "horaFinRuta", "autoCrearRuta", "autoCerrarRuta" FROM ${Prisma.raw(DB_SCHEMA)}."Empresa" WHERE activo = true AND id = ${empresaIdFiltro}`
    : await prisma.$queryRaw`SELECT id, "horaInicioRuta", "horaFinRuta", "autoCrearRuta", "autoCerrarRuta" FROM ${Prisma.raw(DB_SCHEMA)}."Empresa" WHERE activo = true`

  const ahoraBog = ahoraBogota()
  const horaActualMin = ahoraBog.getHours() * 60 + ahoraBog.getMinutes()
  const ayerDate = new Date(ahoraBog.getTime() - 24 * 60 * 60 * 1000)
  const hoyStr = fechaBogotaStr(ahoraBog)
  const ayerStr = fechaBogotaStr(ayerDate)

  let procesadas = 0, rutasCreadas = 0, rutasCerradas = 0, rezagosMigrados = 0

  for (const empresa of empresas) {
    const inicioMin = horaEnMinutos(empresa.horaInicioRuta)
    const finMin = horaEnMinutos(empresa.horaFinRuta)

    // ── CIERRE ────────────────────────────────────────────────────────────
    if (!empresaIdFiltro && horaActualMin >= finMin && empresa.autoCerrarRuta) {
      const rutasHoy = await prisma.ruta.findMany({
        where: { empresaId: empresa.id, cerrada: false, fecha: { lte: finDiaBogota(ahoraBog) } },
        include: { empleados: { select: { empleadoId: true } }, clientes: { select: { clienteId: true, rutaId: true } } }
      })

      if (rutasHoy.length > 0) {
        const todosEmpIds = [...new Set(rutasHoy.flatMap(r => r.empleados.map((e: any) => e.empleadoId)))]
        const todosCliIds = [...new Set(rutasHoy.flatMap(r => r.clientes.map((c: any) => c.clienteId)))]

        const visitasHoy = await prisma.visita.findMany({
          where: { empleadoId: { in: todosEmpIds }, clienteId: { in: todosCliIds }, fechaBogota: { gte: inicioDiaBogota(ahoraBog), lte: finDiaBogota(ahoraBog) } },
          select: { clienteId: true }
        })
        const visitadosSet = new Set(visitasHoy.map((v: any) => v.clienteId))

        for (const ruta of rutasHoy) {
          const sinVisita = ruta.clientes
            .filter((rc: any) => !visitadosSet.has(rc.clienteId))
            .map((rc: any) => rc.clienteId)

          await prisma.$transaction([
            ...(sinVisita.length > 0 ? [prisma.rutaCliente.updateMany({
              where: { rutaId: ruta.id, clienteId: { in: sinVisita } },
              data: { rezago: true }
            })] : []),
            prisma.ruta.update({ where: { id: ruta.id }, data: { cerrada: true, cerradaEl: new Date() } })
          ])
          rutasCerradas++
        }
      }
    }

    // ── APERTURA ──────────────────────────────────────────────────────────
    if (forzar || empresaIdFiltro || (horaActualMin >= inicioMin && horaActualMin < inicioMin + 60 && empresa.autoCrearRuta)) {
      const empleados = await prisma.empleado.findMany({
        where: { empresaId: empresa.id, activo: true, rol: 'entregas' }
      })

      if (empleados.length === 0) { procesadas++; continue }

      const empIds = empleados.map(e => e.id)

      const [rutasHoyTodos, rutasAyerTodos] = await Promise.all([
        prisma.ruta.findMany({
          where: { empresaId: empresa.id, fecha: { gte: inicioDiaBogota(ahoraBog), lte: finDiaBogota(ahoraBog) }, empleados: { some: { empleadoId: { in: empIds } } } },
          include: { empleados: { select: { empleadoId: true } } }
        }),
        prisma.ruta.findMany({
          where: { empresaId: empresa.id, fecha: { gte: inicioDiaBogota(ayerDate), lte: finDiaBogota(ayerDate) }, empleados: { some: { empleadoId: { in: empIds } } } },
          include: { empleados: { select: { empleadoId: true } }, clientes: { where: { rezago: true }, orderBy: { orden: 'asc' } } }
        })
      ])

      const tieneRutaHoy = new Set(rutasHoyTodos.flatMap(r => r.empleados.map((e: any) => e.empleadoId)))
      const rezagosPorEmp: Record<string, any[]> = {}
      for (const r of rutasAyerTodos) {
        for (const re of r.empleados) {
          if (!rezagosPorEmp[re.empleadoId]) rezagosPorEmp[re.empleadoId] = []
          rezagosPorEmp[re.empleadoId].push(...r.clientes)
        }
      }

      const nombresExistentes = new Set(
        (await prisma.ruta.findMany({
          where: { empresaId: empresa.id, fecha: { gte: inicioDiaBogota(ahoraBog), lte: finDiaBogota(ahoraBog) } },
          select: { nombre: true }
        })).map(r => r.nombre)
      )

      const ahoraBog2 = ahoraBogota()
      const dd = String(ahoraBog2.getDate()).padStart(2, '0')
      const mm = String(ahoraBog2.getMonth() + 1).padStart(2, '0')
      const yyyy = ahoraBog2.getFullYear()

      for (const emp of empleados) {
        if (tieneRutaHoy.has(emp.id)) continue

        const rezagos = rezagosPorEmp[emp.id] || []
        const nombreBase = `${emp.nombre}-${dd}-${mm}-${yyyy}`
        let nombreFinal = nombreBase
        let contador = 1
        while (nombresExistentes.has(nombreFinal) && contador <= 20) {
          nombreFinal = `${nombreBase} (${contador++})`
        }
        nombresExistentes.add(nombreFinal)

        await prisma.ruta.create({
          data: {
            id: crypto.randomUUID(),
            nombre: nombreFinal,
            fecha: new Date(hoyStr + 'T05:00:00.000Z'),
            empresaId: empresa.id,
            empleados: { create: [{ id: crypto.randomUUID(), empleadoId: emp.id }] },
            clientes: {
              create: rezagos.map((rc: any, i: number) => ({
                id: crypto.randomUUID(),
                clienteId: rc.clienteId,
                orden: i,
                rezago: true
              }))
            }
          }
        })
        rutasCreadas++
        rezagosMigrados += rezagos.length
      }
    }
    procesadas++
  }

  try {
    await prisma.syncLog.create({
      data: { inicio: new Date(), fin: new Date(), tipo: 'rutas-dia', estado: 'ok', disparadoPor: 'cron', empresaId: empresaIdFiltro ?? undefined }
    })
  } catch {}

  return { procesadas, rutasCreadas, rutasCerradas, rezagosMigrados }
}

// ── runTurnosDia — abre y cierra turnos de vendedores/supervisores ───────────
export async function runTurnosDia(forzar = false): Promise<{
  empresasProcesadas: number
  turnosAbiertos: number
  turnosCerrados: number
}> {
  const empresas: Array<{
    id: string
    horaInicioRuta: string
    horaFinRuta: string
    autoAbrirTurno: boolean
    autoCerrarTurno: boolean
    diasCrearRuta: string
    diasCerrarRuta: string
  }> = await prisma.$queryRaw`
    SELECT id, "horaInicioRuta", "horaFinRuta",
           "autoAbrirTurno", "autoCerrarTurno",
           "diasCrearRuta", "diasCerrarRuta"
    FROM ${Prisma.raw(DB_SCHEMA)}."Empresa"
    WHERE activo = true
      AND ("autoAbrirTurno" = true OR "autoCerrarTurno" = true)`

  const nowBog = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }))
  const horaActMin = nowBog.getHours() * 60 + nowBog.getMinutes()
  const diaSemana = nowBog.getDay()

  let turnosAbiertos = 0, turnosCerrados = 0, empresasProcesadas = 0

  for (const empresa of empresas) {
    const inicioMin = horaEnMinutos(empresa.horaInicioRuta)
    const finMin = horaEnMinutos(empresa.horaFinRuta)
    const diasAbrir = empresa.diasCrearRuta.split(',').map(Number)
    const diasCerrar = empresa.diasCerrarRuta.split(',').map(Number)

    const empleados = await prisma.empleado.findMany({
      where: { empresaId: empresa.id, activo: true, rol: { in: ['vendedor', 'supervisor'] } },
      select: { id: true, nombre: true, email: true }
    })

    if (empleados.length === 0) { empresasProcesadas++; continue }

    const empIds = empleados.map(e => e.id)

    // APERTURA
    if (empresa.autoAbrirTurno && (forzar || (diasAbrir.includes(diaSemana) && horaActMin >= inicioMin && horaActMin < inicioMin + 60))) {
      const conTurnoActivo = await prisma.turno.findMany({
        where: { empleadoId: { in: empIds }, activo: true },
        select: { empleadoId: true }
      })
      const yaAbiertos = new Set(conTurnoActivo.map(t => t.empleadoId))

      for (const emp of empleados) {
        if (yaAbiertos.has(emp.id)) continue
        await prisma.$transaction(async (tx) => {
          await tx.turno.updateMany({
            where: { empleadoId: emp.id, activo: true },
            data: { activo: false, fin: new Date(), finBogota: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Bogota' }) }
          })
          await tx.turno.create({
            data: { id: crypto.randomUUID(), empleadoId: emp.id, inicio: new Date(), inicioBogota: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Bogota' }), activo: true }
          })
        })
        await audit('TURNO_AUTO_ABIERTO', emp.email, `Apertura automatica hora=${empresa.horaInicioRuta}`, emp.id, empresa.id)
        turnosAbiertos++
      }
    }

    // CIERRE
    if (empresa.autoCerrarTurno && diasCerrar.includes(diaSemana) && horaActMin >= finMin) {
      const turnosActivos = await prisma.turno.findMany({
        where: { empleadoId: { in: empIds }, activo: true },
        select: { id: true, empleadoId: true }
      })

      for (const turno of turnosActivos) {
        await prisma.turno.update({
          where: { id: turno.id },
          data: { activo: false, fin: new Date(), finBogota: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Bogota' }) }
        })
        const emp = empleados.find(e => e.id === turno.empleadoId)
        await audit('TURNO_AUTO_CERRADO', emp?.email ?? turno.empleadoId, `Cierre automatico hora=${empresa.horaFinRuta}`, turno.empleadoId, empresa.id)
        turnosCerrados++
      }
    }

    empresasProcesadas++
  }

  return { empresasProcesadas, turnosAbiertos, turnosCerrados }
}
