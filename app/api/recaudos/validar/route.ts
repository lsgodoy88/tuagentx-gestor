import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId, ROLES_ADMIN } from '@/lib/auth-helpers'

/**
 * POST /api/recaudos/validar
 * Confronta saldoAnterior del pago vs saldo en SyncDeuda (UpTres local)
 * Body: { pagoIds: string[] }
 * Response: { resultados: { pagoId, valido, saldoUptres, saldoPago, motivo }[] }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!ROLES_ADMIN.includes(user.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const empresaId = getEmpresaId(user)
  const { pagoIds } = await req.json() as { pagoIds: string[] }

  if (!Array.isArray(pagoIds) || pagoIds.length === 0)
    return NextResponse.json({ error: 'pagoIds requerido' }, { status: 400 })

  // Traer pagos con sus datos
  const pagos = await prisma.pagoCartera.findMany({
    where: {
      id: { in: pagoIds },
      OR: [
        { Cartera: { empresaId } },
        { AND: [{ carteraId: null }, { Empleado: { empresaId } }] },
      ],
    },
    select: {
      id: true,
      monto: true,
      saldoAnterior: true,
      numeroFactura: true,
      clienteApiId: true,
      envioEstado: true,
      Cartera: {
        select: {
          Cliente: { select: { apiId: true } },
        },
      },
    },
  })

  // Buscar SyncDeudas correspondientes por numeroFactura
  const facturas = pagos.map(p => p.numeroFactura).filter(Boolean) as number[]

  const syncDeudas = facturas.length > 0
    ? await prisma.syncDeuda.findMany({
        where: {
          numeroFactura: { in: facturas },
          integracion: { empresaId },
          condition: true,
        },
        select: {
          id: true,
          numeroFactura: true,
          saldo: true,
          valor: true,
          clienteApiId: true,
        },
      })
    : []

  // Indexar por numeroFactura
  const deudaMap = new Map<number, typeof syncDeudas[0]>()
  for (const d of syncDeudas) {
    if (d.numeroFactura) deudaMap.set(d.numeroFactura, d)
  }

  // Confrontar
  const resultados = pagos.map(pago => {
    const saldoPago = Number(pago.saldoAnterior ?? 0)
    const monto     = Number(pago.monto ?? 0)

    if (!pago.numeroFactura) {
      return { pagoId: pago.id, valido: false, motivo: 'Sin número de factura', saldoUptres: null, saldoPago }
    }

    const deuda = deudaMap.get(pago.numeroFactura)

    if (!deuda) {
      return { pagoId: pago.id, valido: false, motivo: 'Factura no encontrada en UpTres', saldoUptres: null, saldoPago }
    }

    const saldoUptres = Number(deuda.saldo ?? 0)

    // Validación: el saldo en UpTres debe ser >= al monto del pago
    // y debe coincidir con el saldoAnterior registrado (tolerancia ±1 por redondeos)
    const diferencia = Math.abs(saldoUptres - saldoPago)
    const tolerancia = 1

    if (saldoUptres <= 0) {
      return { pagoId: pago.id, valido: false, motivo: 'Deuda ya cancelada en UpTres', saldoUptres, saldoPago }
    }

    if (diferencia > tolerancia) {
      return {
        pagoId: pago.id, valido: false,
        motivo: `Saldo difiere: local $${saldoPago.toLocaleString('es-CO')} vs UpTres $${saldoUptres.toLocaleString('es-CO')}`,
        saldoUptres, saldoPago,
      }
    }

    if (saldoUptres < monto) {
      return {
        pagoId: pago.id, valido: false,
        motivo: `Monto del pago ($${monto.toLocaleString('es-CO')}) excede saldo en UpTres ($${saldoUptres.toLocaleString('es-CO')})`,
        saldoUptres, saldoPago,
      }
    }

    return { pagoId: pago.id, valido: true, motivo: 'OK', saldoUptres, saldoPago }
  })

  return NextResponse.json({ resultados })
}
