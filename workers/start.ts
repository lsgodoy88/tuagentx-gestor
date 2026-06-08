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

import { rutasDiaQueue, integracionQueue, rutasDiaWorker, integracionWorker, mantenimientoQueue, mantenimientoWorker, syncDeltaQueue, syncDeltaWorker, syncNocturnoQueue, syncNocturnoWorker } from './index'

async function main() {
  // ── Registrar jobs repetitivos ────────────────────────────────────────────

  // Crear rutas: 13:00 UTC = 8:00 Bogotá
  await rutasDiaQueue.upsertJobScheduler(
    'crear-rutas',
    { pattern: '0 13 * * *' },
    { name: 'crear-rutas', data: {} },
  )

  // Cerrar rutas: 01:00 UTC = 20:00 Bogotá
  await rutasDiaQueue.upsertJobScheduler(
    'cerrar-rutas',
    { pattern: '0 1 * * *' },
    { name: 'cerrar-rutas', data: {} },
  )

  // Delta sync integración: 10:00 UTC = 5:00 Bogotá
  await integracionQueue.upsertJobScheduler(
    'delta-sync',
    { pattern: '0 10 * * *' },
    { name: 'delta-sync', data: {} },
  )

  console.log('[gestor-worker] Jobs registrados:')
  console.log('  rutas-dia  → crear-rutas  (0 13 * * * UTC = 8am Bogotá)')
  console.log('  rutas-dia  → cerrar-rutas (0 1  * * * UTC = 8pm Bogotá)')
  console.log('  integracion → delta-sync  (0 10 * * * UTC = 5am Bogotá)')
  // Audit: 06:00 UTC = 1:00 Bogota
  // audit-diario → manejado por master-worker


  // Mantenimiento: 14:00 UTC = 9am Bogota
  await mantenimientoQueue.upsertJobScheduler(
    'mantenimiento-diario',
    { pattern: '0 14 * * *' },
    { name: 'mantenimiento-diario', data: {} },
  )
  console.log('  mantenimiento -> mantenimiento-diario (0 14 * * * UTC = 9am Bogota)')
  // sync-delta: manejado por crontab Linux (*/30 13-21 * * 1-6)
  // Más confiable que BullMQ — sobrevive reinicios del worker y de Redis
  // sync-delta watchdog: 5 min después del cron — fallback si el cron falló
  // UTC: 5,35 13-23 = 8:05, 8:35... 6:05pm Bogotá lun-sab
  // cronYaEjecuto('delta', 35min) en el worker hace skip si el cron corrió OK
  await syncDeltaQueue.upsertJobScheduler(
    'sync-delta-watchdog',
    { pattern: '5,35 13-23 * * 1-6' },
    { name: 'sync-delta-watchdog', data: {} },
  )
  console.log('  sync-delta  → crontab OS (*/30 8-18 Bogotá) + watchdog BullMQ (8:05, 8:35... L-S)')

  // sync-nocturno: 8:00 UTC = 3:00 Bogotá
  // Completo domingos 3am Bogotá — huérfanas + CarteraCache
  await syncNocturnoQueue.upsertJobScheduler('sync-nocturno-semanal', { pattern: '0 7 * * 0' }, { name: 'sync-nocturno-semanal', data: { modo: 'completo' } })
  // Delta deudas nuevas lunes-sábado 2am Bogotá — solo insert nuevas, sin cache
  await syncNocturnoQueue.upsertJobScheduler('sync-nocturno-delta', { pattern: '0 7 * * 1-6' }, { name: 'sync-nocturno-delta', data: { modo: 'delta' } })
  console.log('  sync-nocturno → completo domingos / delta lun-sab (0 7 UTC = 2am Bogotá)')

  console.log('[gestor-worker] Workers online. Esperando jobs...')

  // Mantener proceso vivo
  process.on('SIGTERM', async () => {
    console.log('[gestor-worker] SIGTERM recibido, cerrando workers...')
    await Promise.all([
      rutasDiaWorker.close(),
      integracionWorker.close(),
      // auditWorker → master-worker
      mantenimientoWorker.close(),
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
