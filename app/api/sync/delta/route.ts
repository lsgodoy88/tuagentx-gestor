import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'
import { decrypt } from '@/lib/crypto-uptres'
import { invalidatePattern } from '@/lib/cache'
import { notificarWA } from '@/lib/notificaciones'
import fs from 'fs'
import path from 'path'

// UTC → Bogotá (UTC-5): restar 5 horas
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

  // Usar MAX(fechaFactura UTC) como from — fecha de factura UpTres (invoicedAt)
  // Más preciso que ultimaSyncBodega: refleja cuándo UpTres registró la última factura
  const maxFactura = await (prisma as any).ordenDespacho.findFirst({
    where: { empresaId: destino, isFacturada: true, fechaFactura: { not: null } },
    orderBy: { fechaFactura: 'desc' },
    select: { fechaFactura: true }
  })
  const empresa = await prisma.empresa.findUnique({ where: { id: destino }, select: { ultimaSyncBodega: true } })
  // Prioridad: MAX(fechaFactura) → ultimaSyncBodega → 2 días atrás
  const baseDesde = maxFactura?.fechaFactura || empresa?.ultimaSyncBodega
    || new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
  const desde = new Date(baseDesde.getTime() - 30 * 60 * 1000) // solapamiento 30min

  const ordenes = await adapter.fetchVentas(desde)
  // #3 fix: si no hay órdenes, avanzar ultimaSyncBodega a now() — el delta corrió OK
  // Solo no avanzar si el fetch falló (error), no si vino vacío legitimamente
  const erroresParciales: string[] = []

  if (!ordenes.length) {
    await prisma.empresa.update({ where: { id: destino }, data: { ultimaSyncBodega: new Date() } })
    try {
      await (prisma as any).syncLog.create({
        data: {
          integracionId,
          empresaId: destino,
          tipo: 'delta',
          inicio: new Date(inicioTs),
          fin: new Date(),
          duracionMs: Date.now() - inicioTs,
          estado: 'ok',
          disparadoPor: 'cron',
          ordenesNuevas: 0,
          deudasSincronizadas: 0,
          clientesNuevos: 0,
          deudasNuevasDelta: 0,
          comprasSincronizadas: 0,
          reconciliadas: 0,
        }
      })
    } catch {}
    return { empresaId: destino, ordenes: 0, nuevasOrdenes: 0, nuevasDeudas: 0 }
  }

  // ── OrdenDespacho ────────────────────────────────────────────────────────
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

  // Fallback clientes
  const clienteApiIds = [...new Set(nuevasOrdenes.map((o: any) => o.cliente?.uid).filter(Boolean))]
  const clienteNits = [...new Set(nuevasOrdenes.map((o: any) => o.clienteNit).filter(Boolean))]
  const clientesLocales = await (prisma as any).cliente.findMany({
    where: { empresaId: destino, OR: [...(clienteApiIds.length ? [{ apiId: { in: clienteApiIds } }] : []), ...(clienteNits.length ? [{ nit: { in: clienteNits } }] : [])] }, // fix: usar destino (no empresaId) para soportar empresas vinculadas
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
      numeroOrden: String(orden.numeroOrden || ''),
      numeroFactura: String(orden.numeroFacturado),
      vendedorApiId: orden.empleado?.uid || null,
      clienteApiId,
      clienteNombre: orden.clienteNombre || orden.clienteNombreApi,
      clienteNit,
      ciudad: ciudadNombre,
      direccion,
      telefono,
      fechaOrden: orden.fCreado ? new Date(orden.fCreado as string) : new Date(),
      fechaOrdenBogota: orden.fCreado ? toBogota(new Date(orden.fCreado as string)) : toBogota(new Date()),
      totalOrden: orden.vTotal ? parseFloat(orden.vTotal) : null,
      isFacturada: orden.isInvoiced === true,
      isActiva: (orden as any).isActiva !== false,
      fechaFactura: orden.invoicedAt ? new Date(orden.invoicedAt) : null,
      // Nuevos campos UpTres
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
      origenId,
      origenVinculadaId,
      estado: 'pendiente',
    }
  })

  // ── SyncDeuda nuevas — manejadas por deudasNuevasDelta (fetchDeudas) ──────
  // Ruta única: fetchDeudas con filtro de fecha → más completo (incluye receivableAt)
  // deudaToCreate eliminado — evitar doble insert en órdenes de crédito nuevas
  const deudaToCreate: any[] = []

  // ── Clientes nuevos (desde MAX createdAtBogota en BD) ──────────────────────
  // Solo trae clientes creados/modificados en UpTres desde la última introducción
  // Protegido: insert-only por apiId, no sobreescribe datos locales existentes
  let clientesNuevos = 0
  try {
    const maxClienteBogota = await (prisma as any).cliente.findFirst({
      where: { empresaId: destino, creadoEnBogota: { not: null } },
      orderBy: { creadoEnBogota: 'desc' },
      select: { creadoEnBogota: true }
    })
    // Fallback: si no hay ninguno con creadoEnBogota, usar ultimaSyncBodega o 2 días
    const baseCli = maxClienteBogota?.creadoEnBogota
      || empresa?.ultimaSyncBodega
      || new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    const desdeCli = new Date(baseCli.getTime() - 30 * 60 * 1000) // solapamiento 30min

    const clientesExt = await adapter.fetchClientes(desdeCli)
    if (clientesExt.length > 0) {
      // Solo insertar los que no existen por apiId — nunca sobreescribir
      const apiIds = clientesExt.map((c: any) => c.uid).filter(Boolean)
      const existentesApiId = await (prisma as any).cliente.findMany({
        where: { empresaId: destino, apiId: { in: apiIds } },
        select: { apiId: true }
      })
      const existentesSet = new Set(existentesApiId.map((e: any) => e.apiId))
      const nuevosCli = clientesExt.filter((c: any) => c.uid && !existentesSet.has(c.uid))
      if (nuevosCli.length > 0) {
        await (prisma as any).cliente.createMany({
          data: nuevosCli.map((c: any) => ({
            nombre: `${c.name || ''} ${c.lastName || ''}`.trim() || 'Sin nombre',
            nombreComercial: c.nombreComercial || null,
            direccion: c.dir || null,
            telefono: c.nCel || null,
            email: c.email || null,
            ciudad: c.ciudad || null,
            departamento: c.departamento || null,
            apiId: c.uid,
            empresaId: destino,
            // fecha UpTres updatedAt UTC → Bogotá al introducir
            creadoEnBogota: c.fModificado ? toBogota(new Date(c.fModificado)) : toBogota(new Date()),
          })),
          skipDuplicates: true,
        })
        clientesNuevos = nuevosCli.length
      }
    }
  } catch (err: any) {
    // No romper el flujo principal si clientes falla
    console.error('[delta] clientes error:', err.message)
    erroresParciales.push('clientes: ' + err.message)
  }

  // ── Empleados — actualizar datos de vendedores existentes ───────────────
  // Insert-only NO aplica — empleados se crean desde el panel con password+rol
  // Solo actualiza: telefono, documento, direccion, ciudad si el apiId ya existe
  let empleadosActualizados = 0
  try {
    const maxEmpleado = await (prisma as any).empleado.aggregate({
      where: { empresaId: destino, apiId: { not: null } },
      _max: { createdAt: true }
    })
    const baseEmp = maxEmpleado._max.createdAt
      || empresa?.ultimaSyncBodega
      || new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    const desdeEmp = new Date(baseEmp.getTime() - 30 * 60 * 1000)

    const empleadosExt = await adapter.fetchEmpleados(desdeEmp)
    if (empleadosExt.length > 0) {
      const apiIds = empleadosExt.map((e: any) => e.uid).filter(Boolean)
      const existentesEmp = await (prisma as any).empleado.findMany({
        where: { empresaId: destino, apiId: { in: apiIds } },
        select: { apiId: true }
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
          }
        })
      }
      empleadosActualizados = aActualizar.length
    }
  } catch (err: any) {
    console.error('[delta] empleados error:', err.message)
    erroresParciales.push('empleados: ' + err.message)
  }

  // ── Deudas nuevas (desde MAX createdAtBogota en SyncDeuda) ──────────────────
  // Solo trae deudas de crédito creadas desde la última introducción
  // Protegido: skipDuplicates por (integracionId, externalId) — nunca duplica
  let deudasNuevasDelta = 0
  try {
    const maxDeudaBogota = await (prisma as any).syncDeuda.findFirst({
      where: { integracionId, createdAtBogota: { not: null } },
      orderBy: { createdAtBogota: 'desc' },
      select: { createdAtBogota: true }
    })
    const baseDeuda = maxDeudaBogota?.createdAtBogota
      || empresa?.ultimaSyncBodega
      || new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    const desdeDeuda = new Date(baseDeuda.getTime() - 30 * 60 * 1000) // solapamiento 30min

    const deudasExt = await adapter.fetchDeudas(desdeDeuda)
    if (deudasExt.length > 0) {
      const extIds = deudasExt.map((d: any) => String(d.uid || d._id)).filter(Boolean)
      const existentesDeuda = await (prisma as any).syncDeuda.findMany({
        where: { integracionId, externalId: { in: extIds } },
        select: { externalId: true }
      })
      const existentesDeudaSet = new Set(existentesDeuda.map((d: any) => d.externalId))
      const nuevasDeudas = deudasExt.filter((d: any) => {
        const extId = String(d.uid || d._id || '')
        return extId && !existentesDeudaSet.has(extId)
      })
      if (nuevasDeudas.length > 0) {
        await (prisma as any).syncDeuda.createMany({
          data: nuevasDeudas.map((d: any) => ({
            integracionId,
            externalId: String(d.uid || d._id),
            clienteApiId: d.cliente?.uid || '',
            empleadoExternalId: d.empleado?.uid || null,
            numeroOrden: d.numeroOrden ? parseInt(String(d.numeroOrden)) : null,
            numeroFactura: d.numeroFacturado ? parseInt(String(d.numeroFacturado)) : null,
            valor: parseFloat(d.vTotal ?? '0'),
            saldo: parseFloat(d.vSaldo ?? '0'),
            diasCredito: d.dias ? parseInt(String(d.dias)) : null,
            condition: true,
            data: d,
            externalUpdatedAt: d.fModificado ? new Date(d.fModificado) : null,
            receivableAt: d.receivableAt ? new Date(d.receivableAt) : null,
            sincronizadoEl: new Date(),
            // fecha UpTres createdAt UTC → Bogotá al introducir — misma lógica que fechaOrdenBogota
            createdAtBogota: d.fCreado ? toBogota(new Date(d.fCreado as string)) : toBogota(new Date()),
          })),
          skipDuplicates: true,
        })
        deudasNuevasDelta = nuevasDeudas.length
      }
    }
  } catch (err: any) {
    // No romper el flujo principal si deudas falla
    console.error('[delta] deudas error:', err.message)
    erroresParciales.push('deudas: ' + err.message)
  }

  // ── Transacción ───────────────────────────────────────────────────────────
  const canceladasIds = ordenesValidas.filter((o: any) => (o as any).isActiva === false).map((o: any) => String(o.uid || o._id))

  // ── Validación de consecutivos post-fetch ────────────────────────────────
  // Compara MAX(invoiceNumber) de UpTres vs MAX(numeroFactura) en BD
  // Si hay gap → los faltantes ya deberían estar en el fetch (mismo rango de fecha)
  // Si no → brecha real → alerta WA

  // Todas las facturas del ciclo (nuevas + ya existentes en el fetch)
  const todasFacturasUpTres = ordenesValidas
    .filter((o: any) => o.numeroFactura && Number(o.numeroFactura) > 0)
    .map((o: any) => Number(o.numeroFactura))
    .sort((a: number, b: number) => a - b)

  if (todasFacturasUpTres.length > 0) {
    const maxUpTres = todasFacturasUpTres[todasFacturasUpTres.length - 1]
    const setUpTres = new Set(todasFacturasUpTres)

    // MAX en BD después del upsert
    const ultimaEnBD = await (prisma as any).ordenDespacho.findFirst({
      where: { empresaId: destino, isFacturada: true, numeroFactura: { not: null } },
      orderBy: { numeroFactura: 'desc' },
      select: { numeroFactura: true }
    })
    const maxEnBD = ultimaEnBD?.numeroFactura ? Number(ultimaEnBD.numeroFactura) : null

    if (maxEnBD && maxUpTres > maxEnBD) {
      // Hay facturas en UpTres que no están en BD
      const faltantesEnBD: number[] = []
      for (let i = maxEnBD + 1; i <= maxUpTres; i++) {
        if (!setUpTres.has(i)) faltantesEnBD.push(i)
      }
      if (faltantesEnBD.length > 0) {
        // Brecha real — no vinieron en este fetch aunque el rango debería cubrirlas
        const msg = `🔢 *Brecha consecutivos detectada*
*Empresa:* ${destino}
*BD tiene hasta:* #${maxEnBD}
*UpTres llegó hasta:* #${maxUpTres}
*No encontradas:* #${faltantesEnBD.slice(0, 10).join(', #')}${faltantesEnBD.length > 10 ? ` (+${faltantesEnBD.length - 10} más)` : ''}`
        console.warn('[delta] BRECHA CONSECUTIVOS:', msg)
        try { await notificarWA('573219182435', msg) } catch {}
      }
    }

    // Brechas internas en lo que trajo UpTres
    for (let i = 1; i < todasFacturasUpTres.length; i++) {
      if (todasFacturasUpTres[i] > todasFacturasUpTres[i - 1] + 1) {
        const faltantes: number[] = []
        for (let j = todasFacturasUpTres[i - 1] + 1; j < todasFacturasUpTres[i]; j++) faltantes.push(j)
        // Solo alertar si son menos de 50 — evitar ruido con histórico
        if (faltantes.length <= 50) {
          const msg = `🔢 *Brecha interna UpTres*
*Empresa:* ${destino}
*Faltantes:* #${faltantes.join(', #')}
*(entre #${todasFacturasUpTres[i-1]} y #${todasFacturasUpTres[i]})*`
          console.warn('[delta] BRECHA INTERNA:', msg)
          try { await notificarWA('573219182435', msg) } catch {}
        }
      }
    }
  }

  // ultimaSyncBodega avanza a now()-30min — solapa con el ciclo anterior
  // Evita perder órdenes con timestamp reciente en UpTres
  const proximoDesde = new Date(Date.now() - 30 * 60 * 1000)

  try {
    await prisma.$transaction(async (tx: any) => {
      // Upsert por origenId+empresaId — evita duplicados, nunca actualiza si ya existe
      if (toCreate.length) {
        for (const orden of toCreate) {
          if (!orden.origenId) continue
          await tx.ordenDespacho.upsert({
            where: { origenId_empresaId: { origenId: orden.origenId, empresaId: orden.empresaId } },
            create: orden,
            update: {}, // insert-only: si ya existe no toca nada
          })
        }
      }
      if (canceladasIds.length) await tx.ordenDespacho.updateMany({ where: { origenId: { in: canceladasIds }, empresaId: destino }, data: { isActiva: false } })
      if (deudaToCreate.length) await tx.syncDeuda.createMany({ data: deudaToCreate, skipDuplicates: true })
      await tx.empresa.update({ where: { id: destino }, data: { ultimaSyncBodega: proximoDesde } })
    }, { timeout: 30000 })
  } catch (err: any) {
    console.error('[delta] insert-ordenes error:', err.message)
    erroresParciales.push('insert-ordenes: ' + err.message)
  }

  // Invalida Redis solo si hubo cambios reales
  if (toCreate.length || deudaToCreate.length || clientesNuevos || deudasNuevasDelta) {
    // Patrones reales usados por los endpoints con cache
    await invalidatePattern('g:v:*')        // vendedor/stats → g:v:{userId}:{fecha}
    await invalidatePattern('g:*:stats:*') // stats admin → g:{empresaId}:stats:{fecha}
    await invalidatePattern('g:*:cartera:*') // cartera/resumen → g:{empresaId}:cartera:*
  }

  // ── Delta saldos cartera — fetchDeudasDesde con token ya activo ──────────
  // Usa receivableAt como ventana — solo deudas con pagos desde última sync
  // No hace login adicional — reutiliza el adapter ya autenticado
  let saldosActualizados = 0
  try {
    const ultimaReceivable = await (prisma as any).syncDeuda.aggregate({
      where: { integracionId },
      _max: { receivableAt: true }
    })
    const desdeReceivable: Date = ultimaReceivable._max.receivableAt
      ? new Date(new Date(ultimaReceivable._max.receivableAt).getTime() - 5 * 60 * 1000)
      : new Date(Date.now() - 24 * 60 * 60 * 1000)

    const deudasConPago = await adapter.fetchDeudasDesde(desdeReceivable)
    if (deudasConPago.length > 0) {
      const exIds = deudasConPago.map((d: any) => String(d.uid || d._id))
      const existentesSaldo = await (prisma as any).syncDeuda.findMany({
        where: { integracionId, externalId: { in: exIds } },
        select: { externalId: true }
      })
      const existentesSaldoSet = new Set(existentesSaldo.map((e: any) => e.externalId))
      const toUpdateSaldo = deudasConPago.filter((d: any) => existentesSaldoSet.has(String(d.uid || d._id)))
      const CHUNK = 100
      for (let i = 0; i < toUpdateSaldo.length; i += CHUNK) {
        const chunk = toUpdateSaldo.slice(i, i + CHUNK)
        await Promise.all(chunk.map((d: any) =>
          (prisma as any).syncDeuda.update({
            where: { integracionId_externalId: { integracionId, externalId: String(d.uid || d._id) } },
            data: {
              saldo: parseFloat(String(d.vSaldo ?? '0')),
              valor: parseFloat(String(d.vTotal ?? '0')),
              receivableAt: d.receivableAt ? new Date(d.receivableAt) : null,
              externalUpdatedAt: d.fModificado ? new Date(d.fModificado) : null,
              sincronizadoEl: new Date(),
            }
          })
        ))
      }
      saldosActualizados = toUpdateSaldo.length
      if (saldosActualizados > 0) {
        await invalidatePattern('g:*:cartera:*')
        await invalidatePattern('g:v:*')
        // Reconstruir CarteraCache para que vendedor vea saldo actualizado inmediatamente
        await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3010'}/api/cartera/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET || '' },
        }).catch(() => {/* no bloquear si falla */})
      }
    }
  } catch (err: any) {
    console.error('[delta] delta-saldos error:', err.message)
    erroresParciales.push('delta-saldos: ' + err.message)
  }

  const duracionMs = Date.now() - inicioTs

  // ── Reconciliador: actualizar órdenes sin facturar ─────────────────────────
  let reconciliadas = 0
  try {
    const sinFacturar = await prisma.ordenDespacho.findMany({
      where: { empresaId: destino, isFacturada: false, isActiva: true, origenId: { not: null } },
      select: { id: true, origenId: true },
    })
    if (sinFacturar.length > 0) {
      for (const orden of sinFacturar) {
        const uptres = await adapter.fetchOrdenPorId(orden.origenId!)
        if (uptres?.isInvoiced && uptres.invoiceNumber) {
          await prisma.ordenDespacho.update({
            where: { id: orden.id },
            data: {
              isFacturada: true,
              numeroFactura: uptres.invoiceNumber,
              fechaFactura: uptres.invoicedAt ? new Date(uptres.invoicedAt) : null,
              totalOrden: uptres.total ? parseFloat(uptres.total) : undefined,
            },
          })
          reconciliadas++
        }
      }
      if (reconciliadas > 0) {
        await invalidatePattern('g:v:*')
        console.log(`[delta] reconciliadas ${reconciliadas} órdenes facturadas`)
      }
    }
  } catch (e: any) {
    console.error('[delta] reconciliador error:', e.message)
    erroresParciales.push('reconciliador: ' + e.message)
  }

  // ── SyncLog — registro del ciclo delta ──────────────────────────────────
  // Retención 30 días — limpieza nocturna en sync-nocturno
  try {
    await (prisma as any).syncLog.create({
      data: {
        integracionId,
        empresaId: destino,
        tipo: 'delta',
        inicio: new Date(inicioTs),
        fin: new Date(),
        duracionMs,
        estado: erroresParciales.length > 0 ? 'parcial' : 'ok',
        disparadoPor: 'cron',
        ordenesNuevas: toCreate.length,
        deudasSincronizadas: deudaToCreate.length,
        clientesNuevos,
        deudasNuevasDelta,
        comprasSincronizadas: ordenes.length,
        // Campos extendidos — cast a any por schema dinámico
        ...(empleadosActualizados ? { empleadosActualizados } : {}),
        ...(saldosActualizados ? { saldosActualizados } : {}),
        ...(reconciliadas ? { reconciliadas } : {}),
        ...(erroresParciales.length > 0 ? { errores: JSON.stringify(erroresParciales) } : {}),
      }
    })
  } catch (logErr: any) {
    console.error('[delta] syncLog insert error:', logErr.message)
  }

  return { empresaId: destino, ordenes: ordenes.length, nuevasOrdenes: toCreate.length, nuevasDeudas: deudaToCreate.length, clientesNuevos, deudasNuevasDelta, empleadosActualizados, saldosActualizados, reconciliadas }
}

