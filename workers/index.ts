import { readFileSync } from 'fs'
try {
  const env = readFileSync('/srv/gestor/.env', 'utf8')
  for (const line of env.split('\n')) {
    const clean = line.trim()
    const idx = clean.indexOf('=')
    if (idx === -1) continue
    const key = clean.slice(0, idx).trim()
    const val = clean.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    if (!(key in process.env)) process.env[key] = val
  }
} catch {}
import { Worker, Queue, QueueEvents } from 'bullmq'

const REDIS = { host: 'localhost', port: 6379, db: 1, password: '7wzadPIuzVn84WkSfPUoOAIlb0PKCZK' } // db1 = gestor
const BASE_URL = 'http://localhost:3010'
// SECRET se lee dinámicamente en cada llamada — sobrevive rotación sin reiniciar worker
function getSecret() { return process.env.CRON_SECRET || '' }

async function callEndpoint(path: string, body?: Record<string, unknown>) {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': getSecret(),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json: unknown
  try { json = JSON.parse(text) } catch { json = text }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`)
  return json
}


async function cronYaEjecuto(tipo: string, ventanaMs = 2 * 60 * 60 * 1000): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/cron/last-run?tipo=${tipo}`, {
      headers: { 'x-cron-secret': getSecret() },
    })
    if (!res.ok) return null
    const data = await res.json() as { ok: boolean; id?: string; createdAt?: string }
    if (!data.ok || !data.createdAt) return null
    const age = Date.now() - new Date(data.createdAt).getTime()
    return age < ventanaMs ? (data.id ?? 'ok') : null
  } catch {
    return null
  }
}

// ── Queue: rutas-dia ─────────────────────────────────────────────────────────

export const rutasDiaQueue = new Queue('rutas-dia', { connection: REDIS, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 60000 }, removeOnComplete: 50, removeOnFail: 100 } })

export const rutasDiaWorker = new Worker(
  'rutas-dia',
  async (job) => {
    const skip = await cronYaEjecuto('rutas-dia')
    if (skip) { console.log(`[rutas-dia] skip — cron ejecutó OK (${skip})`); return { skip: true } }
    console.log(`[rutas-dia] ${job.name} iniciado ${new Date().toISOString()}`)
    const result = await callEndpoint('/api/rutas/procesar-dia')
    console.log(`[rutas-dia] ${job.name} resultado:`, JSON.stringify(result))
    // Turnos vendedores/supervisores — misma ventana horaria
    try {
      const turnos = await callEndpoint('/api/turnos/procesar-dia')
      console.log(`[rutas-dia] turnos resultado:`, JSON.stringify(turnos))
    } catch (e: any) {
      console.error(`[rutas-dia] turnos error:`, e.message)
    }
    return result
  },
  { connection: REDIS, concurrency: 1 },
)

rutasDiaWorker.on('failed', async (job, err) => {
  console.error(`[rutas-dia] ${job?.name} falló:`, err.message)
  // Si agotó todos los intentos — reprogramar scheduler para que no desaparezca
  if (job && (job.attemptsMade ?? 0) >= (job.opts?.attempts ?? 3)) {
    console.warn(`[rutas-dia] ${job.name} agotó intentos — reprogramando scheduler`)
    try {
      await rutasDiaQueue.upsertJobScheduler('crear-rutas', { pattern: '0 13 * * *' }, { name: 'crear-rutas', data: {} })
      await rutasDiaQueue.upsertJobScheduler('cerrar-rutas', { pattern: '0 1 * * *' }, { name: 'cerrar-rutas', data: {} })
      console.log('[rutas-dia] scheduler reprogramado OK')
    } catch (e: any) { console.error('[rutas-dia] error reprogramando scheduler:', e.message) }
  }
})

// ── Queue: integracion ───────────────────────────────────────────────────────

export const integracionQueue = new Queue('integracion', { connection: REDIS, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 60000 }, removeOnComplete: 50, removeOnFail: 100 } })

export const integracionWorker = new Worker(
  'integracion',
  async (job) => {
    const skip = await cronYaEjecuto('integracion')
    if (skip) { console.log(`[integracion] skip — cron ejecutó OK (${skip})`); return { skip: true } }
    console.log(`[integracion] ${job.name} iniciado ${new Date().toISOString()}`)
    const result = await callEndpoint('/api/integracion/sync', { tipo: 'delta' })
    console.log(`[integracion] ${job.name} resultado:`, JSON.stringify(result))
    return result
  },
  { connection: REDIS, concurrency: 1 },
)

integracionWorker.on('failed', async (job, err) => {
  console.error(`[integracion] ${job?.name} falló:`, err.message)
  if (job && (job.attemptsMade ?? 0) >= (job.opts?.attempts ?? 3)) {
    console.warn(`[integracion] ${job.name} agotó intentos — reprogramando scheduler`)
    try {
      await integracionQueue.upsertJobScheduler('delta-sync', { pattern: '0 10 * * *' }, { name: 'delta-sync', data: {} })
      console.log('[integracion] scheduler reprogramado OK')
    } catch (e: any) { console.error('[integracion] error reprogramando scheduler:', e.message) }
  }
})

// ── Queue: entregas (on demand) ──────────────────────────────────────────────

// ── Queue: bodega-sync (diario) ──────────────────────────────────────────────
export const bodegaSyncQueue = new Queue('bodega-sync', { connection: REDIS, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 60000 }, removeOnComplete: 50, removeOnFail: 100 } })
export const bodegaSyncWorker = new Worker(
  'bodega-sync',
  async (job) => {
    console.log(`[bodega-sync] iniciado ${new Date().toISOString()}`)
    const result = await callEndpoint('/api/bodega/sync-auto')
    console.log('[bodega-sync] resultado:', JSON.stringify(result))
    return result
  },
  { connection: REDIS, concurrency: 1 }
)
bodegaSyncWorker.on('failed', (job, err) => {
  console.error(`[bodega-sync] ${job?.name} falló:`, err.message)
})

