/**
 * sync-delta — orquestador F3
 * Responsabilidad: construir DeltaCtx, coordinar dominios, transacción principal, SyncLog
 * Lógica de negocio → lib/bodega/delta.ts | lib/cartera/delta.ts | lib/ventas/delta.ts
 */
import { prisma } from '@/lib/prisma'
import { UpTresAdapter, fetchProductosUptresConCursor, type UpTresCursor } from '@/lib/integracion/adapters/uptres'
import { decrypt } from '@/lib/crypto-uptres'
import { invalidatePattern } from '@/lib/cache'
import { reconstruirCartera } from '@/lib/jobs/sync-nocturno'
import { notificarWA } from '@/lib/notificaciones'
import { deltaBodega, reconciliarOrdenes } from '@/lib/bodega/delta'
import { deltaCartera, recuperadorSyncDeuda, recuperadorInverso } from '@/lib/cartera/delta'
import { deltaVentas } from '@/lib/ventas/delta'
import { type DeltaCtx, mergeResults, emptyResult } from '@/lib/shared/utils/delta-ctx'

export async function runSyncDelta(): Promise<any[]> {
  const integraciones = await (prisma as any).integracion.findMany({
    where: { tipo: 'uptres', activa: true },
    select: { id: true, empresaId: true, config: true },
  })

  const resultados: any[] = []
  for (const intg of integraciones) {
    try {
      const config = intg.config as any
      const apiSecret = decrypt(config.apiSecret, process.env.UPTRES_SECRET!)
      const r = await deltaEmpresa(intg.empresaId, intg.id, config.apiKey, apiSecret)
      resultados.push(r)
    } catch (err: any) {
      resultados.push({ empresaId: intg.empresaId, error: err.message })
      try {
        await (prisma as any).syncLog.create({
          data: {
            integracionId: intg.id, empresaId: intg.empresaId,
            tipo: 'delta', inicio: new Date(), fin: new Date(),
            duracionMs: 0, estado: 'error', disparadoPor: 'cron',
            ordenesNuevas: 0, deudasSincronizadas: 0, clientesNuevos: 0,
            deudasNuevasDelta: 0, comprasSincronizadas: 0,
            errores: JSON.stringify([err.message]),
          },
        })
      } catch {}
    }
  }
  return resultados
}

