import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = user.empresaId || user.id
  const { id } = await params
  const { lat, lng, ubicacionReal } = await req.json()

  if (!lat || !lng) return NextResponse.json({ error: 'lat y lng requeridos' }, { status: 400 })

  // Verificar que el cliente pertenece a la empresa
  const cliente = await prisma.cliente.findFirst({ where: { id, empresaId } })
  if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  // Solo actualizar si no tiene GPS real ya confirmado — a menos que sea admin/supervisor
  const esAdmin = ['empresa', 'supervisor', 'superadmin'].includes(user.role)
  if (cliente.ubicacionReal && !esAdmin) {
    return NextResponse.json({ ok: true, mensaje: 'Ya tiene GPS real confirmado', skipped: true })
  }

  await prisma.cliente.update({
    where: { id },
    data: {
      lat,
      lng,
      ubicacionReal: ubicacionReal === true,
    }
  })

  return NextResponse.json({ ok: true })
}
