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
  // Auth: sesión empresa O x-cron-secret
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

  // Obtener empresas activas con sus horarios y flags de automatización
  const empresas: Array<{ id: string; horaInicioRuta: string; horaFinRuta: string; autoCrearRuta: boolean; autoCerrarRuta: boolean }> = empresaIdFiltro
    ? await prisma.$queryRaw`
        SELECT id, "horaInicioRuta", "horaFinRuta", "autoCrearRuta", "autoCerrarRuta"
        FROM gestor."Empresa"
        WHERE activo = true AND id = ${empresaIdFiltro}
      `
    : await prisma.$queryRaw`
        SELECT id, "horaInicioRuta", "horaFinRuta", "autoCrearRuta", "autoCerrarRuta"
        FROM gestor."Empresa"
        WHERE activo = true
      `

  const ahoraBog = ahoraBogota()
  const horaActualMin = ahoraBog.getHours() * 60 + ahoraBog.getMinutes()
  const hoyStr = fechaBogotaStr()
  const ayerStr = fechaBogotaStr(new Date(ahoraBog.getTime() - 24 * 60 * 60 * 1000))

  let procesadas = 0
  let rutasCreadas = 0
  let rutasCerradas = 0
  let rezagosMigrados = 0

  for (const empresa of empresas) {
    const inicioMin = horaEnMinutos(empresa.horaInicioRuta)
    const finMin = horaEnMinutos(empresa.horaFinRuta)

    // ── CIERRE: hora actual >= horaFinRuta (solo cron, solo si autoCerrarRuta está habilitado)
    if (!esSesionEmpresa && horaActualMin >= finMin && empresa.autoCerrarRuta) {
      const rutasHoy = await prisma.ruta.findMany({
        where: {
          empresaId: empresa.id,
          cerrada: false,
          fecha: { gte: inicioDiaBogota(hoyStr), lte: finDiaBogota(hoyStr) }
        },
        include: {
          empleados: { select: { empleadoId: true } },
          clientes: { select: { clienteId: true, rutaId: true } }
        }
      })

      for (const ruta of rutasHoy) {
        const empIds = ruta.empleados.map((e: any) => e.empleadoId)
        const cliIds = ruta.clientes.map((c: any) => c.clienteId)

        const visitas = await prisma.visita.findMany({
          where: {
            empleadoId: { in: empIds },
            clienteId: { in: cliIds },
            fechaBogota: { gte: inicioDiaBogota(hoyStr), lte: finDiaBogota(hoyStr) }
          },
          select: { clienteId: true }
        })
        const visitadosSet = new Set(visitas.map((v: any) => v.clienteId))

        // Marcar rezago clientes sin visita
        const sinVisita = ruta.clientes
          .filter((rc: any) => !visitadosSet.has(rc.clienteId))
          .map((rc: any) => rc.clienteId)

        if (sinVisita.length > 0) {
          await prisma.rutaCliente.updateMany({
            where: { rutaId: ruta.id, clienteId: { in: sinVisita } },
            data: { rezago: true }
          })
        }

        await prisma.ruta.update({
          where: { id: ruta.id },
          data: { cerrada: true, cerradaEl: new Date() }
        })
        rutasCerradas++
      }
    }

    // ── APERTURA: ventana horaria (cron, solo si autoCrearRuta) o inmediato cuando empresa dispara manualmente
    if (esSesionEmpresa || (horaActualMin >= inicioMin && horaActualMin < inicioMin + 60 && empresa.autoCrearRuta)) {
      const empleados = await prisma.empleado.findMany({
        where: { empresaId: empresa.id, activo: true, rol: 'entregas' }
      })

      for (const emp of empleados) {
        // Ya tiene ruta de hoy?
        const rutaExistente = await prisma.ruta.findFirst({
          where: {
            empresaId: empresa.id,
            empleados: { some: { empleadoId: emp.id } },
            fecha: { gte: inicioDiaBogota(hoyStr), lte: finDiaBogota(hoyStr) }
          }
        })
        if (rutaExistente) continue

        // Rezagos de ayer
        const rutasAyer = await prisma.ruta.findMany({
          where: {
            empresaId: empresa.id,
            empleados: { some: { empleadoId: emp.id } },
            fecha: { gte: inicioDiaBogota(ayerStr), lte: finDiaBogota(ayerStr) }
          },
          include: {
            clientes: {
              where: { rezago: true },
              orderBy: { orden: 'asc' }
            }
          }
        })

        const rezagos = rutasAyer.flatMap((r: any) => r.clientes)

        // Nombre único
        const dd = String(ahoraBog.getDate()).padStart(2, '0')
        const mm = String(ahoraBog.getMonth() + 1).padStart(2, '0')
        const yyyy = ahoraBog.getFullYear()
        const nombreBase = `${emp.nombre}-${dd}-${mm}-${yyyy}`
        let nombreFinal = nombreBase
        let contador = 1
        while (true) {
          const existe = await prisma.ruta.findFirst({ where: { empresaId: empresa.id, nombre: nombreFinal } })
          if (!existe) break
          nombreFinal = `${nombreBase} (${contador++})`
        }

        await prisma.ruta.create({
          data: {
            id: crypto.randomUUID(),
            nombre: nombreFinal,
            fecha: new Date(hoyStr + 'T05:00:00.000Z'),
            empresaId: empresa.id,
            empleados: {
              create: [{ id: crypto.randomUUID(), empleadoId: emp.id }]
            },
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

  return NextResponse.json({ ok: true, procesadas, rutasCreadas, rutasCerradas, rezagosMigrados })
}
