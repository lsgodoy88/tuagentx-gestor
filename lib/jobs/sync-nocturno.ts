/**
 * sync-nocturno — lógica extraída del endpoint
 * Usada por: /api/sync/nocturno/route.ts  y  workers/index.ts
 * Sin dependencia de gestor — accede directo a BD y adapters
 */
import { prisma } from '@/lib/prisma'
import { invalidatePattern } from '@/lib/cache'
import { invalidarCacheClientes } from '@/lib/cartera/saldoCliente'
import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'
import { decrypt } from '@/lib/crypto-uptres'
import { calcularEstado } from '@/lib/cartera'
import { nowBogota } from '@/lib/fechas'
import { calcularNSaldoBatch } from '@/lib/cartera/calcularSaldo'
import { actualizarDeudasInactivas } from '@/lib/integracion/sync'
import { recalcularVentasMesImpulsos } from '@/lib/integracion/venta-mes'
import { syncProductosEmpresa } from '@/lib/jobs/sync-delta'

// ── Estado derivado del PagoCartera padre ────────────────────────────────────
// UNICA fuente de verdad: PagoCarteraDeuda.envioEstado por factura. El padre NUNCA
// almacena su propio envioEstado de forma independiente — se calcula aquí, siempre,
// para evitar que padre e hijos se desincronicen (bug real evitado por diseño 24/06).
// Reglas: todas las facturas 'recibido' → 'recibido'. Todas al menos 'enviado'
// (mezcla de enviado/recibido, sin pendientes) → 'enviado'. Cualquier otra
// combinación (al menos una 'pendiente') → 'pendiente'.
export function derivarEnvioEstado(aplicaciones: { envioEstado: string }[]): 'pendiente' | 'enviado' | 'recibido' | 'cierreUptres' {
  if (aplicaciones.length === 0) return 'pendiente'
  const terminados = ['recibido', 'cierreUptres']
  if (aplicaciones.every(a => terminados.includes(a.envioEstado))) {
    // Si alguno es cierreUptres → el recibo padre queda cierreUptres
    return aplicaciones.some(a => a.envioEstado === 'cierreUptres') ? 'cierreUptres' : 'recibido'
  }
  if (aplicaciones.every(a => terminados.includes(a.envioEstado) || a.envioEstado === 'enviado')) return 'enviado'
  return 'pendiente'
}

// Recalcula y persiste el envioEstado derivado de un PagoCartera específico,
// a partir de sus PagoCarteraDeuda actuales. Llamar después de cualquier cambio
// de estado en una aplicación individual (reconciliación, envío manual, etc.)
export async function recalcularEnvioEstadoPago(pagoId: string) {
  const aplicaciones = await (prisma as any).pagoCarteraDeuda.findMany({
    where: { pagoId },
    select: { envioEstado: true }
  })
  const estado = derivarEnvioEstado(aplicaciones)
  const ultimaFecha = await (prisma as any).pagoCarteraDeuda.aggregate({
    where: { pagoId, envioEstado: estado === 'pendiente' ? undefined : { not: 'pendiente' } },
    _max: { envioFecha: true }
  })
  await (prisma as any).pagoCartera.update({
    where: { id: pagoId },
    data: {
      envioEstado: estado,
      envioFecha: estado !== 'pendiente' ? (ultimaFecha._max.envioFecha ?? new Date()) : null,
    }
  })
  return estado
}

// ── Reconciliacion de saldo — unico punto que decide si SyncDeuda.saldo
// se actualiza o se preserva mientras UpTres no confirme pagos locales pendientes/enviados.
// Exportada para testing aislado (no depende de adapter ni de la transaccion del sync completo).
// Busca un subconjunto de aplicaciones cuya suma de montoAplicado coincida exacto
// (tolerancia 1 peso por redondeo) con el target. Caso real: pagos parciales que
// UpTres confirma en momentos distintos — el sync puede ver "bajó X" donde X coincide
// con UNO de los pagos pendientes, no con la suma de todos. Backtracking exhaustivo,
// limitado a 20 aplicaciones (2^20 manejable; más que eso es un caso anómalo que no
// debería intentar resolverse por inferencia automática — preservar sin marcar).
// Si hay múltiples subconjuntos que calzan, retorna el de MENOS elementos (el más
// conservador: marca el mínimo necesario como recibido).
export function encontrarSubsetExacto(
  aplicaciones: { id: string; montoAplicado: any }[],
  target: number
): { id: string; montoAplicado: any }[] | null {
  if (aplicaciones.length === 0 || aplicaciones.length > 20 || target <= 0) return null
  let mejor: { id: string; montoAplicado: any }[] | null = null
  function backtrack(idx: number, acumulado: number, elegidos: { id: string; montoAplicado: any }[]) {
    if (Math.abs(acumulado - target) < 1 && elegidos.length > 0) {
      if (!mejor || elegidos.length < mejor.length) mejor = [...elegidos]
      return
    }
    if (idx >= aplicaciones.length || acumulado > target + 1) return
    const a = aplicaciones[idx]
    const monto = Number(a.montoAplicado)
    elegidos.push(a)
    backtrack(idx + 1, acumulado + monto, elegidos)
    elegidos.pop()
    backtrack(idx + 1, acumulado, elegidos)
  }
  backtrack(0, 0, [])
  return mejor
}

