const fs   = require('fs')
const path = require('path')

// Única fuente de verdad — todo desde .env
// Si una var requerida está vacía, el proceso falla rápido al arrancar
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
    console.error('[ecosystem] ERROR: no se pudo leer .env:', e.message)
    return {}
  }
}

const env = loadEnv()

// Vars requeridas — falla rápido si alguna está vacía
const REQUIRED = ['DATABASE_URL', 'NEXTAUTH_SECRET', 'NEXTAUTH_URL', 'REDIS_URL', 'CRON_SECRET', 'WEBHOOK_SECRET']
const missing = REQUIRED.filter(k => !env[k])
if (missing.length > 0) {
  console.error('[ecosystem] FATAL: vars faltantes en .env:', missing.join(', '))
  process.exit(1)
}

module.exports = {
  apps: [{
    name: 'gestor-staging',
    max_restarts: 10,
    restart_delay: 3000,
    min_uptime: '10s',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -p 3011',
    cwd: '/srv/gestor',
    env: {
      NODE_ENV:           'production',
      DATABASE_URL:       env.DATABASE_URL,
      NEXTAUTH_SECRET:    env.NEXTAUTH_SECRET,
      NEXTAUTH_URL:       env.NEXTAUTH_URL,
      NEXTAUTH_TRUST_HOST: env.NEXTAUTH_TRUST_HOST || 'true',
      REDIS_URL:          env.REDIS_URL,
      CRON_SECRET:        env.CRON_SECRET,
      WEBHOOK_SECRET:     env.WEBHOOK_SECRET,
    }
  }]
}