async function deltaEmpresa(
  empresaId: string,
  integracionId: string,
  apiKey: string,
  apiSecret: string,
  origenVinculadaId: string | null = null,
  empresaDestinoId?: string,
) {
  const destino = empresaDestinoId || empresaId
  const inicioTs = Date.now()
  const schema = process.env.DB_SCHEMA || 'gestor'

  const adapter = new UpTresAdapter(apiKey, apiSecret)
  await adapter.login()

  const empresa = await prisma.empresa.findUnique({
    where: { id: destino },
    select: {
      ultimaSyncBodega: true, ultimaSyncClientes: true,
      sync_cursor_clientes: true, sync_cursor_empleados: true,
      sync_cursor_cartera: true, sync_cursor_cartera_update: true,
      sync_cursor_listas: true, sync_cursor_proveedores: true,
      sync_cursor_ordenes_date: true, sync_cursor_ordenes_deleted: true,
      sync_cursor_ordenes_invoiced: true, fechaInicioBodega: true,
    },
  })

  const ctx: DeltaCtx = {
    adapter, empresaId, integracionId, destino,
    origenVinculadaId, apiKey, apiSecret, schema, empresa,
  }

  // ── Fase 1: dominios en paralelo donde sea seguro ───────────────────────────
  // bodega corre primero (genera toCreate y clientes frescos que cartera puede necesitar)
  const [bodegaResult, carteraResult, ventasResult] = await Promise.all([
    deltaBodega(ctx),
    deltaCartera(ctx),
    deltaVentas(ctx),
  ])

  let result = emptyResult()
  result = mergeResults(result, bodegaResult)
  result = mergeResults(result, carteraResult)
  result = mergeResults(result, ventasResult)

  const toCreate: any[] = (bodegaResult as any)._toCreate ?? []
  const canceladasIds: string[] = (bodegaResult as any)._canceladasIds ?? []
  const clienteApiIds: string[] = (bodegaResult as any)._clienteApiIds ?? []
  const nuevasDeudas: any[] = (carteraResult as any)._nuevasDeudas ?? []
  const ncNuevas: any[] = (carteraResult as any)._ncNuevas ?? []

  // ── Fase 2: transacción principal ───────────────────────────────────────────
  const proximoDesde = new Date(Date.now() - 30 * 60 * 1000)
  try {
    await prisma.$transaction(async (tx: any) => {
      // Upsert órdenes nuevas
      for (const orden of toCreate) {
        if (!orden.origenId) continue
        await tx.ordenDespacho.upsert({
          where: { origenId_empresaId: { origenId: orden.origenId, empresaId: orden.empresaId } },
          create: orden,
          update: {
            ...(orden.ciudad ? { ciudad: orden.ciudad } : {}),
            ...(orden.direccion ? { direccion: orden.direccion } : {}),
            ...(orden.telefono ? { telefono: orden.telefono } : {}),
          },
        })
      }

      // Canceladas
      if (canceladasIds.length) {
        await tx.ordenDespacho.updateMany({
          where: { origenId: { in: canceladasIds }, empresaId: destino },
          data: { isActiva: false },
        })
      }

      // Rellenar dirección desde Cliente local (UpTres no trae address en órdenes)
      if (toCreate.length > 0) {
        const nuevosOrigenIds = toCreate.map((o: any) => o.origenId).filter(Boolean)
        await tx.$executeRawUnsafe(`
          UPDATE ${schema}."OrdenDespacho" od
          SET
            direccion = COALESCE(od.direccion, NULLIF(c.direccion, '')),
            telefono  = COALESCE(NULLIF(od.telefono, ''), c.telefono)
          FROM ${schema}."Cliente" c
          WHERE c."apiId" = od."clienteApiId"
            AND od."empresaId" = $1
            AND od."origenId" = ANY($2::text[])
            AND (od.direccion IS NULL OR od.telefono IS NULL OR od.telefono = '')
        `, destino, nuevosOrigenIds)
      }

      // Deudas nuevas de cursor cartera
      if (nuevasDeudas.length > 0) {
        const deudaRows = nuevasDeudas.map((d: any) => ({
          integracionId, externalId: String(d.uid || d._id),
          clienteApiId: d.cliente?.uid || '', empleadoExternalId: d.empleado?.uid || null,
          numeroOrden: d.numeroOrden ? parseInt(String(d.numeroOrden)) : null,
          numeroFactura: d.numeroFacturado ? parseInt(String(d.numeroFacturado)) : null,
          valor: parseFloat(d.vTotal ?? '0'), saldo: parseFloat(d.vSaldo ?? '0'),
          diasCredito: d.dias ? parseInt(String(d.dias)) : null,
          fechaVencimiento: d.fPago ? new Date(d.fPago) : null,
          condition: true, data: d,
          externalUpdatedAt: d.fModificado ? new Date(d.fModificado) : null,
          receivableAt: d.receivableAt ? new Date(d.receivableAt) : null,
          sincronizadoEl: new Date(),
          createdAtBogota: d.fCreado
            ? new Date(new Date(d.fCreado).getTime() - 5 * 60 * 60 * 1000)
            : new Date(Date.now() - 5 * 60 * 60 * 1000),
        }))
        await tx.syncDeuda.createMany({ data: deudaRows, skipDuplicates: true })
      }

      // Notas crédito
      if (ncNuevas.length > 0) {
        const ncRows = ncNuevas.map((n: any) => ({
          integracionId, empresaId: destino, externalId: String(n.orderNumber),
          clienteApiId: n.customerDocument || '',
          cufeInvoice: n.cufeInvoice || null,
          total: parseFloat(n.total ?? '0'),
          condition: n.condition !== false,
          externalCreatedAt: n.createdAt ? new Date(n.createdAt) : null,
          sincronizadoEl: new Date(),
        }))
        await tx.syncNotaCredito.createMany({ data: ncRows, skipDuplicates: true })
      }

      await tx.empresa.update({ where: { id: destino }, data: { ultimaSyncBodega: proximoDesde } })
    }, { timeout: 30000 })
  } catch (err: any) {
    console.error('[delta] insert-ordenes error:', err.message)
    result.erroresParciales.push('insert-ordenes: ' + err.message)
    try { await notificarWA('573219182435', `🚨 *Delta error*\n${destino}\n${err.message?.slice(0, 120)}`) } catch {}
  }

  // ── Fase 3: post-transacción ─────────────────────────────────────────────────
  if (toCreate.length || result.deudasNuevasDelta || result.clientesNuevos) {
    try {
      const apiIdsAfectados = [...new Set([
        ...clienteApiIds,
        ...nuevasDeudas.map((d: any) => d.cliente?.uid).filter(Boolean),
      ])]
      const intgDestino = await (prisma as any).integracion.findFirst({
        where: { empresaId: destino, tipo: 'uptres', activa: true },
        select: { id: true },
      })
      await reconstruirCartera(
        intgDestino?.id || integracionId,
        destino,
        apiIdsAfectados.length > 0 ? apiIdsAfectados : undefined,
      )
    } catch (e: any) { result.erroresParciales.push('cache: ' + e.message) }
    await invalidatePattern(`g:${destino}:*`)
  }

  // ── Fase 4: reconciliadores ──────────────────────────────────────────────────
  const recResult = await reconciliarOrdenes(ctx, result.ordenesRaw, result.ordenesDate, toCreate)
  result.reconciliadas += recResult.reconciliadas
  result.huecosRecuperados += recResult.huecosRecuperados
  result.erroresParciales.push(...recResult.erroresParciales)

  const recSD = await recuperadorSyncDeuda(ctx)
  result.huecosRecuperados += recSD.huecosRecuperados
  result.erroresParciales.push(...recSD.erroresParciales)

  const recInv = await recuperadorInverso(ctx)
  result.erroresParciales.push(...recInv.erroresParciales)

  // Reconstruir CarteraCache para clientes cuyas deudas creó el recuperador inverso
  if (recInv.clienteApiIdsCreados.length > 0) {
    try {
      const intgDestino = await (prisma as any).integracion.findFirst({
        where: { empresaId: destino, tipo: 'uptres', activa: true },
        select: { id: true },
      })
      await reconstruirCartera(
        intgDestino?.id || integracionId,
        destino,
        [...new Set(recInv.clienteApiIdsCreados)],
      )
      console.log(`[delta] recuperador-inverso: reconstruido CarteraCache para ${recInv.clienteApiIdsCreados.length} clientes`)
    } catch (e: any) {
      result.erroresParciales.push('recuperador-inverso-cache: ' + (e as any).message)
    }
  }

  // ── SyncLog ──────────────────────────────────────────────────────────────────
  const duracionMs = Date.now() - inicioTs
  try {
    await (prisma as any).syncLog.create({
      data: {
        integracionId, empresaId: destino,
        tipo: 'delta', inicio: new Date(inicioTs), fin: new Date(),
        duracionMs, estado: result.erroresParciales.length > 0 ? 'parcial' : 'ok',
        disparadoPor: 'cron',
        ordenesNuevas: result.ordenesNuevas,
        deudasSincronizadas: 0,
        clientesNuevos: result.clientesNuevos,
        deudasNuevasDelta: result.deudasNuevasDelta,
        comprasSincronizadas: result.ordenesRaw.length,
        ...(result.empleadosActualizados ? { empleadosActualizados: result.empleadosActualizados } : {}),
        ...(result.saldosActualizados ? { saldosActualizados: result.saldosActualizados } : {}),
        ...(result.reconciliadas ? { reconciliadas: result.reconciliadas } : {}),
        ...(result.erroresParciales.length > 0 ? { errores: JSON.stringify(result.erroresParciales) } : {}),
        detalle: result.timings,
      },
    })
  } catch (logErr: any) { console.error('[delta] syncLog insert error:', logErr.message) }

  return {
    empresaId: destino,
    ordenes: result.ordenesRaw.length,
    nuevasOrdenes: result.ordenesNuevas,
    nuevasDeudas: nuevasDeudas.length,
    clientesNuevos: result.clientesNuevos,
    deudasNuevasDelta: result.deudasNuevasDelta,
    empleadosActualizados: result.empleadosActualizados,
    listasActualizadas: result.listasActualizadas,
    proveedoresActualizados: result.proveedoresActualizados,
    saldosActualizados: result.saldosActualizados,
    reconciliadas: result.reconciliadas,
    huecosRecuperados: result.huecosRecuperados,
    ordenesDateActualizadas: result.ordenesDateActualizadas,
    erroresParciales: result.erroresParciales,
  }
}


