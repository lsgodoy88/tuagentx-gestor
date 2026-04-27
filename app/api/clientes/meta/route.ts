import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id, metaVenta } = await req.json()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const cliente = await prisma.cliente.update({
    where: { id },
    data: { metaVenta: metaVenta ? Number(metaVenta) : null }
  })
  return NextResponse.json({ ok: true, cliente })
}
