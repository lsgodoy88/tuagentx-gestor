import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function getEmpresaId() {
  const session = await getServerSession(authOptions)
  if (!session) return null
  const user = session.user as any
  if (user.role !== 'empresa' && user.role !== 'supervisor') return null
  return user.role === 'empresa' ? user.id : user.empresaId
}

export async function GET() {
  const empresaId = await getEmpresaId()
  if (!empresaId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const vinculadas = await prisma.empresaVinculada.findMany({
    where: { empresaId, activa: true },
    include: { _count: { select: { rutas: true } } },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ vinculadas })
}

export async function POST(req: NextRequest) {
  const empresaId = await getEmpresaId()
  if (!empresaId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { color } = await req.json()

  const vinculada = await prisma.empresaVinculada.create({
    data: { empresaId, nombre: 'Pendiente', color: color || '#8b5cf6' },
  })

  return NextResponse.json({ vinculada })
}

export async function DELETE(req: NextRequest) {
  const empresaId = await getEmpresaId()
  if (!empresaId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  await prisma.empresaVinculada.updateMany({
    where: { id, empresaId },
    data: { activa: false },
  })

  return NextResponse.json({ ok: true })
}
