import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEmpresaId } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { generarPlanMes } from '@/lib/billing/generarPlan'

const EMPRESAS_EXENTAS = ['superadmin-001', 'cmn7o4pcg0000vmeg0utky01w']

// GET — estado del plan actual. Si no existe plan del mes → auto-genera (excepto exentas)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)

  const ahora = new Date()
  const mes = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`

  // Auto-generar plan si no existe y empresa no exenta
  if (!EMPRESAS_EXENTAS.includes(empresaId)) {
    const existe = await (prisma as any).planEmpresa.findUnique({
      where: { empresaId_mes: { empresaId, mes } },
      select: { id: true },
    })
    if (!existe) {
      await generarPlanMes(mes, empresaId)
    }
  }

  // Deuda acumulada — todos los meses pendientes/vencidos
  const pendientes = await (prisma as any).planEmpresa.findMany({
    where: { empresaId, estado: { in: ['pendiente', 'vencido'] } },
    orderBy: { mes: 'asc' },
    select: { mes: true, monto: true, saldo: true, estado: true, fechaLimite: true, bannerActivo: true },
  })

  const plan = await (prisma as any).planEmpresa.findUnique({
    where: { empresaId_mes: { empresaId, mes } },
    select: { mes: true, monto: true, saldo: true, montoOriginal: true, estado: true, fechaLimite: true, bannerActivo: true, desglose: true, pagoFecha: true },
  })

  const deudaTotal = pendientes.reduce((s: number, p: any) => s + (p.saldo ?? p.monto), 0)
  const mesesPendientes = pendientes.map((p: any) => p.mes)
  // billingEstado derivado de plan.estado — fuente única de verdad para la UI
  const billingEstado = plan?.estado === 'vencido' ? 'mora' : plan?.estado === 'pendiente' ? 'pendiente' : plan?.estado === 'pagado' ? 'al_dia' : 'sin_plan'

  return NextResponse.json({ plan: plan ?? null, deudaTotal, mesesPendientes, billingEstado })
}
