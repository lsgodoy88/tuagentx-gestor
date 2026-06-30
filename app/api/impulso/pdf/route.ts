import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { fechaHoyBogota } from '@/lib/fechas'
import { calcularImpulsadorasMes } from '@/lib/impulsoMetricas'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)

  const { searchParams } = new URL(req.url)
  const fecha = searchParams.get('fecha') || fechaHoyBogota()
  const [anioStr, mesStr] = fecha.slice(0, 7).split('-')
  const anio = parseInt(anioStr)
  const mes = parseInt(mesStr)

  // Snapshot congelado (mes ya cerrado, ultimo dia 23:59 via Guardian) tiene
  // prioridad sobre el calculo en vivo — es de solo lectura, no se recalcula.
  const snapshot = await (prisma as any).reporteImpulsoMes.findUnique({
    where: { empresaId_mes_anio: { empresaId, mes, anio } },
  })

  if (snapshot) {
    const data = snapshot.resultados as any
    const impulsadoras = aplicarScopeRol(data.impulsadoras || [], user)
    return NextResponse.json({ ...data, impulsadoras, snapshot: true })
  }

  let whereImpExtra: any = {}
  if (user.role === 'vendedor') whereImpExtra = { vendedorId: user.id }
  if (user.role === 'impulsadora') whereImpExtra = { id: user.id }

  const data = await calcularImpulsadorasMes(empresaId, fecha, whereImpExtra)
  return NextResponse.json({ ...data, snapshot: false })
}

// Aplica el mismo filtro de rol que antes vivia en el where de Prisma, pero
// sobre el JSON ya congelado del snapshot (que siempre incluye TODAS las
// impulsadoras de la empresa). Cada entrada del snapshot guarda vendedorId
// para poder reproducir el mismo scope exacto que el calculo en vivo.
function aplicarScopeRol(impulsadoras: any[], user: any) {
  if (user.role === 'vendedor') {
    return impulsadoras.filter((i: any) => i.vendedorId === user.id)
  }
  if (user.role === 'impulsadora') {
    return impulsadoras.filter((i: any) => i.id === user.id)
  }
  return impulsadoras
}
