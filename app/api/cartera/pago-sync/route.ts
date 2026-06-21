import type { PagoSyncResponse } from '@/lib/types/cartera'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { generarReciboToken } from '@/lib/recibos'
import { calcularEstado } from '@/lib/cartera'
import { invalidateKeys } from '@/lib/cache'
import { actualizarResumenVisita } from '@/lib/visitaResumen'
import { fechaHoyBogota, nowBogota } from '@/lib/fechas'
import { getConsecutivo } from '@/lib/consecutivo' 

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)
  const empleadoId = user.role === 'empresa' ? null : user.id

  const idempotencyKey = req.headers.get('X-Idempotency-Key') || null

  // Deduplicación — si ya existe un pago con este key, retornarlo sin crear otro
  if (idempotencyKey) {
    const existing = await (prisma as any).pagoCartera.findUnique({
      where: { idempotencyKey }
    })
    if (existing) {
      const empresa = await prisma.empresa.findUnique({
        where: { id: empresaId },
        select: { configRecibos: true }
      })
      const anchoPapel = (empresa as any)?.configRecibos?.anchoPapel || '80mm'
      return NextResponse.json({ pago: existing, anchoPapel, _idempotent: true })
    }
  }

  const body = await req.json()
  const { syncDeudaIds, clienteApiId, monto, descuento = 0, descuentosPorFactura = {}, metodoPago = 'efectivo', notas, voucherKey, voucherDatosIA, lineasPago, lat, lng, gpsAccuracy } = body

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

  // Normalizar líneas — fuente única de método y monto
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
  const descuentoNum = Number(descuento) || 0
  // Método derivado de líneas — no depende del campo redundante del body
  // Si no hay lineasPago en el body, usar metodoPago suelto como fallback (compat. cartera/page.tsx)
  const metodoPagoFinal = lineasValidas.length > 1
    ? 'mixto'
    : (lineasValidas[0]?.metodoPago || metodoPago || 'efectivo')

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
  const totalAplicado = montoNum + descuentoNum

  // Obtener integracionId de la empresa para buscar deudas sin externalIds
  const integracionRow = await (prisma as any).integracion.findFirst({
    where: { empresaId, activa: true },
    select: { id: true }
  })
  const integracionIdActual = integracionRow?.id || null

  // Buscar deudas por externalId — si no vienen, buscar todas las activas del cliente (FIFO)
  const externalIds = Array.isArray(syncDeudaIds) ? syncDeudaIds : []
  const deudas = await (prisma as any).syncDeuda.findMany({
    where: externalIds.length > 0
      ? { externalId: { in: externalIds }, clienteApiId }
      : { clienteApiId, ...(integracionIdActual ? { integracionId: integracionIdActual } : {}), condition: true, saldo: { gt: 0 } },
    orderBy: [{ fechaVencimiento: 'asc' }, { numeroFactura: 'asc' }],
  })

  // Scope vendedor — si hay deudas seleccionadas, al menos una debe ser suya
  if (user.role === 'vendedor' && deudas.length > 0) {
    const miApiId = (user as any).apiId || null
    if (!miApiId) return NextResponse.json({ error: 'Vendedor sin apiId en sesión' }, { status: 403 })
    const asignado = deudas.some((d: any) => d.empleadoExternalId === miApiId)
    if (!asignado) return NextResponse.json({ error: 'Sin permiso para cobrar este cliente' }, { status: 403 })
  }

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
      const descFact = Number((descuentosPorFactura as Record<string,number>)[a.syncDeudaId] || 0)
      const d = deudas.find((x: any) => x.id === a.syncDeudaId)
      const saldoAntes = d ? Number(d.saldo) : 0
      return {
        numeroFactura:  a.numeroFactura,
        montoAplicado:  a.montoAplicado,
        valorFactura:   d ? Number(d.valor || d.saldo) : 0,
        saldoAntes,
        descuento:      descFact || null,
        saldoDespues:   Math.max(0, saldoAntes - a.montoAplicado - descFact),
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
  let pago: any
  try {
  pago = await (prisma as any).$transaction(async (tx: any) => {
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
        numeroFactura: aplicaciones.length > 0 ? aplicaciones[0].numeroFactura : null,
        ...(lineasValidas.length > 0 ? { lineasPago: lineasValidas } : {}),
        ...(lat != null && lng != null ? { latCobro: Number(lat), lngCobro: Number(lng), gpsAccuracy: gpsAccuracy != null ? Number(gpsAccuracy) : null } : {}),
        numeroRecibo,
        reciboToken,
        tokenExpira,
        ...(idempotencyKey ? { idempotencyKey } : {}),
        ...(aplicaciones.length > 0 ? { syncDeudaId: aplicaciones[0].syncDeudaId } : {}),
        reciboPago,
        // Persistir voucher en columna scalar — accesible sin parsear JSON
        ...(() => {
          const lv = lineasValidas.find((l: any) =>
            ['transferencia', 'nequi', 'banco'].includes(l.metodoPago) && l.voucherKey
          ) || (voucherKey && ['transferencia', 'nequi', 'banco'].includes(metodoPagoFinal) ? { voucherKey, voucherDatosIA } : null)
          return lv ? { voucherKey: lv.voucherKey, voucherDatosIA: lv.voucherDatosIA ?? null } : {}
        })(),
        ...(aplicaciones.length > 0 ? {
          Aplicaciones: {
            create: aplicaciones.map(a => ({
              syncDeudaId: a.syncDeudaId,
              numeroFactura: a.numeroFactura,
              externalId: a.externalId,
              montoAplicado: a.montoAplicado,
              descuento: Number((descuentosPorFactura as Record<string,number>)[a.syncDeudaId] || 0) || null,
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
  } catch (txErr: any) {
    // Unique constraint en idempotencyKey — request duplicado llegó en paralelo
    if (txErr?.code === 'P2002' && txErr?.meta?.target?.includes('idempotencyKey') && idempotencyKey) {
      const existing = await (prisma as any).pagoCartera.findUnique({ where: { idempotencyKey } })
      if (existing) {
        const empresa2 = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { configRecibos: true } })
        const anchoPapel2 = (empresa2 as any)?.configRecibos?.anchoPapel || '80mm'
        return NextResponse.json({ pago: existing, anchoPapel: anchoPapel2, _idempotent: true })
      }
    }
    throw txErr
  }

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

  actualizarResumenVisita(user.id, { tipo: 'cobro', monto: montoNum }, fechaHoyBogota()).catch(() => {})

  return NextResponse.json({ pago, anchoPapel } satisfies PagoSyncResponse)
}