export async function POST(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const integraciones = await (prisma as any).integracion.findMany({
    where: { tipo: 'uptres', activa: true },
    select: { id: true, empresaId: true, config: true }
  })

  const resultados = []
  for (const intg of integraciones) {
    try {
      const config = intg.config as any
      const apiSecret = decrypt(config.apiSecret, process.env.UPTRES_SECRET!)
      const r = await deltaEmpresa(intg.empresaId, intg.id, config.apiKey, apiSecret)
      resultados.push(r)

      // Vinculadas
      const vinculadas = await (prisma as any).empresaVinculada.findMany({
        where: { empresaId: intg.empresaId, activa: true },
        select: { id: true, nombre: true, empresaClienteId: true }
      })
      for (const v of vinculadas) {
        try {
          const rv = await deltaEmpresa(v.empresaClienteId, intg.id, config.apiKey, apiSecret, v.id, intg.empresaId)
          resultados.push({ ...rv, vinculada: v.nombre })
        } catch (err: any) {
          resultados.push({ vinculada: v.nombre, error: err.message })
        }
      }
    } catch (err: any) {
      resultados.push({ empresaId: intg.empresaId, error: err.message })
      // Registrar error crítico en SyncLog
      try {
        await (prisma as any).syncLog.create({
          data: {
            integracionId: intg.id,
            empresaId: intg.empresaId,
            tipo: 'delta',
            inicio: new Date(),
            fin: new Date(),
            duracionMs: 0,
            estado: 'error',
            disparadoPor: 'cron',
            ordenesNuevas: 0,
            deudasSincronizadas: 0,
            clientesNuevos: 0,
            deudasNuevasDelta: 0,
            comprasSincronizadas: 0,
            errores: JSON.stringify([err.message]),
          }
        })
      } catch {}
    }
  }

  return NextResponse.json({ ok: true, resultados })
}
