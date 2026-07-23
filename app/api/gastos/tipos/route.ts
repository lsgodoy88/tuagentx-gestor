import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const empresaId = getEmpresaId(session.user as any)
  const tipos = await (prisma as any).gastoTipo.findMany({ where: { empresaId }, orderBy: { orden: 'asc' } })
  return NextResponse.json({ tipos })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const empresaId = getEmpresaId(session.user as any)
  const { label } = await req.json()
  if (!label?.trim()) return NextResponse.json({ error: 'label requerido' }, { status: 400 })
  const last = await (prisma as any).gastoTipo.findFirst({ where: { empresaId }, orderBy: { orden: 'desc' } })
  const tipo = await (prisma as any).gastoTipo.create({
    data: { empresaId, label: label.trim(), orden: (last?.orden ?? -1) + 1 }
  })
  return NextResponse.json({ tipo })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const empresaId = getEmpresaId(session.user as any)
  const { id, label } = await req.json()
  if (!id || !label?.trim()) return NextResponse.json({ error: 'id y label requeridos' }, { status: 400 })
  const found = await (prisma as any).gastoTipo.findFirst({ where: { id, empresaId } })
  if (!found) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  const tipo = await (prisma as any).gastoTipo.update({ where: { id }, data: { label: label.trim() } })
  return NextResponse.json({ tipo })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const empresaId = getEmpresaId(session.user as any)
  const { id } = await req.json()
  const found = await (prisma as any).gastoTipo.findFirst({ where: { id, empresaId } })
  if (!found) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  const count = await (prisma as any).gasto.count({ where: { empresaId, tipo: found.label } })
  if (count > 0) return NextResponse.json({ error: `No se puede eliminar — tiene ${count} gastos` }, { status: 409 })
  await (prisma as any).gastoTipo.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
