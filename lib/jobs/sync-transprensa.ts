/**
 * sync-transprensa.ts
 * Consulta remesas en Transprensa por empresa y hace upsert en TransprensaRemesa.
 * Cuando estado_atencion === 'ENTREGADO' → marca OrdenDespacho como entregada.
 */

import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { Prisma } from '@/app/generated/prisma'
import { decrypt } from '@/lib/crypto-uptres'

const BASE_URL = 'https://transprensa.colombiasoftware.net/index.php'

// ── Alertas ──────────────────────────────────────────────────────────────────

async function crearAlertaTransprensa(empresaId: string, mensaje: string) {
  try {
    await prisma.$executeRaw`
      INSERT INTO ${Prisma.raw(DB_SCHEMA)}."AlertaLog"
        (empresa_id, tipo, severidad, mensaje, updated_at)
      VALUES (${empresaId}, 'transprensa_conexion', 'advertencia', ${mensaje}, NOW())
      ON CONFLICT (empresa_id, tipo) WHERE resuelta = FALSE
      DO UPDATE SET mensaje = ${mensaje}, updated_at = NOW()`
  } catch {}
}

async function resolverAlertaTransprensa(empresaId: string) {
  try {
    await prisma.$executeRaw`
      UPDATE ${Prisma.raw(DB_SCHEMA)}."AlertaLog"
      SET resuelta = TRUE, resuelta_el = NOW(), updated_at = NOW()
      WHERE empresa_id = ${empresaId} AND tipo = 'transprensa_conexion' AND resuelta = FALSE`
  } catch {}
}

// ── Auth ─────────────────────────────────────────────────────────────────────

async function loginTransprensa(usuario_login: string, usuario_password: string): Promise<string> {
  const params = new URLSearchParams({ usuario_login, usuario_password })
  const res = await fetch(`${BASE_URL}?api=servicio.Seguridad.login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const data = await res.json()
  if (!data.success || !data.data?.token) throw new Error(data.msg || 'Login Transprensa fallido')
  return data.data.token
}

// ── Consulta remesas por número ───────────────────────────────────────────────

async function consultarRemesa(token: string, numero_remesa: string): Promise<any | null> {
  const res = await fetch(`${BASE_URL}?api=servicio.Consultas.remesas`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token,
      'Accept': 'application/json',
    },
    body: JSON.stringify({ numero_remesa, pagina_numero: '1' }),
  })
  const data = await res.json()
  if (!data.success || !Array.isArray(data.data) || data.data.length === 0) return null
  // FIX: validar que el numero_remesa retornado coincide exactamente con el buscado
  // Transprensa puede devolver una RE EXPEDICIÓN u otra remesa distinta en data.data[0]
  const match = data.data.find(
    (r: any) => String(r.numero_remesa ?? '').trim() === String(numero_remesa).trim()
  )
  return match ?? null
}

// ── Mapear estado a ícono UI ──────────────────────────────────────────────────

export function iconoEstadoTransprensa(estado: string): string {
  const e = estado?.toUpperCase() ?? ''
  if (e.includes('ENTREGADO')) return '✅'
  if (e.includes('NOVEDAD'))   return '🔴'
  return '🚚'
}


// ── Match automático guías por fecha+NIT+ciudad+cajas ─────────────────────────

async function consultarRemesasPorFechaYNit(token: string, fecha: string, nitRemitente: string): Promise<any[]> {
  const res = await fetch(`${BASE_URL}?api=servicio.Consultas.remesas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': token, 'Accept': 'application/json' },
    body: JSON.stringify({ remesa_fechacreacion: fecha, cliente_nit: nitRemitente, pagina_numero: '1' }),
  })
  const data = await res.json()
  if (!data.success || !Array.isArray(data.data)) return []
  return data.data
}

function similaridad(a: string, b: string): number {
  const s1 = a.toUpperCase().trim(), s2 = b.toUpperCase().trim()
  if (s1 === s2) return 1
  const longer = s1.length > s2.length ? s1 : s2
  const shorter = s1.length > s2.length ? s2 : s1
  if (longer.length === 0) return 1
  // Simple: caracteres en común / longitud del más largo
  let matches = 0
  const used = new Array(longer.length).fill(false)
  for (const ch of shorter) {
    const idx = longer.split('').findIndex((c, i) => !used[i] && c === ch)
    if (idx >= 0) { matches++; used[idx] = true }
  }
  return matches / longer.length
}

/** Extrae la ciudad base de una cadena "NEIVA / HUI" → "NEIVA" */
function normalizarCiudad(ciudad: string | null | undefined): string {
  if (!ciudad) return ''
  return ciudad.split('/')[0].trim().toUpperCase()
}

