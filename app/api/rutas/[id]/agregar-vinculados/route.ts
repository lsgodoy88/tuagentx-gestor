import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'empresa' && user.role !== 'supervisor') {
    return NextResponse.json({ error: 'Solo supervisor o empresa' }, { status: 403 })
  }

  const { pedidoIds } = await req.json()
  if (!Array.isArray(pedidoIds) || pedidoIds.length === 0) {
    return NextResponse.json({ error: 'pedidoIds requerido' }, { status: 400 })
  }

  const { id: rutaId } = await params
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId

  const rutaPrincipal = await prisma.ruta.findFirst({
    where: { id: rutaId, empresaId },
    include: { empleados: true },
  })
  if (!rutaPrincipal) return NextResponse.json({ error: 'Ruta no encontrada' }, { status: 404 })
  if (rutaPrincipal.empleados.length === 0) {
    return NextResponse.json({ error: 'La ruta principal no tiene empleados asignados' }, { status: 400 })
  }

  const results = await Promise.all(
    pedidoIds.map(async (pedidoId: string) => {
      const rutaVinculada = await prisma.ruta.findFirst({
        where: { id: pedidoId, empresaVinculada: { empresaId }, cerrada: false },
      })
      if (!rutaVinculada) return { pedidoId, ok: false }

      const existentes = await prisma.rutaEmpleado.findMany({
        where: { rutaId: pedidoId },
        select: { empleadoId: true },
      })
      const existentesSet = new Set(existentes.map((e: any) => e.empleadoId))
      const nuevos = rutaPrincipal.empleados.filter((re: any) => !existentesSet.has(re.empleadoId))

      if (nuevos.length > 0) {
        await prisma.rutaEmpleado.createMany({
          data: nuevos.map((re: any) => ({
            id: crypto.randomUUID(),
            rutaId: pedidoId,
            empleadoId: re.empleadoId,
          })),
        })
      }

      return { pedidoId, ok: true }
    })
  )

  return NextResponse.json({ ok: true, results })
}
