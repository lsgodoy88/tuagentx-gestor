import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { calcularEstado } from '@/lib/cartera'

export async function GET(req: NextRequest, { params }: { params: Promise<{ clienteId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)
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
      return NextResponse.json({ cartera: null,
 _motivo: 'cliente sin apiId' })
    }

    // Lee directo de SyncDeuda — el nocturno y el delta mantienen los datos frescos
    // Buscar todas las deudas de este cliente en SyncDeuda
    const deudas = await (prisma as any).syncDeuda.findMany({
      where: { integracionId: integracion.id, clienteApiId: cliente.apiId, condition: true },
      orderBy: [{ fechaVencimiento: { sort: 'asc', nulls: 'last' } }]
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
      _modo: 'sync',
      cartera: {
        cliente,
        deudas: deudasEnriquecidas,
        saldoTotal: saldoTotalCliente,
        totalDeudas: deudasEnriquecidas.length,
        _modo: 'sync',
        _sincronizado: true,
        _integracion: { id: integracion.id, nombre: integracion.nombre }
      },
    })
  }

  // Cliente sin integración activa
  return NextResponse.json({ cartera: null, _motivo: 'sin integracion activa' })
}
