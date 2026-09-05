/**
 * sync-delta — lógica extraída del endpoint /api/sync/delta
 * Usada por: /api/sync/delta/route.ts  y  workers/index.ts
 * Sin dependencia de gestor HTTP — accede directo a BD y adapters
 */
import { prisma } from '@/lib/prisma'
import { UpTresAdapter, parseFechaUptresBogota, fetchProductosUptres, fetchProductosUptresConCursor, fetchNotasCredito, type UpTresCursor } from '@/lib/integracion/adapters/uptres'
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
  const _det: Record<string, number> = {}
  const _t = (k: string, s: number) => { _det[k] = Date.now() - s }
  const adapter = new UpTresAdapter(apiKey, apiSecret)
  let _s = Date.now(); await adapter.login(); _t('login', _s)

  const maxFactura = await (prisma as any).ordenDespacho.findFirst({
    where: { empresaId: destino, isFacturada: true, fechaFactura: { not: null } },
    orderBy: { fechaFactura: 'desc' },
    select: { fechaFactura: true }
  })
  const empresa = await prisma.empresa.findUnique({ where: { id: destino }, select: { ultimaSyncBodega: true, ultimaSyncClientes: true, sync_cursor_clientes: true, sync_cursor_empleados: true, sync_cursor_cartera: true, sync_cursor_cartera_update: true, sync_cursor_listas: true, sync_cursor_proveedores: true, fechaInicioBodega: true } })
  const baseDesde = maxFactura?.fechaFactura || empresa?.ultimaSyncBodega
    || new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
  const desde = new Date(baseDesde.getTime() - 30 * 60 * 1000)

  _s = Date.now(); const ordenes = await adapter.fetchVentas(desde); _t('fetchVentas', _s)
  const erroresParciales: string[] = []

  if (!ordenes.length) {
    await prisma.empresa.update({ where: { id: destino }, data: { ultimaSyncBodega: new Date() } })
    try {
      await (prisma as any).syncLog.create({
        data: { integracionId, empresaId: destino, tipo: 'delta', inicio: new Date(inicioTs), fin: new Date(), duracionMs: Date.now() - inicioTs, estado: 'ok', disparadoPor: 'cron', ordenesNuevas: 0, deudasSincronizadas: 0, clientesNuevos: 0, deudasNuevasDelta: 0, comprasSincronizadas: 0, reconciliadas: 0, detalle: _det }
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
  const _orClientes = [...(clienteApiIds.length ? [{ apiId: { in: clienteApiIds } }] : []), ...(clienteNits.length ? [{ nit: { in: clienteNits } }] : [])]
  let clientesLocales = _orClientes.length > 0 ? await (prisma as any).cliente.findMany({
    where: { empresaId: destino, OR: _orClientes },
    select: { apiId: true, nit: true, ciudad: true, direccion: true, telefono: true }
  }) : []

  // Sync incremental de clientes — cursor persistido por empresa
  try {
    const cursorClientes = empresa?.sync_cursor_clientes as UpTresCursor | null ?? null
    // from basado en ultimaSyncClientes — cursor pagina dentro del rango, no lo reemplaza
    const desdeClientes = empresa?.ultimaSyncClientes || new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    _s = Date.now()
    const { data: clientesUpTres, ultimoCursor: nuevoCursorClientes } =
      await adapter.fetchClientesConCursor(cursorClientes, desdeClientes)
    _t('fetchClientes', _s)
    if (clientesUpTres.length > 0) {
      const apiIds = clientesUpTres.map((c: any) => c.uid).filter(Boolean)
      const existentes = await (prisma as any).cliente.findMany({
        where: { empresaId: destino, apiId: { in: apiIds } },
        select: { id: true, apiId: true, nombre: true, ciudad: true, direccion: true, telefono: true }
      })
      const existentesMap = new Map<string, any>(existentes.map((e: any) => [e.apiId, e]))
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
          if (Object.keys(cambios).length > 0) updates.push((prisma as any).cliente.update({ where: { id: existing.id }, data: cambios }))
        } else {
          creates.push({ empresaId: destino, apiId: c.uid, nombre, nit: c.doc || '', ciudad: c.ciudad || null, direccion: c.dir || null, telefono: c.nCel || null, email: c.email || null })
        }
      }
      _s = Date.now()
      await Promise.all(updates)
      if (creates.length > 0) await (prisma as any).cliente.createMany({ data: creates, skipDuplicates: true })
      _t('upsertClientes', _s)
      // Persistir cursor y ultimaSyncClientes
      const maxUpdatedAt = clientesUpTres.reduce((max: Date, c: any) => {
        const t = c.fModificado ? new Date(c.fModificado) : null
        return t && t > max ? t : max
      }, empresa?.ultimaSyncClientes || new Date(0))
      await prisma.empresa.update({
        where: { id: destino },
        data: {
          ultimaSyncClientes: maxUpdatedAt,
          ...(nuevoCursorClientes ? { sync_cursor_clientes: nuevoCursorClientes } : {}),
        }
      })
      // Re-leer para que nuevas órdenes encuentren ciudad
      if (_orClientes.length > 0) clientesLocales = await (prisma as any).cliente.findMany({
        where: { empresaId: destino, OR: _orClientes },
        select: { apiId: true, nit: true, ciudad: true, direccion: true, telefono: true }
      })
    }
  } catch (e: any) {
    console.warn('[delta] sync-clientes error:', e.message)
  }

  

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
      fechaOrden: orden.fCreado ? parseFechaUptresBogota(orden.fCreado as string) : new Date(),
      fechaOrdenBogota: orden.fCreado ? parseFechaUptresBogota(orden.fCreado as string) : new Date(),
      totalOrden: orden.vTotal ? parseFloat(orden.vTotal) : null,
      isFacturada: orden.isInvoiced === true, isActiva: (orden as any).isActiva !== false,
      fechaFactura: orden.invoicedAt ? parseFechaUptresBogota(orden.invoicedAt) : null,
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

  // Clientes — movido al nocturno (UpTres updatedAt retorna epoch, delta traía todo)
  let clientesNuevos = 0

  // Empleados
  let empleadosActualizados = 0
  try {
    const cursorEmpleados = empresa?.sync_cursor_empleados as UpTresCursor | null ?? null
    // Con cursor: aggregate innecesario — desde es ignorado en el método
    let desdeEmp: Date | undefined
    if (!cursorEmpleados) {
      const maxEmpleado = await (prisma as any).empleado.aggregate({ where: { empresaId: destino, apiId: { not: null } }, _max: { createdAt: true } })
      const baseEmp = maxEmpleado._max.createdAt || empresa?.ultimaSyncBodega || new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      desdeEmp = new Date(baseEmp.getTime() - 30 * 60 * 1000)
    }
    _s = Date.now(); const { data: empleadosExt, ultimoCursor: nuevoCursorEmpleados } = await adapter.fetchEmpleadosConCursor(cursorEmpleados, desdeEmp); _t('fetchEmpleados', _s)
    if (empleadosExt.length > 0) {
      const apiIds = empleadosExt.map((e: any) => e.uid).filter(Boolean)
      const existentesEmp = await (prisma as any).empleado.findMany({ where: { empresaId: destino, apiId: { in: apiIds } }, select: { apiId: true } })
      const existentesEmpSet = new Set(existentesEmp.map((e: any) => e.apiId))
      const aActualizar = empleadosExt.filter((e: any) => e.uid && existentesEmpSet.has(e.uid))
      for (const e of aActualizar) {
        await (prisma as any).empleado.updateMany({ where: { empresaId: destino, apiId: e.uid }, data: { ...(e.nCel ? { telefono: e.nCel } : {}), ...(e.doc ? { documento: e.doc } : {}), ...(e.ciudad ? { ciudadApiId: e.ciudad } : {}) } })
      }
      empleadosActualizados = aActualizar.length
      if (nuevoCursorEmpleados) {
        await prisma.empresa.update({ where: { id: destino }, data: { sync_cursor_empleados: nuevoCursorEmpleados } })
      }
    }
  } catch (err: any) { console.error('[delta] empleados error:', err.message); erroresParciales.push('empleados: ' + err.message) }

  // Deudas nuevas
  let deudasNuevasDelta = 0
  let nuevasDeudas: any[] = []
  try {
    const cursorCartera = empresa?.sync_cursor_cartera as UpTresCursor | null ?? null
    // Con cursor: findFirst innecesario — desde ignorado en el método
    let desdeDeuda: Date | undefined
    if (!cursorCartera) {
      const maxModificada = await (prisma as any).syncDeuda.findFirst({ where: { integracionId, externalUpdatedAt: { not: null } }, orderBy: { externalUpdatedAt: 'desc' }, select: { externalUpdatedAt: true } })
      const baseDeuda = maxModificada?.externalUpdatedAt || empresa?.ultimaSyncBodega || new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      desdeDeuda = new Date(baseDeuda.getTime() - 60 * 60 * 1000) // 1h de overlap
    }
    _s = Date.now(); const { data: deudasExt, ultimoCursor: nuevoCursorCartera } = await adapter.fetchDeudasConCursor(cursorCartera, desdeDeuda); _t('fetchCartera', _s)
    if (deudasExt.length > 0) {
      const extIds = deudasExt.map((d: any) => String(d.uid || d._id)).filter(Boolean)
      const existentesDeuda = await (prisma as any).syncDeuda.findMany({ where: { integracionId, externalId: { in: extIds } }, select: { externalId: true } })
      const existentesDeudaSet = new Set(existentesDeuda.map((d: any) => d.externalId))
      nuevasDeudas = deudasExt.filter((d: any) => { const extId = String(d.uid || d._id || ''); return extId && !existentesDeudaSet.has(extId) })
      if (nuevasDeudas.length > 0) {
        deudasNuevasDelta = nuevasDeudas.length
        // insertadas en la transacción principal
      }
      if (nuevoCursorCartera) {
        await prisma.empresa.update({ where: { id: destino }, data: { sync_cursor_cartera: nuevoCursorCartera } })
      }
    }
  } catch (err: any) { console.error('[delta] deudas error:', err.message); erroresParciales.push('deudas: ' + err.message) }

  // Cartera update — fetch adicional sin cursor para capturar pedidos viejos facturados recientemente
  // Complementa el cursor de cartera que puede saltarse deudas con createdAt anterior a la ventana
  try {
    const hace2dias = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
    _s = Date.now()
    const deudasUpdate = await adapter.fetchDeudasDesde(hace2dias)
    _t('fetchCarteraUpdate', _s)
    if (deudasUpdate.length > 0) {
      const extIdsUpdate = deudasUpdate.map((d: any) => String(d.uid || d._id)).filter(Boolean)
      const existentesUpdate = await (prisma as any).syncDeuda.findMany({
        where: { integracionId, externalId: { in: extIdsUpdate } },
        select: { externalId: true }
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
          createdAtBogota: d.fCreado ? toBogota(new Date(d.fCreado as string)) : toBogota(new Date())
        }))
        await (prisma as any).syncDeuda.createMany({ data: rows, skipDuplicates: true })
        console.log(`[delta] carteraUpdate: ${nuevasUpdate.length} deudas nuevas para ${destino}`)
        deudasNuevasDelta += nuevasUpdate.length
      }
    }
  } catch (e: any) { console.error('[delta] carteraUpdate error:', e.message) }

  // Notas Crédito — insert-only por orderNumber (nunca pisa registros existentes)
  let ncNuevas: any[] = []
  try {
    const maxNc = await (prisma as any).syncNotaCredito.findFirst({
      where: { integracionId },
      orderBy: { sincronizadoEl: 'desc' },
      select: { sincronizadoEl: true }
    })
    const baseNc = maxNc?.sincronizadoEl || new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    const desdeNc = new Date(baseNc.getTime() - 60 * 60 * 1000) // 1h overlap
    const authRes = await fetch('https://serviceuptres.cloud/external/v1/auth/api', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, apiSecret })
    }).then(r => r.json())
    if (authRes.ok && authRes.token) {
      _s = Date.now(); const ncsExt = await fetchNotasCredito(apiKey, authRes.token, desdeNc); _t('fetchNotasCredito', _s)
      if (ncsExt.length > 0) {
        const extIds = ncsExt.map((n: any) => String(n.orderNumber)).filter(Boolean)
        const existentesNc = await (prisma as any).syncNotaCredito.findMany({
          where: { integracionId, externalId: { in: extIds } },
          select: { externalId: true }
        })
        const existentesNcSet = new Set(existentesNc.map((n: any) => n.externalId))
        ncNuevas = ncsExt.filter((n: any) => n.orderNumber && !existentesNcSet.has(String(n.orderNumber)))
      }
    }
  } catch (err: any) { console.error('[delta] notas-credito error:', err.message); erroresParciales.push('notas-credito: ' + err.message) }

  // Sync listas de clientes desde UpTres — cursor persistido
  let listasActualizadas = 0
  try {
    const cursorListas = empresa?.sync_cursor_listas as UpTresCursor | null ?? null
    // Sin cursor: primera vez → traer todo el histórico
    const desdeListas = new Date('2020-01-01')
    _s = Date.now()
    const { data: listasExt, ultimoCursor: nuevoCursorListas } =
      await adapter.fetchListasClientesConCursor(cursorListas, desdeListas)
    _t('fetchListas', _s)

    if (listasExt.length > 0) {
      for (const lista of listasExt) {
        // Upsert lista: primero por api_id, si no existe buscar huérfana por nombre+empresa
        let listaLocal = await (prisma as any).listaClientes.findUnique({ where: { api_id: lista.apiId } })
        if (!listaLocal) {
          // Buscar lista manual sin api_id con mismo nombre
          const huerfana = await (prisma as any).listaClientes.findFirst({
            where: { empresaId: destino, nombre: lista.nombre, api_id: null }
          })
          if (huerfana) {
            listaLocal = await (prisma as any).listaClientes.update({
              where: { id: huerfana.id },
              data: { api_id: lista.apiId, name_us: lista.nameUs }
            })
          } else {
            listaLocal = await (prisma as any).listaClientes.create({
              data: { api_id: lista.apiId, nombre: lista.nombre, name_us: lista.nameUs, empresaId: destino }
            })
          }
        } else {
          listaLocal = await (prisma as any).listaClientes.update({
            where: { id: listaLocal.id },
            data: { nombre: lista.nombre, name_us: lista.nameUs }
          })
        }

        // Actualizar Cliente.listaId donde apiId esté en lista.clienteApiIds
        if (lista.clienteApiIds.length > 0) {
          await (prisma as any).cliente.updateMany({
            where: { empresaId: destino, apiId: { in: lista.clienteApiIds } },
            data: { listaId: listaLocal.id },
          })
          listasActualizadas++
        }
      }

      if (nuevoCursorListas) {
        await prisma.empresa.update({
          where: { id: destino },
          data: { sync_cursor_listas: nuevoCursorListas },
        })
      }
    }
  } catch (err: any) { console.error('[delta] listas error:', err.message); erroresParciales.push('listas: ' + err.message) }

  // Sync proveedores desde UpTres — cursor persistido
  let proveedoresActualizados = 0
  try {
    const cursorProveedores = empresa?.sync_cursor_proveedores as UpTresCursor | null ?? null
    // Sin cursor: primera vez → traer todo el histórico
    const desdeProveedores = new Date('2020-01-01')
    _s = Date.now()
    const { data: proveedoresExt, ultimoCursor: nuevoCursorProveedores } =
      await adapter.fetchProveedoresConCursor(cursorProveedores, desdeProveedores)
    _t('fetchProveedores', _s)

    if (proveedoresExt.length > 0) {
      for (const p of proveedoresExt) {
        await (prisma as any).proveedor.upsert({
          where: { api_id: p.apiId },
          create: {
            api_id: p.apiId, empresaId: destino,
            firstName: p.firstName, lastName: p.lastName,
            document: p.document, documentType: p.documentType,
            verificationDigit: p.verificationDigit,
            email: p.email, phone: p.phone, cityId: p.cityId,
            address: p.address, neighborhood: p.neighborhood,
            note: p.note, condition: true,
            updatedAt: p.updatedAt ? new Date(p.updatedAt) : null,
          },
          update: {
            firstName: p.firstName, lastName: p.lastName,
            document: p.document, documentType: p.documentType,
            verificationDigit: p.verificationDigit,
            email: p.email, phone: p.phone, cityId: p.cityId,
            address: p.address, neighborhood: p.neighborhood,
            note: p.note,
            updatedAt: p.updatedAt ? new Date(p.updatedAt) : null,
          },
        })
        proveedoresActualizados++
      }
      if (nuevoCursorProveedores) {
        await prisma.empresa.update({
          where: { id: destino },
          data: { sync_cursor_proveedores: nuevoCursorProveedores },
        })
      }
    }
  } catch (err: any) { console.error('[delta] proveedores error:', err.message); erroresParciales.push('proveedores: ' + err.message) }

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
    _s = Date.now(); await prisma.$transaction(async (tx: any) => {
      if (toCreate.length) {
        for (const orden of toCreate) {
          if (!orden.origenId) continue
          await tx.ordenDespacho.upsert({ where: { origenId_empresaId: { origenId: orden.origenId, empresaId: orden.empresaId } }, create: orden, update: {} })
        }
      }
      if (canceladasIds.length) await tx.ordenDespacho.updateMany({ where: { origenId: { in: canceladasIds }, empresaId: destino }, data: { isActiva: false } })
      if (deudaToCreate.length) await tx.syncDeuda.createMany({ data: deudaToCreate, skipDuplicates: true })
      if (nuevasDeudas.length > 0) {
        const deudaRows = nuevasDeudas.map((d: any) => ({ integracionId, externalId: String(d.uid || d._id), clienteApiId: d.cliente?.uid || '', empleadoExternalId: d.empleado?.uid || null, numeroOrden: d.numeroOrden ? parseInt(String(d.numeroOrden)) : null, numeroFactura: d.numeroFacturado ? parseInt(String(d.numeroFacturado)) : null, valor: parseFloat(d.vTotal ?? '0'), saldo: parseFloat(d.vSaldo ?? '0'), diasCredito: d.dias ? parseInt(String(d.dias)) : null, fechaVencimiento: d.fPago ? new Date(d.fPago) : null, condition: true, data: d, externalUpdatedAt: d.fModificado ? new Date(d.fModificado) : null, receivableAt: d.receivableAt ? new Date(d.receivableAt) : null, sincronizadoEl: new Date(), createdAtBogota: d.fCreado ? toBogota(new Date(d.fCreado as string)) : toBogota(new Date()) }))
        await tx.syncDeuda.createMany({ data: deudaRows, skipDuplicates: true })
      }
      if (ncNuevas.length > 0) {
        const ncRows = ncNuevas.map((n: any) => ({
          integracionId,
          empresaId: destino,
          externalId: String(n.orderNumber),
          clienteApiId: n.customerDocument || '',
          cufeInvoice: n.cufeInvoice || null, // PENDIENTE: confirmar campo vínculo NC→factura con UpTres
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
    erroresParciales.push('insert-ordenes: ' + err.message)
    try { await notificarWA('573219182435', `🚨 *Delta error*\n${destino}\n${err.message?.slice(0,120)}`) } catch {}
  }

  if (toCreate.length || deudaToCreate.length || clientesNuevos || deudasNuevasDelta) {
    // Reconstruir CarteraCache — solo clientes afectados en este ciclo
    try {
      const apiIdsAfectados = [...new Set([
        ...clienteApiIds,
        ...deudaToCreate.map((d: any) => d.clienteApiId).filter(Boolean),
      ])]
      const intgDestino = await (prisma as any).integracion.findFirst({ where: { empresaId: destino, tipo: 'uptres', activa: true }, select: { id: true } })
      await reconstruirCartera(intgDestino?.id || integracionId, destino, apiIdsAfectados.length > 0 ? apiIdsAfectados : undefined)
    } catch (e: any) { erroresParciales.push('cache: ' + e.message) }
    _t('transaction', _s); await invalidatePattern(`g:${destino}:*`)
  }

  // Delta saldos — removido 21/06. SyncDeuda.saldo/condition de deudas existentes
  // ahora se actualiza SOLO desde sync-nocturno.ts (single writer, evita pisar pagos locales pendientes).
  // sync-delta conserva su responsabilidad real: detectar y crear deudas NUEVAS (bloque arriba).
  //
  // EXCEPCIÓN agregada 24/06, REMOVIDA 25/06: reconciliación puntual por receivableAt en
  // sync-delta. Decisión: el saldo que ve el vendedor ya NO depende de receivableAtUptres
  // (reconstruirCartera resta pendiente+enviado al vuelo, ver sync-nocturno.ts) — confirmar
  // 'recibido' cada 30min ya no aportaba nada operativo, solo aceleraba una bitácora
  // administrativa (tab Recaudos/Revisar). Esa confrontación contra UpTres queda
  // EXCLUSIVAMENTE en sync-nocturno.ts (corre 1x/día, modo completo, barre todas las
  // deudas vía reconciliarDeuda() incluyendo subset-sum). sync-delta de día solo crea
  // deudas/órdenes nuevas — no reconcilia saldos ni marca recibido.
  let saldosActualizados = 0

  const duracionMs = Date.now() - inicioTs

  // Reconciliador — órdenes sin facturar
  // Estrategia: usar datos ya en memoria del fetchVentas (últimos 10 días) → 0 HTTP
  // Solo llama HTTP para órdenes con createdAt > 10 días (caso raro)
  let reconciliadas = 0
  _s = Date.now()
  try {
    const sinFacturar = await prisma.ordenDespacho.findMany({
      where: { empresaId: destino, isFacturada: false, isActiva: true, origenId: { not: null } },
      select: { id: true, origenId: true, fechaOrden: true }
    })

    if (sinFacturar.length > 0) {
      // Mapa de origenId → orden de UpTres ya traída en fetchVentas
      const mapaFetch = new Map(ordenes.map((o: any) => [String(o.uid || o._id), o]))

      const updates: Promise<any>[] = []
      const sinFacturarAntiguas: typeof sinFacturar = []

      for (const orden of sinFacturar) {
        const uptresFetch = mapaFetch.get(orden.origenId!)
        if (uptresFetch) {
          // Está en el fetch — usar datos en memoria, sin HTTP
          if ((uptresFetch as any).isInvoiced && (uptresFetch as any).numeroFacturado) {
            updates.push(prisma.ordenDespacho.update({
              where: { id: orden.id },
              data: {
                isFacturada: true,
                numeroFactura: (uptresFetch as any).numeroFacturado,
                fechaFactura: (uptresFetch as any).invoicedAt ? parseFechaUptresBogota((uptresFetch as any).invoicedAt) : null,
                totalOrden: (uptresFetch as any).total ? parseFloat((uptresFetch as any).total) : undefined,
                reconciliadoEn: new Date()
              }
            }))
            reconciliadas++
          }
        } else {
          // Fuera del rango de 10 días → necesita HTTP
          sinFacturarAntiguas.push(orden)
        }
      }

      if (updates.length > 0) await Promise.all(updates)

      // Solo HTTP para órdenes antiguas (createdAt > 10 días) — caso raro
      // Límite: máx 30 días — más de eso es caso de soporte manual, no reconciliación automática
      const limite30dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const sinFacturarAntiguesAcotadas = sinFacturarAntiguas.filter((o: any) =>
        !o.fechaOrden || new Date(o.fechaOrden) >= limite30dias
      )
      for (const orden of sinFacturarAntiguesAcotadas) {
        const uptres = await adapter.fetchOrdenPorId(orden.origenId!)
        if (uptres?.isInvoiced && uptres.invoiceNumber) {
          await prisma.ordenDespacho.update({
            where: { id: orden.id },
            data: {
              isFacturada: true,
              numeroFactura: uptres.invoiceNumber,
              fechaFactura: uptres.invoicedAt ? parseFechaUptresBogota(uptres.invoicedAt) : null,
              totalOrden: uptres.total ? parseFloat(uptres.total) : undefined,
              reconciliadoEn: new Date()
            }
          })
          reconciliadas++
        }
      }

      if (reconciliadas > 0) await invalidatePattern(`g:${destino}:*`)
    }
  } catch (e: any) { console.error('[delta] reconciliador error:', e.message); erroresParciales.push('reconciliador: ' + e.message) }
  _t('reconciliador', _s)

  // Reconciliador huecos
  let huecosRecuperados = 0
  _s = Date.now()
  if (true) { // Reconciliador siempre corre — detecta huecos independiente de órdenes nuevas
    try {
      // Reconciliador corre siempre — busca órdenes sin factura en BD que UpTres ya facturó
      // Además detecta huecos en las facturas nuevas del delta
      const facturas = toCreate.map((o: any) => parseInt(o.numeroFactura || '0')).filter((n: number) => n > 0)
      const sinFacturarEnBD = await prisma.ordenDespacho.findMany({
        where: { empresaId: destino, isFacturada: false, isActiva: true, origenId: { not: null } },
        select: { id: true, origenId: true, numeroOrden: true }
      })
      const hoy = new Date()
      // Solo llamar UpTres si hay órdenes pendientes de facturar
      const ordenesHoy = sinFacturarEnBD.length > 0 || facturas.length >= 2
        ? await adapter.fetchVentas(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()))
        : []
      const porOrigenId = new Map(ordenesHoy.map((o: any) => [String(o.uid || o._id), o]))
      for (const sinF of sinFacturarEnBD) {
        const uptres = porOrigenId.get(sinF.origenId!)
        if (uptres && (uptres as any).isInvoiced && (uptres as any).numeroFacturado) {
          await prisma.ordenDespacho.update({
            where: { id: sinF.id },
            data: {
              isFacturada: true,
              numeroFactura: String((uptres as any).numeroFacturado),
              fechaFactura: (uptres as any).invoicedAt ? parseFechaUptresBogota((uptres as any).invoicedAt) : new Date(),
              totalOrden: (uptres as any).vTotal ? parseFloat((uptres as any).vTotal) : undefined,
              reconciliadoEn: new Date(),
            }
          })
          reconciliadas++
          console.log(`[delta] reconciliada orden ${sinF.numeroOrden} → factura ${(uptres as any).numeroFacturado}`)
        }
      }
      if (facturas.length >= 2) {
        const minF = Math.min(...facturas); const maxF = Math.max(...facturas)
        if (maxF - minF < 50) {
          const esperados = Array.from({ length: maxF - minF + 1 }, (_, i) => minF + i)
          const llegaron = new Set(facturas)
          const huecos = esperados.filter(n => !llegaron.has(n))
          if (huecos.length > 0) {
            const porFactura = new Map<number, any>()
            for (const o of ordenesHoy) { const inv = parseInt(String((o as any).numeroFacturado || '0')); if (inv > 0) porFactura.set(inv, o) }
            for (const hueco of huecos) {
              const orden = porFactura.get(hueco)
              if (orden) {
                const origenId = String((orden as any).uid || (orden as any)._id)
                const completa = await adapter.fetchOrdenCompletaPorId(origenId)
                if (completa && completa.clienteNombre) {
                  await prisma.ordenDespacho.upsert({ where: { origenId_empresaId: { origenId, empresaId: destino } }, create: { origenId, empresaId: destino, numeroOrden: completa.numeroOrden, numeroFactura: completa.numeroFactura || String(hueco), isFacturada: completa.isFacturada, fechaFactura: completa.fechaFactura ? parseFechaUptresBogota(String(completa.fechaFactura)) : null, totalOrden: completa.totalOrden, balance: completa.balance, paymentType: completa.paymentType ? String(completa.paymentType) : null, paymentMethod: completa.paymentMethod != null ? String(completa.paymentMethod) : null, clienteApiId: completa.clienteApiId, clienteNit: completa.clienteNit || '', clienteNombre: completa.clienteNombre, vendedorApiId: completa.vendedorApiId, fechaOrden: completa.createdAt ? parseFechaUptresBogota(String(completa.createdAt)) : new Date(), fechaOrdenBogota: completa.createdAt ? parseFechaUptresBogota(String(completa.createdAt)) : new Date(), origen: origenVinculadaId ? 'vinculada' : 'propia', origenVinculadaId, ciudad: (completa as any).ciudad || null, direccion: (completa as any).direccion || null, telefono: (completa as any).telefono || null, estado: 'pendiente', sincronizadoEn: new Date(), origenSync: 'recuperada' }, update: {} })
                  huecosRecuperados++
                }
              }
            }
            if (huecosRecuperados > 0) await invalidatePattern(`g:${destino}:*`)
          }
        }
      }
    } catch (e: any) { console.error('[delta] reconciliador-huecos error:', e.message) }
    _t('reconciliadorHuecos', _s)
  }

  // Recuperador SyncDeuda → OrdenDespacho — solo facturas recientes (30 días)
  _s = Date.now()
  try {
    const schema = process.env.DB_SCHEMA || 'gestor'
    const hace30dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const deudasSinOrden: any[] = await prisma.$queryRawUnsafe(`
      SELECT sd."externalId", sd."numeroFactura", sd."numeroOrden"
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
      ORDER BY sd."numeroFactura" DESC
      LIMIT 10`, integracionId, destino, hace30dias)

    const hace30diasRec = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const fechaInicioBodegaRec: Date = (empresa as any)?.fechaInicioBodega ?? hace30diasRec

    if (deudasSinOrden.length > 0) {
      console.log(`[delta] recuperador: ${deudasSinOrden.length} órdenes faltantes para ${destino}`)
      for (const deuda of deudasSinOrden) {
        try {
          // Intentar por uid primero, fallback por orderNumber via fetchVentas (ya validado)
          const completa = await adapter.fetchOrdenCompletaPorId(deuda.externalId)
          const fechaFacturaOrden = completa?.fechaFactura ? new Date(completa.fechaFactura) : completa?.createdAt ? new Date(completa.createdAt) : null
          if (completa && completa.clienteNombre && fechaFacturaOrden && fechaFacturaOrden >= fechaInicioBodegaRec) {
            await prisma.ordenDespacho.upsert({
              where: { origenId_empresaId: { origenId: deuda.externalId, empresaId: destino } },
              create: {
                origenId: deuda.externalId, empresaId: destino,
                numeroOrden: completa.numeroOrden, numeroFactura: completa.numeroFactura,
                isFacturada: completa.isFacturada,
                fechaFactura: completa.fechaFactura ? parseFechaUptresBogota(String(completa.fechaFactura)) : null,
                totalOrden: completa.totalOrden, balance: completa.balance,
                paymentType: completa.paymentType ? String(completa.paymentType) : null, paymentMethod: completa.paymentMethod != null ? String(completa.paymentMethod) : null,
                clienteApiId: completa.clienteApiId, clienteNit: completa.clienteNit || '',
                clienteNombre: completa.clienteNombre, vendedorApiId: completa.vendedorApiId,
                fechaOrden: completa.createdAt ? parseFechaUptresBogota(String(completa.createdAt)) : new Date(),
                fechaOrdenBogota: completa.createdAt ? parseFechaUptresBogota(String(completa.createdAt)) : new Date(),
                origen: origenVinculadaId ? 'vinculada' : 'propia', origenVinculadaId,
                ciudad: (completa as any).ciudad || null, direccion: (completa as any).direccion || null, telefono: (completa as any).telefono || null,
                estado: 'pendiente', sincronizadoEn: new Date(), origenSync: 'recuperada_sync',
              },
              update: {}
            })
            // Poblar ciudad/direccion/telefono desde Cliente local si no vino de UpTres
            if (completa.clienteApiId && (!(completa as any).ciudad)) {
              try {
                const schema = process.env.DB_SCHEMA || 'gestor'
                await prisma.$queryRawUnsafe(`
                  UPDATE ${schema}."OrdenDespacho" od
                  SET ciudad = c.ciudad, direccion = c.direccion, telefono = c.telefono
                  FROM ${schema}."Cliente" c
                  WHERE c."apiId" = od."clienteApiId"
                  AND od."origenId" = $1
                  AND od."empresaId" = $2
                  AND c.ciudad IS NOT NULL`, deuda.externalId, destino)
              } catch (e: any) { /* ciudad no crítica */ }
            }
            huecosRecuperados++
            console.log(`[delta] recuperada F_${completa.numeroFactura} orden ${completa.numeroOrden}`)
          } else {
            console.warn(`[delta] fetchOrdenCompletaPorId sin datos para ${deuda.externalId} F_${deuda.numeroFactura}`)
          }
        } catch (e: any) { console.error('[delta] recuperador error', deuda.externalId, e.message) }
      }
      if (huecosRecuperados > 0) await invalidatePattern(`g:${destino}:*`)
    }
  } catch (e: any) { console.error('[delta] recuperador SyncDeuda error:', e.message) }
  _t('recuperadorSyncDeuda', _s)

  try {
    await (prisma as any).syncLog.create({ data: { integracionId, empresaId: destino, tipo: 'delta', inicio: new Date(inicioTs), fin: new Date(), duracionMs, estado: erroresParciales.length > 0 ? 'parcial' : 'ok', disparadoPor: 'cron', ordenesNuevas: toCreate.length, deudasSincronizadas: deudaToCreate.length, clientesNuevos, deudasNuevasDelta, comprasSincronizadas: ordenes.length, ...(empleadosActualizados ? { empleadosActualizados } : {}), ...(saldosActualizados ? { saldosActualizados } : {}), ...(reconciliadas ? { reconciliadas } : {}), ...(erroresParciales.length > 0 ? { errores: JSON.stringify(erroresParciales) } : {}), detalle: _det } })
  } catch (logErr: any) { console.error('[delta] syncLog insert error:', logErr.message) }

  return { empresaId: destino, ordenes: ordenes.length, nuevasOrdenes: toCreate.length, nuevasDeudas: deudaToCreate.length, clientesNuevos, deudasNuevasDelta, empleadosActualizados, listasActualizadas, proveedoresActualizados, saldosActualizados, reconciliadas, huecosRecuperados }
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

export async function syncProductosEmpresa(
  empresaId: string,
  integracionId: string,
  apiKey: string,
  apiSecret: string,
  desde?: Date
): Promise<{ upserted: number; desactivados: number }> {
  // Login para obtener token
  const authRes = await fetch('https://serviceuptres.cloud/external/v1/auth/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, apiSecret }),
  }).then(r => r.json())
  if (!authRes.ok || !authRes.token) throw new Error('Login UpTres fallido en syncProductos: ' + (authRes.msg || ''))

  const productos = await fetchProductosUptres(apiKey, authRes.token, desde)
  if (productos.length === 0) return { upserted: 0, desactivados: 0 }

  const DB_SCHEMA = process.env.DB_SCHEMA || 'gestor'
  const now = new Date()

  // Upsert por lotes de 100
  const BATCH = 100
  let upserted = 0
  for (let i = 0; i < productos.length; i += BATCH) {
    const batch = productos.slice(i, i + BATCH)
    // Capturar inventory previo antes del upsert para detectar cruces de umbral
    const batchIds = batch.map(p => p.id)
    const prevRows: { id: string; inventory: number; stockMinimo: number | null }[] = await (prisma as any).$queryRawUnsafe(
      `SELECT id, inventory, "stockMinimo" FROM ${DB_SCHEMA}."Producto" WHERE id = ANY($1)`,
      batchIds
    )
    const prevMap = new Map(prevRows.map(r => [r.id, r]))

    const batchResults = await Promise.all(batch.map(p =>
      (prisma as any).$queryRawUnsafe(`
        INSERT INTO ${DB_SCHEMA}."Producto" (
          id, "empresaId", "integracionId", condition, nombre, barcode,
          inventory, precio, marca, linea, punto, invima,
          prices, "purchasePrice", taxable, tax, tipo, unidad, descripcion,
          "externalUpdatedAt", "updatedAt", "createdAt"
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$21
        )
        ON CONFLICT (id) DO UPDATE SET
          condition          = EXCLUDED.condition,
          nombre             = EXCLUDED.nombre,
          barcode            = EXCLUDED.barcode,
          inventory          = EXCLUDED.inventory,
          precio             = EXCLUDED.precio,
          marca              = EXCLUDED.marca,
          linea              = EXCLUDED.linea,
          punto              = EXCLUDED.punto,
          invima             = EXCLUDED.invima,
          prices             = EXCLUDED.prices,
          "purchasePrice"    = EXCLUDED."purchasePrice",
          taxable            = EXCLUDED.taxable,
          tax                = EXCLUDED.tax,
          tipo               = EXCLUDED.tipo,
          unidad             = EXCLUDED.unidad,
          descripcion        = EXCLUDED.descripcion,
          "externalUpdatedAt"= EXCLUDED."externalUpdatedAt",
          "updatedAt"        = EXCLUDED."updatedAt"
        RETURNING id, nombre, "stockMinimo", inventory AS nuevo_inv
      `,
        p.id,
        empresaId,
        integracionId,
        p.condition,
        p.name,
        p.barcode ?? null,
        p.inventory,
        p.price ?? null,
        p.brand ?? null,
        p.line ?? null,
        p.point ?? null,
        p.invima ?? null,
        p.prices ? JSON.stringify(p.prices) : null,
        p.purchasePrice ?? null,
        p.taxable ?? false,
        p.tax ?? null,
        p.type ?? null,
        p.unit ?? null,
        p.description ?? null,
        p.updatedAt ? new Date(p.updatedAt) : now,
        now,
      )
    ))
    upserted += batch.length

    // Detectar cruces de umbral e insertar StockSnapshot
    const snapshots: any[] = []
    for (const rows of batchResults) {
      for (const row of (rows as any[])) {
        const prev = prevMap.get(row.id)
        const anterior = prev?.inventory ?? null
        const nuevo = row.nuevo_inv
        const minimo = row.stockMinimo
        if (anterior === null || anterior === nuevo) continue

        // Cruzó a agotado
        if (anterior > 0 && nuevo <= 0) {
          snapshots.push({ id: crypto.randomUUID(), empresaId, productoId: row.id, nombre: row.nombre, inventory: nuevo, stockMinimo: minimo ?? null, estado: 'agotado', createdAt: now })
        }
        // Cruzó a stock_bajo (inventory > 0 pero bajó de stockMinimo)
        else if (minimo !== null && nuevo > 0 && nuevo < minimo && (anterior >= minimo || anterior > nuevo)) {
          snapshots.push({ id: crypto.randomUUID(), empresaId, productoId: row.id, nombre: row.nombre, inventory: nuevo, stockMinimo: minimo, estado: 'stock_bajo', createdAt: now })
        }
        // Se reabastació — eliminar snapshot previo de ese producto
        else if ((anterior <= 0 && nuevo > 0) || (minimo !== null && anterior < minimo && nuevo >= minimo)) {
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

  // Si es sync completo (sin desde), desactivar los que ya no vienen
  let desactivados = 0
  if (!desde) {
    const idsActivos = productos.map(p => p.id)
    if (idsActivos.length > 0) {
      const placeholders = idsActivos.map((_: string, i: number) => `$${i + 2}`).join(',')
      const res = await (prisma as any).$executeRawUnsafe(
        `UPDATE ${DB_SCHEMA}."Producto" SET condition=false, "updatedAt"=$1
         WHERE "empresaId"='${empresaId}' AND condition=true AND id NOT IN (${placeholders})`,
        now,
        ...idsActivos
      )
      desactivados = res ?? 0
    }
  }

  return { upserted, desactivados }
}
