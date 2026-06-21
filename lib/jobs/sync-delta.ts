/**
 * sync-delta — lógica extraída del endpoint /api/sync/delta
 * Usada por: /api/sync/delta/route.ts  y  workers/index.ts
 * Sin dependencia de gestor HTTP — accede directo a BD y adapters
 */
import { prisma } from '@/lib/prisma'
import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'
import { decrypt } from '@/lib/crypto-uptres'
import { invalidatePattern } from '@/lib/cache'
import { reconstruirCartera } from '@/lib/jobs/sync-nocturno'
import { fechaBogotaStr } from '@/lib/fechas'
import { notificarWA } from '@/lib/notificaciones'
import fs from 'fs'
import path from 'path'

function toBogota(utcDate: Date | null): Date | null {
  if (!utcDate) return null
  return new Date(utcDate.getTime() - 5 * 60 * 60 * 1000)
}

const municipiosDANE: Record<string, string> = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'public/municipios_dane.json'), 'utf-8')
)

async function deltaEmpresa(empresaId: string, integracionId: string, apiKey: string, apiSecret: string, origenVinculadaId: string | null = null, empresaDestinoId?: string) {
  const destino = empresaDestinoId || empresaId
  const inicioTs = Date.now()
  const adapter = new UpTresAdapter(apiKey, apiSecret)
  await adapter.login()

  const maxFactura = await (prisma as any).ordenDespacho.findFirst({
    where: { empresaId: destino, isFacturada: true, fechaFactura: { not: null } },
    orderBy: { fechaFactura: 'desc' },
    select: { fechaFactura: true }
  })
  const empresa = await prisma.empresa.findUnique({ where: { id: destino }, select: { ultimaSyncBodega: true } })
  const baseDesde = maxFactura?.fechaFactura || empresa?.ultimaSyncBodega
    || new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
  const desde = new Date(baseDesde.getTime() - 30 * 60 * 1000)

  const ordenes = await adapter.fetchVentas(desde)
  const erroresParciales: string[] = []

  if (!ordenes.length) {
    await prisma.empresa.update({ where: { id: destino }, data: { ultimaSyncBodega: new Date() } })
    try {
      await (prisma as any).syncLog.create({
        data: { integracionId, empresaId: destino, tipo: 'delta', inicio: new Date(inicioTs), fin: new Date(), duracionMs: Date.now() - inicioTs, estado: 'ok', disparadoPor: 'cron', ordenesNuevas: 0, deudasSincronizadas: 0, clientesNuevos: 0, deudasNuevasDelta: 0, comprasSincronizadas: 0, reconciliadas: 0 }
      })
    } catch {}
    return { empresaId: destino, ordenes: 0, nuevasOrdenes: 0, nuevasDeudas: 0 }
  }

  const ordenesValidas = ordenes.filter((o: any) => {
    const numFactura = o.numeroFacturado ? String(o.numeroFacturado) : null
    const nombre = o.clienteNombre || o.clienteNombreApi
    const origenId = String(o.uid || o._id || '')
    return numFactura && nombre && origenId
  })

  const origenIds = ordenesValidas.map((o: any) => String(o.uid || o._id))
  const existentes = await (prisma as any).ordenDespacho.findMany({
    where: { empresaId: destino, origenId: { in: origenIds }, ...(origenVinculadaId ? { origenVinculadaId } : { origenVinculadaId: null }) },
    select: { origenId: true }
  })
  const existentesSet = new Set(existentes.map((e: any) => e.origenId))
  const nuevasOrdenes = ordenesValidas.filter((o: any) => !existentesSet.has(String(o.uid || o._id)))

  const clienteApiIds = [...new Set(nuevasOrdenes.map((o: any) => o.cliente?.uid).filter(Boolean))]
  const clienteNits = [...new Set(nuevasOrdenes.map((o: any) => o.clienteNit).filter(Boolean))]
  const clientesLocales = await (prisma as any).cliente.findMany({
    where: { empresaId: destino, OR: [...(clienteApiIds.length ? [{ apiId: { in: clienteApiIds } }] : []), ...(clienteNits.length ? [{ nit: { in: clienteNits } }] : [])] },
    select: { apiId: true, nit: true, ciudad: true, direccion: true, telefono: true }
  })
  const porApiId = new Map(clientesLocales.filter((c: any) => c.apiId).map((c: any) => [c.apiId, c]))
  const porNit = new Map(clientesLocales.filter((c: any) => c.nit).map((c: any) => [c.nit, c]))

  const toCreate = nuevasOrdenes.map((orden: any) => {
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
      numeroOrden: String(orden.numeroOrden || ''), numeroFactura: String(orden.numeroFacturado),
      vendedorApiId: orden.empleado?.uid || null, clienteApiId, clienteNombre: orden.clienteNombre || orden.clienteNombreApi,
      clienteNit, ciudad: ciudadNombre, direccion, telefono,
      fechaOrden: orden.fCreado ? new Date(orden.fCreado as string) : new Date(),
      fechaOrdenBogota: orden.fCreado ? toBogota(new Date(orden.fCreado as string)) : toBogota(new Date()),
      totalOrden: orden.vTotal ? parseFloat(orden.vTotal) : null,
      isFacturada: orden.isInvoiced === true, isActiva: (orden as any).isActiva !== false,
      fechaFactura: orden.invoicedAt ? new Date(orden.invoicedAt) : null,
      discount: (orden as any).discount ? parseFloat((orden as any).discount) : null,
      balance: (orden as any).balance ? parseFloat((orden as any).balance) : null,
      paymentType: (orden as any).paymentType || null, paymentMethod: (orden as any).paymentMethod || null,
      isDelivered: (orden as any).isDelivered ?? null, isShipped: (orden as any).isShipped ?? null,
      isCompleted: (orden as any).isCompleted ?? null, amountItems: (orden as any).amountItems || null,
      empresaId: destino, origen: origenVinculadaId ? 'vinculada' : 'propia', origenId, origenVinculadaId,
      estado: 'pendiente', sincronizadoEn: new Date(), origenSync: 'delta',
    }
  })

  const deudaToCreate: any[] = []

  // Clientes nuevos
  let clientesNuevos = 0
  try {
    const maxClienteBogota = await (prisma as any).cliente.findFirst({ where: { empresaId: destino, creadoEnBogota: { not: null } }, orderBy: { creadoEnBogota: 'desc' }, select: { creadoEnBogota: true } })
    const baseCli = maxClienteBogota?.creadoEnBogota || empresa?.ultimaSyncBodega || new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    const desdeCli = new Date(baseCli.getTime() - 30 * 60 * 1000)
    const clientesExt = await adapter.fetchClientes(desdeCli)
    if (clientesExt.length > 0) {
      const apiIds = clientesExt.map((c: any) => c.uid).filter(Boolean)
      const existentesApiId = await (prisma as any).cliente.findMany({ where: { empresaId: destino, apiId: { in: apiIds } }, select: { apiId: true } })
      const existentesSet2 = new Set(existentesApiId.map((e: any) => e.apiId))
      const nuevosCli = clientesExt.filter((c: any) => c.uid && !existentesSet2.has(c.uid))
      if (nuevosCli.length > 0) {
        await (prisma as any).cliente.createMany({ data: nuevosCli.map((c: any) => ({ nombre: `${c.name || ''} ${c.lastName || ''}`.trim() || 'Sin nombre', nombreComercial: c.nombreComercial || null, direccion: c.dir || null, telefono: c.nCel || null, email: c.email || null, ciudad: c.ciudad || null, departamento: c.departamento || null, apiId: c.uid, empresaId: destino, creadoEnBogota: c.fModificado ? toBogota(new Date(c.fModificado)) : toBogota(new Date()) })), skipDuplicates: true })
        clientesNuevos = nuevosCli.length
      }
    }
  } catch (err: any) { console.error('[delta] clientes error:', err.message); erroresParciales.push('clientes: ' + err.message) }

  // Empleados
  let empleadosActualizados = 0
  try {
    const maxEmpleado = await (prisma as any).empleado.aggregate({ where: { empresaId: destino, apiId: { not: null } }, _max: { createdAt: true } })
    const baseEmp = maxEmpleado._max.createdAt || empresa?.ultimaSyncBodega || new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    const desdeEmp = new Date(baseEmp.getTime() - 30 * 60 * 1000)
    const empleadosExt = await adapter.fetchEmpleados(desdeEmp)
    if (empleadosExt.length > 0) {
      const apiIds = empleadosExt.map((e: any) => e.uid).filter(Boolean)
      const existentesEmp = await (prisma as any).empleado.findMany({ where: { empresaId: destino, apiId: { in: apiIds } }, select: { apiId: true } })
      const existentesEmpSet = new Set(existentesEmp.map((e: any) => e.apiId))
      const aActualizar = empleadosExt.filter((e: any) => e.uid && existentesEmpSet.has(e.uid))
      for (const e of aActualizar) {
        await (prisma as any).empleado.updateMany({ where: { empresaId: destino, apiId: e.uid }, data: { ...(e.nCel ? { telefono: e.nCel } : {}), ...(e.doc ? { documento: e.doc } : {}), ...(e.ciudad ? { ciudadApiId: e.ciudad } : {}) } })
      }
      empleadosActualizados = aActualizar.length
    }
  } catch (err: any) { console.error('[delta] empleados error:', err.message); erroresParciales.push('empleados: ' + err.message) }

  // Deudas nuevas
  let deudasNuevasDelta = 0
  try {
    const maxDeudaBogota = await (prisma as any).syncDeuda.findFirst({ where: { integracionId, createdAtBogota: { not: null } }, orderBy: { createdAtBogota: 'desc' }, select: { createdAtBogota: true } })
    const baseDeuda = maxDeudaBogota?.createdAtBogota || empresa?.ultimaSyncBodega || new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    const desdeDeuda = new Date(baseDeuda.getTime() - 30 * 60 * 1000)
    const deudasExt = await adapter.fetchDeudas(desdeDeuda)
    if (deudasExt.length > 0) {
      const extIds = deudasExt.map((d: any) => String(d.uid || d._id)).filter(Boolean)
      const existentesDeuda = await (prisma as any).syncDeuda.findMany({ where: { integracionId, externalId: { in: extIds } }, select: { externalId: true } })
      const existentesDeudaSet = new Set(existentesDeuda.map((d: any) => d.externalId))
      const nuevasDeudas = deudasExt.filter((d: any) => { const extId = String(d.uid || d._id || ''); return extId && !existentesDeudaSet.has(extId) })
      if (nuevasDeudas.length > 0) {
        await (prisma as any).syncDeuda.createMany({ data: nuevasDeudas.map((d: any) => ({ integracionId, externalId: String(d.uid || d._id), clienteApiId: d.cliente?.uid || '', empleadoExternalId: d.empleado?.uid || null, numeroOrden: d.numeroOrden ? parseInt(String(d.numeroOrden)) : null, numeroFactura: d.numeroFacturado ? parseInt(String(d.numeroFacturado)) : null, valor: parseFloat(d.vTotal ?? '0'), saldo: parseFloat(d.vSaldo ?? '0'), diasCredito: d.dias ? parseInt(String(d.dias)) : null, condition: true, data: d, externalUpdatedAt: d.fModificado ? new Date(d.fModificado) : null, receivableAt: d.receivableAt ? new Date(d.receivableAt) : null, sincronizadoEl: new Date(), createdAtBogota: d.fCreado ? toBogota(new Date(d.fCreado as string)) : toBogota(new Date()) })), skipDuplicates: true })
        deudasNuevasDelta = nuevasDeudas.length
      }
    }
  } catch (err: any) { console.error('[delta] deudas error:', err.message); erroresParciales.push('deudas: ' + err.message) }

  const canceladasIds = ordenesValidas.filter((o: any) => (o as any).isActiva === false).map((o: any) => String(o.uid || o._id))

  // Validación consecutivos
  const todasFacturasUpTres = ordenesValidas.filter((o: any) => o.numeroFactura && Number(o.numeroFactura) > 0).map((o: any) => Number(o.numeroFactura)).sort((a: number, b: number) => a - b)
  if (todasFacturasUpTres.length > 0) {
    const maxUpTres = todasFacturasUpTres[todasFacturasUpTres.length - 1]
    const setUpTres = new Set(todasFacturasUpTres)
    const ultimaEnBD = await (prisma as any).ordenDespacho.findFirst({ where: { empresaId: destino, isFacturada: true, numeroFactura: { not: null } }, orderBy: { numeroFactura: 'desc' }, select: { numeroFactura: true } })
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

  const proximoDesde = new Date(Date.now() - 30 * 60 * 1000)
  try {
    await prisma.$transaction(async (tx: any) => {
      if (toCreate.length) {
        for (const orden of toCreate) {
          if (!orden.origenId) continue
          await tx.ordenDespacho.upsert({ where: { origenId_empresaId: { origenId: orden.origenId, empresaId: orden.empresaId } }, create: orden, update: {} })
        }
      }
      if (canceladasIds.length) await tx.ordenDespacho.updateMany({ where: { origenId: { in: canceladasIds }, empresaId: destino }, data: { isActiva: false } })
      if (deudaToCreate.length) await tx.syncDeuda.createMany({ data: deudaToCreate, skipDuplicates: true })
      await tx.empresa.update({ where: { id: destino }, data: { ultimaSyncBodega: proximoDesde } })
    }, { timeout: 30000 })
  } catch (err: any) { console.error('[delta] insert-ordenes error:', err.message); erroresParciales.push('insert-ordenes: ' + err.message) }

  if (toCreate.length || deudaToCreate.length || clientesNuevos || deudasNuevasDelta) {
    // Reconstruir CarteraCache — usar integración propia del destino (vinculada tiene la suya)
    try {
      const intgDestino = await (prisma as any).integracion.findFirst({ where: { empresaId: destino, tipo: 'uptres', activa: true }, select: { id: true } })
      await reconstruirCartera(intgDestino?.id || integracionId, destino)
    } catch (e: any) { erroresParciales.push('cache: ' + e.message) }
    await invalidatePattern(`g:${destino}:*`)
  }

  // Delta saldos — removido 21/06. SyncDeuda.saldo/condition de deudas existentes
  // ahora se actualiza SOLO desde sync-nocturno.ts (single writer, evita pisar pagos locales pendientes).
  // sync-delta conserva su responsabilidad real: detectar y crear deudas NUEVAS (bloque arriba).
  const saldosActualizados = 0

  const duracionMs = Date.now() - inicioTs

  // Reconciliador
  let reconciliadas = 0
  try {
    const sinFacturar = await prisma.ordenDespacho.findMany({ where: { empresaId: destino, isFacturada: false, isActiva: true, origenId: { not: null } }, select: { id: true, origenId: true } })
    for (const orden of sinFacturar) {
      const uptres = await adapter.fetchOrdenPorId(orden.origenId!)
      if (uptres?.isInvoiced && uptres.invoiceNumber) {
        await prisma.ordenDespacho.update({ where: { id: orden.id }, data: { isFacturada: true, numeroFactura: uptres.invoiceNumber, fechaFactura: uptres.invoicedAt ? new Date(uptres.invoicedAt) : null, totalOrden: uptres.total ? parseFloat(uptres.total) : undefined, reconciliadoEn: new Date() } })
        reconciliadas++
      }
    }
    if (reconciliadas > 0) await invalidatePattern(`g:${destino}:*`)
  } catch (e: any) { console.error('[delta] reconciliador error:', e.message); erroresParciales.push('reconciliador: ' + e.message) }

  // Reconciliador huecos
  let huecosRecuperados = 0
  if (true) { // Reconciliador siempre corre — detecta huecos independiente de órdenes nuevas
    try {
      const facturas = toCreate.map((o: any) => parseInt(o.numeroFactura || '0')).filter((n: number) => n > 0)
      if (facturas.length >= 2) {
        const minF = Math.min(...facturas); const maxF = Math.max(...facturas)
        if (maxF - minF < 50) {
          const esperados = Array.from({ length: maxF - minF + 1 }, (_, i) => minF + i)
          const llegaron = new Set(facturas)
          const huecos = esperados.filter(n => !llegaron.has(n))
          if (huecos.length > 0) {
            const hoy = new Date()
            const ordenesHoy = await adapter.fetchVentas(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()))
            const porFactura = new Map<number, any>()
            for (const o of ordenesHoy) { const inv = parseInt(String((o as any).numeroFacturado || '0')); if (inv > 0) porFactura.set(inv, o) }
            for (const hueco of huecos) {
              const orden = porFactura.get(hueco)
              if (orden) {
                const origenId = String((orden as any).uid || (orden as any)._id)
                const completa = await adapter.fetchOrdenCompletaPorId(origenId)
                if (completa && completa.clienteNombre) {
                  await prisma.ordenDespacho.upsert({ where: { origenId_empresaId: { origenId, empresaId: destino } }, create: { origenId, empresaId: destino, numeroOrden: completa.numeroOrden, numeroFactura: completa.numeroFactura || String(hueco), isFacturada: completa.isFacturada, fechaFactura: completa.fechaFactura ? new Date(completa.fechaFactura) : null, totalOrden: completa.totalOrden, balance: completa.balance, paymentType: completa.paymentType, paymentMethod: completa.paymentMethod, clienteApiId: completa.clienteApiId, clienteNit: completa.clienteNit || '', clienteNombre: completa.clienteNombre, vendedorApiId: completa.vendedorApiId, fechaOrden: completa.createdAt ? new Date(completa.createdAt) : new Date(), fechaOrdenBogota: completa.createdAt ? new Date(new Date(completa.createdAt).getTime() - 5*60*60*1000) : new Date(), origen: origenVinculadaId ? 'vinculada' : 'propia', origenVinculadaId, estado: 'pendiente', sincronizadoEn: new Date(), origenSync: 'recuperada' }, update: {} })
                  huecosRecuperados++
                }
              }
            }
            if (huecosRecuperados > 0) await invalidatePattern(`g:${destino}:*`)
          }
        }
      }
    } catch (e: any) { console.error('[delta] reconciliador-huecos error:', e.message) }
  }

  try {
    await (prisma as any).syncLog.create({ data: { integracionId, empresaId: destino, tipo: 'delta', inicio: new Date(inicioTs), fin: new Date(), duracionMs, estado: erroresParciales.length > 0 ? 'parcial' : 'ok', disparadoPor: 'cron', ordenesNuevas: toCreate.length, deudasSincronizadas: deudaToCreate.length, clientesNuevos, deudasNuevasDelta, comprasSincronizadas: ordenes.length, ...(empleadosActualizados ? { empleadosActualizados } : {}), ...(saldosActualizados ? { saldosActualizados } : {}), ...(reconciliadas ? { reconciliadas } : {}), ...(erroresParciales.length > 0 ? { errores: JSON.stringify(erroresParciales) } : {}) } })
  } catch (logErr: any) { console.error('[delta] syncLog insert error:', logErr.message) }

  return { empresaId: destino, ordenes: ordenes.length, nuevasOrdenes: toCreate.length, nuevasDeudas: deudaToCreate.length, clientesNuevos, deudasNuevasDelta, empleadosActualizados, saldosActualizados, reconciliadas, huecosRecuperados }
}