export const entregasQueue = new Queue('entregas', { connection: REDIS, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 60000 }, removeOnComplete: 50, removeOnFail: 100 } })

export const entregasWorker = new Worker(
  'entregas',
  async (job) => {
    console.log(`[entregas] ${job.name} iniciado ${new Date().toISOString()}`)
    let result: unknown
    if (job.name === 'geocodificar') {
      result = await callEndpoint('/api/entregas/geocodificar', { clienteId: job.data.clienteId })
    } else {
      result = await callEndpoint('/api/rutas/procesar-dia')
    }
    console.log(`[entregas] ${job.name} resultado:`, JSON.stringify(result))
    return result
  },
  { connection: REDIS, concurrency: 5 },
)

entregasWorker.on('failed', (job, err) => {
  console.error(`[entregas] ${job?.name} falló:`, err.message)
})

// ── Queue: audit (noche) ─────────────────────────────────────────────────────
export const auditQueue = new Queue('audit', { connection: REDIS, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 60000 }, removeOnComplete: 50, removeOnFail: 100 } })
export const auditWorker = new Worker(
  'audit',
  async (job) => {
    console.log(`[audit] ${job.name} iniciado ${new Date().toISOString()}`)
    const res = await fetch('http://localhost:3020/api/audit/reporte', {
      method: 'POST',
      headers: { 'x-audit-secret': process.env.AUDIT_SECRET ?? '' },
      signal: AbortSignal.timeout(120000),
    })
    const result = await res.json()
    console.log(`[audit] ${job.name} resultado:`, JSON.stringify(result))
    return result
  },
  { connection: REDIS, concurrency: 1 },
)
auditWorker.on('failed', (job, err) => {
  console.error(`[audit] ${job?.name} falló:`, err.message)
})

// ── Queue: contexto (madrugada) ──────────────────────────────────────────────
export const contextoQueue = new Queue('contexto', { connection: REDIS, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 60000 }, removeOnComplete: 50, removeOnFail: 100 } })
export const contextoWorker = new Worker(
  'contexto',
  async (job) => {
    console.log(`[contexto] ${job.name} iniciado ${new Date().toISOString()}`)
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)
    const { stdout } = await execAsync('bash /srv/generar-contexto.sh', { timeout: 120000 })
    console.log(`[contexto] completado:`, stdout.slice(-100))
    return { ok: true }
  },
  { connection: REDIS, concurrency: 1 },
)
contextoWorker.on('failed', (job, err) => {
  console.error(`[contexto] ${job?.name} fallo:`, err.message)
})

// ── Queue: mantenimiento (diario) ────────────────────────────────────────────
export const mantenimientoQueue = new Queue('mantenimiento', { connection: REDIS, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 60000 }, removeOnComplete: 50, removeOnFail: 100 } })
export const mantenimientoWorker = new Worker(
  'mantenimiento',
  async (job) => {
    console.log(`[mantenimiento] ${job.name} iniciado ${new Date().toISOString()}`)
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)
    await execAsync('bash /srv/master/scripts/mantenimiento.sh', { timeout: 60000 })
    console.log(`[mantenimiento] completado`)
    return { ok: true }
  },
  { connection: REDIS, concurrency: 1 },
)
mantenimientoWorker.on('failed', (job, err) => {
  console.error(`[mantenimiento] ${job?.name} fallo:`, err.message)
})

// ── Queue: sync-delta (diurno inteligente) ───────────────────────────────────
export const syncDeltaQueue = new Queue('sync-delta', { connection: REDIS, defaultJobOptions: { attempts: 2, backoff: { type: 'exponential', delay: 30000 }, removeOnComplete: 50, removeOnFail: 100 } })
export const syncDeltaWorker = new Worker(
  'sync-delta',
  async (job) => {
    const skip = await cronYaEjecuto('delta', 35 * 60 * 1000)
    if (skip) { console.log(`[sync-delta] skip — cron ejecutó OK (${skip})`); return { skip: true } }
    console.log(`[sync-delta] iniciado ${new Date().toISOString()}`)
    const result = await callEndpoint('/api/sync/delta')
    console.log('[sync-delta] resultado:', JSON.stringify(result))
    return result
  },
  { connection: REDIS, concurrency: 1 }
)
syncDeltaWorker.on('failed', (job, err) => {
  console.error(`[sync-delta] ${job?.name} falló:`, err.message)
})

// ── Queue: sync-nocturno (3am Bogotá) ────────────────────────────────────────
export const syncNocturnoQueue = new Queue('sync-nocturno', { connection: REDIS, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 60000 }, removeOnComplete: 50, removeOnFail: 100 } })
export const syncNocturnoWorker = new Worker(
  'sync-nocturno',
  async (job) => {
    const skip = await cronYaEjecuto('nocturno')
    if (skip) { console.log(`[sync-nocturno] skip — cron ejecutó OK (${skip})`); return { skip: true } }
    const modo = job.data?.modo ?? 'completo'
    console.log(`[sync-nocturno] iniciado modo=${modo} ${new Date().toISOString()}`)
    const result = await callEndpoint(`/api/sync/nocturno?modo=${modo}`)
    console.log('[sync-nocturno] resultado:', JSON.stringify(result))
    return result
  },
  { connection: REDIS, concurrency: 1 }
)
syncNocturnoWorker.on('failed', (job, err) => {
  console.error(`[sync-nocturno] ${job?.name} falló:`, err.message)
})
