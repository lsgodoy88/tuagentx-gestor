import { readFileSync } from 'fs'
import { resolve } from 'path'

// Cargar .env manualmente (no hay dotenv instalado)
try {
  const envFile = readFileSync('/srv/gestor/.env', 'utf8')
  for (const line of envFile.split('\n')) {
    const clean = line.trim()
    if (!clean || clean.startsWith('#')) continue
    const idx = clean.indexOf('=')
    if (idx === -1) continue
    const key = clean.slice(0, idx).trim()
    const val = clean.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    if (!(key in process.env)) process.env[key] = val
  }
} catch { /* .env no encontrado — usar variables de entorno del proceso */ }

import { rutasDiaQueue, integracionQueue, rutasDiaWorker, integracionWorker, entregasWorker, auditQueue, auditWorker, contextoQueue, contextoWorker, mantenimientoQueue, mantenimientoWorker, bodegaSyncQueue, bodegaSyncWorker, syncDeltaQueue, syncDeltaWorker, syncNocturnoQueue, syncNocturnoWorker } from './index'

async function main() {
  // ── Registrar jobs repetitivos ────────────────────────────────────────────

  // Crear rutas: 12:00 UTC = 7:00 Bogotá
  await rutasDiaQueue.upsertJobScheduler(
    'crear-rutas',
    { pattern: '0 12 * * *' },
    { name: 'crear-rutas', data: {} },
  )

  // Cerrar rutas: 02:00 UTC = 21:00 Bogotá
  await rutasDiaQueue.upsertJobScheduler(
    'cerrar-rutas',
    { pattern: '0 2 * * *' },
    { name: 'cerrar-rutas', data: {} },
  )

  // Delta sync integración: 10:00 UTC = 5:00 Bogotá
  await integracionQueue.upsertJobScheduler(
    'delta-sync',
    { pattern: '0 10 * * *' },
    { name: 'delta-sync', data: {} },
  )

  console.log('[gestor-worker] Jobs registrados:')
  console.log('  rutas-dia  → crear-rutas  (0 12 * * * UTC = 7am Bogotá)')
  console.log('  rutas-dia  → cerrar-rutas (0 2  * * * UTC = 9pm Bogotá)')
  console.log('  integracion → delta-sync  (0 10 * * * UTC = 5am Bogotá)')
  // Audit: 06:00 UTC = 1:00 Bogota
  await auditQueue.upsertJobScheduler(
    'audit-diario',
    { pattern: '0 6 * * *' },
    { name: 'audit-diario', data: {} },
  )
  console.log('  audit      -> audit-diario (0 6 * * * UTC = 1am Bogota)')
  // Contexto: 03:00 UTC = 10pm Bogota
  await contextoQueue.upsertJobScheduler(
    'generar-contexto',
    { pattern: '0 3 * * *' },
    { name: 'generar-contexto', data: {} },
  )
  console.log('  contexto      -> generar-contexto (0 3 * * * UTC = 10pm Bogota)')
  // Bodega sync: 11:00 UTC = 6am Bogotá (después del delta-sync de 5am)
  await bodegaSyncQueue.upsertJobScheduler(
    'bodega-sync-diario',
    { pattern: '0 11 * * *' },
    { name: 'bodega-sync-diario', data: {} },
  )
  console.log('  bodega-sync -> bodega-sync-diario (0 11 * * * UTC = 6am Bogotá)')

  // Mantenimiento: 14:00 UTC = 9am Bogota
  await mantenimientoQueue.upsertJobScheduler(
    'mantenimiento-diario',
    { pattern: '0 14 * * *' },
    { name: 'mantenimiento-diario', data: {} },
  )
  console.log('  mantenimiento -> mantenimiento-diario (0 14 * * * UTC = 9am Bogota)')
  // ── sync-delta: horario inteligente 8am–6pm UTC-5 = UTC+5 ──────────────────
  // 8am–10am cada 30min: 13:00,13:30,14:00,14:30 UTC
  await syncDeltaQueue.upsertJobScheduler('sync-delta-0800', { pattern: '0 13 * * 1-6' }, { name: 'sync-delta-0800', data: {} })
  await syncDeltaQueue.upsertJobScheduler('sync-delta-0830', { pattern: '30 13 * * 1-6' }, { name: 'sync-delta-0830', data: {} })
  await syncDeltaQueue.upsertJobScheduler('sync-delta-0900', { pattern: '0 14 * * 1-6' }, { name: 'sync-delta-0900', data: {} })
  await syncDeltaQueue.upsertJobScheduler('sync-delta-0930', { pattern: '30 14 * * 1-6' }, { name: 'sync-delta-0930', data: {} })
  // 10am–2pm cada hora: 15,16,17,18 UTC
  await syncDeltaQueue.upsertJobScheduler('sync-delta-1000', { pattern: '0 15 * * 1-6' }, { name: 'sync-delta-1000', data: {} })
  await syncDeltaQueue.upsertJobScheduler('sync-delta-1100', { pattern: '0 16 * * 1-6' }, { name: 'sync-delta-1100', data: {} })
  await syncDeltaQueue.upsertJobScheduler('sync-delta-1200', { pattern: '0 17 * * 1-6' }, { name: 'sync-delta-1200', data: {} })
  await syncDeltaQueue.upsertJobScheduler('sync-delta-1300', { pattern: '0 18 * * 1-6' }, { name: 'sync-delta-1300', data: {} })
  // 2pm–4pm cada 30min: 19:00,19:30,20:00,20:30 UTC
  await syncDeltaQueue.upsertJobScheduler('sync-delta-1400', { pattern: '0 19 * * 1-6' }, { name: 'sync-delta-1400', data: {} })
  await syncDeltaQueue.upsertJobScheduler('sync-delta-1430', { pattern: '30 19 * * 1-6' }, { name: 'sync-delta-1430', data: {} })
  await syncDeltaQueue.upsertJobScheduler('sync-delta-1500', { pattern: '0 20 * * 1-6' }, { name: 'sync-delta-1500', data: {} })
  await syncDeltaQueue.upsertJobScheduler('sync-delta-1530', { pattern: '30 20 * * 1-6' }, { name: 'sync-delta-1530', data: {} })
  // 4pm–6pm cada hora: 21,22 UTC
  await syncDeltaQueue.upsertJobScheduler('sync-delta-1600', { pattern: '0 21 * * 1-6' }, { name: 'sync-delta-1600', data: {} })
  await syncDeltaQueue.upsertJobScheduler('sync-delta-1700', { pattern: '0 22 * * 1-6' }, { name: 'sync-delta-1700', data: {} })
  console.log('  sync-delta  → 14 ciclos/día (8am–6pm Bogotá, horario inteligente)')

  // sync-nocturno: 8:00 UTC = 3:00 Bogotá
  await syncNocturnoQueue.upsertJobScheduler('sync-nocturno-diario', { pattern: '0 8 * * *' }, { name: 'sync-nocturno-diario', data: {} })
  console.log('  sync-nocturno → 0 8 * * * UTC = 3am Bogotá')

  console.log('[gestor-worker] Workers online. Esperando jobs...')

  // Mantener proceso vivo
  process.on('SIGTERM', async () => {
    console.log('[gestor-worker] SIGTERM recibido, cerrando workers...')
    await Promise.all([
      rutasDiaWorker.close(),
      integracionWorker.close(),
      entregasWorker.close(),
      auditWorker.close(),
      contextoWorker.close(),
      mantenimientoWorker.close(),
      bodegaSyncWorker.close(),
      syncDeltaWorker.close(),
      syncNocturnoWorker.close(),
    ])
    process.exit(0)
  })
}

main().catch(err => {
  console.error('[gestor-worker] Error fatal en inicio:', err)
  process.exit(1)
})
