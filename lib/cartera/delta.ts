/**
 * lib/cartera/delta.ts
 * Responsabilidad: deudas nuevas (cursor cartera), carteraUpdate, notas crédito,
 *                  recuperador SyncDeuda→OrdenDespacho, recuperador inverso
 * Llamado por lib/jobs/sync-delta.ts (orquestador)
 */
import { prisma } from '@/lib/shared/infra/prisma'
import { invalidatePattern } from '@/lib/shared/infra/cache'
import { fetchNotasCredito, parseFechaUptresBogota, type UpTresCursor } from '@/lib/integracion/adapters/uptres'
import { type DeltaCtx, type DeltaResult, emptyResult } from '@/lib/shared/utils/delta-ctx'

function toBogota(utcDate: Date | null): Date | null {
  if (!utcDate) return null
  return new Date(utcDate.getTime() - 5 * 60 * 60 * 1000)
}

export async function deltaCartera(ctx: DeltaCtx): Promise<Partial<DeltaResult>> {
  const { adapter, empresaId, destino, integracionId, apiKey, empresa, schema } = ctx
  const result = emptyResult()
  const _t = (k: string, s: number) => { result.timings[k] = Date.now() - s }
  let _s: number

  let nuevasDeudas: any[] = []

  // ─── Cursor cartera (createdAt) ──────────────────────────────────────────────
  try {
    const cursorCartera = empresa?.sync_cursor_cartera as UpTresCursor | null ?? null
    let desdeDeuda: Date | undefined
    if (!cursorCartera) {
      const maxModificada = await (prisma as any).syncDeuda.findFirst({
        where: { integracionId, externalUpdatedAt: { not: null } },
        orderBy: { externalUpdatedAt: 'desc' },
        select: { externalUpdatedAt: true },
      })
      const baseDeuda = maxModificada?.externalUpdatedAt || empresa?.ultimaSyncBodega || new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      desdeDeuda = new Date(baseDeuda.getTime() - 60 * 60 * 1000)
    }
    _s = Date.now()
    const { data: deudasExt, ultimoCursor: nuevoCursorCartera } =
      await adapter.fetchDeudasConCursor(cursorCartera, desdeDeuda)
    _t('fetchCartera', _s)

    if (deudasExt.length > 0) {
      const extIds = deudasExt.map((d: any) => String(d.uid || d._id)).filter(Boolean)
      const existentesDeuda = await (prisma as any).syncDeuda.findMany({
        where: { integracionId, externalId: { in: extIds } },
        select: { externalId: true },
      })
      const existentesDeudaSet = new Set(existentesDeuda.map((d: any) => d.externalId))
      nuevasDeudas = deudasExt.filter((d: any) => {
        const extId = String(d.uid || d._id || '')
        return extId && !existentesDeudaSet.has(extId)
      })
      if (nuevoCursorCartera) {
        await prisma.empresa.update({ where: { id: destino }, data: { sync_cursor_cartera: nuevoCursorCartera } })
      }
    }
  } catch (err: any) {
    console.error('[delta/cartera] deudas error:', err.message)
    result.erroresParciales.push('deudas: ' + err.message)
  }

  // ─── CarteraUpdate — ventana 5 días sin cursor ───────────────────────────────
  try {
    const hace5dias = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
    _s = Date.now()
    const deudasUpdate = await adapter.fetchDeudasDesde(hace5dias)
    _t('fetchCarteraUpdate', _s)

    if (deudasUpdate.length > 0) {
      const extIdsUpdate = deudasUpdate.map((d: any) => String(d.uid || d._id)).filter(Boolean)
      const existentesUpdate = await (prisma as any).syncDeuda.findMany({
        where: { integracionId, externalId: { in: extIdsUpdate } },
        select: { externalId: true },
      })
      const existentesUpdateSet = new Set(existentesUpdate.map((d: any) => d.externalId))
      const nuevasUpdate = deudasUpdate.filter((d: any) => {
        const extId = String(d.uid || d._id || '')
        return extId && !existentesUpdateSet.has(extId)
      })
      if (nuevasUpdate.length > 0) {
        const rows = nuevasUpdate.map((d: any) => ({
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
          createdAtBogota: d.fCreado ? toBogota(new Date(d.fCreado as string)) : toBogota(new Date()),
        }))
        await (prisma as any).syncDeuda.createMany({ data: rows, skipDuplicates: true })
        console.log(`[delta/cartera] carteraUpdate: ${nuevasUpdate.length} deudas nuevas para ${destino}`)
        result.deudasNuevasDelta += nuevasUpdate.length
      }
    }
  } catch (e: any) {
    console.error('[delta/cartera] carteraUpdate error:', e.message)
  }

  // ─── Notas Crédito ───────────────────────────────────────────────────────────
  let ncNuevas: any[] = []
  try {
    const maxNc = await (prisma as any).syncNotaCredito.findFirst({
      where: { integracionId },
      orderBy: { sincronizadoEl: 'desc' },
      select: { sincronizadoEl: true },
    })
    const baseNc = maxNc?.sincronizadoEl || new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    const desdeNc = new Date(baseNc.getTime() - 60 * 60 * 1000)

    const authRes = await fetch('https://serviceuptres.cloud/external/v1/auth/api', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, apiSecret: ctx.apiSecret }),
    }).then(r => r.json())

    if (authRes.ok && authRes.token) {
      _s = Date.now()
      const ncsExt = await fetchNotasCredito(apiKey, authRes.token, desdeNc)
      _t('fetchNotasCredito', _s)
      if (ncsExt.length > 0) {
        const extIds = ncsExt.map((n: any) => String(n.orderNumber)).filter(Boolean)
        const existentesNc = await (prisma as any).syncNotaCredito.findMany({
          where: { integracionId, externalId: { in: extIds } },
          select: { externalId: true },
        })
        const existentesNcSet = new Set(existentesNc.map((n: any) => n.externalId))
        ncNuevas = ncsExt.filter((n: any) => n.orderNumber && !existentesNcSet.has(String(n.orderNumber)))
      }
    }
  } catch (err: any) {
    console.error('[delta/cartera] notas-credito error:', err.message)
    result.erroresParciales.push('notas-credito: ' + err.message)
  }

  // Exportar para la transacción principal del orquestador
  result.deudasNuevasDelta += nuevasDeudas.length
  ;(result as any)._nuevasDeudas = nuevasDeudas
  ;(result as any)._ncNuevas = ncNuevas

  return result
}

