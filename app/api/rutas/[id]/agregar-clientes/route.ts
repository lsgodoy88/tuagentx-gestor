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

  const { clienteIds } = await req.json()
  if (!Array.isArray(clienteIds) || clienteIds.length === 0) {
    return NextResponse.json({ error: 'clienteIds requerido' }, { status: 400 })
  }

  const { id: rutaId } = await params

  // Verificar que la ruta pertenece a la empresa
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId
  const ruta = await prisma.ruta.findFirst({ where: { id: rutaId, empresaId } })
  if (!ruta) return NextResponse.json({ error: 'Ruta no encontrada' }, { status: 404 })

  // Obtener orden máximo actual
  const maxOrden = await prisma.rutaCliente.aggregate({
    where: { rutaId },
    _max: { orden: true }
  })
  const baseOrden = (maxOrden._max.orden ?? -1) + 1

  // IDs ya en la ruta para no duplicar
  const existentes = await prisma.rutaCliente.findMany({
    where: { rutaId },
    select: { clienteId: true }
  })
  const existentesSet = new Set(existentes.map((e: any) => e.clienteId))
  const nuevos = clienteIds.filter((id: string) => !existentesSet.has(id))

  if (nuevos.length === 0) return NextResponse.json({ ok: true, agregados: 0 })

  const supData = user.role === 'supervisor'
    ? { supervisorId: user.id, supervisorEtiqueta: (user as any).etiqueta || null }
    : {}

  await prisma.rutaCliente.createMany({
    data: nuevos.map((clienteId: string, i: number) => ({
      id: crypto.randomUUID(),
      rutaId,
      clienteId,
      orden: baseOrden + i,
      rezago: false,
      ...supData
    }))
  })

  return NextResponse.json({ ok: true, agregados: nuevos.length })
}
