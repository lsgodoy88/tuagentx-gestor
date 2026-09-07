import type { PagoSyncResponse } from '@/lib/types/cartera'
import { prisma } from '@/lib/prisma'
import { aplicarPagoEnCache } from '@/lib/integracion/sync'
import { invalidarContextoVendedor, invalidarContextoEmpresa } from '@/lib/taxbot-invalidar'
import { generarReciboToken } from '@/lib/cartera/recibos'
import { invalidateKeys } from '@/lib/cache'
import { actualizarResumenVisita } from '@/lib/ventas/visitaResumen'
import { fechaHoyBogota, nowBogota } from '@/lib/fechas'
import { getConsecutivo } from '@/lib/consecutivo'

export async function procesarPagoSync(params: {
  empresaId: string
  empleadoId: string | null
  idempotencyKey: string | null
  body: any
}): Promise<{ response: any; status?: number }> {
  const { empresaId, empleadoId, idempotencyKey, body } = params

  // Deduplicación
  if (idempotencyKey) {
    const existing = await (prisma as any).pagoCartera.findUnique({ where: { idempotencyKey } })
    if (existing) {
      const empresa = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { configRecibos: true } })
      const anchoPapel = (empresa as any)?.configRecibos?.anchoPapel || '80mm'
      return { response: { pago: existing, anchoPapel, _idempotent: true } }
    }
  }

  const { syncDeudaIds, clienteApiId, monto, descuento = 0, descuentosPorFactura = {}, metodoPago = 'efectivo', notas, voucherKey, voucherDatosIA, lineasPago, lat, lng, gpsAccuracy, userRole, userApiId } = body

  if (!clienteApiId || !monto) return { response: { error: 'clienteApiId y monto requeridos' }, status: 400 }

  const cliente = await prisma.cliente.findFirst({
    where: { apiId: clienteApiId, empresaId },
    select: { id: true, nombre: true, nit: true, telefono: true, direccion: true },
  })
  if (!cliente) return { response: { error: 'Cliente no encontrado' }, status: 404 }

  let empId = empleadoId
  let vendedorNom: string | null = null
  if (!empId) {
    const emp = await prisma.empleado.findFirst({ where: { empresaId, activo: true } })
    if (!emp) return { response: { error: 'Sin empleado activo' }, status: 400 }
    empId = emp.id
    vendedorNom = emp.nombre
  } else {
    const emp = await prisma.empleado.findUnique({ where: { id: empId }, select: { nombre: true } })
    vendedorNom = emp?.nombre || null
  }

  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { nombre: true, telefono: true, configRecibos: true },
  })
  const anchoPapel = (empresa as any)?.configRecibos?.anchoPapel || '80mm'

  const lineasValidas = Array.isArray(lineasPago)
    ? lineasPago.filter((l: any) => Number(l?.monto || 0) > 0).map((l: any) => ({
        metodoPago: l.metodoPago || 'efectivo',
        monto: Number(l.monto || 0),
        descuento: Number(l.descuento || 0),
        voucherKey: l.voucherKey || null,
        voucherDatosIA: l.voucherDatosIA || null,
        valorModificado: l.valorModificado === true ? true : undefined,
      }))
    : []
  const montoNum = lineasValidas.length > 0 ? lineasValidas.reduce((s: number, l: any) => s + l.monto, 0) : Number(monto)
  const descuentoNum = Number(descuento) || 0
  const metodoPagoFinal = lineasValidas.length > 1 ? 'mixto' : (lineasValidas[0]?.metodoPago || metodoPago || 'efectivo')

  if (!Number.isFinite(montoNum) || montoNum < 0) return { response: { error: 'Monto inválido' }, status: 400 }
  if (!Number.isFinite(descuentoNum) || descuentoNum < 0) return { response: { error: 'Descuento inválido' }, status: 400 }
  if (montoNum + descuentoNum <= 0) return { response: { error: 'El total del pago debe ser mayor a 0' }, status: 400 }
  if (notas && typeof notas === 'string' && notas.length > 1000) return { response: { error: 'Notas demasiado largas (máx 1000)' }, status: 400 }

  const totalAplicado = montoNum + descuentoNum

  const integracionRow = await (prisma as any).integracion.findFirst({
    where: { empresaId, activa: true }, select: { id: true },
  })
  const integracionIdActual = integracionRow?.id || null

  const syncIds = Array.isArray(syncDeudaIds) ? syncDeudaIds : []
  const deudas = await (prisma as any).syncDeuda.findMany({
    where: syncIds.length > 0
      ? { id: { in: syncIds }, clienteApiId }
      : { clienteApiId, ...(integracionIdActual ? { integracionId: integracionIdActual } : {}), condition: true, saldo: { gt: 0 } },
    orderBy: [{ fechaVencimiento: 'asc' }, { numeroFactura: 'asc' }],
  })

  if (userRole === 'vendedor' && deudas.length > 0) {
    if (!userApiId) return { response: { error: 'Vendedor sin apiId en sesión' }, status: 403 }
    const asignado = deudas.some((d: any) => d.empleadoExternalId === userApiId)
    if (!asignado) return { response: { error: 'Sin permiso para cobrar este cliente' }, status: 403 }
  }

  const { reciboToken, tokenExpira } = generarReciboToken()
  let numeroRecibo: string | null = null
  try { numeroRecibo = await getConsecutivo(empId!) } catch {}

  const aplicaciones: { syncDeudaId: string; numeroFactura: number | null; externalId: string; montoAplicado: number }[] = []
  let restante = totalAplicado
  for (const d of deudas) {
    if (restante <= 0) break
    const saldoActual = d.nSaldo != null ? Math.min(Number(d.nSaldo), Number(d.saldo)) : Number(d.saldo)
    if (saldoActual <= 0) continue
    const aplicar = Math.min(saldoActual, restante)
    aplicaciones.push({ syncDeudaId: d.id, numeroFactura: d.numeroFactura ?? null, externalId: d.externalId, montoAplicado: aplicar })
    restante -= aplicar
  }

  const saldoAnteriorTotal = deudas.filter((d: any) => aplicaciones.some(a => a.syncDeudaId === d.id)).reduce((s: number, d: any) => s + (d.nSaldo != null ? Number(d.nSaldo) : Number(d.saldo)), 0)
  const valorFacturaTotal = deudas.filter((d: any) => aplicaciones.some(a => a.syncDeudaId === d.id)).reduce((s: number, d: any) => s + Number(d.valor || d.saldo), 0)

  const reciboPago = {
    empresa: {
      nombre:     (empresa as any)?.nombre || null,
      nit:        (empresa as any)?.configRecibos?.nit || null,
      telefono:   (empresa as any)?.configRecibos?.telefono || (empresa as any)?.telefono || null,
      direccion:  (empresa as any)?.configRecibos?.direccion || null,
      logo:       (empresa as any)?.configRecibos?.logo || null,
      anchoPapel: (empresa as any)?.configRecibos?.anchoPapel || '80mm',
      prefijo:    (empresa as any)?.configRecibos?.prefijo || 'REC',
    },
    cliente: { nombre: cliente?.nombre || null, nit: (cliente as any)?.nit || null, telefono: (cliente as any)?.telefono || null, direccion: (cliente as any)?.direccion || null },
    vendedor: vendedorNom || null,
    detalles: aplicaciones.map(a => {
      const descFact = Number((descuentosPorFactura as Record<string, number>)[a.syncDeudaId] || 0)
      const d = deudas.find((x: any) => x.id === a.syncDeudaId)
      const saldoAntes = d ? (d.nSaldo != null ? Number(d.nSaldo) : Number(d.saldo)) : 0
      return { numeroFactura: a.numeroFactura, montoAplicado: a.montoAplicado, valorFactura: d ? Number(d.valor || d.saldo) : 0, saldoAntes, descuento: descFact || null, saldoDespues: Math.max(0, saldoAntes - a.montoAplicado) }
    }),
    saldoAnterior: saldoAnteriorTotal > 0 ? saldoAnteriorTotal : null,
    saldoNuevo: Math.max(0, saldoAnteriorTotal - totalAplicado),
    monto: montoNum,
    descuento: descuentoNum,
    metodoPago: metodoPagoFinal,
    lineasPago: lineasValidas.length > 0 ? lineasValidas : null,
    fechaPago: new Date().toISOString(),
  }

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
          ...(() => {
            const lv = lineasValidas.find((l: any) => ['transferencia', 'nequi', 'banco'].includes(l.metodoPago) && l.voucherKey)
              || (voucherKey && ['transferencia', 'nequi', 'banco'].includes(metodoPagoFinal) ? { voucherKey, voucherDatosIA } : null)
            return lv ? { voucherKey: lv.voucherKey, voucherDatosIA: lv.voucherDatosIA ?? null } : {}
          })(),
          ...(aplicaciones.length > 0 ? {
            Aplicaciones: {
              create: aplicaciones.map(a => ({
                syncDeudaId: a.syncDeudaId,
                numeroFactura: a.numeroFactura,
                externalId: a.externalId,
                montoAplicado: a.montoAplicado,
                descuento: Number((descuentosPorFactura as Record<string, number>)[a.syncDeudaId] || 0) || null,
              })),
            },
          } : {}),
        },
      })

      for (const a of aplicaciones) {
        const sdActual = await tx.syncDeuda.findUnique({ where: { id: a.syncDeudaId }, select: { saldo: true, abono: true, nSaldo: true, nSaldoBase: true } })
        if (!sdActual) continue
        const nuevoSaldo = Math.max(0, Number(sdActual.saldo) - a.montoAplicado)
        const nuevoAbono = Number(sdActual.abono || 0) + a.montoAplicado
        const tieneBase = sdActual.nSaldoBase != null
        const nuevoNSaldo = tieneBase ? undefined : Math.max(0, (sdActual.nSaldo != null ? Number(sdActual.nSaldo) : Number(sdActual.saldo)) - a.montoAplicado)
        await tx.syncDeuda.update({
          where: { id: a.syncDeudaId },
          data: { saldo: nuevoSaldo, abono: nuevoAbono, condition: nuevoSaldo > 0, ...(nuevoNSaldo !== undefined ? { nSaldo: nuevoNSaldo } : {}) },
        })
      }

      const turnoActivo = await tx.turno.findFirst({ where: { empleadoId: empId, activo: true }, select: { id: true } })
      const clienteInterno = await tx.cliente.findFirst({ where: { apiId: clienteApiId, empresaId }, select: { id: true } })
      if (clienteInterno) {
        await tx.visita.create({
          data: {
            empleadoId: empId,
            clienteId: clienteInterno.id,
            turnoId: turnoActivo?.id || null,
            lat: lat != null ? Number(lat) : null,
            lng: lng != null ? Number(lng) : null,
            tipo: 'cobro',
            monto: montoNum,
            nota: pagoCreado.numeroRecibo || null,
            factura: aplicaciones[0]?.numeroFactura != null ? String(aplicaciones[0].numeroFactura) : null,
            fechaBogota: nowBogota(),
          },
        })
      }

      return pagoCreado
    }, { isolationLevel: 'Serializable', timeout: 10000 })
  } catch (txErr: any) {
    if (txErr?.code === 'P2002' && txErr?.meta?.target?.includes('idempotencyKey') && idempotencyKey) {
      const existing = await (prisma as any).pagoCartera.findUnique({ where: { idempotencyKey } })
      if (existing) {
        const empresa2 = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { configRecibos: true } })
        return { response: { pago: existing, anchoPapel: (empresa2 as any)?.configRecibos?.anchoPapel || '80mm', _idempotent: true } }
      }
    }
    throw txErr
  }

  // Post-transacción: actualizar cache
  const integracion = await (prisma as any).integracion.findFirst({ where: { empresaId, tipo: 'uptres', activa: true }, select: { id: true } })
  if (integracion && clienteApiId) {
    const ajustes = reciboPago.detalles.filter((d: any) => d.saldoDespues !== undefined).map((d: any) => {
      const syncDeudaId = aplicaciones.find((a: any) => a.numeroFactura === d.numeroFactura)?.syncDeudaId
      return syncDeudaId ? { syncDeudaId, saldoFinal: Number(d.saldoDespues) } : null
    }).filter(Boolean) as Array<{ syncDeudaId: string; saldoFinal: number }>
    await aplicarPagoEnCache(clienteApiId, integracion.id, empresaId, ajustes)
  }

  await invalidateKeys(
    `g:${empresaId}:stats:${fechaHoyBogota()}`,
    `g:${empresaId}:cartera:resumen:${fechaHoyBogota()}`,
    `g:v:${empId}:${fechaHoyBogota()}`
  )

  actualizarResumenVisita(empId!, { tipo: 'cobro', monto: montoNum, descuento: descuentoNum }, fechaHoyBogota()).catch(() => {})
  invalidarContextoVendedor(empId!).catch(() => {})
  invalidarContextoEmpresa(empresaId).catch(() => {})

  // Fire & forget: huellas vouchers
  void (async () => {
    try {
      const lineas: any[] = Array.isArray(body.lineasPago) ? body.lineasPago : []
      const huellas = lineas.filter((l: any) => l.metodoPago !== 'efectivo' && l.voucherDatosIA && (l.voucherDatosIA.referencia || l.hashArchivo)).map((l: any) => ({
        id: crypto.randomUUID(),
        hashArchivo: l.hashArchivo ?? null,
        referencia: l.voucherDatosIA?.referencia ?? null,
        valor: l.voucherDatosIA?.valor ? String(Math.round(Number(l.voucherDatosIA.valor))) : null,
        fecha: l.voucherDatosIA?.fecha ?? null,
        banco: l.voucherDatosIA?.banco ?? null,
        numeroCuenta: l.voucherDatosIA?.numero_cuenta ?? null,
        titular: l.voucherDatosIA?.titular ?? null,
        pagoId: pago.id,
        empresaId,
        vendedorNombre: vendedorNom ?? null,
      }))
      if (huellas.length > 0) await (prisma as any).voucherHuella.createMany({ data: huellas, skipDuplicates: true })
    } catch (err) { console.error('[voucher-huella] fire&forget error:', err) }
  })()

  return { response: { pago, anchoPapel } satisfies PagoSyncResponse }
}