// ─── Recuperador SyncDeuda → OrdenDespacho ───────────────────────────────────

export async function recuperadorSyncDeuda(
  ctx: DeltaCtx,
): Promise<{ huecosRecuperados: number; erroresParciales: string[] }> {
  const { adapter, destino, integracionId, empresa, schema } = ctx
  let huecosRecuperados = 0
  const erroresParciales: string[] = []

  try {
    const hace10dias = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    const deudasSinOrden: any[] = await prisma.$queryRawUnsafe(`
      SELECT sd."externalId", sd."numeroFactura", sd."numeroOrden", sd."recuperadorIntentos"
      FROM ${schema}."SyncDeuda" sd
      WHERE sd."integracionId" = $1
        AND sd.condition = true
        AND sd."externalId" IS NOT NULL
        AND sd."numeroFactura" IS NOT NULL
        AND sd."externalUpdatedAt" > $3::timestamp
        AND NOT EXISTS (
          SELECT 1 FROM ${schema}."OrdenDespacho" od
          WHERE od."origenId" = sd."externalId" AND od."empresaId" = $2
        )
        AND (
          sd."recuperadorIntentos" < 3
          OR sd."recuperadorFallidoEn" < NOW() - INTERVAL '7 days'
        )
      ORDER BY sd."numeroFactura" DESC
      LIMIT 10`, ctx.integracionId, destino, hace10dias)

    const hace30diasRec = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const fechaInicioBodegaRec: Date = (empresa as any)?.fechaInicioBodega ?? hace30diasRec

    if (deudasSinOrden.length > 0) {
      console.log(`[delta/cartera] recuperador: ${deudasSinOrden.length} órdenes faltantes para ${destino}`)
      for (const deuda of deudasSinOrden) {
        try {
          const completa = await adapter.fetchOrdenCompletaPorId(deuda.externalId)
          const fechaFacturaOrden = completa?.fechaFactura
            ? new Date(completa.fechaFactura)
            : completa?.createdAt ? new Date(completa.createdAt) : null

          if (completa && completa.clienteNombre && fechaFacturaOrden && fechaFacturaOrden >= fechaInicioBodegaRec) {
            await prisma.ordenDespacho.upsert({
              where: { origenId_empresaId: { origenId: deuda.externalId, empresaId: destino } },
              create: {
                origenId: deuda.externalId, empresaId: destino,
                numeroOrden: completa.numeroOrden, numeroFactura: completa.numeroFactura,
                isFacturada: completa.isFacturada,
                fechaFactura: completa.fechaFactura ? parseFechaUptresBogota(String(completa.fechaFactura)) : null,
                totalOrden: completa.totalOrden, balance: completa.balance,
                paymentType: completa.paymentType ? String(completa.paymentType) : null,
                paymentMethod: completa.paymentMethod != null ? String(completa.paymentMethod) : null,
                clienteApiId: completa.clienteApiId, clienteNit: completa.clienteNit || '',
                clienteNombre: completa.clienteNombre, vendedorApiId: completa.vendedorApiId,
                fechaOrden: completa.createdAt ? parseFechaUptresBogota(String(completa.createdAt)) : new Date(),
                fechaOrdenBogota: (completa.isFacturada && completa.fechaFactura)
                  ? parseFechaUptresBogota(String(completa.fechaFactura))
                  : (completa.createdAt ? parseFechaUptresBogota(String(completa.createdAt)) : new Date()),
                origen: ctx.origenVinculadaId ? 'vinculada' : 'propia',
                origenVinculadaId: ctx.origenVinculadaId,
                ciudad: (completa as any).ciudad || null,
                direccion: (completa as any).direccion || null,
                telefono: (completa as any).telefono || null,
                estado: 'pendiente', sincronizadoEn: new Date(), origenSync: 'recuperada_sync',
              },
              update: {},
            })
            if (completa.clienteApiId && (!(completa as any).ciudad || !(completa as any).direccion)) {
              try {
                await prisma.$queryRawUnsafe(`
                  UPDATE ${schema}."OrdenDespacho" od
                  SET ciudad = COALESCE(od.ciudad, c.ciudad), direccion = COALESCE(od.direccion, c.direccion), telefono = COALESCE(od.telefono, c.telefono)
                  FROM ${schema}."Cliente" c
                  WHERE c."apiId" = od."clienteApiId" AND od."origenId" = $1 AND od."empresaId" = $2
                  AND (c.ciudad IS NOT NULL OR c.direccion IS NOT NULL)`, deuda.externalId, destino)
              } catch { /* ciudad no crítica */ }
            }
            huecosRecuperados++
            console.log(`[delta/cartera] recuperada F_${completa.numeroFactura} orden ${completa.numeroOrden}`)
            if ((deuda.recuperadorIntentos || 0) > 0) {
              await prisma.syncDeuda.updateMany({
                where: { integracionId, externalId: deuda.externalId },
                data: { recuperadorIntentos: 0, recuperadorFallidoEn: null },
              })
            }
          } else {
            console.log(`[delta/cartera] recuperador sin datos F_${deuda.numeroFactura} — intento ${(deuda.recuperadorIntentos || 0) + 1}`)
            await prisma.syncDeuda.updateMany({
              where: { integracionId, externalId: deuda.externalId },
              data: { recuperadorIntentos: { increment: 1 }, recuperadorFallidoEn: new Date() },
            })
          }
        } catch (e: any) {
          console.error('[delta/cartera] recuperador error', deuda.externalId, e.message)
        }
      }
      if (huecosRecuperados > 0) await invalidatePattern(`g:${destino}:*`)
    }
  } catch (e: any) {
    console.error('[delta/cartera] recuperador SyncDeuda error:', e.message)
    erroresParciales.push('recuperadorSyncDeuda: ' + e.message)
  }

  return { huecosRecuperados, erroresParciales }
}

