import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { Prisma } from '@/app/generated/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { calcularEstado } from '@/lib/cartera'

const CORTE_LUMELI = new Date('2026-06-01T05:00:00Z').getTime() // sin offset: Prisma devuelve TIMESTAMP sin TZ como UTC
const LUMELI_ID = 'cmn7oiutk0001vmega46373b4'

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
    const esLumeli = empresaId === LUMELI_ID
    let saldosInicialesLumeli: Record<number, number> = {}
    if (esLumeli) {
      const rows: any[] = await prisma.$queryRaw`
        SELECT "numeroFactura", "saldoInicial"
        FROM ${Prisma.raw(DB_SCHEMA)}."LumeliSaldoInicial0206"`
      for (const r of rows) {
        saldosInicialesLumeli[Number(r.numerofactura ?? r.numeroFactura)] = Number(r.saldoinicial ?? r.saldoInicial)
      }
    }

    const deudasEnriquecidas = await Promise.all(deudas.map(async (d: any) => {
      const aplicaciones = await (prisma as any).pagoCarteraDeuda.findMany({
        where: { syncDeudaId: d.id },
        select: { montoAplicado: true, descuento: true, createdAt: true, pagoId: true },
        orderBy: { createdAt: 'asc' }
      })
      const pagosLocales = await (prisma as any).pagoCartera.findMany({
        where: { syncDeudaId: d.id },
        orderBy: { createdAt: 'desc' },
        include: { Empleado: { select: { id: true, nombre: true } } }
      })

      let saldoReal: number
      if (esLumeli && saldosInicialesLumeli[d.numeroFactura] !== undefined) {
        const pagadoPost = aplicaciones
          .filter((p: any) => new Date(p.createdAt).getTime() > CORTE_LUMELI)
          .reduce((s: number, p: any) => s + Number(p.montoAplicado), 0) // montoAplicado ya incluye descuento
        saldoReal = Math.max(0, saldosInicialesLumeli[d.numeroFactura] - pagadoPost)
      } else if (aplicaciones.length > 0) {
        const primerPago = await (prisma as any).pagoCartera.findFirst({
          where: { id: aplicaciones[0].pagoId },
          select: { saldoAnterior: true }
        })
        const ancla = primerPago?.saldoAnterior !== undefined ? Number(primerPago.saldoAnterior) : Number(d.valor)
        const totalPagado = aplicaciones.reduce((s: number, p: any) => s + Number(p.montoAplicado), 0) // montoAplicado ya incluye descuento
        saldoReal = Math.max(0, ancla - totalPagado)
      } else {
        // nSaldo v3 persistido en BD — fuente de verdad cuando no hay pagos locales
        saldoReal = Number(d.nSaldo ?? d.saldo ?? d.valor)
      }

      return {
        ...d,
        saldoReal,
        saldoSync: saldoReal,
        saldoCambioEnSync: false,
        pagosLocales: pagosLocales.map((p: any) => ({ ...p, empleado: p.Empleado })),
        totalPagosLocales: pagosLocales.reduce((s: number, p: any) => s + Number(p.monto), 0),
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
