import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'unauth' }, { status: 401 })
  const { empresaId, role } = session.user as any
  if (!['empresa', 'supervisor', 'bodega'].includes(role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const empresa = await (prisma as any).empresa.findUnique({
    where: { id: empresaId },
    select: { configDespachos: true },
  })

  return NextResponse.json(empresa?.configDespachos ?? { transportadora: '', urlBase: '' })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'unauth' }, { status: 401 })
  const { empresaId, role } = session.user as any
  if (role !== 'empresa') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { transportadora, urlBase } = await req.json()

  await (prisma as any).empresa.update({
    where: { id: empresaId },
    data: { configDespachos: { transportadora: transportadora || '', urlBase: urlBase || '' } },
  })

  return NextResponse.json({ ok: true })
}