export interface ReconciliarInput {
  sdId: string
  externalId: string
  saldo: number               // saldo crudo UpTres AHORA — solo referencia
  valor: number               // valor factura — inmutable
  condicionUpTres: boolean
  saldoUptresAnterior: number // snapshot anterior — para calcular delta
  saldoLocalActual: number    // mantenido por compatibilidad tests existentes
  externalUpdatedAt?: Date | null
  receivableAt?: Date | null
  fechaVencimiento?: Date | null
  fechaVencimientoActual?: Date | null  // valor actual en BD — evita findUnique en reconciliarDeuda
  data?: any
}

export async function reconciliarDeuda(u: ReconciliarInput, integracionId: string) {
  // baseUpdate: solo metadata de UpTres — NUNCA toca saldo ni nSaldo.
  // nSaldo lo calcula reconstruirCartera (valor - SUM pagos nuestros).
  // saldo (referencia cruda UpTres) se actualiza solo cuando UpTres es autoridad.
  const baseUpdate: any = {
    valor: u.valor,
    saldoUptresOriginal: u.saldo,        // referencia cruda UpTres — solo para confrontar
    externalUpdatedAt: u.externalUpdatedAt ?? null,
    receivableAt: u.receivableAt ?? null,
    // fechaVencimiento: write-once — se añade condicionalmente abajo si no existe aún
    sincronizadoEl: new Date(),
    data: u.data,
  }
  const whereSd = { integracionId_externalId: { integracionId, externalId: u.externalId } }

  // Helper: marcar aplicaciones como recibidas y recalcular estado del recibo padre
  async function marcarAplicacionesRecibidasYRecalcular(aplicacionIds: string[], fecha: Date) {
    if (aplicacionIds.length === 0) return
    await (prisma as any).pagoCarteraDeuda.updateMany({
      where: { id: { in: aplicacionIds } },
      data: { envioEstado: 'recibido', envioFecha: fecha, receivableAtUptres: fecha }
    })
    const pagoIds = await (prisma as any).pagoCarteraDeuda.findMany({
      where: { id: { in: aplicacionIds } },
      select: { pagoId: true },
      distinct: ['pagoId']
    })
    await Promise.all(pagoIds.map((p: any) => recalcularEnvioEstadoPago(p.pagoId)))
  }

  // Helper: marcar aplicaciones como cierreUptres (deuda cerrada sin receivableAt explícito)
  async function marcarAplicacionesCierreUptres(aplicacionIds: string[]) {
    if (aplicacionIds.length === 0) return
    await (prisma as any).pagoCarteraDeuda.updateMany({
      where: { id: { in: aplicacionIds } },
      data: { envioEstado: 'cierreUptres' }
    })
    const pagoIds = await (prisma as any).pagoCarteraDeuda.findMany({
      where: { id: { in: aplicacionIds } },
      select: { pagoId: true },
      distinct: ['pagoId']
    })
    await Promise.all(pagoIds.map((p: any) => recalcularEnvioEstadoPago(p.pagoId)))
  }

  // ── MISIÓN 1: UpTres certifica deuda saldada ──────────────────────────────
  // Única vez que UpTres tiene autoridad sobre condition. nSaldo lo fijará
  // reconstruirCartera en 0 porque condition=false excluye la deuda.
  if (u.condicionUpTres === false) {
    const aplicacionesPendientes = await (prisma as any).pagoCarteraDeuda.findMany({
      where: { syncDeudaId: u.sdId, envioEstado: { in: ['pendiente', 'enviado'] } },
      select: { id: true }
    })
    if (u.receivableAt) {
      // UpTres confirmó con receivableAt explícito → recibido
      await marcarAplicacionesRecibidasYRecalcular(
        aplicacionesPendientes.map((a: any) => a.id),
        u.receivableAt
      )
    } else {
      // Deuda cerrada sin receivableAt → cierreUptres (pago llegó pero sin señal individual)
      await marcarAplicacionesCierreUptres(aplicacionesPendientes.map((a: any) => a.id))
    }
    return (prisma as any).syncDeuda.update({
      where: whereSd,
      data: {
        ...baseUpdate,
        saldo: u.saldo,
        condition: false,
        ...(!u.fechaVencimientoActual && u.fechaVencimiento ? { fechaVencimiento: u.fechaVencimiento } : {})
      }
    })
  }

  // ── MISIÓN 2: confirmar pagos que UpTres ya reflejó ──────────────────────
  // Compara delta (cuánto bajó UpTres) con pagos pendientes/enviados.
  // Si coinciden exacto o por subconjunto → marcar recibido.
  // En ningún caso se toca saldo ni nSaldo — eso es territorio de reconstruirCartera.
  const delta = u.saldoUptresAnterior - u.saldo
  const aplicacionesPendientes = await (prisma as any).pagoCarteraDeuda.findMany({
    where: { syncDeudaId: u.sdId, envioEstado: { in: ['pendiente', 'enviado'] } },
    select: { id: true, montoAplicado: true, pagoId: true }
  })
  const pendienteLocal = aplicacionesPendientes.reduce((s: number, a: any) => s + Number(a.montoAplicado), 0)

  if (pendienteLocal > 0 && Math.abs(delta - pendienteLocal) < 1) {
    // Delta exacto — UpTres confirmó todos los pagos pendientes
    await marcarAplicacionesRecibidasYRecalcular(
      aplicacionesPendientes.map((a: any) => a.id),
      u.receivableAt ?? new Date()
    )
  } else if (delta > 0 && delta < pendienteLocal) {
    // Delta parcial — buscar subconjunto exacto
    const subset = encontrarSubsetExacto(aplicacionesPendientes, delta)
    if (subset) {
      await marcarAplicacionesRecibidasYRecalcular(
        subset.map((a: any) => a.id),
        u.receivableAt ?? new Date()
      )
    }
  }

  // Siempre actualizar metadata. saldo (referencia UpTres) se actualiza siempre —
  // es solo referencia para confrontación, no afecta lo que ve el vendedor.
  return (prisma as any).syncDeuda.update({
    where: whereSd,
    data: {
      ...baseUpdate,
      saldo: u.saldo,
      ...(!u.fechaVencimientoActual && u.fechaVencimiento ? { fechaVencimiento: u.fechaVencimiento } : {})
    }
  })
}

