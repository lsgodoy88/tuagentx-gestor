import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any

  const { id } = await params
  const { lat, lng } = await req.json()
  if (!lat || !lng) return NextResponse.json({ error: 'lat/lng requeridos' }, { status: 400 })

  const visita = await prisma.visita.findFirst({
    where: { id, empleadoId: user.id },
  })
  if (!visita) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  await prisma.visita.update({
    where: { id },
    data: { lat, lng },
  })

  return NextResponse.json({ ok: true })
}
