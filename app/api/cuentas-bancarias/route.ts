import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEmpresaId } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const empresaId = getEmpresaId(session.user as any)
  const cuentas = await (prisma as any).cuentaBancaria.findMany({
    where: { empresaId },
    orderBy: { orden: 'asc' },
  })
  return NextResponse.json(cuentas, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!['empresa'].includes(user.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  const empresaId = getEmpresaId(user)
  const { label, titular, banco, numeroCuenta } = await req.json()
  if (!label?.trim() || !banco?.trim() || !numeroCuenta?.trim())
    return NextResponse.json({ error: 'label, banco y numeroCuenta son requeridos' }, { status: 400 })
  const count = await (prisma as any).cuentaBancaria.count({ where: { empresaId } })
  const cuenta = await (prisma as any).cuentaBancaria.create({
    data: { id: crypto.randomUUID(), empresaId, label: label.trim(), titular: titular?.trim() || null, banco: banco.trim(), numeroCuenta: numeroCuenta.trim(), orden: count }
  })
  return NextResponse.json(cuenta)
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!['empresa'].includes(user.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  const empresaId = getEmpresaId(user)
  const { id, label, titular, banco, numeroCuenta } = await req.json()
  const cuenta = await (prisma as any).cuentaBancaria.updateMany({
    where: { id, empresaId },
    data: { label: label?.trim(), titular: titular?.trim() || null, banco: banco?.trim(), numeroCuenta: numeroCuenta?.trim() }
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!['empresa'].includes(user.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  const empresaId = getEmpresaId(user)
  const { id } = await req.json()
  await (prisma as any).cuentaBancaria.deleteMany({ where: { id, empresaId } })
  return NextResponse.json({ ok: true })
}
