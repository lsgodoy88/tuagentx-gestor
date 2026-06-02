module.exports = {
  apps: [{
    name: 'gestor',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -p 3010',
    cwd: '/srv/gestor',
    env: {
      DATABASE_URL: 'postgresql://evolution:evolutionpass@127.0.0.1:5432/evolution?schema=gestor&options=-c%20timezone%3DUTC',
      // CRON_SECRET y NEXTAUTH_SECRET — vienen de .env del servidor (no en git)
      NEXTAUTH_URL: 'https://gestor.tuagentx.com',
      NEXTAUTH_TRUST_HOST: 'true',
      REDIS_URL: 'redis://:7wzadPIuzVn84WkSfPUoOAIlb0PKCZK@127.0.0.1:6379'
    }
  }]
}
