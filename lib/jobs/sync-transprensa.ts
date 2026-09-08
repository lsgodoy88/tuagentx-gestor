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
  return data.data[0]
}

// ── Mapear estado a ícono UI ──────────────────────────────────────────────────

export function iconoEstadoTransprensa(estado: string): string {
  const e = estado?.toUpperCase() ?? ''
  if (e.includes('ENTREGADO')) return '✅'
  if (e.includes('NOVEDAD'))   return '🔴'
  return '🚚'
}


// ── Match automático guías por fecha+NIT+cajas ────────────────────────────────

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

async function autoAsignarGuias(
  empresaId: string,
  token: string,
  nitRemitente: string
): Promise<{ asignadas: number }> {
  // Órdenes transporte del día sin guía y con num_cajas > 0
  const hoy = new Date()
  const fechaHoy = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`

  const ordenesSinGuia = await (prisma as any).ordenDespacho.findMany({
    where: {
      empresaId,
      modo_despacho: { in: ['transportadora', 'transporte'] },
      guiaTransporte: null,
      num_cajas: { gt: 0 },
      estado: { in: ['en_transito', 'despachado', 'alistado'] },
    },
    select: { id: true, numeroFactura: true, clienteNombre: true, num_cajas: true, createdAt: true },
  })

  if (!ordenesSinGuia.length) return { asignadas: 0 }

  // Agrupar por fecha de creación
  const porFecha = new Map<string, typeof ordenesSinGuia>()
  for (const o of ordenesSinGuia) {
    const f = new Date(o.createdAt)
    const key = `${f.getFullYear()}-${String(f.getMonth()+1).padStart(2,'0')}-${String(f.getDate()).padStart(2,'0')}`
    if (!porFecha.has(key)) porFecha.set(key, [])
    porFecha.get(key)!.push(o)
  }

  // Cargar NITs de clientes
  const nombres = [...new Set(ordenesSinGuia.map((o: any) => o.clienteNombre))]
  const clientes = await (prisma as any).cliente.findMany({
    where: { empresaId, nombre: { in: nombres }, nit: { not: null } },
    select: { nombre: true, nit: true },
  })
  const nitMap = new Map<string, string>()
  for (const c of clientes) if (c.nit) nitMap.set(c.nombre, c.nit)

  let asignadas = 0

  for (const [fecha, ordenes] of porFecha) {
    const remesas = await consultarRemesasPorFechaYNit(token, fecha, nitRemitente)
    if (!remesas.length) continue

    // Construir lookup remesas: dest_nit+cajas → remesa
    const remesaMap = new Map<string, any>()
    for (const r of remesas) {
      const dest = r.remesa_destinatario ?? {}
      const cajas = (r.remesa_detalle ?? []).find((x: any) => x.producto?.producto_nombre?.toUpperCase().includes('CAJA'))?.cantidad ?? '0'
      const key = `${dest.destinataro_documento}|${cajas}`
      if (!remesaMap.has(key)) remesaMap.set(key, r)
    }

    for (const orden of ordenes) {
      const nit = nitMap.get(orden.clienteNombre)
      const cajas = String(orden.num_cajas)
      let matched: any = null

      // 1) Match exacto NIT + cajas
      if (nit) matched = remesaMap.get(`${nit}|${cajas}`) ?? null

      // 2) Fallback fuzzy nombre + cajas
      if (!matched) {
        let best: any = null, bestScore = 0
        for (const r of remesas) {
          const destNombre = r.remesa_destinatario?.destinatario_nombre ?? ''
          const rCajas = (r.remesa_detalle ?? []).find((x: any) => x.producto?.producto_nombre?.toUpperCase().includes('CAJA'))?.cantidad ?? '0'
          if (rCajas !== cajas) continue
          const score = similaridad(orden.clienteNombre, destNombre)
          if (score > bestScore) { bestScore = score; best = r }
        }
        if (bestScore >= 0.6) matched = best
      }

      if (!matched) continue

      // Asignar guía
      try {
        await (prisma as any).ordenDespacho.update({
          where: { id: orden.id },
          data: { guiaTransporte: matched.numero_remesa },
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