async function autoAsignarGuias(
  empresaId: string,
  token: string,
  nitRemitente: string
): Promise<{ asignadas: number }> {
  const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const ordenesSinGuia = await (prisma as any).ordenDespacho.findMany({
    where: {
      empresaId,
      modo_despacho: { in: ['transportadora', 'transporte'] },
      guiaTransporte: null,
      num_cajas: { gt: 0 },
      estado: { in: ['en_transito', 'despachado', 'alistado'] },
      OR: [
        { guiaBuscadaEl: null },               // nunca intentado
        { guiaBuscadaEl: { gt: hace24h } },    // intentado hace menos de 24h
      ],
    },
    // clienteNit viene directo en la orden; despachadoEl vendrá de DespachoLog
    select: { id: true, numeroFactura: true, clienteNombre: true, clienteNit: true, num_cajas: true, createdAt: true, ciudad: true },
  })

  if (!ordenesSinGuia.length) return { asignadas: 0 }

  // Enriquecer con despachadoEl desde DespachoLog (igual que enrichConDespacho en trazabilidad)
  const facturas = ordenesSinGuia.map((o: any) => o.numeroFactura).filter(Boolean)
  const despachoLogs: any[] = facturas.length
    ? await (prisma as any).despachoLog.findMany({
        where: { empresaId, numeroFactura: { in: facturas } },
        select: { numeroFactura: true, despachadoEl: true },
        orderBy: { despachadoEl: 'desc' },
      })
    : []
  const despachoElMap = new Map<string, Date>()
  for (const l of despachoLogs) {
    if (!despachoElMap.has(l.numeroFactura) && l.despachadoEl) {
      despachoElMap.set(l.numeroFactura, new Date(l.despachadoEl))
    }
  }

  // Agrupar por despachadoEl (fecha real de despacho), fallback a createdAt
  // Transprensa usa hora Colombia (UTC-5) — convertir antes de formatear la fecha
  const toColombiaDateKey = (d: Date) => {
    const col = new Date(d.getTime() - 5 * 60 * 60 * 1000)
    return `${col.getUTCFullYear()}-${String(col.getUTCMonth()+1).padStart(2,'0')}-${String(col.getUTCDate()).padStart(2,'0')}`
  }
  // Día siguiente en Colombia (Transprensa puede registrar la remesa el día siguiente)
  const nextColombiaDateKey = (key: string) => {
    const d = new Date(key + 'T05:00:00Z') // mediodia Colombia como UTC
    d.setUTCDate(d.getUTCDate() + 1)
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`
  }

  const porFecha = new Map<string, typeof ordenesSinGuia>()
  for (const o of ordenesSinGuia) {
    const base = despachoElMap.get(o.numeroFactura) ?? new Date(o.createdAt)
    const key = toColombiaDateKey(base)
    if (!porFecha.has(key)) porFecha.set(key, [])
    porFecha.get(key)!.push(o)
  }

  // NIT viene directo de la orden (clienteNit) — no necesita join a Cliente

  let asignadas = 0

  for (const [fecha, ordenes] of porFecha) {
    // Transprensa puede registrar la remesa el día del despacho o el siguiente
    const fechaSig = nextColombiaDateKey(fecha)
    const [remesasD, remesasDSig] = await Promise.all([
      consultarRemesasPorFechaYNit(token, fecha, nitRemitente),
      consultarRemesasPorFechaYNit(token, fechaSig, nitRemitente),
    ])
    // Deduplicar por numero_remesa (en caso de solapamiento)
    const remesasMap = new Map<string, any>()
    for (const r of [...remesasD, ...remesasDSig]) remesasMap.set(r.numero_remesa, r)
    const remesas = [...remesasMap.values()]
    if (!remesas.length) continue

    // Helper para extraer cajas de una remesa (admite CAJA / PAQUETE / unidad genérica)
    const getCajasRemesa = (r: any): string => {
      const detalle = r.remesa_detalle ?? []
      // Buscar primero producto con 'CAJA' en el nombre
      const entryCaja = detalle.find((x: any) =>
        x.producto?.producto_nombre?.toUpperCase().includes('CAJA')
      )
      if (entryCaja) return String(entryCaja.cantidad ?? '0')
      // Si no hay 'CAJA', sumar todas las cantidades como fallback
      const total = detalle.reduce((sum: number, x: any) => sum + Number(x.cantidad ?? 0), 0)
      return total > 0 ? String(total) : '0'
    }

    // Lookup NIT + ciudad + cajas — también indexar con ciudad vacía para remesas sin ciudad
    const remesaLookup = new Map<string, any>()
    for (const r of remesas) {
      const dest = r.remesa_destinatario ?? {}
      const cajas = getCajasRemesa(r)
      const ciudadR = normalizarCiudad(dest.destinatario_ciudad)
      const nit = String(dest.destinataro_documento ?? '').trim()
      // Key exacto con ciudad
      const keyConCiudad = `${nit}|${ciudadR}|${cajas}`
      if (!remesaLookup.has(keyConCiudad)) remesaLookup.set(keyConCiudad, r)
      // Key sin ciudad (para remesas donde Transprensa no envía ciudad)
      if (!ciudadR) {
        const keySinCiudad = `${nit}||${cajas}`
        if (!remesaLookup.has(keySinCiudad)) remesaLookup.set(keySinCiudad, r)
      }
    }

    for (const orden of ordenes) {
      // FIX: usar clienteNit de la orden directamente (más confiable que join a Cliente)
      const nit = orden.clienteNit ? String(orden.clienteNit).trim() : null
      const cajas = String(orden.num_cajas)
      const ciudadO = normalizarCiudad(orden.ciudad)
      let matched: any = null

      // 1) Match exacto NIT + ciudad + cajas
      if (nit) matched = remesaLookup.get(`${nit}|${ciudadO}|${cajas}`) ?? null

      // 1b) Match NIT + sin ciudad (remesa sin ciudad en Transprensa) + cajas
      if (!matched && nit) matched = remesaLookup.get(`${nit}||${cajas}`) ?? null

      // 2) Match NIT + ciudad (sin cajas) — si hay una sola candidata con ese NIT y ciudad (o sin ciudad)
      if (!matched && nit) {
        const candidatas = remesas.filter((r: any) => {
          const dest = r.remesa_destinatario ?? {}
          const ciudadR = normalizarCiudad(dest.destinatario_ciudad)
          return String(dest.destinataro_documento ?? '').trim() === nit &&
            (!ciudadR || ciudadR === ciudadO)
        })
        if (candidatas.length === 1) matched = candidatas[0]
        else if (candidatas.length > 1) {
          // Tiebreaker: cajas exactas
          matched = candidatas.find((r: any) => getCajasRemesa(r) === cajas) ?? null
        }
      }

      // 3) Fallback fuzzy nombre + ciudad + cajas
      if (!matched) {
        let best: any = null, bestScore = 0
        for (const r of remesas) {
          const dest = r.remesa_destinatario ?? {}
          const destNombre = dest.destinatario_nombre ?? ''
          const ciudadR = normalizarCiudad(dest.destinatario_ciudad)
          const remesaNit = String(dest.destinataro_documento ?? '').trim()
          // Si la orden tiene NIT y la remesa también tiene NIT distintos → descartar
          if (nit && remesaNit && remesaNit !== nit) continue
          // Filtrar por ciudad solo si la remesa trae ciudad
          if (ciudadR && ciudadO && ciudadR !== ciudadO) continue
          const rCajas = getCajasRemesa(r)
          if (rCajas !== cajas) continue
          const score = similaridad(orden.clienteNombre, destNombre)
          if (score > bestScore) { bestScore = score; best = r }
        }
        if (bestScore >= 0.6) matched = best
      }

      if (!matched) {
        // Marcar como buscada-sin-match para no reintentar hasta el próximo ciclo de 24h
        try {
          await (prisma as any).ordenDespacho.update({
            where: { id: orden.id },
            data: { guiaBuscadaEl: new Date() },
          })
        } catch {}
        continue
      }

      // Asignar guía
      try {
        await (prisma as any).ordenDespacho.update({
          where: { id: orden.id },
          data: {
            guiaTransporte: String(matched.numero_remesa).trim(),
            urlSeguimiento: `https://transprensa.com/Seguimiento/?remesa_codigo=${String(matched.numero_remesa).trim()}`,
            guiaBuscadaEl: null, // limpiar — ya tiene guía
          },
        })
        asignadas++
        console.log(`[transprensa] auto-guía fac=${orden.numeroFactura} → ${matched.numero_remesa}`)
      } catch (e: any) {
        console.error(`[transprensa] error asignando guía fac=${orden.numeroFactura}:`, e.message)
      }
    }
  }

  return { asignadas }
}

