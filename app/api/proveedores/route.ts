import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.empresaId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (user.role !== 'empresa' && user.role !== 'supervisor') return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim().toUpperCase() || ''
  const proveedores = await (prisma as any).proveedor.findMany({
    where: {
      empresaId: user.empresaId,
      condition: true,
      ...(q ? { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }, { document: { contains: q } }] } : {}),
    },
    orderBy: { firstName: 'asc' },
    take: 100,
  })
  return NextResponse.json({ proveedores })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.empresaId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (user.role !== 'empresa' && user.role !== 'supervisor') return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  const body = await req.json()
  const { firstName, lastName, document, documentType, verificationDigit, email, phone, cityId, address, neighborhood, note } = body
  if (!firstName?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })
  const proveedor = await (prisma as any).proveedor.create({
    data: {
      empresaId: user.empresaId,
      firstName: firstName.trim().toUpperCase(),
      lastName: lastName?.trim().toUpperCase() || null,
      document: document?.trim() || null,
      documentType: documentType?.trim() || null,
      verificationDigit: verificationDigit?.trim() || null,
      email: email?.trim().toLowerCase() || null,
      phone: phone?.trim() || null,
      cityId: cityId?.trim() || null,
      address: address?.trim().toUpperCase() || null,
      neighborhood: neighborhood?.trim().toUpperCase() || null,
      note: note?.trim() || null,
      condition: true,
    },
  })
  return NextResponse.json({ ok: true, proveedor })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.empresaId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (user.role !== 'empresa' && user.role !== 'supervisor') return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  const body = await req.json()
  const { id, ...campos } = body
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  const data: any = {}
  if (campos.firstName !== undefined) data.firstName = campos.firstName.trim().toUpperCase()
  if (campos.lastName !== undefined) data.lastName = campos.lastName?.trim().toUpperCase() || null
  if (campos.document !== undefined) data.document = campos.document?.trim() || null
  if (campos.documentType !== undefined) data.documentType = campos.documentType?.trim() || null
  if (campos.verificationDigit !== undefined) data.verificationDigit = campos.verificationDigit?.trim() || null
  if (campos.email !== undefined) data.email = campos.email?.trim().toLowerCase() || null
  if (campos.phone !== undefined) data.phone = campos.phone?.trim() || null
  if (campos.cityId !== undefined) data.cityId = campos.cityId?.trim() || null
  if (campos.address !== undefined) data.address = campos.address?.trim().toUpperCase() || null
  if (campos.neighborhood !== undefined) data.neighborhood = campos.neighborhood?.trim().toUpperCase() || null
  if (campos.note !== undefined) data.note = campos.note?.trim() || null
  if (campos.condition !== undefined) data.condition = campos.condition
  const proveedor = await (prisma as any).proveedor.update({ where: { id, empresaId: user.empresaId }, data })
  return NextResponse.json({ ok: true, proveedor })
}
