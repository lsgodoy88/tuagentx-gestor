import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Token requerido' }, { status: 400 })

  const pago = await (prisma as any).pagoCartera.findFirst({
    where: { reciboToken: token },
    include: {
      Cartera: {
        include: {
          Cliente: true,
          Empresa: true,
          DetalleCartera: { take: 1, orderBy: { createdAt: 'desc' } },
        }
      },
      Empleado: { select: { id: true, nombre: true, empresaId: true } },
      Aplicaciones: true,
    }
  })

  if (!pago) return NextResponse.json({ error: 'Token invalido' }, { status: 404 })

  if (pago.tokenExpira && new Date() > new Date(pago.tokenExpira)) {
    return NextResponse.json({ error: 'TOKEN_EXPIRADO', pagoId: pago.id }, { status: 410 })
  }

  let carteraData: any = null
  if (pago.Cartera) {
    carteraData = {
      ...pago.Cartera,
      cliente: pago.Cartera?.Cliente,
      empresa: pago.Cartera?.Empresa,
      DetalleCartera: pago.Cartera?.DetalleCartera,
    }
  } else {
    const empresa = pago.Empleado?.empresaId
      ? await (prisma as any).empresa.findUnique({ where: { id: pago.Empleado.empresaId } })
      : null

    let cliente = null
    // Prioridad 1: datos congelados en PagoCartera
    if (pago.clienteApiId && empresa) {
      cliente = await (prisma as any).cliente.findFirst({
        where: { apiId: pago.clienteApiId, empresaId: empresa.id }
      })
    }
    // Fallback: pagos viejos sin datos congelados → SyncDeuda
    if (!cliente) {
      const aplicacion = pago.Aplicaciones?.[0]
      if (aplicacion) {
        const sd = await (prisma as any).syncDeuda.findUnique({ where: { id: aplicacion.syncDeudaId } })
        if (sd?.clienteApiId && empresa) {
          cliente = await (prisma as any).cliente.findFirst({
            where: { apiId: sd.clienteApiId, empresaId: empresa.id }
          })
        }
      }
    }

    // Hidratar valores de cada SyncDeuda aplicada
    const syncDeudaIds = (pago.Aplicaciones || []).map((a: any) => a.syncDeudaId)
    const syncDeudas = syncDeudaIds.length > 0
      ? await (prisma as any).syncDeuda.findMany({ where: { id: { in: syncDeudaIds } } })
      : []
    const sdMap = new Map(syncDeudas.map((sd: any) => [sd.id, sd]))

    const detalleCartera = (pago.Aplicaciones || []).map((a: any) => {
      const sd: any = sdMap.get(a.syncDeudaId)
      // Prioridad: datos congelados en PagoCartera (válido cuando hay 1 sola aplicación)
      const valorFact = (pago.Aplicaciones?.length === 1 && pago.valorFactura)
        ? Number(pago.valorFactura)
        : (sd ? Number(sd.valor) : 0)
      const saldoAntesCongelado = (pago.Aplicaciones?.length === 1 && pago.saldoAnterior !== null)
        ? Number(pago.saldoAnterior)
        : null
      const saldoActual = sd ? Number(sd.saldo) : (saldoAntesCongelado !== null ? saldoAntesCongelado - Number(a.montoAplicado) : 0)
      return {
        numeroFactura: a.numeroFactura,
        montoAplicado: Number(a.montoAplicado),
        valorFactura: valorFact,
        saldoActual,
        saldoAntes: saldoAntesCongelado !== null ? saldoAntesCongelado : saldoActual + Number(a.montoAplicado),
        fechaCreacion: (sd?.data as any)?.createdAt || null,
      }
    })

    // Totales: lo que este pago tocó
    const valorFacturasPagadas = detalleCartera.reduce((s: number, d: any) => s + d.valorFactura, 0)
    const saldoNuevo = detalleCartera.reduce((s: number, d: any) => s + d.saldoActual, 0)
    const montoPago = Number(pago.monto) + Number(pago.descuento || 0)
    // Priorizar saldoAnterior congelado al momento del pago
    const saldoAnterior = pago.saldoAnterior != null
      ? Number(pago.saldoAnterior)
      : saldoNuevo + montoPago

    carteraData = {
      cliente,
      empresa,
      DetalleCartera: detalleCartera,
      saldoPendiente: saldoNuevo,
      saldoAnterior,
      valorFacturasPagadas,
      _modo: 'sync',
    }
  }

  const normalized = {
    ...pago,
    metodoPago: pago.metodopago,
    consecutivo: pago.numeroRecibo,
    cartera: carteraData,
    empleado: pago.Empleado,
  }

  return NextResponse.json({ pago: normalized })
}
