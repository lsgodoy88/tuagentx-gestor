import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ahoraBogota, fechaBogotaStr, inicioDiaBogota, finDiaBogota } from '@/lib/fecha'

function horaEnMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}

export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get('x-cron-secret')
  const esCron = cronSecret && cronSecret === process.env.CRON_SECRET

  let empresaIdFiltro: string | null = null
  let esSesionEmpresa = false

  if (!esCron) {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (user.role !== 'empresa' && user.role !== 'superadmin') {
      return NextResponse.json({ error: 'Solo empresa puede ejecutar esto' }, { status: 403 })
    }
    if (user.role === 'empresa') {
      empresaIdFiltro = user.id
      esSesionEmpresa = true
    }
  }

  const empresas: Array<{ id: string; horaInicioRuta: string; horaFinRuta: string; autoCrearRuta: boolean; autoCerrarRuta: boolean }> = empresaIdFiltro
    ? await prisma.$queryRaw`SELECT id, "horaInicioRuta", "horaFinRuta", "autoCrearRuta", "autoCerrarRuta" FROM gestor."Empresa" WHERE activo = true AND id = ${empresaIdFiltro}`
    : await prisma.$queryRaw`SELECT id, "horaInicioRuta", "horaFinRuta", "autoCrearRuta", "autoCerrarRuta" FROM gestor."Empresa" WHERE activo = true`

  const ahoraBog = ahoraBogota()
  const horaActualMin = ahoraBog.getHours() * 60 + ahoraBog.getMinutes()
  const hoyStr = fechaBogotaStr()
  const ayerStr = fechaBogotaStr(new Date(ahoraBog.getTime() - 24 * 60 * 60 * 1000))

  let procesadas = 0, rutasCreadas = 0, rutasCerradas = 0, rezagosMigrados = 0

  for (const empresa of empresas) {
    const inicioMin = horaEnMinutos(empresa.horaInicioRuta)
    const finMin = horaEnMinutos(empresa.horaFinRuta)

    // ── CIERRE ──────────────────────────────────────────────────────────────
    // Incluye rutas de días anteriores sin cerrar (huérfanas por fallos de cron)
    if (!esSesionEmpresa && horaActualMin >= finMin && empresa.autoCerrarRuta) {
      const rutasHoy = await prisma.ruta.findMany({
        where: { empresaId: empresa.id, cerrada: false, fecha: { lte: finDiaBogota(hoyStr) } },
        include: { empleados: { select: { empleadoId: true } }, clientes: { select: { clienteId: true, rutaId: true } } }
      })

      if (rutasHoy.length > 0) {
        // Sacar todas las visitas del día para TODAS las rutas de una vez — no en loop
        const todosEmpIds = [...new Set(rutasHoy.flatMap(r => r.empleados.map((e: any) => e.empleadoId)))]
        const todosCliIds = [...new Set(rutasHoy.flatMap(r => r.clientes.map((c: any) => c.clienteId)))]

        const visitasHoy = await prisma.visita.findMany({
          where: {
            empleadoId: { in: todosEmpIds },
            clienteId: { in: todosCliIds },
            fechaBogota: { gte: inicioDiaBogota(hoyStr), lte: finDiaBogota(hoyStr) }
          },
          select: { clienteId: true }
        })
        const visitadosSet = new Set(visitasHoy.map((v: any) => v.clienteId))

        // Una transacción por ruta (atómica), pero visitas ya cargadas en memoria
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

    // ── APERTURA ─────────────────────────────────────────────────────────────
    if (esSesionEmpresa || (horaActualMin >= inicioMin && horaActualMin < inicioMin + 60 && empresa.autoCrearRuta)) {
      const empleados = await prisma.empleado.findMany({
        where: { empresaId: empresa.id, activo: true, rol: 'entregas' }
      })

      if (empleados.length === 0) { procesadas++; continue }

      // Cargar rutas de hoy y de ayer para TODOS los empleados en 2 queries
      const empIds = empleados.map(e => e.id)

      const [rutasHoyTodos, rutasAyerTodos] = await Promise.all([
        prisma.ruta.findMany({
          where: { empresaId: empresa.id, fecha: { gte: inicioDiaBogota(hoyStr), lte: finDiaBogota(hoyStr) }, empleados: { some: { empleadoId: { in: empIds } } } },
          include: { empleados: { select: { empleadoId: true } } }
        }),
        prisma.ruta.findMany({
          where: { empresaId: empresa.id, fecha: { gte: inicioDiaBogota(ayerStr), lte: finDiaBogota(ayerStr) }, empleados: { some: { empleadoId: { in: empIds } } } },
          include: { empleados: { select: { empleadoId: true } }, clientes: { where: { rezago: true }, orderBy: { orden: 'asc' } } }
        })
      ])

      // Mapas en memoria — sin queries en el loop por empleado
      const tieneRutaHoy = new Set(rutasHoyTodos.flatMap(r => r.empleados.map((e: any) => e.empleadoId)))
      const rezagosPorEmp: Record<string, any[]> = {}
      for (const r of rutasAyerTodos) {
        for (const re of r.empleados) {
          if (!rezagosPorEmp[re.empleadoId]) rezagosPorEmp[re.empleadoId] = []
          rezagosPorEmp[re.empleadoId].push(...r.clientes)
        }
      }

      // Cargar nombres de rutas existentes de hoy — para resolver colisiones sin queries en loop
      const nombresExistentes = new Set(
        (await prisma.ruta.findMany({
          where: { empresaId: empresa.id, fecha: { gte: inicioDiaBogota(hoyStr), lte: finDiaBogota(hoyStr) } },
          select: { nombre: true }
        })).map(r => r.nombre)
      )

      const dd = String(ahoraBog.getDate()).padStart(2, '0')
      const mm = String(ahoraBog.getMonth() + 1).padStart(2, '0')
      const yyyy = ahoraBog.getFullYear()

      for (const emp of empleados) {
        if (tieneRutaHoy.has(emp.id)) continue

        const rezagos = rezagosPorEmp[emp.id] || []
        const nombreBase = `${emp.nombre}-${dd}-${mm}-${yyyy}`

        // Resolver nombre único en memoria — sin queries en loop, cap de seguridad en 20
        let nombreFinal = nombreBase
        let contador = 1
        while (nombresExistentes.has(nombreFinal) && contador <= 20) {
          nombreFinal = `${nombreBase} (${contador++})`
        }
        nombresExistentes.add(nombreFinal) // reservar para los siguientes empleados

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

  // ── SyncLog ──────────────────────────────────────────────────────────────
  try {
    await prisma.syncLog.create({
      data: {
        inicio: new Date(),
        fin: new Date(),
        tipo: 'rutas-dia',
        estado: 'ok',
        disparadoPor: esCron ? 'cron' : 'manual',
        empresaId: empresaIdFiltro ?? undefined,
      },
    })
  } catch {}

  return NextResponse.json({ ok: true, procesadas, rutasCreadas, rutasCerradas, rezagosMigrados })
}
