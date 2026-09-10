import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEmpresaId } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

// GET — listar adjuntos de un egreso
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)
  const egresoId = req.nextUrl.searchParams.get('egresoId')
  if (!egresoId) return NextResponse.json({ error: 'egresoId requerido' }, { status: 400 })

  const egreso = await (prisma as any).egreso.findFirst({ where: { id: egresoId, empresaId } })
  if (!egreso) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const adjuntos = await (prisma as any).egresoAdjunto.findMany({
    where: { egresoId },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ adjuntos })
}

// POST — agregar adjunto
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)
  const { egresoId, abonoId, tipo, key } = await req.json()
  if (!egresoId || !tipo || !key) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })

  const egreso = await (prisma as any).egreso.findFirst({ where: { id: egresoId, empresaId } })
  if (!egreso) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const adjunto = await (prisma as any).egresoAdjunto.create({
    data: { egresoId, abonoId: abonoId || null, tipo, key },
  })
  return NextResponse.json({ adjunto })
}

// DELETE — eliminar adjunto (solo si el egreso no ha sido guardado — controlado en frontend)
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)
  const { adjuntoId, egresoId } = await req.json()
  if (!adjuntoId || !egresoId) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })

  const egreso = await (prisma as any).egreso.findFirst({ where: { id: egresoId, empresaId } })
  if (!egreso) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  await (prisma as any).egresoAdjunto.delete({ where: { id: adjuntoId } })
  return NextResponse.json({ ok: true })
}
