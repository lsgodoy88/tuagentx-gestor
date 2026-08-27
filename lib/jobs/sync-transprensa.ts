/**
 * sync-transprensa.ts
 * Consulta remesas en Transprensa por empresa y hace upsert en TransprensaRemesa.
 * Cuando estado_atencion === 'ENTREGADO' → marca OrdenDespacho como entregada.
 */

import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto-uptres'

const BASE_URL = 'https://transprensa.colombiasoftware.net/index.php'

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

// ── Sync por empresa ──────────────────────────────────────────────────────────

async function syncEmpresa(empresaId: string): Promise<{ actualizadas: number; entregadas: number; errores: number }> {
  const intg = await (prisma as any).integracion.findFirst({
    where: { empresaId, tipo: 'transprensa', activa: true },
    select: { config: true }
  })
  if (!intg) return { actualizadas: 0, entregadas: 0, errores: 0 }

  const config = intg.config as any
  const password = decrypt(config.usuario_password, process.env.UPTRES_SECRET!)

  // Login — token caduca cada 2 días, lo obtenemos fresco cada sync
  const token = await loginTransprensa(config.usuario_login, password)

  // Órdenes en_transito con guiaTransporte para esta empresa
  const ordenes = await (prisma as any).ordenDespacho.findMany({
    where: {
      empresaId,
      modo_despacho: { in: ['transportadora', 'transporte'] },
      guiaTransporte: { not: null },
      estado: { in: ['en_transito', 'despachado', 'entregado'] },
    },
    select: { id: true, guiaTransporte: true, numeroFactura: true }
  })

  let actualizadas = 0, entregadas = 0, errores = 0

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

  return { actualizadas, entregadas, errores }
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runSyncTransprensa(): Promise<{ ok: boolean; empresas: number; actualizadas: number; entregadas: number; errores: number }> {
  // Todas las empresas con integración Transprensa activa
  const integraciones = await (prisma as any).integracion.findMany({
    where: { tipo: 'transprensa', activa: true },
    select: { empresaId: true }
  })

  let totActualizadas = 0, totEntregadas = 0, totErrores = 0

  for (const { empresaId } of integraciones) {
    try {
      const r = await syncEmpresa(empresaId)
      totActualizadas += r.actualizadas
      totEntregadas   += r.entregadas
      totErrores      += r.errores
    } catch (e: any) {
      console.error(`[transprensa] error empresa ${empresaId}:`, e.message)
      totErrores++
    }
  }

  return { ok: true, empresas: integraciones.length, actualizadas: totActualizadas, entregadas: totEntregadas, errores: totErrores }
}
