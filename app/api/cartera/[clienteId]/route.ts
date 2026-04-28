import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calcularEstado } from '@/lib/cartera'
import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'
import { sincronizarDeudas, actualizarCache } from '@/lib/integracion/sync'

export async function GET(req: NextRequest, { params }: { params: Promise<{ clienteId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId
  const { clienteId } = await params

  // ── Detectar integración UpTres activa ──
  const integracion = await (prisma as any).integracion.findFirst({
    where: { empresaId, tipo: 'uptres', activa: true }
  })

  if (integracion) {
    // Buscar cliente para obtener su apiId
    const cliente = await (prisma as any).cliente.findFirst({
      where: { id: clienteId, empresaId },
      select: { id: true, nombre: true, nit: true, telefono: true, ciudad: true, apiId: true }
    })

    if (!cliente?.apiId) {
      // Cliente sin apiId — no está en UpTres, retornar cartera manual si existe
      return NextResponse.json({ cartera: null, _modo: 'sin_sync', _motivo: 'cliente sin apiId' })
    }

    // Live sync — refrescar deudas de este cliente desde UpTres antes de leer
    try {
      const config = integracion.config as any
      const { decrypt } = await import('@/lib/crypto-uptres')
      const apiSecret = decrypt(config.apiSecret, process.env.UPTRES_SECRET!)
      const adapter = new UpTresAdapter(config.apiKey, apiSecret)
      await adapter.login()
      const deudasFrescas = await adapter.fetchDeudasCliente(cliente.apiId)
      const afectados = await sincronizarDeudas(deudasFrescas, integracion.id, empresaId)
      await actualizarCache(afectados, integracion.id, empresaId)
    } catch {
      // Si UpTres no responde, continuar con datos en caché
    }

    // Buscar todas las deudas de este cliente en SyncDeuda
    const deudas = await (prisma as any).syncDeuda.findMany({
      where: { integracionId: integracion.id, clienteApiId: cliente.apiId, condition: true },
      orderBy: { fechaVencimiento: 'asc' }
    })

    // Para cada deuda calcular saldo real con lógica inteligente
    const deudasEnriquecidas = await Promise.all(deudas.map(async (d: any) => {
      const pagosLocales = await (prisma as any).pagoCartera.findMany({
        where: { syncDeudaId: d.id },
        orderBy: { createdAt: 'desc' },
        include: { Empleado: { select: { id: true, nombre: true } } }
      })

      const totalPagosLocales = pagosLocales.reduce((s: number, p: any) => s + Number(p.monto), 0)

      const saldoSync = Number(d.saldo)
      const saldoAnterior = Number(d.saldoAnterior ?? d.saldo)
      const saldoCambio = Math.abs(saldoSync - saldoAnterior) > 0.01

      // Si UpTres actualizó el saldo → usar directo, limpiar pagos locales pendientes
      // Si no cambió → restar pagos locales no reflejados
      const saldoReal = saldoCambio
        ? saldoSync
        : Math.max(0, saldoSync - totalPagosLocales)

      return {
        ...d,
        saldoReal,
        saldoSync,
        saldoCambioEnSync: saldoCambio,
        pagosLocales: pagosLocales.map((p: any) => ({ ...p, empleado: p.Empleado })),
        totalPagosLocales,
      }
    }))

    const saldoTotalCliente = deudasEnriquecidas.reduce((s: number, d: any) => s + d.saldoReal, 0)

    return NextResponse.json({
      cartera: {
        cliente,
        deudas: deudasEnriquecidas,
        saldoTotal: saldoTotalCliente,
        totalDeudas: deudasEnriquecidas.length,
        _fuente: 'sync',
        _sincronizado: true,
        _integracion: { id: integracion.id, nombre: integracion.nombre }
      },
      _modo: 'sync'
    })
  }

  // ── MODO MANUAL ──
  const carteraWhere: any = { clienteId, empresaId }
  if (user.role === 'vendedor') carteraWhere.empleadoId = user.id

  const cartera = await prisma.cartera.findFirst({
    where: carteraWhere,
    include: {
      Cliente: { select: { id: true, nombre: true, nit: true, telefono: true, ciudad: true } },
      Empleado: { select: { id: true, nombre: true } },
      DetalleCartera: { orderBy: { createdAt: 'asc' } },
      PagoCartera: {
        orderBy: { createdAt: 'desc' },
        include: { Empleado: { select: { id: true, nombre: true } } }
      },
    }
  })

  if (!cartera) return NextResponse.json({ cartera: null, _modo: 'manual' })

  const detalles = (cartera.DetalleCartera as any[]).map((d: any) => {
    const vf = Number(d.valorFactura ?? d.valor)
    const ab = Number(d.abonos ?? 0)
    const saldo = Math.max(0, vf - ab)
    const { estado, label, color } = calcularEstado(saldo, vf, ab, d.fechaVencimiento ?? null)
    return { ...d, saldoPendiente: saldo, estado, estadoLabel: label, estadoColor: color }
  })

  const pagos = (cartera.PagoCartera as any[]).map((p: any) => ({
    ...p,
    empleado: p.Empleado,
    metodoPago: p.metodopago,
  }))

  return NextResponse.json({
    cartera: {
      ...cartera,
      _fuente: 'manual',
      _sincronizado: false,
      cliente: cartera.Cliente,
      empleado: cartera.Empleado,
      DetalleCartera: detalles,
      PagoCartera: pagos,
    },
    _modo: 'manual'
  })
}
