const fs   = require('fs')
const path = require('path')

function loadEnv() {
  try {
    return Object.fromEntries(
      fs.readFileSync(path.join(__dirname, '.env'), 'utf8')
        .split('\n')
        .filter(l => l.includes('=') && !l.startsWith('#') && l.trim())
        .map(l => {
          const i = l.indexOf('=')
          return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
        })
    )
  } catch (e) {
    console.error('[ecosystem-worker] ERROR: no se pudo leer .env:', e.message)
    return {}
  }
}

const env = loadEnv()

const REQUIRED = ['DATABASE_URL', 'REDIS_URL', 'CRON_SECRET']
const missing = REQUIRED.filter(k => !env[k])
if (missing.length > 0) {
  console.error('[ecosystem-worker] FATAL: vars faltantes en .env:', missing.join(', '))
  process.exit(1)
}

module.exports = {
  apps: [{
    name: 'gestor-worker',
    script: 'npx',
    args: 'tsx workers/start.ts',
    cwd: '/srv/gestor',
    // Garantiza que el worker nunca quede caído
    autorestart: true,       // reiniciar siempre si muere
    max_restarts: 999,       // sin límite práctico de reinicios
    min_uptime: '10s',       // considera estable si vive >10s
    restart_delay: 5000,     // esperar 5s entre reinicios
    watch: false,
    env: {
      NODE_ENV:    'production',
      DATABASE_URL: env.DATABASE_URL,
      REDIS_URL:    env.REDIS_URL,
      CRON_SECRET:  env.CRON_SECRET,
      AUDIT_SECRET: env.AUDIT_SECRET || '',
    }
  }]
}
