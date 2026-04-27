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

import { rutasDiaQueue, integracionQueue, rutasDiaWorker, integracionWorker, entregasWorker } from './index'

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

  // Delta sync integración: 08:00 UTC = 3:00 Bogotá
  await integracionQueue.upsertJobScheduler(
    'delta-sync',
    { pattern: '0 8 * * *' },
    { name: 'delta-sync', data: {} },
  )

  console.log('[gestor-worker] Jobs registrados:')
  console.log('  rutas-dia  → crear-rutas  (0 12 * * * UTC = 7am Bogotá)')
  console.log('  rutas-dia  → cerrar-rutas (0 2  * * * UTC = 9pm Bogotá)')
  console.log('  integracion → delta-sync  (0 8  * * * UTC = 3am Bogotá)')
  console.log('[gestor-worker] Workers online. Esperando jobs...')

  // Mantener proceso vivo
  process.on('SIGTERM', async () => {
    console.log('[gestor-worker] SIGTERM recibido, cerrando workers...')
    await Promise.all([
      rutasDiaWorker.close(),
      integracionWorker.close(),
      entregasWorker.close(),
    ])
    process.exit(0)
  })
}

main().catch(err => {
  console.error('[gestor-worker] Error fatal en inicio:', err)
  process.exit(1)
})
