import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEmpresaId } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!['empresa', 'supervisor'].includes(user.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const empresaId = getEmpresaId(user)
  const { searchParams } = new URL(req.url)
  const mes = searchParams.get('mes') // formato: YYYY-MM

  const whereBase: any = { empresaId }
  if (mes) {
    const inicio = new Date(`${mes}-01T00:00:00.000Z`)
    const fin = new Date(inicio)
    fin.setMonth(fin.getMonth() + 1)
    whereBase.createdAt = { gte: inicio, lt: fin }
  }

  const huellas = await (prisma as any).voucherHuella.findMany({
    where: whereBase,
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      fecha: true,
      banco: true,
      numeroCuenta: true,
      titular: true,
      referencia: true,
      valor: true,
      vendedorNombre: true,
      pagoId: true,
      createdAt: true,
    }
  })

  // Traer datos de PagoCartera (cliente y recibo)
  const pagoIds = [...new Set(huellas.map((h: any) => h.pagoId).filter(Boolean))]
  const pagos = pagoIds.length > 0
    ? await (prisma as any).pagoCartera.findMany({
        where: { id: { in: pagoIds } },
        select: { id: true, numeroRecibo: true, clienteNombre: true }
      })
    : []
  const pagosMap = Object.fromEntries(pagos.map((p: any) => [p.id, p]))

  // Enriquecer huellas
  const huellasMapped = huellas.map((h: any) => ({
    ...h,
    numeroRecibo: pagosMap[h.pagoId]?.numeroRecibo ?? null,
    clienteNombre: pagosMap[h.pagoId]?.clienteNombre ?? null,
  }))

  // Agrupar por numeroCuenta
  const grupos: Record<string, { numeroCuenta: string; banco: string | null; titular: string | null; registros: any[]; total: number }> = {}
  for (const h of huellasMapped) {
    const key = h.numeroCuenta || 'sin-cuenta'
    if (!grupos[key]) {
      grupos[key] = { numeroCuenta: h.numeroCuenta || 'Sin número de cuenta', banco: h.banco, titular: h.titular || null, registros: [], total: 0 }
    }
    grupos[key].registros.push(h)
    grupos[key].total += Number(h.valor || 0)
  }

  return NextResponse.json({ grupos: Object.values(grupos) }, { headers: { 'Cache-Control': 'private, no-store' } })
}
