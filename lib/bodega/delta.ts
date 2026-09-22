/**
 * lib/bodega/delta.ts
 * Responsabilidad: sync incremental de clientes, empleados, órdenes y reconciliadores
 * Llamado por lib/jobs/sync-delta.ts (orquestador)
 */
import { prisma } from '@/lib/shared/infra/prisma'
import {
  parseFechaUptresBogota,
  fetchOrdenesDateConCursor,
  fetchOrdenesInvoicedConCursor,
  fetchOrdenesDeletedConCursor,
  type UpTresCursor,
} from '@/lib/integracion/adapters/uptres'
import { invalidatePattern } from '@/lib/shared/infra/cache'
import { notificarWA } from '@/lib/shared/push/notificaciones'
import { type DeltaCtx, type DeltaResult, emptyResult } from '@/lib/shared/utils/delta-ctx'
import fs from 'fs'
import path from 'path'

const municipiosDANE: Record<string, string> = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'public/municipios_dane.json'), 'utf-8')
)

function toBogota(utcDate: Date | null): Date | null {
  if (!utcDate) return null
  return new Date(utcDate.getTime() - 5 * 60 * 60 * 1000)
}

export async function deltaBodega(ctx: DeltaCtx): Promise<Partial<DeltaResult>> {
  const { adapter, empresaId, destino, origenVinculadaId, empresa, schema } = ctx
  const result = emptyResult()
  const _t = (k: string, s: number) => { result.timings[k] = Date.now() - s }
  let _s: number

  // ─── fetchVentas ────────────────────────────────────────────────────────────
  const ahoraBogota = new Date(Date.now() - 5 * 60 * 60 * 1000)
  const desde = new Date(Date.UTC(
    ahoraBogota.getUTCFullYear(), ahoraBogota.getUTCMonth(), ahoraBogota.getUTCDate()
  ) + 5 * 60 * 60 * 1000)

  const ordenes = process.env.DISABLE_FETCH_VENTAS === 'true'
    ? []
    : await adapter.fetchVentas(desde)
  if (process.env.DISABLE_FETCH_VENTAS !== 'true') _t('fetchVentas', Date.now())
  result.ordenesRaw = ordenes

  const ordenesValidas = ordenes.filter((o: any) => {
    const numFactura = o.numeroFacturado ? String(o.numeroFacturado) : null
    const nombre = o.clienteNombre || o.clienteNombreApi
    const origenId = String(o.uid || o._id || '')
    return numFactura && nombre && origenId
  })

  const origenIds = ordenesValidas.map((o: any) => String(o.uid || o._id))
  const existentes = await (prisma as any).ordenDespacho.findMany({
    where: {
      empresaId: destino,
      origenId: { in: origenIds },
      ...(origenVinculadaId ? { origenVinculadaId } : { origenVinculadaId: null }),
    },
    select: { origenId: true },
  })
  const existentesSet = new Set(existentes.map((e: any) => e.origenId))
  const nuevasOrdenes = ordenesValidas.filter((o: any) => !existentesSet.has(String(o.uid || o._id)))

  // ─── Clientes locales para nuevas órdenes ───────────────────────────────────
  const clienteApiIds = [...new Set(nuevasOrdenes.map((o: any) => o.cliente?.uid).filter(Boolean))]
  const clienteNits = [...new Set(nuevasOrdenes.map((o: any) => o.clienteNit).filter(Boolean))]
  const _orClientes = [
    ...(clienteApiIds.length ? [{ apiId: { in: clienteApiIds } }] : []),
    ...(clienteNits.length ? [{ nit: { in: clienteNits } }] : []),
  ]
  let clientesLocales = _orClientes.length > 0
    ? await (prisma as any).cliente.findMany({
        where: { empresaId: destino, OR: _orClientes },
        select: { apiId: true, nit: true, ciudad: true, direccion: true, telefono: true },
      })
    : []

  // ─── Sync incremental clientes ──────────────────────────────────────────────
  try {
    const cursorClientes = empresa?.sync_cursor_clientes as UpTresCursor | null ?? null
    const desdeClientes = empresa?.ultimaSyncClientes || new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    _s = Date.now()
    const { data: clientesUpTres, ultimoCursor: nuevoCursorClientes } =
      await adapter.fetchClientesConCursor(cursorClientes, desdeClientes)
    _t('fetchClientes', _s)

    if (clientesUpTres.length > 0) {
      const apiIds = clientesUpTres.map((c: any) => c.uid).filter(Boolean)
      const existentesClientes = await (prisma as any).cliente.findMany({
        where: { empresaId: destino, apiId: { in: apiIds } },
        select: { id: true, apiId: true, nombre: true, ciudad: true, direccion: true, telefono: true },
      })
      const existentesMap = new Map<string, any>(existentesClientes.map((e: any) => [e.apiId, e]))
      const updates: Promise<any>[] = []
      const creates: any[] = []

      for (const c of clientesUpTres) {
        if (!c.uid) continue
        const nombre = `${c.name || ''} ${c.lastName || ''}`.trim()
        const existing = existentesMap.get(c.uid)
        if (existing) {
          const cambios: any = {}
          if (nombre && nombre !== existing.nombre) cambios.nombre = nombre
          if (c.ciudad && c.ciudad !== existing.ciudad) { cambios.ciudad = c.ciudad; cambios.lat = null; cambios.lng = null; cambios.ubicacionReal = false }
          if (c.dir && c.dir !== existing.direccion) { cambios.direccion = c.dir; cambios.lat = null; cambios.lng = null; cambios.ubicacionReal = false }
          if (c.nCel && c.nCel !== existing.telefono) cambios.telefono = c.nCel
          if (Object.keys(cambios).length > 0)
            updates.push((prisma as any).cliente.update({ where: { id: existing.id }, data: cambios }))
        } else {
          creates.push({
            empresaId: destino, apiId: c.uid,
            nombre, nit: c.doc || '',
            ciudad: c.ciudad || null, direccion: c.dir || null,
            telefono: c.nCel || null, email: c.email || null,
          })
        }
      }

      _s = Date.now()
      await Promise.all(updates)
      if (creates.length > 0) await (prisma as any).cliente.createMany({ data: creates, skipDuplicates: true })
      _t('upsertClientes', _s)

      const maxUpdatedAt = clientesUpTres.reduce((max: Date, c: any) => {
        const t = c.fModificado ? new Date(c.fModificado) : null
        return t && t > max ? t : max
      }, empresa?.ultimaSyncClientes || new Date(0))

      await prisma.empresa.update({
        where: { id: destino },
        data: {
          ultimaSyncClientes: maxUpdatedAt,
          ...(nuevoCursorClientes ? { sync_cursor_clientes: nuevoCursorClientes } : {}),
        },
      })

      if (_orClientes.length > 0) {
        clientesLocales = await (prisma as any).cliente.findMany({
          where: { empresaId: destino, OR: _orClientes },
          select: { apiId: true, nit: true, ciudad: true, direccion: true, telefono: true },
        })
      }
    }
  } catch (e: any) {
    console.warn('[delta/bodega] sync-clientes error:', e.message)
  }

  const porApiId = new Map(clientesLocales.filter((c: any) => c.apiId).map((c: any) => [c.apiId, c]))
  const porNit = new Map(clientesLocales.filter((c: any) => c.nit).map((c: any) => [c.nit, c]))

  // ─── Retry órdenes sin customerId ───────────────────────────────────────────
  const nuevasOrdenesConDatos: any[] = []
  for (const orden of nuevasOrdenes) {
    if (!orden.cliente?.uid) {
      const origenId = String(orden.uid || orden._id)
      try {
        const completa = await adapter.fetchOrdenCompletaPorId(origenId)
        if (completa?.clienteApiId || completa?.clienteNit || completa?.clienteNombre) {
          nuevasOrdenesConDatos.push({
            ...orden,
            cliente: { uid: completa.clienteApiId },
            clienteNit: orden.clienteNit || completa.clienteNit,
            clienteNombreApi: orden.clienteNombreApi || completa.clienteNombre,
            ciudad: completa.ciudad,
            direccion: completa.direccion,
            telefono: orden.telefono || completa.telefono,
          })
        } else {
          console.warn(`[delta/bodega] orden ${origenId} sin customerId tras retry — omitida`)
        }
      } catch { console.warn(`[delta/bodega] fetchOrdenCompletaPorId falló para ${origenId}`) }
    } else {
      nuevasOrdenesConDatos.push(orden)
    }
  }

  // ─── Build toCreate ──────────────────────────────────────────────────────────
  const toCreate = nuevasOrdenesConDatos.map((orden: any) => {
    const origenId = String(orden.uid || orden._id)
    let ciudadNombre = (orden.ciudad as string) || ''
    if (orden.cityId && municipiosDANE[String(orden.cityId)]) ciudadNombre = municipiosDANE[String(orden.cityId)]
    else if (ciudadNombre.includes('/')) ciudadNombre = ciudadNombre.split('/').pop()?.trim() || ciudadNombre
    let direccion = orden.direccion || ''
    let telefono = orden.telefono || ''
    let clienteNit = orden.clienteNit || ''
    const clienteApiId = orden.cliente?.uid || null
    const cli = (clienteApiId && porApiId.get(clienteApiId)) || (clienteNit && porNit.get(clienteNit))
    if (cli) {
      if (!ciudadNombre && cli.ciudad) ciudadNombre = cli.ciudad
      if (!direccion && cli.direccion) direccion = cli.direccion
      if (!telefono && cli.telefono) telefono = cli.telefono
      if (!clienteNit && cli.nit) clienteNit = cli.nit
    }
    return {
      numeroOrden: String(orden.numeroOrden || ''),
      numeroFactura: String(orden.numeroFacturado),
      vendedorApiId: orden.empleado?.uid || null,
      clienteApiId, clienteNombre: orden.clienteNombre || orden.clienteNombreApi,
      clienteNit, ciudad: ciudadNombre, direccion, telefono,
      fechaOrden: orden.fCreado ? parseFechaUptresBogota(orden.fCreado as string) : new Date(),
      fechaOrdenBogota: (orden.isInvoiced && orden.invoicedAt)
        ? parseFechaUptresBogota(orden.invoicedAt)
        : (orden.fCreado ? parseFechaUptresBogota(orden.fCreado as string) : new Date()),
      totalOrden: orden.vTotal ? parseFloat(orden.vTotal) : null,
      isFacturada: orden.isInvoiced === true,
      isActiva: (orden as any).isActiva !== false,
      fechaFactura: orden.invoicedAt ? parseFechaUptresBogota(orden.invoicedAt) : null,
      discount: (orden as any).discount ? parseFloat((orden as any).discount) : null,
      balance: (orden as any).balance ? parseFloat((orden as any).balance) : null,
      paymentType: (orden as any).paymentType || null,
      paymentMethod: (orden as any).paymentMethod || null,
      isDelivered: (orden as any).isDelivered ?? null,
      isShipped: (orden as any).isShipped ?? null,
      isCompleted: (orden as any).isCompleted ?? null,
      amountItems: (orden as any).amountItems || null,
      empresaId: destino,
      origen: origenVinculadaId ? 'vinculada' : 'propia',
      origenId, origenVinculadaId,
      estado: 'pendiente', sincronizadoEn: new Date(), origenSync: 'delta',
    }
  })

  // ─── Empleados ───────────────────────────────────────────────────────────────
  try {
    const cursorEmpleados = empresa?.sync_cursor_empleados as UpTresCursor | null ?? null
    let desdeEmp: Date | undefined
    if (!cursorEmpleados) {
      const maxEmpleado = await (prisma as any).empleado.aggregate({
        where: { empresaId: destino, apiId: { not: null } },
        _max: { createdAt: true },
      })
      const baseEmp = maxEmpleado._max.createdAt || empresa?.ultimaSyncBodega || new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      desdeEmp = new Date(baseEmp.getTime() - 30 * 60 * 1000)
    }
    _s = Date.now()
    const { data: empleadosExt, ultimoCursor: nuevoCursorEmpleados } =
      await adapter.fetchEmpleadosConCursor(cursorEmpleados, desdeEmp)
    _t('fetchEmpleados', _s)

    if (empleadosExt.length > 0) {
      const apiIds = empleadosExt.map((e: any) => e.uid).filter(Boolean)
      const existentesEmp = await (prisma as any).empleado.findMany({
        where: { empresaId: destino, apiId: { in: apiIds } },
        select: { apiId: true },
      })
      const existentesEmpSet = new Set(existentesEmp.map((e: any) => e.apiId))
      const aActualizar = empleadosExt.filter((e: any) => e.uid && existentesEmpSet.has(e.uid))
      for (const e of aActualizar) {
        await (prisma as any).empleado.updateMany({
          where: { empresaId: destino, apiId: e.uid },
          data: {
            ...(e.nCel ? { telefono: e.nCel } : {}),
            ...(e.doc ? { documento: e.doc } : {}),
            ...(e.ciudad ? { ciudadApiId: e.ciudad } : {}),
          },
        })
      }
      result.empleadosActualizados = aActualizar.length
      if (nuevoCursorEmpleados) {
        await prisma.empresa.update({ where: { id: destino }, data: { sync_cursor_empleados: nuevoCursorEmpleados } })
      }
    }
  } catch (err: any) {
    console.error('[delta/bodega] empleados error:', err.message)
    result.erroresParciales.push('empleados: ' + err.message)
  }

  // ─── Ordenes date (updatedAt) ────────────────────────────────────────────────
  let ordenesDate: any[] = []
  try {
    const cursorOrdenesDate = empresa?.sync_cursor_ordenes_date as UpTresCursor | null ?? null
    const desdeOrdenesDate = cursorOrdenesDate ? new Date(0) : new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    _s = Date.now()
    const { data: _ordenesDate, ultimoCursor: nuevoCursorOrdenesDate } =
      await fetchOrdenesDateConCursor(ctx.apiKey, adapter.currentToken, cursorOrdenesDate, desdeOrdenesDate)
    _t('fetchOrdenesDate', _s)
    ordenesDate = _ordenesDate
    result.ordenesDate = ordenesDate

    if (ordenesDate.length > 0) {
      const updates: Promise<any>[] = []
      for (const o of ordenesDate) {
        const origenId = String(o.id || '')
        if (!origenId) continue
        const dataUpdate: any = {
          totalOrden: o.total ? parseFloat(o.total) : undefined,
          balance: o.balance !== undefined ? parseFloat(o.balance) : undefined,
          reconciliadoEn: new Date(),
        }
        if (o.isInvoiced && o.invoiceNumber) {
          dataUpdate.isFacturada = true
          dataUpdate.numeroFactura = String(o.invoiceNumber)
          dataUpdate.fechaFactura = o.invoicedAt ? parseFechaUptresBogota(o.invoicedAt) : null
        }
        updates.push(
          prisma.ordenDespacho.updateMany({ where: { origenId, empresaId: destino }, data: dataUpdate })
            .then(() => { result.ordenesDateActualizadas++ })
        )
      }
      await Promise.all(updates)
      if (nuevoCursorOrdenesDate) {
        await prisma.empresa.update({ where: { id: destino }, data: { sync_cursor_ordenes_date: nuevoCursorOrdenesDate } })
      }
    }
  } catch (err: any) {
    console.error('[delta/bodega] ordenes/date error:', err.message)
    result.erroresParciales.push('ordenes_date: ' + err.message)
  }

  // ─── Ordenes invoiced ────────────────────────────────────────────────────────
  try {
    const cursorOrdenesInvoiced = empresa?.sync_cursor_ordenes_invoiced as UpTresCursor | null ?? null
    const desdeOrdenesInvoiced = cursorOrdenesInvoiced ? new Date(0) : new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    _s = Date.now()
    const { data: ordenesInvoiced, ultimoCursor: nuevoCursorOrdenesInvoiced } =
      await fetchOrdenesInvoicedConCursor(ctx.apiKey, adapter.currentToken, cursorOrdenesInvoiced, desdeOrdenesInvoiced)
    _t('fetchOrdenesInvoiced', _s)

    if (ordenesInvoiced.length > 0) {
      for (const o of ordenesInvoiced) {
        const origenId = String(o.id || '')
        if (!origenId || !o.isInvoiced || !o.invoiceNumber) continue
        try {
          const daneCode = o.cityId || o.customer?.city || o.customer?.cityId
          const ciudad = daneCode ? (municipiosDANE[String(daneCode)] || null) : null
          const clienteApiId = o.customerId || ''
          const cliLocal = clienteApiId
            ? await prisma.cliente.findFirst({ where: { empresaId: destino, apiId: clienteApiId }, select: { direccion: true, telefono: true } })
            : null
          const direccion = cliLocal?.direccion || null
          const telefono = o.phone || o.customer?.phone || cliLocal?.telefono || null
          const clienteNombre = o.customer ? `${o.customer.firstName || ''} ${o.customer.lastName || ''}`.trim() : ''
          await prisma.ordenDespacho.upsert({
            where: { origenId_empresaId: { origenId, empresaId: destino } },
            create: {
              empresaId: destino, origen: origenVinculadaId ? 'vinculada' : 'propia', origenId,
              numeroOrden: String(o.orderNumber ?? ''), numeroFactura: String(o.invoiceNumber),
              isFacturada: true,
              fechaFactura: o.invoicedAt ? parseFechaUptresBogota(o.invoicedAt) : null,
              totalOrden: o.total ? parseFloat(o.total) : null,
              balance: o.balance !== undefined ? parseFloat(o.balance) : null,
              clienteApiId, clienteNit: o.customer?.document || null, clienteNombre,
              vendedorApiId: o.employeeId || null, ciudad, direccion, telefono,
              fechaOrden: o.createdAt ? parseFechaUptresBogota(o.createdAt) : null,
              fechaOrdenBogota: o.invoicedAt ? parseFechaUptresBogota(o.invoicedAt) : (o.createdAt ? parseFechaUptresBogota(o.createdAt) : null),
              estado: 'pendiente', sincronizadoEn: new Date(), origenSync: 'delta', reconciliadoEn: new Date(),
            },
            update: {
              isFacturada: true, numeroFactura: String(o.invoiceNumber),
              fechaFactura: o.invoicedAt ? parseFechaUptresBogota(o.invoicedAt) : null,
              fechaOrdenBogota: o.invoicedAt ? parseFechaUptresBogota(o.invoicedAt) : null,
              totalOrden: o.total ? parseFloat(o.total) : null,
              balance: o.balance !== undefined ? parseFloat(o.balance) : null,
              reconciliadoEn: new Date(),
            },
          })
          result.ordenesInvoicedCreadas++
        } catch (e: any) {
          console.error('[delta/bodega] ordenes/invoiced upsert falló origenId=' + origenId + ':', e.message)
        }
      }
      if (nuevoCursorOrdenesInvoiced) {
        await prisma.empresa.update({ where: { id: destino }, data: { sync_cursor_ordenes_invoiced: nuevoCursorOrdenesInvoiced } })
      }
      if (result.ordenesInvoicedCreadas > 0) await invalidatePattern(`g:${destino}:*`)
    }
  } catch (err: any) {
    console.error('[delta/bodega] ordenes/invoiced error:', err.message)
    result.erroresParciales.push('ordenes_invoiced: ' + err.message)
  }

  // ─── Ordenes deleted ─────────────────────────────────────────────────────────
  try {
    const cursorOrdenesDeleted = empresa?.sync_cursor_ordenes_deleted as UpTresCursor | null ?? null
    const desdeOrdenesDeleted = cursorOrdenesDeleted ? new Date(0) : new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    _s = Date.now()
    const { data: ordenesDeleted, ultimoCursor: nuevoCursorOrdenesDeleted } =
      await fetchOrdenesDeletedConCursor(ctx.apiKey, adapter.currentToken, cursorOrdenesDeleted, desdeOrdenesDeleted)
    _t('fetchOrdenesDeleted', _s)

    if (ordenesDeleted.length > 0) {
      const origenIdsDeleted = ordenesDeleted.map((o: any) => String(o.id)).filter(Boolean)
      if (origenIdsDeleted.length > 0) {
        const res = await prisma.ordenDespacho.updateMany({
          where: { origenId: { in: origenIdsDeleted }, empresaId: destino, isActiva: true },
          data: { isActiva: false },
        })
        result.ordenesEliminadas = res.count
        if (res.count > 0) {
          console.log(`[delta/bodega] ${destino}: ${res.count} órdenes marcadas inactivas`)
          await invalidatePattern(`g:${destino}:*`)
        }
      }
      if (nuevoCursorOrdenesDeleted) {
        await prisma.empresa.update({ where: { id: destino }, data: { sync_cursor_ordenes_deleted: nuevoCursorOrdenesDeleted } })
      }
    }
  } catch (err: any) {
    console.error('[delta/bodega] ordenes/deleted error:', err.message)
    result.erroresParciales.push('ordenes_deleted: ' + err.message)
  }

  // ─── Validación consecutivos ─────────────────────────────────────────────────
  const canceladasIds = ordenesValidas
    .filter((o: any) => (o as any).isActiva === false)
    .map((o: any) => String(o.uid || o._id))

  const todasFacturasUpTres = ordenesValidas
    .filter((o: any) => o.numeroFactura && Number(o.numeroFactura) > 0)
    .map((o: any) => Number(o.numeroFactura))
    .sort((a: number, b: number) => a - b)

  if (todasFacturasUpTres.length > 0) {
    const maxUpTres = todasFacturasUpTres[todasFacturasUpTres.length - 1]
    const setUpTres = new Set(todasFacturasUpTres)
    const ultimaEnBD = await (prisma as any).ordenDespacho.findFirst({
      where: { empresaId: destino, isFacturada: true, numeroFactura: { not: null } },
      orderBy: { numeroFactura: 'desc' },
      select: { numeroFactura: true },
    })
    const maxEnBD = ultimaEnBD?.numeroFactura ? Number(ultimaEnBD.numeroFactura) : null
    if (maxEnBD && maxUpTres > maxEnBD) {
      const faltantesEnBD: number[] = []
      for (let i = maxEnBD + 1; i <= maxUpTres; i++) { if (!setUpTres.has(i)) faltantesEnBD.push(i) }
      if (faltantesEnBD.length > 0) {
        const msg = `🔢 *Brecha consecutivos*\n*Empresa:* ${destino}\n*BD:* #${maxEnBD} | *UpTres:* #${maxUpTres}\n*No encontradas:* #${faltantesEnBD.slice(0, 10).join(', #')}`
        try { await notificarWA('573219182435', msg) } catch {}
      }
    }
  }

  // Exportar para que el orquestador los use en la transacción principal
  result.ordenesNuevas = toCreate.length
  ;(result as any)._toCreate = toCreate
  ;(result as any)._canceladasIds = canceladasIds
  ;(result as any)._clienteApiIds = clienteApiIds

  return result
}

