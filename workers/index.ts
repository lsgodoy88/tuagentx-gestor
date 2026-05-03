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

const REDIS = { host: 'localhost', port: 6379, db: 1 } // db1 = gestor (db0 = Evolution)
const BASE_URL = 'http://localhost:3010'
const SECRET = process.env.CRON_SECRET || ''

async function callEndpoint(path: string, body?: Record<string, unknown>) {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': SECRET,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json: unknown
  try { json = JSON.parse(text) } catch { json = text }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`)
  return json
}

// ── Queue: rutas-dia ─────────────────────────────────────────────────────────

export const rutasDiaQueue = new Queue('rutas-dia', { connection: REDIS })

export const rutasDiaWorker = new Worker(
  'rutas-dia',
  async (job) => {
    console.log(`[rutas-dia] ${job.name} iniciado ${new Date().toISOString()}`)
    const result = await callEndpoint('/api/rutas/procesar-dia')
    console.log(`[rutas-dia] ${job.name} resultado:`, JSON.stringify(result))
    return result
  },
  { connection: REDIS, concurrency: 1 },
)

rutasDiaWorker.on('failed', (job, err) => {
  console.error(`[rutas-dia] ${job?.name} falló:`, err.message)
})

// ── Queue: integracion ───────────────────────────────────────────────────────

export const integracionQueue = new Queue('integracion', { connection: REDIS })

export const integracionWorker = new Worker(
  'integracion',
  async (job) => {
    console.log(`[integracion] ${job.name} iniciado ${new Date().toISOString()}`)
    const result = await callEndpoint('/api/integracion/sync', { tipo: 'delta' })
    console.log(`[integracion] ${job.name} resultado:`, JSON.stringify(result))
    return result
  },
  { connection: REDIS, concurrency: 1 },
)

integracionWorker.on('failed', (job, err) => {
  console.error(`[integracion] ${job?.name} falló:`, err.message)
})

// ── Queue: entregas (on demand) ──────────────────────────────────────────────

export const entregasQueue = new Queue('entregas', { connection: REDIS })

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
export const auditQueue = new Queue('audit', { connection: REDIS })
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
export const contextoQueue = new Queue('contexto', { connection: REDIS })
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
export const mantenimientoQueue = new Queue('mantenimiento', { connection: REDIS })
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
