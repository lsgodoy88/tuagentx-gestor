import type { PagoSyncResponse } from '@/lib/types/cartera'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { generarReciboToken } from '@/lib/recibos'
import { calcularEstado } from '@/lib/cartera'
import { invalidateKeys } from '@/lib/cache'
import { fechaHoyBogota, nowBogota } from '@/lib/fechas'
import { getConsecutivo } from '@/lib/consecutivo' 

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)
  const empleadoId = user.role === 'empresa' ? null : user.id

  const body = await req.json()
  const { syncDeudaIds, clienteApiId, monto, descuento = 0, metodoPago = 'efectivo', notas, voucherKey, voucherDatosIA, lineasPago, lat, lng, gpsAccuracy } = body

  if (!clienteApiId || !monto) return NextResponse.json({ error: 'clienteApiId y monto requeridos' }, { status: 400 })

  const cliente = await prisma.cliente.findFirst({
    where: { apiId: clienteApiId, empresaId },
    select: { id: true, nombre: true, nit: true, telefono: true, direccion: true }
  })
  if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  let empId = empleadoId
  let vendedorNom: string | null = null
  if (!empId) {
    const emp = await prisma.empleado.findFirst({ where: { empresaId, activo: true } })
    if (!emp) return NextResponse.json({ error: 'Sin empleado activo' }, { status: 400 })
    empId = emp.id
    vendedorNom = emp.nombre
  } else {
    const emp = await prisma.empleado.findUnique({ where: { id: empId }, select: { nombre: true } })
    vendedorNom = emp?.nombre || null
  }

  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { nombre: true, telefono: true, configRecibos: true }
  })
  const anchoPapel = (empresa as any)?.configRecibos?.anchoPapel || '80mm'

  // Si vienen lineas (multi-metodo), agregamos
  const lineasValidas = Array.isArray(lineasPago)
    ? lineasPago.filter((l: any) => Number(l?.monto || 0) > 0).map((l: any) => ({
        metodoPago: l.metodoPago || 'efectivo',
        monto: Number(l.monto || 0),
        descuento: Number(l.descuento || 0),
        voucherKey: l.voucherKey || null,
        voucherDatosIA: l.voucherDatosIA || null,
      }))
    : []
  const montoNum = lineasValidas.length > 0
    ? lineasValidas.reduce((s: number, l: any) => s + l.monto, 0)
    : Number(monto)
  const descuentoNum = lineasValidas.length > 0
    ? lineasValidas.reduce((s: number, l: any) => s + l.descuento, 0)
    : Number(descuento)

  // Validación de input
  if (!Number.isFinite(montoNum) || montoNum < 0) {
    return NextResponse.json({ error: 'Monto inválido' }, { status: 400 })
  }
  if (!Number.isFinite(descuentoNum) || descuentoNum < 0) {
    return NextResponse.json({ error: 'Descuento inválido' }, { status: 400 })
  }
  if (montoNum + descuentoNum <= 0) {
    return NextResponse.json({ error: 'El total del pago debe ser mayor a 0' }, { status: 400 })
  }
  // Limitar tamaño de notas y voucher para evitar abuso
  if (notas && typeof notas === 'string' && notas.length > 1000) {
    return NextResponse.json({ error: 'Notas demasiado largas (máx 1000)' }, { status: 400 })
  }
  const metodoPagoFinal = lineasValidas.length > 1 ? 'mixto' : (lineasValidas[0]?.metodoPago || metodoPago)
  const totalAplicado = montoNum + descuentoNum

  // Buscar deudas por externalId, ordenadas FIFO (más antigua primero)
  const externalIds = Array.isArray(syncDeudaIds) ? syncDeudaIds : []
  const deudas = externalIds.length > 0
    ? await (prisma as any).syncDeuda.findMany({
        where: { externalId: { in: externalIds }, clienteApiId },
        orderBy: [{ fechaVencimiento: 'asc' }, { numeroFactura: 'asc' }],
      })
    : []

  const { reciboToken, tokenExpira } = generarReciboToken()
  let numeroRecibo: string | null = null
  try { numeroRecibo = await getConsecutivo(empId) } catch {}

  // Aplicación FIFO: cubrir totalmente la más antigua, luego la siguiente
  const aplicaciones: { syncDeudaId: string, numeroFactura: number | null, externalId: string, montoAplicado: number }[] = []
  let restante = totalAplicado
  for (const d of deudas) {
    if (restante <= 0) break
    const saldoActual = Number(d.saldo)
    if (saldoActual <= 0) continue
    const aplicar = Math.min(saldoActual, restante)
    aplicaciones.push({
      syncDeudaId: d.id,
      numeroFactura: d.numeroFactura ?? null,
      externalId: d.externalId,
      montoAplicado: aplicar,
    })
    restante -= aplicar
  }

  // Congelar saldoAnterior y valorFactura ANTES de aplicar pagos
  const saldoAnteriorTotal = deudas
    .filter((d: any) => aplicaciones.some(a => a.syncDeudaId === d.id))
    .reduce((s: number, d: any) => s + Number(d.saldo), 0)
  const valorFacturaTotal = deudas
    .filter((d: any) => aplicaciones.some(a => a.syncDeudaId === d.id))
    .reduce((s: number, d: any) => s + Number(d.valor || d.saldo), 0)

  // Snapshot inmutable del recibo — todo lo que necesita el PDF sin tocar BD al reabrir
  const reciboPago = {
    empresa: {
      nombre:       (empresa as any)?.nombre                        || null,
      nit:          (empresa as any)?.configRecibos?.nit            || null,
      telefono:     (empresa as any)?.configRecibos?.telefono       || (empresa as any)?.telefono || null,
      direccion:    (empresa as any)?.configRecibos?.direccion      || null,
      logo:         (empresa as any)?.configRecibos?.logo           || null,
      anchoPapel:   (empresa as any)?.configRecibos?.anchoPapel     || '80mm',
      prefijo:      (empresa as any)?.configRecibos?.prefijo        || 'REC',
    },
    cliente: {
      nombre:    cliente?.nombre    || null,
      nit:       (cliente as any)?.nit       || null,
      telefono:  (cliente as any)?.telefono  || null,
      direccion: (cliente as any)?.direccion || null,
    },
    vendedor: vendedorNom || null,
    detalles: aplicaciones.map(a => {
      const d = deudas.find((x: any) => x.id === a.syncDeudaId)
      const saldoAntes = d ? Number(d.saldo) : 0
      return {
        numeroFactura:  a.numeroFactura,
        montoAplicado:  a.montoAplicado,
        valorFactura:   d ? Number(d.valor || d.saldo) : 0,
        saldoAntes,
        saldoDespues:   Math.max(0, saldoAntes - a.montoAplicado),
      }
    }),
    saldoAnterior: saldoAnteriorTotal > 0 ? saldoAnteriorTotal : null,
    saldoNuevo:    Math.max(0, saldoAnteriorTotal - totalAplicado),
    monto:         montoNum,
    descuento:     descuentoNum,
    metodoPago:    metodoPagoFinal,
    lineasPago:    lineasValidas.length > 0 ? lineasValidas : null,
    fechaPago:     new Date().toISOString(),
  }

  // Transacción: crear pago + actualizar saldos atómicamente
  // Si otra request modifica el saldo entre medio, esta falla y se reintenta
  const pago = await (prisma as any).$transaction(async (tx: any) => {
    const pagoCreado = await tx.pagoCartera.create({
      data: {
        empleadoId: empId,
        monto: montoNum,
        descuento: descuentoNum,
        tipo: 'abono',
        metodopago: metodoPagoFinal,
        notas: notas || null,
        clienteApiId: clienteApiId || null,
        clienteNombre: cliente?.nombre || null,
        vendedorNombre: vendedorNom || null,
        saldoAnterior: saldoAnteriorTotal > 0 ? saldoAnteriorTotal : null,
        valorFactura: valorFacturaTotal > 0 ? valorFacturaTotal : null,
        ...(lineasValidas.length > 0 ? { lineasPago: lineasValidas } : {}),
        ...(lat != null && lng != null ? { latCobro: Number(lat), lngCobro: Number(lng), gpsAccuracy: gpsAccuracy != null ? Number(gpsAccuracy) : null } : {}),
        numeroRecibo,
        reciboToken,
        tokenExpira,
        ...(aplicaciones.length > 0 ? { syncDeudaId: aplicaciones[0].syncDeudaId } : {}),
        reciboPago,
        ...(lineasValidas.length === 0 && ['transferencia', 'nequi', 'banco'].includes(metodoPago) && voucherKey ? {
          voucherKey,
          voucherDatosIA: voucherDatosIA ?? undefined,
        } : {}),
        ...(aplicaciones.length > 0 ? {
          Aplicaciones: {
            create: aplicaciones.map(a => ({
              syncDeudaId: a.syncDeudaId,
              numeroFactura: a.numeroFactura,
              externalId: a.externalId,
              montoAplicado: a.montoAplicado,
            }))
          }
        } : {}),
      }
    })

    // Releer saldos dentro de la transacción y aplicar atómicamente
    for (const a of aplicaciones) {
      const sdActual = await tx.syncDeuda.findUnique({
        where: { id: a.syncDeudaId },
        select: { saldo: true, abono: true }
      })
      if (!sdActual) continue
      const nuevoSaldo = Math.max(0, Number(sdActual.saldo) - a.montoAplicado)
      const nuevoAbono = Number(sdActual.abono || 0) + a.montoAplicado
      await tx.syncDeuda.update({
        where: { id: a.syncDeudaId },
        data: { saldo: nuevoSaldo, abono: nuevoAbono, condition: nuevoSaldo > 0 }
      })
    }

    // ── Visita tipo recaudo — mismo patrón que /api/visitas ────────────────
    const turnoActivo = await tx.turno.findFirst({
      where: { empleadoId: empId, activo: true },
      select: { id: true }
    })
    const clienteInterno = await tx.cliente.findFirst({
      where: { apiId: clienteApiId, empresaId },
      select: { id: true }
    })
    if (clienteInterno) {
      await tx.visita.create({
        data: {
          empleadoId: empId,
          clienteId:  clienteInterno.id,
          turnoId:    turnoActivo?.id || null,
          lat:        lat  != null ? Number(lat)  : null,
          lng:        lng  != null ? Number(lng)  : null,
          tipo:       'cobro',
          monto:      montoNum,
          nota:       pagoCreado.numeroRecibo || null,
          factura:    aplicaciones[0]?.numeroFactura != null ? String(aplicaciones[0].numeroFactura) : null,
          fechaBogota: nowBogota(),
        }
      })
    }

    return pagoCreado
  }, { isolationLevel: 'Serializable', timeout: 10000 })

  // Repoblar cache del cliente
  const integracion = await (prisma as any).integracion.findFirst({
    where: { empresaId, tipo: 'uptres', activa: true },
    select: { id: true }
  })
  if (integracion) {
    const { actualizarCache } = await import('@/lib/integracion/sync')
    await actualizarCache(new Set([clienteApiId]), integracion.id, empresaId)
  }

  // Invalidar caché afectado por el nuevo pago
  await invalidateKeys(
    `g:${empresaId}:stats:${fechaHoyBogota()}`,
    `g:${empresaId}:cartera:resumen:${fechaHoyBogota()}`,
    `g:v:${user.id}:${fechaHoyBogota()}`
  )

  return NextResponse.json({ pago, anchoPapel } satisfies PagoSyncResponse)
}
