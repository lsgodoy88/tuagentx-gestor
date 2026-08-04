import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const all = await (prisma as any).saldoConfig.findMany({
    where: { empresaId: user.empresaId },
    orderBy: [{ tipo: 'asc' }, { orden: 'asc' }],
  })
  const categorias = all.filter((c: any) => c.tipo !== 'tab')
  const tabs       = all.filter((c: any) => c.tipo === 'tab')
  return NextResponse.json({ categorias, tabs })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { tipo, nombre, key, emoji } = await req.json()
  const count = await (prisma as any).saldoConfig.count({
    where: { empresaId: user.empresaId, tipo }
  })

  // Validar key único para tabs
  if (tipo === 'tab') {
    const exists = await (prisma as any).saldoConfig.findFirst({
      where: { empresaId: user.empresaId, tipo: 'tab', key }
    })
    if (exists) return NextResponse.json({ error: 'Tab ya existe' }, { status: 400 })
  }

  const cat = await (prisma as any).saldoConfig.create({
    data: {
      empresaId: user.empresaId,
      tipo,
      nombre: nombre,
      orden: count,
      ...(tipo === 'tab' ? { key, emoji: emoji || '📦' } : {}),
    }
  })
  return NextResponse.json({ ok: true, cat })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id, nombre, emoji } = await req.json()
  const cat = await (prisma as any).saldoConfig.update({
    where: { id },
    data: {
      ...(nombre ? { nombre } : {}),
      ...(emoji  ? { emoji }                        : {}),
    }
  })
  return NextResponse.json({ ok: true, cat })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await req.json()
  // No eliminar si hay movimientos en esa tab
  const cfg = await (prisma as any).saldoConfig.findUnique({ where: { id } })
  if (cfg?.tipo === 'tab') {
    const count = await (prisma as any).saldoMovimiento.count({
      where: { empresaId: user.empresaId, tab_key: cfg.key }
    })
    if (count > 0) return NextResponse.json({ error: 'Tab tiene movimientos' }, { status: 400 })
  }
  await (prisma as any).saldoConfig.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
