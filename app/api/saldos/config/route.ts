import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const categorias = await (prisma as any).saldoConfig.findMany({
    where: { empresaId: user.empresaId },
    orderBy: [{ tipo: 'asc' }, { orden: 'asc' }]
  })
  return NextResponse.json({ categorias })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { tipo, nombre } = await req.json()
  const count = await (prisma as any).saldoConfig.count({
    where: { empresaId: user.empresaId, tipo }
  })
  const cat = await (prisma as any).saldoConfig.create({
    data: { empresaId: user.empresaId, tipo, nombre: nombre.toUpperCase(), orden: count }
  })
  return NextResponse.json({ ok: true, cat })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await req.json()
  await (prisma as any).saldoConfig.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
