import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { nowBogota, inicioDiaBogota, finDiaBogota } from '@/lib/fechas'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (user.role !== 'entregas') return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

    const empresaId = getEmpresaId(user)
    const { id: rutaMañanaId } = await params
    const { rutaClienteIds } = await req.json()

    if (!Array.isArray(rutaClienteIds) || rutaClienteIds.length === 0)
      return NextResponse.json({ error: 'Sin selección' }, { status: 400 })

    const ahoraBog = nowBogota()
    const hoyInicio = inicioDiaBogota(ahoraBog)
    const mananaInicio = finDiaBogota(ahoraBog)

    // Buscar/crear ruta HOY del empleado
    let rutaHoyId: string | null = null
    const rutaHoyLink = await prisma.rutaEmpleado.findFirst({
      where: {
        empleadoId: user.id,
        ruta: { cerrada: false, empresaId, fecha: { gte: hoyInicio, lt: mananaInicio } }
      },
      select: { rutaId: true }
    })

    if (rutaHoyLink) {
      rutaHoyId = rutaHoyLink.rutaId
    } else {
      // Crear ruta hoy (edge case: cerró hoy y quiere adelantar)
      const empleado = await prisma.empleado.findUnique({ where: { id: user.id }, select: { nombre: true } })
      const dd = String(ahoraBog.getDate()).padStart(2,'0')
      const mm = String(ahoraBog.getMonth()+1).padStart(2,'0')
      const yyyy = ahoraBog.getFullYear()
      const nueva = await prisma.ruta.create({
        data: {
          nombre: `${empleado?.nombre || 'Repartidor'}-${dd}-${mm}-${yyyy}`,
          fecha: hoyInicio, empresaId,
          empleados: { create: [{ empleadoId: user.id }] }
        },
        select: { id: true }
      })
      rutaHoyId = nueva.id
    }

    // Contar órdenes actuales en hoy para orden
    const countHoy = await prisma.rutaCliente.count({ where: { rutaId: rutaHoyId! } })

    // Mover RutaCliente seleccionados a ruta hoy
    await Promise.all(rutaClienteIds.map((rcId: string, i: number) =>
      prisma.rutaCliente.update({
        where: { id: rcId },
        data: {
          rutaId: rutaHoyId!,
          posible_entrega: hoyInicio,
          orden: countHoy + i,
          rezago: false,
        }
      })
    ))

    return NextResponse.json({ ok: true, movidos: rutaClienteIds.length })
  } catch (err: any) {
    console.error('[POST adelantar]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