// ── Sync por empresa ──────────────────────────────────────────────────────────

async function syncEmpresa(empresaId: string): Promise<{ actualizadas: number; entregadas: number; errores: number; asignadas: number }> {
  const intg = await (prisma as any).integracion.findFirst({
    where: { empresaId, tipo: 'transprensa', activa: true },
    select: { config: true }
  })
  if (!intg) return { actualizadas: 0, entregadas: 0, errores: 0, asignadas: 0 }

  const config = intg.config as any
  const password = decrypt(config.usuario_password, process.env.UPTRES_SECRET!)

  // Login — token caduca cada 2 días, lo obtenemos fresco cada sync
  let token: string
  try {
    token = await loginTransprensa(config.usuario_login, password)
    await resolverAlertaTransprensa(empresaId)
  } catch (e: any) {
    await crearAlertaTransprensa(empresaId, `Transprensa: fallo de conexión — ${e.message}`)
    throw e
  }

  let actualizadas = 0, entregadas = 0, errores = 0

  // Auto-asignar guías a órdenes sin guía si hay nit_remitente configurado — PRIMERO
  let asignadas = 0
  if (config.nit_remitente) {
    try {
      const r = await autoAsignarGuias(empresaId, token, config.nit_remitente)
      asignadas = r.asignadas
      if (asignadas > 0) console.log(`[transprensa] ${empresaId}: ${asignadas} guías auto-asignadas`)
    } catch (e: any) {
      console.error(`[transprensa] error auto-asignando guías ${empresaId}:`, e.message)
    }
  }

  // Órdenes en_transito con guiaTransporte — consultado DESPUÉS de auto-asignación
  const ordenes = await (prisma as any).ordenDespacho.findMany({
    where: {
      empresaId,
      OR: [
        { modo_despacho: { in: ['transportadora', 'transporte'] } },
        { modo_despacho: null },
      ],
      guiaTransporte: { not: null },
      estado: { in: ['en_transito', 'despachado', 'entregado'] },
      NOT: {
        AND: [
          { transprensaRemesa: { estado_atencion: 'ENTREGADO' } },
          { transprensaRemesa: { imagen_cumplido: { not: null } } },
        ]
      },
    },
    select: { id: true, guiaTransporte: true, numeroFactura: true }
  })

  for (const orden of ordenes) {
    try {
      const remesa = await consultarRemesa(token, orden.guiaTransporte.trim())
      if (!remesa) continue

      const estadoAtencion: string = remesa.estado_atencioncliente ?? ''
      const rawEstados: any[]      = remesa.lista_estado_atencioncliente ?? []
      const ultimoEstado           = rawEstados[rawEstados.length - 1] ?? null

      // Upsert TransprensaRemesa
      await (prisma as any).transprensaRemesa.upsert({
        where:  { ordenId: orden.id },
        create: {
          empresaId,
          ordenId:         orden.id,
          numero_remesa:   remesa.numero_remesa,
          estado_remesa:   remesa.estado_remesa ?? null,
          estado_atencion: estadoAtencion || null,
          raw_estados:     rawEstados,
          imagen_cumplido: remesa.remesa_imagencumplido ?? null,
          sincronizadoEn:  new Date(),
        },
        update: {
          estado_remesa:   remesa.estado_remesa ?? null,
          estado_atencion: estadoAtencion || null,
          raw_estados:     rawEstados,
          imagen_cumplido: remesa.remesa_imagencumplido ?? null,
          sincronizadoEn:  new Date(),
          updatedAt:       new Date(),
        }
      })

      actualizadas++

      // Si entregado → marcar OrdenDespacho
      if (estadoAtencion.toUpperCase() === 'ENTREGADO') {
        const fechaEntrega = ultimoEstado?.estado_fecha
          ? new Date(ultimoEstado.estado_fecha)
          : new Date()

        await (prisma as any).ordenDespacho.update({
          where: { id: orden.id },
          data:  { estado: 'entregado', entregadoEl: fechaEntrega }
        })
        entregadas++
      }

    } catch (e: any) {
      console.error(`[transprensa] error orden ${orden.guiaTransporte}:`, e.message)
      errores++
    }
  }

  return { actualizadas, entregadas, errores, asignadas }
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runSyncTransprensa(): Promise<{ ok: boolean; empresas: number; actualizadas: number; entregadas: number; errores: number; asignadas: number }> {
  // Todas las empresas con integración Transprensa activa
  const integraciones = await (prisma as any).integracion.findMany({
    where: { tipo: 'transprensa', activa: true },
    select: { empresaId: true }
  })

  let totActualizadas = 0, totEntregadas = 0, totErrores = 0, totAsignadas = 0

  for (const { empresaId } of integraciones) {
    try {
      const r = await syncEmpresa(empresaId)
      totActualizadas += r.actualizadas
      totEntregadas   += r.entregadas
      totErrores      += r.errores
      totAsignadas    += r.asignadas ?? 0
    } catch (e: any) {
      console.error(`[transprensa] error empresa ${empresaId}:`, e.message)
      totErrores++
    }
  }

  return { ok: true, empresas: integraciones.length, actualizadas: totActualizadas, entregadas: totEntregadas, errores: totErrores, asignadas: totAsignadas }
}
