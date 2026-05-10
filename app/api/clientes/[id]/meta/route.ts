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
  const { metaVenta } = await req.json()

  const cliente = await prisma.cliente.findFirst({ where: { id, empresaId } })
  if (!cliente) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  await prisma.cliente.update({
    where: { id },
    data: { metaVenta: metaVenta ? Number(metaVenta) : null }
  })
  return NextResponse.json({ ok: true })
}
