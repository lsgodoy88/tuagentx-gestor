import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { calcularEstado } from '@/lib/cartera'
import { calcularNSaldoPorDeuda } from '@/lib/integracion/sync'

const CORTE_LUMELI = new Date('2026-06-01T05:00:00Z').getTime() // sin offset: Prisma devuelve TIMESTAMP sin TZ como UTC
const LUMELI_ID = 'cmn7oiutk0001vmega46373b4'

export async function GET(req: NextRequest, { params }: { params: Promise<{ clienteId: string }> }) {
  try {
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
      select: { id: true, nombre: true, nit: true, telefono: true, ciudad: true, apiId: true, ubicacionReal: true, lat: true, lng: true }
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

    // nSaldo v3: calculado desde datos propios, sin depender de SyncDeuda.saldo
    // (que solo se actualiza cuando UpTres sincroniza). Misma fórmula que
    // reconstruirCartera() — fuente única de verdad para el saldo que ve el vendedor.
    // nSaldo v3 — una sola query para todas las deudas (no N+1)
    const nSaldoMap = await calcularNSaldoPorDeuda(
      deudas.map((d: any) => ({ id: d.id, valor: d.valor, numeroFactura: d.numeroFactura, nSaldo: d.nSaldo, saldo: d.saldo })),
      empresaId
    )

    // Pagos locales — una sola query para todas las deudas
    const pagosLocalesTodos = await (prisma as any).pagoCartera.findMany({
      where: { syncDeudaId: { in: deudas.map((d: any) => d.id) } },
      orderBy: { createdAt: 'desc' },
      include: { Empleado: { select: { id: true, nombre: true } } }
    })
    const pagosLocalesPorDeuda: Record<string, any[]> = {}
    for (const p of pagosLocalesTodos) {
      if (!pagosLocalesPorDeuda[p.syncDeudaId]) pagosLocalesPorDeuda[p.syncDeudaId] = []
      pagosLocalesPorDeuda[p.syncDeudaId].push({ ...p, empleado: p.Empleado })
    }

    const deudasEnriquecidas = deudas.map((d: any) => {
      const saldoReal = nSaldoMap[d.id] ?? Number(d.nSaldo ?? d.saldo ?? d.valor)
      const pagosLocales = pagosLocalesPorDeuda[d.id] || []
      return {
        ...d,
        saldoReal,
        saldoSync: saldoReal,
        saldoCambioEnSync: false,
        pagosLocales,
        totalPagosLocales: pagosLocales.reduce((s: number, p: any) => s + Number(p.monto), 0),
      }
    })

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
  } catch (e: any) {
    console.error('[cartera/detalle] error:', e?.message ?? e)
    return NextResponse.json({ error: 'Error al cargar deuda', cartera: null }, { status: 500 })
  }
}
