import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)

  const { egresoId, valor, fecha, evidenciaKey, medioPago } = await req.json()
  if (!egresoId || !valor) return NextResponse.json({ error: 'egresoId y valor requeridos' }, { status: 400 })

  // Verificar que el egreso pertenece a la empresa
  const egreso = await (prisma as any).egreso.findFirst({ where: { id: egresoId, empresaId } })
  if (!egreso) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // Crear abono
  await (prisma as any).egresoAbono.create({
    data: {
      egresoId,
      valor: parseFloat(valor),
      fecha: fecha ? new Date(fecha) : new Date(),
      ...(evidenciaKey ? { evidenciaKey } : {}),
    },
  })

  // Recalcular abonoPago = SUM de todos los abonos
  const agg = await (prisma as any).egresoAbono.aggregate({
    where: { egresoId },
    _sum: { valor: true },
    _count: { id: true },
  })
  const totalAbono = parseFloat(agg._sum.valor || 0)
  const countAbonos = agg._count.id

  const v = parseFloat(egreso.valor)
  const r = parseFloat(egreso.retencion)
  const d = parseFloat(egreso.descuento)
  const nuevoSaldo = Math.max(0, v - r - totalAbono - d)
  const nuevoEstado = nuevoSaldo <= 0 ? 'ok' : egreso.estado

  const updated = await (prisma as any).egreso.update({
    where: { id: egresoId },
    data: {
      abonoPago: totalAbono, saldo: nuevoSaldo, estado: nuevoEstado,
      ...(medioPago ? { medioPago } : {}),
      ...(fecha ? { fechaPago: new Date(fecha) } : {}),
    },
  })

  return NextResponse.json({ ok: true, abonoPago: totalAbono, saldo: nuevoSaldo, estado: nuevoEstado, countAbonos })
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const egresoId = new URL(req.url).searchParams.get('egresoId')
  if (!egresoId) return NextResponse.json({ error: 'egresoId requerido' }, { status: 400 })
  const abonos = await (prisma as any).egresoAbono.findMany({
    where: { egresoId },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ abonos })
}