export async function syncProductosEmpresa(
  empresaId: string,
  integracionId: string,
  apiKey: string,
  apiSecret: string,
  cursor?: UpTresCursor | null
): Promise<{ upserted: number; desactivados: number; nuevoCursor: UpTresCursor | null }> {
  const authRes = await fetch('https://serviceuptres.cloud/external/v1/auth/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, apiSecret }),
  }).then(r => r.json())
  if (!authRes.ok || !authRes.token) throw new Error('Login UpTres fallido en syncProductos: ' + (authRes.msg || ''))

  const { data: productos, ultimoCursor: nuevoCursor } = await fetchProductosUptresConCursor(apiKey, authRes.token, cursor ?? null)
  if (productos.length === 0) return { upserted: 0, desactivados: 0, nuevoCursor: cursor ?? null }

  const DB_SCHEMA = process.env.DB_SCHEMA || 'gestor'
  const now = new Date()
  const BATCH = 100
  let upserted = 0

  for (let i = 0; i < productos.length; i += BATCH) {
    const batch = productos.slice(i, i + BATCH)
    const batchIds = batch.map(p => p.id)
    const prevRows: { id: string; inventory: number; stockMinimo: number | null }[] = await (prisma as any).$queryRawUnsafe(
      `SELECT id, inventory, "stockMinimo" FROM ${DB_SCHEMA}."Producto" WHERE id = ANY($1)`,
      batchIds
    )
    const prevMap = new Map(prevRows.map(r => [r.id, r]))
    const batchResults = await Promise.all(batch.map(p =>
      (prisma as any).$queryRawUnsafe(
        'INSERT INTO ' + DB_SCHEMA + '."Producto" ' +
        '(id, "empresaId", "integracionId", condition, nombre, barcode, ' +
        'inventory, precio, marca, linea, punto, invima, ' +
        'prices, "purchasePrice", taxable, tax, tipo, unidad, descripcion, ' +
        '"externalUpdatedAt", "updatedAt", "createdAt") ' +
        'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$21) ' +
        'ON CONFLICT (id) DO UPDATE SET ' +
        'condition=EXCLUDED.condition, nombre=EXCLUDED.nombre, barcode=EXCLUDED.barcode, ' +
        'inventory=EXCLUDED.inventory, precio=EXCLUDED.precio, marca=EXCLUDED.marca, ' +
        'linea=EXCLUDED.linea, punto=EXCLUDED.punto, invima=EXCLUDED.invima, ' +
        'prices=EXCLUDED.prices, "purchasePrice"=EXCLUDED."purchasePrice", ' +
        'taxable=EXCLUDED.taxable, tax=EXCLUDED.tax, tipo=EXCLUDED.tipo, ' +
        'unidad=EXCLUDED.unidad, descripcion=EXCLUDED.descripcion, ' +
        '"externalUpdatedAt"=EXCLUDED."externalUpdatedAt", "updatedAt"=EXCLUDED."updatedAt" ' +
        'RETURNING id, nombre, "stockMinimo", inventory AS nuevo_inv',
        p.id, empresaId, integracionId, p.condition, p.name, p.barcode ?? null,
        p.inventory, p.price ?? null, p.brand ?? null, p.line ?? null, p.point ?? null, p.invima ?? null,
        p.prices ? JSON.stringify(p.prices) : null, p.purchasePrice ?? null,
        p.taxable ?? false, p.tax ?? null, p.type ?? null, p.unit ?? null, p.description ?? null,
        p.updatedAt ? new Date(p.updatedAt) : now, now,
      )
    ))
    upserted += batch.length
    const snapshots: any[] = []
    for (const rows of batchResults) {
      for (const row of (rows as any[])) {
        const prev = prevMap.get(row.id)
        const anterior = prev?.inventory ?? null
        const nuevo = row.nuevo_inv
        const minimo = row.stockMinimo
        if (anterior === null || anterior === nuevo) continue
        if (anterior > 0 && nuevo <= 0) {
          snapshots.push({ id: crypto.randomUUID(), empresaId, productoId: row.id, nombre: row.nombre, inventory: nuevo, stockMinimo: minimo ?? null, estado: 'agotado', createdAt: now })
        } else if (minimo !== null && nuevo > 0 && nuevo < minimo && (anterior >= minimo || anterior > nuevo)) {
          snapshots.push({ id: crypto.randomUUID(), empresaId, productoId: row.id, nombre: row.nombre, inventory: nuevo, stockMinimo: minimo, estado: 'stock_bajo', createdAt: now })
        } else if ((anterior <= 0 && nuevo > 0) || (minimo !== null && anterior < minimo && nuevo >= minimo)) {
          await (prisma as any).$executeRawUnsafe(
            `DELETE FROM ${DB_SCHEMA}."StockSnapshot" WHERE "empresaId"=$1 AND "productoId"=$2`,
            empresaId, row.id
          )
        }
      }
    }
    if (snapshots.length > 0) {
      await (prisma as any).$executeRawUnsafe(
        `INSERT INTO ${DB_SCHEMA}."StockSnapshot" (id,"empresaId","productoId",nombre,inventory,"stockMinimo",estado,"createdAt")
         VALUES ${snapshots.map((_: any, i: number) => `($${i*8+1},$${i*8+2},$${i*8+3},$${i*8+4},$${i*8+5},$${i*8+6},$${i*8+7},$${i*8+8})`).join(',')}
         ON CONFLICT DO NOTHING`,
        ...snapshots.flatMap((s: any) => [s.id, s.empresaId, s.productoId, s.nombre, s.inventory, s.stockMinimo, s.estado, s.createdAt])
      )
    }
  }

  let desactivados = 0
  if (!cursor) {
    const idsActivos = productos.map(p => p.id)
    if (idsActivos.length > 0) {
      const placeholders = idsActivos.map((_: string, i: number) => `$${i + 2}`).join(',')
      const res = await (prisma as any).$executeRawUnsafe(
        `UPDATE ${DB_SCHEMA}."Producto" SET condition=false, "updatedAt"=$1
         WHERE "empresaId"='${empresaId}' AND condition=true AND id NOT IN (${placeholders})`,
        now, ...idsActivos
      )
      desactivados = res ?? 0
    }
  }
  return { upserted, desactivados, nuevoCursor }
}
