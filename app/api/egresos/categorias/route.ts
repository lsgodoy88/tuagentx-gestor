import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)

  const categorias = await (prisma as any).egresoCategoria.findMany({
    where: { empresaId },
    orderBy: { orden: 'asc' },
  })
  return NextResponse.json({ categorias })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)
  const { label, emoji = '📋' } = await req.json()
  if (!label) return NextResponse.json({ error: 'label requerido' }, { status: 400 })

  const key = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
  const last = await (prisma as any).egresoCategoria.findFirst({ where: { empresaId }, orderBy: { orden: 'desc' } })
  const categoria = await (prisma as any).egresoCategoria.create({
    data: { empresaId, key, label, emoji, orden: (last?.orden ?? -1) + 1 }
  })
  return NextResponse.json({ categoria })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)
  const { id, label, emoji } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const cat = await (prisma as any).egresoCategoria.findFirst({ where: { id, empresaId } })
  if (!cat) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const updated = await (prisma as any).egresoCategoria.update({
    where: { id },
    data: { ...(label && { label }), ...(emoji && { emoji }) }
  })
  return NextResponse.json({ categoria: updated })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)
  const { id } = await req.json()

  const cat = await (prisma as any).egresoCategoria.findFirst({ where: { id, empresaId } })
  if (!cat) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // No eliminar si tiene egresos
  const count = await (prisma as any).egreso.count({ where: { empresaId, categoria: cat.key } })
  if (count > 0) return NextResponse.json({ error: `No se puede eliminar — tiene ${count} egresos` }, { status: 409 })

  await (prisma as any).egresoCategoria.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
