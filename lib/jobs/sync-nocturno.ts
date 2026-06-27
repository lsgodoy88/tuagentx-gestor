/**
 * sync-nocturno — lógica extraída del endpoint
 * Usada por: /api/sync/nocturno/route.ts  y  workers/index.ts
 * Sin dependencia de gestor — accede directo a BD y adapters
 */
import { prisma } from '@/lib/prisma'
import { invalidatePattern } from '@/lib/cache'
import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'
import { decrypt } from '@/lib/crypto-uptres'
import { calcularEstado } from '@/lib/cartera'
import { nowBogota } from '@/lib/fechas'
import { actualizarDeudasInactivas } from '@/lib/integracion/sync'
import { recalcularVentasMesImpulsos } from '@/lib/integracion/venta-mes'

// ── Estado derivado del PagoCartera padre ────────────────────────────────────
// UNICA fuente de verdad: PagoCarteraDeuda.envioEstado por factura. El padre NUNCA
// almacena su propio envioEstado de forma independiente — se calcula aquí, siempre,
// para evitar que padre e hijos se desincronicen (bug real evitado por diseño 24/06).
// Reglas: todas las facturas 'recibido' → 'recibido'. Todas al menos 'enviado'
// (mezcla de enviado/recibido, sin pendientes) → 'enviado'. Cualquier otra
// combinación (al menos una 'pendiente') → 'pendiente'.
export function derivarEnvioEstado(aplicaciones: { envioEstado: string }[]): 'pendiente' | 'enviado' | 'recibido' {
  if (aplicaciones.length === 0) return 'pendiente'
  if (aplicaciones.every(a => a.envioEstado === 'recibido')) return 'recibido'
  if (aplicaciones.every(a => a.envioEstado === 'recibido' || a.envioEstado === 'enviado')) return 'enviado'
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
  saldo: number          // saldo crudo que UpTres trae AHORA
  valor: number
  condicionUpTres: boolean
  saldoUptresAnterior: number  // SyncDeuda.saldoUptresOriginal ANTES de este sync
  saldoLocalActual: number     // SyncDeuda.saldo ANTES de este sync
  externalUpdatedAt?: Date | null
  receivableAt?: Date | null
  data?: any
}