// ── Reconstruir CarteraCache ─────────────────────────────────────────────────
export async function reconstruirCartera(integracionId: string, empresaId: string, soloClienteApiIds?: string[]) {
  const deudas = await (prisma as any).syncDeuda.findMany({
    where: {
      integracionId, condition: true, // condition=true (UpTres activa) — el filtro de saldo>0
      // ahora se aplica sobre nSaldo (nuestra matematica), no sobre saldo crudo de UpTres,
      // ver FIX 26/06 mas abajo: vTotal - SUM(todos nuestros pagos) puede ya ser 0 aunque
      // UpTres siga mostrando saldo>0 por movimientos externos a nuestra app
      ...(soloClienteApiIds && soloClienteApiIds.length > 0 ? { clienteApiId: { in: soloClienteApiIds } } : {})
    }
  })

  // FIX 26/06 (v1, nSaldo=valor-pagos) → CORREGIDO 27/06 (v2, ancla saldoAnterior)
  // → CORREGIDO 28/06 (v3) tras hallazgo real adicional: v2 asumía que
  // PagoCartera.saldoAnterior es confiable por factura — pero en recibos
  // MULTI-FACTURA ese campo vive a nivel de RECIBO, no por factura — la
  // 2da+ factura de un mismo recibo heredaba el saldoAnterior de la 1ra
  // factura del recibo (22 facturas reales afectadas en Lumeli, 10 recibos).
  // FIX v3 — para LUMELI exclusivamente: se obtuvo cartera real de UpTres al
  // corte 2026-06-02 21:08:15 (archivo Deuda-LUMELI-total-completa-total-
  // 02_06_2026.xlsx, verificado: 511/511 facturas existían en BD, 0 huérfanas).
  // Para las facturas que YA EXISTÍAN en ese corte: nSaldo = saldoInicial
  // (LumeliSaldoInicial0206) − SUM(pagos nuestros con createdAt > corte).


  const sdIds = deudas.map((d: any) => d.id)
  const todasLasAplicaciones = sdIds.length > 0 ? await (prisma as any).pagoCarteraDeuda.findMany({
    where: { syncDeudaId: { in: sdIds } },
    select: { syncDeudaId: true, montoAplicado: true, createdAt: true, PagoCartera: { select: { saldoAnterior: true } } },
    orderBy: { createdAt: 'asc' }
  }) : []
  const apls = todasLasAplicaciones.map((a: any) => ({
    syncDeudaId: a.syncDeudaId,
    montoAplicado: a.montoAplicado,
    createdAt: a.createdAt,
    saldoAnterior: a.PagoCartera?.saldoAnterior ?? null,
  }))
  const nSaldoMap = calcularNSaldoBatch(
    deudas.map((d: any) => ({ id: d.id, valor: d.valor, numeroFactura: d.numeroFactura, nSaldo: d.nSaldo, saldo: d.saldo, nSaldoBase: d.nSaldoBase, nSaldoBaseAt: d.nSaldoBaseAt, ajusteManual: d.ajusteManual })),
    apls
  )

  const apiIds = [...new Set(deudas.map((d: any) => d.clienteApiId))]
  const clientes = await (prisma as any).cliente.findMany({
    where: { apiId: { in: apiIds }, empresaId },
    select: { id: true, apiId: true, nombre: true, nit: true, telefono: true, ciudad: true }
  })
  const clienteMap: Record<string, any> = {}
  clientes.forEach((c: any) => { clienteMap[c.apiId] = c })

  const empleadoApiIds = [...new Set(deudas.map((d: any) => d.empleadoExternalId).filter(Boolean))] as string[]
  const empleados = await (prisma as any).empleado.findMany({
    where: { apiId: { in: empleadoApiIds }, empresaId },
    select: { apiId: true, nombre: true }
  })
  const empleadoMap: Record<string, string> = {}
  empleados.forEach((e: any) => { empleadoMap[e.apiId] = e.nombre })

  const porCliente: Record<string, any[]> = {}
  for (const d of deudas) {
    if (!porCliente[d.clienteApiId]) porCliente[d.clienteApiId] = []
    porCliente[d.clienteApiId].push(d)
  }

  const ahora = nowBogota()
  for (const [apiId, deudasCliente] of Object.entries(porCliente)) {
    const cliente = clienteMap[apiId]
    if (!cliente) continue

    const conteoEmpleado: Record<string, number> = {}
    for (const d of deudasCliente) {
      if (d.empleadoExternalId) conteoEmpleado[d.empleadoExternalId] = (conteoEmpleado[d.empleadoExternalId] || 0) + 1
    }
    const empleadoPrincipal = Object.keys(conteoEmpleado).sort((a, b) => conteoEmpleado[b] - conteoEmpleado[a])[0] ?? null

    let saldoTotal = 0
    let saldoPendiente = 0
    const porEstado: Record<string, number> = { critica: 0, mora: 0, vencida: 0, proxima: 0, pendiente: 0, vigente: 0, abonada: 0, pagada: 0 }

    const deudasOrdenadas = [...deudasCliente].sort((a: any, b: any) => {
      const fa = a.fechaVencimiento ? new Date(a.fechaVencimiento).getTime() : Infinity
      const fb = b.fechaVencimiento ? new Date(b.fechaVencimiento).getTime() : Infinity
      return fa - fb
    })

    // FIX 28/06 (v3) — prioridad de fuentes para nSaldo, de más a menos confiable:
    //   1. Lumeli + factura existía al corte 02/06 → saldoInicial (archivo real,
    //      verificado) − pagos nuestros POSTERIORES al corte (v3, ver arriba).
    //   2. Factura con ≥1 pago nuestro → ancla saldoAnterior − TODOS los pagos (v2).
    //   3. Sin pago nuestro y sin archivo → saldo crudo de UpTres directo (v1 fallback).
    // d.saldo se preserva en BD sin tocar (reconciliarDeuda() sigue actualizándolo
    // normal, sirve de referencia para "Revisar" en recaudos/route.ts).
    const deudasDetalle = deudasOrdenadas
      .map((d: any) => {
        const valor = Number(d.valor)
        const nSaldo = nSaldoMap[d.id]?.nSaldo ?? Math.max(0, Number(d.nSaldo ?? d.saldo ?? d.valor))
        const { estado } = calcularEstado(nSaldo, valor, Number(d.abono), d.fechaVencimiento)
        // Si tiene nSaldoBase → abonos externos reflejados como valor-nSaldo (igual que Carlos con LumeliSaldoInicial)
        const abonoEfectivo = d.nSaldoBase != null ? Math.max(0, valor - nSaldo) : Number(d.abono)
        return { id: d.id, externalId: d.externalId, numeroOrden: d.numeroOrden, numeroFactura: d.numeroFactura, valor, saldo: nSaldo, abono: abonoEfectivo, diasCredito: d.diasCredito, fechaVencimiento: d.fechaVencimiento, estado, _nSaldo: nSaldo }
      })
      .filter((d: any) => d._nSaldo > 0) // FIX 26/06: ya no se muestra si nuestra propia cuenta da 0

    for (const d of deudasDetalle) {
      porEstado[d.estado] = (porEstado[d.estado] || 0) + d.saldo
      saldoTotal += d.valor
      saldoPendiente += d.saldo
      delete (d as any)._nSaldo
    }

    // FIX 26/06 — cliente sin saldo pendiente real: antes este 'continue' saltaba
    // el upsert dejando un registro VIEJO huérfano en CarteraCache si el cliente
    // ya tenía cache previo (mostraba saldo desactualizado indefinidamente, nunca
    // se limpiaba). Con nSaldo (este FIX) más clientes llegan a $0 más rápido que
    // antes (ya no esperan confirmación de UpTres) — se vuelve más frecuente, así
    // que ahora se borra explícitamente el cache existente en vez de solo saltar.
    if (saldoPendiente <= 0) {
      await (prisma as any).carteraCache.deleteMany({ where: { integracionId, clienteApiId: apiId } })
      continue
    }

    await (prisma as any).carteraCache.upsert({
      where: { integracionId_clienteApiId: { integracionId, clienteApiId: apiId } },
      create: { id: `cc-${integracionId}-${apiId}`, empresaId, integracionId, clienteId: cliente.id, clienteApiId: apiId, nombre: cliente.nombre, nit: cliente.nit, telefono: cliente.telefono, ciudad: cliente.ciudad, empleadoExternalId: empleadoPrincipal, empleadoNombre: empleadoPrincipal ? (empleadoMap[empleadoPrincipal] ?? null) : null, saldoTotal, saldoPendiente, porEstado, deudas: deudasDetalle, totalDeudas: deudasDetalle.length, ultimaActualizacion: ahora },
      update: { clienteId: cliente.id, nombre: cliente.nombre, nit: cliente.nit, telefono: cliente.telefono, ciudad: cliente.ciudad, empleadoExternalId: empleadoPrincipal, empleadoNombre: empleadoPrincipal ? (empleadoMap[empleadoPrincipal] ?? null) : null, saldoTotal, saldoPendiente, porEstado, deudas: deudasDetalle, totalDeudas: deudasDetalle.length, ultimaActualizacion: ahora }
    })

    // Persistir nSaldo v3 en SyncDeuda — fuente de verdad para recibos y pago-sync
    await Promise.all(deudasDetalle.map((d: any) =>
      (prisma as any).syncDeuda.update({
        where: { id: d.id },
        data: { nSaldo: d.saldo }
      })
    ))
  }

  // Limpiar cache con saldo=0 (deudas ya pagadas)
  await (prisma as any).carteraCache.deleteMany({
    where: { integracionId, saldoPendiente: { lte: 0 } }
  })

  return Object.keys(porCliente).length
}

