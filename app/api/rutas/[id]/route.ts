import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { nowBogota, inicioDiaBogota, finDiaBogota } from '@/lib/fechas'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (!['entregas', 'empresa', 'supervisor'].includes(user.role))
      return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

    const empresaId = getEmpresaId(user)
    const { id } = await params
    const body = await req.json()
    const { accion, rutaIds } = body // accion: 'iniciar' | 'cerrar', rutaIds: string[] (todas las del día)

    // Operar sobre todas las rutas del día si se pasan, o solo la principal
    const idsAOperar: string[] = rutaIds?.length ? rutaIds : [id]

    if (accion === 'iniciar') {
      await prisma.ruta.updateMany({
        where: { id: { in: idsAOperar }, empresaId: empresaId },
        data: { iniciada: true }
      })
      return NextResponse.json({ ok: true })
    }

    if (accion === 'cerrar') {
      const ahoraBog = nowBogota()
      const mananaInicio = finDiaBogota(ahoraBog)
      const pasadoInicio = finDiaBogota(new Date(ahoraBog.getTime() + 24 * 60 * 60 * 1000))

      // Recoger todos los RutaCliente pendientes de todas las rutas hoy
      const rutasHoy = await prisma.ruta.findMany({
        where: { id: { in: idsAOperar } },
        include: {
          empleados: { select: { empleadoId: true } },
          clientes: { select: { id: true, clienteId: true, rutaId: true } }
        }
      })

      // Visitas de hoy para determinar cuáles se entregaron
      const hoyInicio = inicioDiaBogota(ahoraBog)
      const todosClienteIds = rutasHoy.flatMap((r: any) => r.clientes.map((c: any) => c.clienteId))
      const empleadoIds = [...new Set(rutasHoy.flatMap((r: any) => r.empleados.map((e: any) => e.empleadoId)))]

      const visitasHoy = await prisma.visita.findMany({
        where: {
          clienteId: { in: todosClienteIds },
          empleadoId: { in: empleadoIds },
          fechaBogota: { gte: hoyInicio }
        },
        select: { clienteId: true }
      })
      const visitadosSet = new Set(visitasHoy.map((v: any) => v.clienteId))

      // Verificar también ordenEstado — fuente de verdad para entregado
      const notasOrdenes = rutasHoy.flatMap((r: any) => r.clientes.map((rc: any) => rc.notas)).filter(Boolean)
      const numerosFactura = notasOrdenes.map((n: string) => { const m = n.match(/#(\d+)/); return m ? m[1] : null }).filter((x): x is string => x !== null)
      const ordenesEntregadas = numerosFactura.length > 0
        ? await prisma.ordenDespacho.findMany({
            where: { numeroFactura: { in: numerosFactura }, estado: 'entregado' },
            select: { numeroFactura: true }
          })
        : []
      const facturasEntregadas = new Set(ordenesEntregadas.map((o: any) => o.numeroFactura))

      const pendientes = rutasHoy.flatMap((r: any) =>
        r.clientes.filter((rc: any) => {
          if (visitadosSet.has(rc.clienteId)) return false
          const m = (rc.notas || '').match(/#(\d+)/)
          if (m && facturasEntregadas.has(m[1])) return false
          return true
        }).map((rc: any) => ({ ...rc, _empresaId: (r as any).empresaId }))
      )

      // Por cada empresa, buscar/crear ruta mañana y migrar sus pendientes
      if (pendientes.length > 0) {
        const porEmpresa = new Map<string, typeof pendientes>()
        for (const rc of pendientes) {
          const emp = rc._empresaId || empresaId
          if (!porEmpresa.has(emp)) porEmpresa.set(emp, [])
          porEmpresa.get(emp)!.push(rc)
        }

        for (const [empId, pends] of porEmpresa) {
          let rutaMañanaId: string | null = null
          const rutaMañanaLink = await prisma.rutaEmpleado.findFirst({
            where: {
              empleadoId: user.id,
              ruta: { cerrada: false, empresaId: empId, fecha: { gte: mananaInicio, lt: pasadoInicio } }
            },
            select: { rutaId: true }
          })

          if (rutaMañanaLink) {
            rutaMañanaId = rutaMañanaLink.rutaId
          } else {
            const empleado = await prisma.empleado.findUnique({ where: { id: user.id }, select: { nombre: true } })
            const mañana = new Date(ahoraBog); mañana.setDate(mañana.getDate() + 1)
            const dd = String(mañana.getDate()).padStart(2,'0')
            const mm = String(mañana.getMonth()+1).padStart(2,'0')
            const yyyy = mañana.getFullYear()
            const nueva = await prisma.ruta.create({
              data: {
                nombre: `${empleado?.nombre || 'Repartidor'}-${dd}-${mm}-${yyyy}`,
                fecha: mananaInicio, empresaId: empId,
                empleados: { create: [{ empleadoId: user.id }] }
              },
              select: { id: true }
            })
            rutaMañanaId = nueva.id
          }

          if (rutaMañanaId) {
            // Empujar existentes hacia abajo para que rezagos queden primero
            const existentes = await prisma.rutaCliente.findMany({
              where: { rutaId: rutaMañanaId },
              select: { id: true },
              orderBy: { orden: 'asc' }
            })
            if (existentes.length > 0) {
              await Promise.all(existentes.map((rc: any, i: number) =>
                prisma.rutaCliente.update({ where: { id: rc.id }, data: { orden: pends.length + i } })
              ))
            }
            await Promise.all(pends.map((rc: any, i: number) =>
              prisma.rutaCliente.update({
                where: { id: rc.id },
                data: { rutaId: rutaMañanaId!, orden: i, rezago: true, posible_entrega: mananaInicio }
              })
            ))
          }
        }
      }

      // Cerrar todas las rutas hoy
      await prisma.ruta.updateMany({
        where: { id: { in: idsAOperar }, empresaId: empresaId },
        data: { cerrada: true, cerradaEl: new Date() }
      })

      return NextResponse.json({ ok: true, pendientesMigrados: pendientes.length })
    }

    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
  } catch (err: any) {
    console.error('[PATCH /api/rutas/[id]]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