export async function reconciliarDeuda(u: ReconciliarInput, integracionId: string) {
  const baseUpdate: any = {
    valor: u.valor,
    saldoUptresOriginal: u.saldo,
    externalUpdatedAt: u.externalUpdatedAt ?? null,
    receivableAt: u.receivableAt ?? null,
    sincronizadoEl: new Date(),
    data: u.data,
  }
  const whereSd = { integracionId_externalId: { integracionId, externalId: u.externalId } }

  // Fuente única de verdad por FACTURA: PagoCarteraDeuda.envioEstado, nunca
  // PagoCartera.envioEstado directo (ese se deriva, ver recalcularEnvioEstadoPago).
  // BUG REAL corregido 24/06: antes se buscaba via PagoCartera.syncDeudaId, que solo
  // guarda la PRIMERA factura de un recibo multi-factura — las facturas 2+ quedaban
  // invisibles para la reconciliación.
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

  if (u.condicionUpTres === false) {
    // UpTres certifica deuda saldada — autoridad maxima, sin ambiguedad
    const aplicacionesDeEstaFactura = await (prisma as any).pagoCarteraDeuda.findMany({
      where: { syncDeudaId: u.sdId, envioEstado: { in: ['pendiente', 'enviado'] } },
      select: { id: true }
    })
    await marcarAplicacionesRecibidasYRecalcular(aplicacionesDeEstaFactura.map((a: any) => a.id), u.receivableAt ?? new Date())
    return (prisma as any).syncDeuda.update({ where: whereSd, data: { ...baseUpdate, saldo: u.saldo, condition: false } })
  }

  // Deuda sigue activa en UpTres — ver si bajo por pagos locales ya conocidos
  const delta = u.saldoUptresAnterior - u.saldo // cuanto bajo segun UpTres desde el ultimo sync
  const aplicacionesNoReflejadas = await (prisma as any).pagoCarteraDeuda.findMany({
    where: { syncDeudaId: u.sdId, envioEstado: { in: ['pendiente', 'enviado'] } },
    select: { id: true, montoAplicado: true, pagoId: true }
  })
  const pendienteLocal = aplicacionesNoReflejadas.reduce((s: number, a: any) => s + Number(a.montoAplicado), 0)
  const pagosNoReflejados = aplicacionesNoReflejadas.map((a: any) => ({ id: a.pagoId, monto: a.montoAplicado }))

  if (pendienteLocal > 0 && Math.abs(delta - pendienteLocal) < 1) {
    // Coincidencia exacta — UpTres reflejo justo lo que teniamos pendiente
    await marcarAplicacionesRecibidasYRecalcular(aplicacionesNoReflejadas.map((a: any) => a.id), u.receivableAt ?? new Date())
    return (prisma as any).syncDeuda.update({ where: whereSd, data: { ...baseUpdate, saldo: u.saldo, condition: u.saldo > 0 } })
  }

  if (delta >= 0 && delta < pendienteLocal) {
    // UpTres bajo, pero no cubre el TOTAL pendiente — antes de asumir "ningún pago
    // individual confirmó todavía", buscar si delta coincide EXACTO con un subconjunto
    // de las aplicaciones pendientes (caso real 25/06: pagos parciales que UpTres
    // confirma en momentos distintos, sin que ninguno coincida con la suma total en
    // el instante del sync — el pago más viejo SÍ puede haber confirmado ya).
    const subset = encontrarSubsetExacto(aplicacionesNoReflejadas, delta)
    if (subset) {
      await marcarAplicacionesRecibidasYRecalcular(subset.map((a: any) => a.id), u.receivableAt ?? new Date())
      return (prisma as any).syncDeuda.update({ where: whereSd, data: { ...baseUpdate, saldo: u.saldo, condition: u.saldo > 0 } })
    }
    // Sin coincidencia exacta de ningún subconjunto — preservar saldo local sin marcar nada
    return (prisma as any).syncDeuda.update({ where: whereSd, data: baseUpdate })
  }

  // Guardia de no-regresión: si el saldo local YA refleja correctamente haber restado
  // pendienteLocal del último saldo conocido de UpTres, el pago local ya está bien
  // aplicado (total o parcial) — UpTres simplemente no lo ha reflejado aún. NO recalcular
  // con la fórmula de ajuste por diferencia, que puede pisar un saldo local correcto
  // cuando saldoUptresAnterior queda desfasado vs la realidad (bug real detectado 24/06:
  // pago total quedó en 0 localmente y el sync siguiente lo revirtió a saldo completo).
  // Requiere delta >= 0 (UpTres no subió) — si UpTres subió (cargo nuevo: intereses, etc.)
  // al mismo tiempo que hay un pago pendiente, la resta de snapshots puede coincidir por
  // casualidad y enmascarar el cargo nuevo (brecha detectada en análisis 24/06). Con
  // delta < 0 se cae al bloque de ajuste por diferencia, que sí suma el cargo nuevo.
  if (pendienteLocal > 0 && delta >= 0) {
    const saldoLocalEsperado = u.saldoUptresAnterior - pendienteLocal
    if (Math.abs(saldoLocalEsperado - u.saldoLocalActual) < 1) {
      return (prisma as any).syncDeuda.update({ where: whereSd, data: baseUpdate })
    }
  }

  // delta no coincide con pendienteLocal (ni cubre limpio, ni es menor) — ej. cargo nuevo
  // ajeno mezclado con pago pendiente. No inferir: aplicar el ajuste sin tocar pagos.
  const ajuste = u.saldoUptresAnterior - u.saldo // positivo = bajo, negativo = subio
  const saldoLocalNuevo = Math.max(0, u.saldoLocalActual - ajuste)
  return (prisma as any).syncDeuda.update({ where: whereSd, data: { ...baseUpdate, saldo: saldoLocalNuevo, condition: saldoLocalNuevo > 0 } })
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

  // FIX 26/06 (v1, nSaldo=valor-pagos) → CORREGIDO 27/06 tras hallazgo real:
  // 109 facturas (Lumeli+Leche) con abonos hechos DIRECTO en UpTres antes de
  // que existieran en nuestra app (ej. factura 3821 Martha Asened: $342.000
  // pagados en UpTres vía recibos 4523/4670/4739/4902, nunca vistos por
  // nosotros) — nSaldo=valor-pagos los ignoraba, mostrando deuda inflada
  // hasta $2.9M en un caso (factura 1581, ya saldada 100% en UpTres).
  // FIX híbrido v2:
  //   - Si la factura YA tiene ≥1 pago nuestro: usar PagoCartera.saldoAnterior
  //     (congelado en pago-sync/route.ts ANTES de aplicar cada pago — captura
  //     el saldo real de UpTres en el momento exacto que empezamos a operar
  //     esa factura, incluyendo cualquier abono externo previo) del pago MÁS
  //     ANTIGUO, menos TODOS nuestros pagos desde entonces.
  //   - Si la factura NUNCA ha tenido pago nuestro: no hay ningún ancla propia
  //     que reconstruir — usar SyncDeuda.saldo crudo de UpTres directo (única
  //     fuente disponible, confirmado 26/06 que backups históricos no dan
  //     ventana útil para reconstruir versus la antigüedad real de los abonos).
  const sdIds = deudas.map((d: any) => d.id)
  const totalPagadoPorDeuda: Record<string, number> = {}
  const saldoAnclaPorDeuda: Record<string, number> = {} // saldoAnterior del primer pago, si existe
  if (sdIds.length > 0) {
    const todasLasAplicaciones = await (prisma as any).pagoCarteraDeuda.findMany({
      where: { syncDeudaId: { in: sdIds } }, // TODOS los estados — pendiente+enviado+recibido
      select: { syncDeudaId: true, montoAplicado: true, descuento: true, createdAt: true, PagoCartera: { select: { saldoAnterior: true } } },
      orderBy: { createdAt: 'asc' }
    })
    for (const a of todasLasAplicaciones) {
      const monto = Number(a.montoAplicado || 0) + Number(a.descuento || 0)
      totalPagadoPorDeuda[a.syncDeudaId] = (totalPagadoPorDeuda[a.syncDeudaId] || 0) + monto
      // El PRIMER pago cronológico (orderBy asc, solo se fija si aún no existe ancla) define el ancla
      if (saldoAnclaPorDeuda[a.syncDeudaId] === undefined && a.PagoCartera?.saldoAnterior != null) {
        saldoAnclaPorDeuda[a.syncDeudaId] = Number(a.PagoCartera.saldoAnterior)
      }
    }
  }

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

    // FIX 27/06 — nSaldo híbrido (ver comentario arriba en el bloque de
    // totalPagadoPorDeuda). d.saldo se preserva en BD sin tocar (reconciliarDeuda()
    // sigue actualizándolo normal cada noche, sirve de referencia para "Revisar"
    // en recaudos/route.ts) — pero deja de ser la base de lo que el vendedor ve
    // SOLO cuando tenemos un ancla propia confiable (saldoAnterior). Sin pago
    // nuestro todavía, d.saldo crudo SIGUE siendo la única fuente real.
    const deudasDetalle = deudasOrdenadas
      .map((d: any) => {
        const valor = Number(d.valor)
        const totalPagado = totalPagadoPorDeuda[d.id] || 0
        const ancla = saldoAnclaPorDeuda[d.id]
        const nSaldo = ancla !== undefined
          ? Math.max(0, ancla - totalPagado)
          : Math.max(0, Number(d.saldo)) // sin pago nuestro aun — usar crudo de UpTres directo
        const { estado } = calcularEstado(nSaldo, valor, Number(d.abono), d.fechaVencimiento)
        return { id: d.id, externalId: d.externalId, numeroOrden: d.numeroOrden, numeroFactura: d.numeroFactura, valor, saldo: nSaldo, abono: Number(d.abono), diasCredito: d.diasCredito, fechaVencimiento: d.fechaVencimiento, estado, _nSaldo: nSaldo }
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
        select: { id: true, externalId: true, saldo: true, saldoUptresOriginal: true, clienteApiId: true }
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
            condicionUpTres: Boolean(d.condicionUpTres !== false),
            sdId: sdLocal.id,
            clienteApiId: d.cliente?.uid || sdLocal.clienteApiId || '',
            saldoLocalActual: Number(sdLocal.saldo),
            saldoUptresAnterior: sdLocal.saldoUptresOriginal != null ? Number(sdLocal.saldoUptresOriginal) : Number(sdLocal.saldo),
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
              select: { id: true, externalId: true, saldo: true, saldoUptresOriginal: true }
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
                saldoUptresAnterior: sdLocal.saldoUptresOriginal != null ? Number(sdLocal.saldoUptresOriginal) : Number(sdLocal.saldo),
                saldoLocalActual: Number(sdLocal.saldo),
                externalUpdatedAt: (d as any).fModificado ? new Date((d as any).fModificado) : null,
                receivableAt: (d as any).receivableAt ? new Date((d as any).receivableAt) : null,
                data: d,
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

      resultados.push({ empresaId: intg.empresaId, deudas: deudas.length, insertadas: toInsert.length, actualizadas: toUpdate.length, clientesCache: clientesActualizados })
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

  // SyncLog
  const integracionesMap = Object.fromEntries(integraciones.map((i: any) => [i.empresaId, i.id]))
  await Promise.allSettled(
    resultados.map((r) =>
      prisma.syncLog.create({
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
          errores: r.error ? { message: r.error } : undefined,
        },
      })
    )
  )

  return resultados
}
