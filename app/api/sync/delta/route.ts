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

  // ── SyncDeuda — órdenes de crédito nuevas ────────────────────────────────
  const ordenesCredito = ordenesValidas.filter((o: any) =>
    (o as any).paymentType === 'credito' &&
    parseFloat((o as any).balance ?? '0') > 0 &&
    (o as any).isActiva !== false
  )
  const externalIdsCredito = ordenesCredito.map((o: any) => String(o.uid || o._id))
  const deudaExistentes = await (prisma as any).syncDeuda.findMany({
    where: { integracionId, externalId: { in: externalIdsCredito } },
    select: { externalId: true }
  })
  const deudaExistentesSet = new Set(deudaExistentes.map((d: any) => d.externalId))
  const nuevasDeudas = ordenesCredito.filter((o: any) => !deudaExistentesSet.has(String(o.uid || o._id)))

  const deudaToCreate = nuevasDeudas.map((o: any) => ({
    integracionId,
    externalId: String(o.uid || o._id),
    clienteApiId: o.cliente?.uid || o.customerId || '',
    empleadoExternalId: o.empleado?.uid || o.employeeId || null,
    numeroOrden: o.numeroOrden ? parseInt(String(o.numeroOrden)) : null,
    numeroFactura: o.numeroFacturado ? parseInt(String(o.numeroFacturado)) : null,
    valor: parseFloat(o.vTotal ?? o.total ?? '0'),
    saldo: parseFloat(o.balance ?? '0'),
    diasCredito: o.creditDay ? parseInt(String(o.creditDay)) : null,
    condition: true,
    data: o,
    externalUpdatedAt: o.updatedAt ? new Date(o.updatedAt) : null,
    sincronizadoEl: new Date(),
  }))

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

  // Invalida Redis solo si hubo cambios reales
  if (toCreate.length || deudaToCreate.length || clientesNuevos || deudasNuevasDelta) {
    // Patrones reales usados por los endpoints con cache
    await invalidatePattern('g:v:*')        // vendedor/stats → g:v:{userId}:{fecha}
    await invalidatePattern('g:*:stats:*') // stats admin → g:{empresaId}:stats:{fecha}
    await invalidatePattern('g:*:cartera:*') // cartera/resumen → g:{empresaId}:cartera:*
  }

  const duracionMs = Date.now() - inicioTs

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
        estado: 'ok',
        disparadoPor: 'cron',
        ordenesNuevas: toCreate.length,
        deudasSincronizadas: deudaToCreate.length,
        clientesNuevos,
        deudasNuevasDelta,
        comprasSincronizadas: ordenes.length,
      }
    })
  } catch (logErr: any) {
    console.error('[delta] syncLog insert error:', logErr.message)
  }

  return { empresaId: destino, ordenes: ordenes.length, nuevasOrdenes: toCreate.length, nuevasDeudas: deudaToCreate.length, clientesNuevos, deudasNuevasDelta }
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
    }
  }

  return NextResponse.json({ ok: true, resultados })
}