// ─── Reconciliadores (llamados post-transacción por el orquestador) ──────────

export async function reconciliarOrdenes(
  ctx: DeltaCtx,
  ordenes: any[],
  ordenesDate: any[],
  toCreate: any[],
): Promise<{ reconciliadas: number; huecosRecuperados: number; erroresParciales: string[] }> {
  const { adapter, empresaId, destino, origenVinculadaId, schema } = ctx
  let reconciliadas = 0
  let huecosRecuperados = 0
  const erroresParciales: string[] = []

  // Reconciliador órdenes sin facturar
  try {
    const sinFacturar = await prisma.ordenDespacho.findMany({
      where: { empresaId: destino, isFacturada: false, isActiva: true, origenId: { not: null } },
      select: { id: true, origenId: true, fechaOrden: true },
    })
    if (sinFacturar.length > 0) {
      const mapaFetch = new Map(ordenes.map((o: any) => [String(o.uid || o._id), o]))
      const updates: Promise<any>[] = []
      const sinFacturarAntiguas: typeof sinFacturar = []

      for (const orden of sinFacturar) {
        const uptresFetch = mapaFetch.get(orden.origenId!)
        if (uptresFetch) {
          if ((uptresFetch as any).isInvoiced && (uptresFetch as any).numeroFacturado) {
            updates.push(prisma.ordenDespacho.update({
              where: { id: orden.id },
              data: {
                isFacturada: true, numeroFactura: (uptresFetch as any).numeroFacturado,
                fechaFactura: (uptresFetch as any).invoicedAt ? parseFechaUptresBogota((uptresFetch as any).invoicedAt) : null,
                totalOrden: (uptresFetch as any).total ? parseFloat((uptresFetch as any).total) : undefined,
                reconciliadoEn: new Date(),
              },
            }))
            reconciliadas++
          }
        } else {
          sinFacturarAntiguas.push(orden)
        }
      }
      if (updates.length > 0) await Promise.all(updates)

      // Antiguas — cruzar contra ordenesDate
      if (sinFacturarAntiguas.length > 0) {
        const mapaOrdenesDate = new Map(
          (ordenesDate ?? [])
            .filter((o: any) => o.isInvoiced && o.invoiceNumber)
            .map((o: any) => [String(o.id), o])
        )
        const updatesAntiguos: Promise<any>[] = []
        for (const orden of sinFacturarAntiguas) {
          const match = mapaOrdenesDate.get(orden.origenId!)
          if (match) {
            updatesAntiguos.push(prisma.ordenDespacho.update({
              where: { id: orden.id },
              data: {
                isFacturada: true, numeroFactura: String(match.invoiceNumber),
                fechaFactura: match.invoicedAt ? parseFechaUptresBogota(match.invoicedAt) : null,
                totalOrden: match.total ? parseFloat(match.total) : undefined,
                reconciliadoEn: new Date(),
              },
            }))
            reconciliadas++
          }
        }
        if (updatesAntiguos.length > 0) await Promise.all(updatesAntiguos)
      }
      if (reconciliadas > 0) await invalidatePattern(`g:${destino}:*`)
    }
  } catch (e: any) {
    console.error('[delta/bodega] reconciliador error:', e.message)
    erroresParciales.push('reconciliador: ' + e.message)
  }

  // Reconciliador huecos
  try {
    const ordenesDateNormalizadas = ordenesDate.map((o: any) => ({
      uid: o.id, isInvoiced: o.isInvoiced, numeroFacturado: o.invoiceNumber || null,
      vTotal: o.total || null, invoicedAt: o.invoicedAt || null,
    }))
    const ordenesHoy = [...ordenes, ...ordenesDateNormalizadas]
    const porOrigenId = new Map(ordenesHoy.map((o: any) => [String(o.uid || o._id || o.id), o]))

    const sinFacturarEnBD = await prisma.ordenDespacho.findMany({
      where: { empresaId: destino, isFacturada: false, isActiva: true, origenId: { not: null } },
      select: { id: true, origenId: true, numeroOrden: true },
    })
    for (const sinF of sinFacturarEnBD) {
      const uptres = porOrigenId.get(sinF.origenId!)
      if (uptres && (uptres as any).isInvoiced && (uptres as any).numeroFacturado) {
        await prisma.ordenDespacho.update({
          where: { id: sinF.id },
          data: {
            isFacturada: true, numeroFactura: String((uptres as any).numeroFacturado),
            fechaFactura: (uptres as any).invoicedAt ? parseFechaUptresBogota((uptres as any).invoicedAt) : new Date(),
            totalOrden: (uptres as any).vTotal ? parseFloat((uptres as any).vTotal) : undefined,
            reconciliadoEn: new Date(),
          },
        })
        reconciliadas++
        console.log(`[delta/bodega] reconciliada orden ${sinF.numeroOrden} → factura ${(uptres as any).numeroFacturado}`)
      }
    }

    // Huecos en consecutivos
    const facturas = toCreate.map((o: any) => parseInt(o.numeroFactura || '0')).filter((n: number) => n > 0)
    if (facturas.length >= 2) {
      const minF = Math.min(...facturas); const maxF = Math.max(...facturas)
      if (maxF - minF < 50) {
        const esperados = Array.from({ length: maxF - minF + 1 }, (_, i) => minF + i)
        const llegaron = new Set(facturas)
        const huecos = esperados.filter(n => !llegaron.has(n))
        if (huecos.length > 0) {
          const porFactura = new Map<number, any>()
          for (const o of ordenesHoy) {
            const inv = parseInt(String((o as any).numeroFacturado || '0'))
            if (inv > 0) porFactura.set(inv, o)
          }
          for (const hueco of huecos) {
            const orden = porFactura.get(hueco)
            if (orden) {
              const origenId = String((orden as any).uid || (orden as any)._id)
              const completa = await adapter.fetchOrdenCompletaPorId(origenId)
              if (completa && completa.clienteNombre) {
                await prisma.ordenDespacho.upsert({
                  where: { origenId_empresaId: { origenId, empresaId: destino } },
                  create: {
                    origenId, empresaId: destino, numeroOrden: completa.numeroOrden,
                    numeroFactura: completa.numeroFactura || String(hueco),
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
                    origen: origenVinculadaId ? 'vinculada' : 'propia', origenVinculadaId,
                    ciudad: (completa as any).ciudad || null, direccion: (completa as any).direccion || null,
                    telefono: (completa as any).telefono || null,
                    estado: 'pendiente', sincronizadoEn: new Date(), origenSync: 'recuperada',
                  },
                  update: {},
                })
                if (completa.clienteApiId) {
                  try {
                    await prisma.$queryRawUnsafe(`
                      UPDATE ${schema}."OrdenDespacho" od
                      SET ciudad = COALESCE(od.ciudad, c.ciudad), direccion = COALESCE(od.direccion, c.direccion), telefono = COALESCE(od.telefono, c.telefono)
                      FROM ${schema}."Cliente" c
                      WHERE c."apiId" = od."clienteApiId" AND od."origenId" = $1 AND od."empresaId" = $2
                      AND (c.ciudad IS NOT NULL OR c.direccion IS NOT NULL)`, origenId, destino)
                  } catch { /* no crítico */ }
                }
                huecosRecuperados++
              }
            }
          }
          if (huecosRecuperados > 0) await invalidatePattern(`g:${destino}:*`)
        }
      }
    }
  } catch (e: any) {
    console.error('[delta/bodega] reconciliador-huecos error:', e.message)
  }

  return { reconciliadas, huecosRecuperados, erroresParciales }
}