// ── Función principal exportada ──────────────────────────────────────────────
export interface SyncNocturnoOpts {
  modo?: 'completo' | 'delta'
}

export interface SyncNocturnoResultado {
  empresaId: string
  deudas?: number
  insertadas?: number
  actualizadas?: number
  clientesCache?: number
  productosSync?: { upserted: number; desactivados: number }
  error?: string
}

export async function runSyncNocturno(opts: SyncNocturnoOpts = {}): Promise<SyncNocturnoResultado[]> {
  const modo = opts.modo ?? 'completo'

  const integraciones = await (prisma as any).integracion.findMany({
    where: { tipo: 'uptres', activa: true },
    select: { id: true, empresaId: true, config: true }
  })

  const resultados: SyncNocturnoResultado[] = []

  for (const intg of integraciones) {
    try {
      const config = intg.config as any
      const apiSecret = decrypt(config.apiSecret, process.env.UPTRES_SECRET!)
      const adapter = new UpTresAdapter(config.apiKey, apiSecret)
      await adapter.login()

      let desde: Date | undefined
      if (modo === 'delta') {
        const ultima = await (prisma as any).syncDeuda.aggregate({
          where: { integracionId: intg.id },
          _max: { externalUpdatedAt: true }
        })
        desde = ultima._max.externalUpdatedAt
          ? new Date(new Date(ultima._max.externalUpdatedAt).getTime() - 5 * 60 * 1000)
          : new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      }

      const deudas = await adapter.fetchDeudas(desde)
      const externalIds = deudas.map((d: any) => String(d.uid || d._id))
      const existentes = await (prisma as any).syncDeuda.findMany({
        where: { integracionId: intg.id, externalId: { in: externalIds } },
        select: { id: true, externalId: true, saldo: true, saldoUptresOriginal: true, clienteApiId: true, fechaVencimiento: true }
      })
      const existentesMap = new Map(existentes.map((e: any) => [e.externalId, e]))
      const existentesSet = new Set(existentes.map((e: any) => e.externalId))

      const toInsert: any[] = []
      const toUpdate: any[] = []

      for (const d of deudas) {
        const externalId = String(d.uid || d._id)
        const saldo = parseFloat(String(d.vSaldo ?? '0'))
        const valor = parseFloat(String(d.vTotal ?? '0'))
        const externalUpdatedAt = d.fModificado ? new Date(d.fModificado) : null
        const receivableAt = d.receivableAt ? new Date(d.receivableAt) : null

        if (existentesSet.has(externalId)) {
          const sdLocal: any = existentesMap.get(externalId)
          toUpdate.push({
            externalId, saldo, valor, externalUpdatedAt, receivableAt, data: d,
            fechaVencimiento: d.fPago ? new Date(d.fPago) : null,
            fechaVencimientoActual: sdLocal.fechaVencimiento ?? null,
            condicionUpTres: Boolean(d.condicionUpTres !== false),
            sdId: sdLocal.id,
            clienteApiId: d.cliente?.uid || sdLocal.clienteApiId || '',
            saldoLocalActual: Number(sdLocal.nSaldo ?? sdLocal.saldo),
            saldoUptresAnterior: sdLocal.saldoUptresOriginal != null ? Number(sdLocal.saldoUptresOriginal) : Number(sdLocal.nSaldo ?? sdLocal.saldo),
          })
        } else {
          toInsert.push({
            integracionId: intg.id,
            externalId,
            clienteApiId: d.cliente?.uid || '',
            empleadoExternalId: d.empleado?.uid || null,
            numeroOrden: d.numeroOrden ? parseInt(String(d.numeroOrden)) : null,
            numeroFactura: d.numeroFacturado ? parseInt(String(d.numeroFacturado)) : null,
            valor,
            saldo,
            diasCredito: d.dias ? parseInt(String(d.dias)) : null,
            fechaVencimiento: d.fPago ? new Date(d.fPago) : null,
            condition: Boolean(d.condicionUpTres !== false), // condition real de UpTres
            data: d as any,
            externalUpdatedAt,
            receivableAt,
            sincronizadoEl: new Date(),
          })
        }
      }

      if (toInsert.length) {
        await (prisma as any).syncDeuda.createMany({ data: toInsert, skipDuplicates: true })
      }

      // Reconciliacion — delegada a reconciliarDeuda (testeada aisladamente)
      const CHUNK = 100
      for (let i = 0; i < toUpdate.length; i += CHUNK) {
        const chunk = toUpdate.slice(i, i + CHUNK)
        await Promise.all(chunk.map((u: any) => reconciliarDeuda({
          sdId: u.sdId, externalId: u.externalId, saldo: u.saldo, valor: u.valor,
          condicionUpTres: u.condicionUpTres, saldoUptresAnterior: u.saldoUptresAnterior,
          saldoLocalActual: u.saldoLocalActual, externalUpdatedAt: u.externalUpdatedAt,
          receivableAt: u.receivableAt, data: u.data,
          fechaVencimientoActual: u.fechaVencimientoActual,
        }, intg.id)))
      }

      // FIX 26/06 — fetchDeudas(desde) filtra por createdAt de la orden en UpTres,
      // NO por actividad/receivableAt reciente (confirmado: 20 deudas reales con pago
      // pendiente quedaban fuera de este filtro por tener createdAt viejo, aunque
      // hubieran recibido pago hace poco — solo se reconciliaban el domingo en modo
      // completo). fetchDeudasDesde() usa /cartera/update, filtrado por receivableAt
      // real — SÍ cubre ese hueco. Solo en modo delta (en completo ya se trae todo
      // sin filtro, este bloque sería redundante).
      if (modo === 'delta') {
        try {
          const maxReceivable = await (prisma as any).syncDeuda.aggregate({
            where: { integracionId: intg.id, receivableAt: { not: null } },
            _max: { receivableAt: true }
          })
          const desdeCartera = maxReceivable._max.receivableAt
            ? new Date(new Date(maxReceivable._max.receivableAt).getTime() - 5 * 60 * 1000)
            : new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
          const deudasConPago = await adapter.fetchDeudasDesde(desdeCartera)
          if (deudasConPago.length > 0) {
            const extIdsConPago = deudasConPago.map((d: any) => String(d.uid || d._id))
            const sdExistentes = await (prisma as any).syncDeuda.findMany({
              where: { integracionId: intg.id, externalId: { in: extIdsConPago } },
              select: { id: true, externalId: true, saldo: true, saldoUptresOriginal: true, fechaVencimiento: true }
            })
            const sdMap = new Map(sdExistentes.map((sd: any) => [sd.externalId, sd]))
            for (const d of deudasConPago) {
              const externalId = String(d.uid || d._id)
              const sdLocal: any = sdMap.get(externalId)
              if (!sdLocal) continue // no existe localmente todavía — la crea el bloque normal
              await reconciliarDeuda({
                sdId: sdLocal.id,
                externalId,
                saldo: parseFloat(String((d as any).vSaldo ?? '0')),
                valor: parseFloat(String((d as any).vTotal ?? '0')),
                condicionUpTres: Boolean((d as any).condicionUpTres !== false),
                saldoUptresAnterior: sdLocal.saldoUptresOriginal != null ? Number(sdLocal.saldoUptresOriginal) : Number(sdLocal.nSaldo ?? sdLocal.saldo),
                saldoLocalActual: Number(sdLocal.nSaldo ?? sdLocal.saldo),
                externalUpdatedAt: (d as any).fModificado ? new Date((d as any).fModificado) : null,
                receivableAt: (d as any).receivableAt ? new Date((d as any).receivableAt) : null,
                data: d,
                fechaVencimientoActual: sdLocal.fechaVencimiento ?? null,
              }, intg.id)
            }
          }
        } catch (eReceivable: any) {
          console.error(`[sync-nocturno] fetchDeudasDesde (receivableAt) fallo (no critico):`, eReceivable.message)
        }
      }

      if (modo === 'completo') {
        const externalIdsActivos = new Set(externalIds)
        // fetchAll trae todo sin filtro condition — seguro marcar masivamente
        await (prisma as any).syncDeuda.updateMany({
          where: { integracionId: intg.id, condition: true, externalId: { notIn: Array.from(externalIdsActivos) } },
          data: { condition: false, sincronizadoEl: new Date() }
        })
      }

      const clienteApiIdsAfectados = [...new Set([
        ...toInsert.map((t: any) => t.clienteApiId).filter(Boolean),
        ...toUpdate.map((u: any) => u.clienteApiId).filter(Boolean),
      ])] as string[]

      const clientesActualizados = modo === 'completo'
        ? await reconstruirCartera(intg.id, intg.empresaId)
        : (clienteApiIdsAfectados.length > 0 ? await reconstruirCartera(intg.id, intg.empresaId, clienteApiIdsAfectados) : 0)

      // Deudas condition=false con saldo>0 residual — UpTres ya las cerro pero quedo
      // un saldo local sin limpiar. Solo en modo completo (costoso, 1 query por cliente).
      // Estaba importada pero nunca invocada antes de hoy (21/06) — cableada ahora.
      if (modo === 'completo') {
        try {
          await actualizarDeudasInactivas(adapter, intg.id)
        } catch (eInactivas: any) {
          console.error(`[sync-nocturno] actualizarDeudasInactivas fallo (no critico):`, eInactivas.message)
        }
      }

      // Impulso/Rutas Fijas — con adapter real (ya logueado arriba), corrige bug
      // donde integracion-delta.ts lo llamaba sin adapter y omitia clientes con apiId.
      try {
        await recalcularVentasMesImpulsos(intg.empresaId, adapter)
      } catch (eImpulso: any) {
        console.error(`[sync-nocturno] recalcularVentasMesImpulsos fallo (no critico):`, eImpulso.message)
      }

      // Nocturno invalida todo — corre 1 vez/día, datos masivos
      await invalidatePattern('g:*')

      // Invalidar cache Redis de todos los clientes procesados
      const clienteApiIdsActualizados = [...new Set([...toInsert.map((d: any) => d.clienteApiId), ...toUpdate.map((u: any) => u.clienteApiId)].filter(Boolean))]
      await invalidarCacheClientes(intg.empresaId, clienteApiIdsActualizados).catch(() => {})

      // Sync productos (delta o completo segun modo)
      let productosSync = { upserted: 0, desactivados: 0 }
      try {
        const desdeProductos = modo === 'delta'
          ? new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
          : undefined
        productosSync = await syncProductosEmpresa(intg.empresaId, intg.id, config.apiKey, apiSecret, desdeProductos)
      } catch (eProd: any) {
        console.error(`[sync-nocturno] syncProductos fallo (no critico):`, eProd.message)
      }

      resultados.push({ empresaId: intg.empresaId, deudas: deudas.length, insertadas: toInsert.length, actualizadas: toUpdate.length, clientesCache: clientesActualizados, productosSync })
    } catch (err: any) {
      console.error(`[sync-nocturno] Error integracion ${intg.id}:`, err.message)
      // Guardar error en SyncLog para visibilidad
      try {
        await (prisma as any).syncLog.create({
          data: {
            integracionId: intg.id,
            inicio: new Date(),
            fin: new Date(),
            disparadoPor: 'cron',
            tipo: 'nocturno',
            estado: 'error',
            errores: [{ mensaje: err.message, ts: new Date().toISOString() }],
          }
        })
      } catch {}
      resultados.push({ empresaId: intg.empresaId, error: err.message })
    }
  }

  // SyncLog — incluye snapshot de conteos totales (visibilidad/diagnóstico,
  // NO es guard: los jobs de sync no hacen wipe masivo de clientes/empleados/
  // listas hoy — el único riesgo real de wipe es deudas, ya protegido por el
  // guard de marcarZombis()). Snapshot guardado dentro de "errores" con key
  // "_snapshot" para no migrar schema.
  const integracionesMap = Object.fromEntries(integraciones.map((i: any) => [i.empresaId, i.id]))
  await Promise.allSettled(
    resultados.map(async (r) => {
      let snapshot: Record<string, number> | null = null
      try {
        const [clientesTotal, deudasActivas, empleadosActivos, listasTotal] = await Promise.all([
          (prisma as any).cliente.count({ where: { empresaId: r.empresaId } }),
          (prisma as any).syncDeuda.count({ where: { integracionId: integracionesMap[r.empresaId], condition: true } }),
          (prisma as any).empleado.count({ where: { empresaId: r.empresaId, activo: true } }),
          (prisma as any).listaClientes.count({ where: { empresaId: r.empresaId } }),
        ])
        snapshot = { clientesTotal, deudasActivas, empleadosActivos, listasTotal }
      } catch (eSnap: any) {
        console.error(`[sync-nocturno] snapshot fallo (no critico) para ${r.empresaId}:`, eSnap.message)
      }

      return prisma.syncLog.create({
        data: {
          integracionId: integracionesMap[r.empresaId] ?? 'system',
          inicio: new Date(),
          fin: new Date(),
          tipo: 'nocturno',
          estado: r.error ? 'error' : 'ok',
          disparadoPor: 'cron',
          empresaId: r.empresaId,
          deudasSincronizadas: r.deudas ?? 0,
          clientesActualizados: r.clientesCache ?? 0,
          errores: r.error
            ? { message: r.error, ...(snapshot ? { _snapshot: snapshot } : {}) }
            : (snapshot ? { _snapshot: snapshot } : undefined),
        },
      })
    })
  )

  return resultados
}