// ─── Recuperador inverso — OrdenDespacho crédito sin SyncDeuda ───────────────

export async function recuperadorInverso(
  ctx: DeltaCtx,
): Promise<{ erroresParciales: string[] }> {
  const { adapter, destino, integracionId, schema } = ctx
  const erroresParciales: string[] = []

  try {
    const hace30diasInv = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const ordenesSinDeuda: any[] = await prisma.$queryRawUnsafe(
      `SELECT od."origenId", od."numeroFactura", od."numeroOrden", od."clienteApiId"
      FROM ${schema}."OrdenDespacho" od
      WHERE od."empresaId" = $1
        AND od."isFacturada" = true
        AND (od."paymentType" = 'credito' OR od."paymentType" IS NULL)
        AND od."fechaOrden" > $2::timestamp
        AND od."origenId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM ${schema}."SyncDeuda" sd
          JOIN ${schema}."Integracion" i ON i.id = sd."integracionId" AND i."empresaId" = $1
          WHERE sd."externalId" = od."origenId"
        )
      ORDER BY od."numeroFactura" DESC
      LIMIT 10`,
      destino, hace30diasInv
    )

    if (ordenesSinDeuda.length > 0) {
      console.log(`[delta/cartera] recuperador-inverso: ${ordenesSinDeuda.length} deudas faltantes para ${destino}`)
      for (const od of ordenesSinDeuda) {
        try {
          const deudaExt = await adapter.fetchDeudasCliente(od.clienteApiId)
          const match = deudaExt.find((d: any) => String(d.uid || d._id) === od.origenId)
          if (match) {
            const m = match as any
            await (prisma as any).syncDeuda.upsert({
              where: { integracionId_externalId: { integracionId, externalId: od.origenId } },
              create: {
                integracionId, externalId: od.origenId,
                clienteApiId: m.cliente?.uid || od.clienteApiId || '',
                empleadoExternalId: m.empleado?.uid || null,
                numeroOrden: od.numeroOrden ? parseInt(String(od.numeroOrden)) : null,
                numeroFactura: od.numeroFactura ? parseInt(String(od.numeroFactura)) : null,
                valor: parseFloat(m.vTotal ?? '0'), saldo: parseFloat(m.vSaldo ?? '0'),
                diasCredito: m.dias ? parseInt(String(m.dias)) : null,
                fechaVencimiento: m.fPago ? new Date(m.fPago) : null,
                condition: true, data: m,
                externalUpdatedAt: m.fModificado ? new Date(m.fModificado) : null,
                receivableAt: m.receivableAt ? new Date(m.receivableAt) : null,
                sincronizadoEl: new Date(),
                createdAtBogota: m.fCreado ? new Date(new Date(m.fCreado).getTime() - 5 * 60 * 60 * 1000) : new Date(Date.now() - 5 * 60 * 60 * 1000),
              },
              update: { sincronizadoEl: new Date() },
            })
            console.log(`[delta/cartera] recuperador-inverso: creada SyncDeuda F_${od.numeroFactura} orden ${od.numeroOrden}`)
            // Corregir paymentType en OrdenDespacho si llegó null por race condition con UpTres
            if (!od.paymentType) {
              try {
                await prisma.$queryRawUnsafe(`UPDATE ${schema}."OrdenDespacho" SET "paymentType" = 'credito' WHERE "origenId" = $1 AND "empresaId" = $2 AND "paymentType" IS NULL`, od.origenId, destino)
              } catch { /* no crítico */ }
            }
          } else {
            console.log(`[delta/cartera] recuperador-inverso: F_${od.numeroFactura} no encontrada en /cartera cliente ${od.clienteApiId}`)
          }
        } catch (e: any) {
          console.error('[delta/cartera] recuperador-inverso error', od.origenId, e.message)
        }
      }
      await invalidatePattern(`g:${destino}:*`)
    }
  } catch (e: any) {
    console.error('[delta/cartera] recuperador-inverso error:', e.message)
    erroresParciales.push('recuperadorInverso: ' + e.message)
  }

  return { erroresParciales }
}
