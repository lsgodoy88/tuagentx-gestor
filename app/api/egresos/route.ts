import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { mesBogota, anioBogota } from '@/lib/fechas'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)
  const { searchParams } = new URL(req.url)
  const mes = parseInt(searchParams.get('mes') || String(mesBogota()))
  const anio = parseInt(searchParams.get('anio') || String(anioBogota()))
  const categoria = searchParams.get('categoria') || undefined

  const where: any = { empresaId, mes, anio }
  if (categoria) where.categoria = categoria

  const egresos = await (prisma as any).egreso.findMany({
    where, orderBy: { fecha: 'asc' },
    include: { _count: { select: { abonos: true } } }
  })
  return NextResponse.json({ ok: true, egresos })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)
  const body = await req.json()
  if (!body.concepto?.trim()) return NextResponse.json({ error: 'Concepto requerido' }, { status: 400 })
  if (!body.valor || parseFloat(body.valor) === 0) return NextResponse.json({ error: 'Valor requerido' }, { status: 400 })

  let fecha = new Date(body.fecha)
  if (isNaN(fecha.getTime())) fecha = new Date()
  const egreso = await (prisma as any).egreso.create({
    data: {
      empresaId, categoria: body.categoria,
      fecha, concepto: body.concepto,
      valor: body.valor || 0, retencion: body.retencion || 0,
      abonoPago: body.abonoPago || 0, descuento: body.descuento || 0,
      saldo: body.saldo || 0,
      fechaPago: body.fechaPago ? new Date(body.fechaPago) : null,
      medioPago: body.medioPago || null,
      estado: body.estado || 'pendiente',
      autorizado: body.autorizado || false,
      mes: body.mes || (fecha.getMonth() + 1), anio: body.anio || fecha.getFullYear(),
      ...(body.evidenciaKey ? { evidenciaKey: body.evidenciaKey } : {}),
    }
  })
  return NextResponse.json({ ok: true, egreso })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const body = await req.json()
  const { id, ...data } = body
  if (data.fecha) data.fecha = new Date(data.fecha)
  if (data.fechaPago) data.fechaPago = new Date(data.fechaPago)
  const egreso = await (prisma as any).egreso.update({ where: { id }, data })
  return NextResponse.json({ ok: true, egreso })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { id } = await req.json()
  await (prisma as any).egreso.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