export async function runSyncDelta(): Promise<any[]> {
  const integraciones = await (prisma as any).integracion.findMany({
    where: { tipo: 'uptres', activa: true },
    select: { id: true, empresaId: true, config: true }
  })

  const resultados: any[] = []
  for (const intg of integraciones) {
    try {
      const config = intg.config as any
      const apiSecret = decrypt(config.apiSecret, process.env.UPTRES_SECRET!)
      const r = await deltaEmpresa(intg.empresaId, intg.id, config.apiKey, apiSecret)
      resultados.push(r)
      // NOTA 2026-06-20: se eliminó el sync duplicado hacia EmpresaVinculada.
      // Antes, cada empresa vinculada (ej. Leche vinculada a Lumeli) generaba una
      // SEGUNDA fila completa de OrdenDespacho con origen='vinculada', duplicando
      // 25+ campos de venta que nunca debían divergir. La empresa vinculada ya se
      // sincroniza por su cuenta en este mismo loop (tiene su propia integración
      // activa). La visibilidad de Lumeli sobre las órdenes de Leche ahora se
      // resuelve por consulta via EmpresaVinculada, no por copia física.
    } catch (err: any) {
      resultados.push({ empresaId: intg.empresaId, error: err.message })
      try {
        await (prisma as any).syncLog.create({ data: { integracionId: intg.id, empresaId: intg.empresaId, tipo: 'delta', inicio: new Date(), fin: new Date(), duracionMs: 0, estado: 'error', disparadoPor: 'cron', ordenesNuevas: 0, deudasSincronizadas: 0, clientesNuevos: 0, deudasNuevasDelta: 0, comprasSincronizadas: 0, errores: JSON.stringify([err.message]) } })
      } catch {}
    }
  }
  return resultados
}
