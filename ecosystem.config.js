const fs = require('fs')
const path = require('path')

// Leer .env del servidor — secrets nunca van en git
function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env')
    return Object.fromEntries(
      fs.readFileSync(envPath, 'utf8')
        .split('\n')
        .filter(l => l.includes('=') && !l.startsWith('#'))
        .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,'')] })
    )
  } catch { return {} }
}

const serverEnv = loadEnv()

module.exports = {
  apps: [{
    name: 'gestor',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -p 3010',
    cwd: '/srv/gestor',
    env: {
      DATABASE_URL: 'postgresql://evolution:evolutionpass@127.0.0.1:5432/evolution?schema=gestor&options=-c%20timezone%3DUTC',
      NEXTAUTH_URL: 'https://gestor.tuagentx.com',
      NEXTAUTH_TRUST_HOST: 'true',
      REDIS_URL: 'redis://:7wzadPIuzVn84WkSfPUoOAIlb0PKCZK@127.0.0.1:6379',
      // Secrets desde .env — nunca hardcodeados en git
      NEXTAUTH_SECRET: serverEnv.NEXTAUTH_SECRET || '',
      CRON_SECRET: serverEnv.CRON_SECRET || '',
    }
  }]
}
