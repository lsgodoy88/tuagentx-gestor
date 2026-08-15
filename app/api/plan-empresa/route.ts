import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEmpresaId } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

// GET — estado del plan actual para la empresa (usado por banner y página empleados)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)

  const ahora = new Date()
  const mes = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`

  // Deuda acumulada — todos los meses pendientes/vencidos
  const pendientes = await (prisma as any).planEmpresa.findMany({
    where: { empresaId, estado: { in: ['pendiente', 'vencido'] } },
    orderBy: { mes: 'asc' },
    select: { mes: true, monto: true, estado: true, fechaLimite: true, bannerActivo: true },
  })

  const plan = await (prisma as any).planEmpresa.findUnique({
    where: { empresaId_mes: { empresaId, mes } },
    select: { mes: true, monto: true, estado: true, fechaLimite: true, bannerActivo: true, desglose: true, pagoFecha: true },
  })

  const deudaTotal = pendientes.reduce((s: number, p: any) => s + p.monto, 0)
  const bannerActivo = pendientes.some((p: any) => p.bannerActivo)
  const mesesPendientes = pendientes.map((p: any) => p.mes)

  return NextResponse.json({ plan: plan ?? null, deudaTotal, bannerActivo, mesesPendientes })
}
