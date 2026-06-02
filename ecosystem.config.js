module.exports = {
  apps: [{
    name: 'gestor',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -p 3010',
    cwd: '/srv/gestor',
    env: {
      DATABASE_URL: 'postgresql://evolution:evolutionpass@127.0.0.1:5432/evolution?schema=gestor&options=-c%20timezone%3DUTC',
      CRON_SECRET: '42b07dd283c99f6ec07d3699a0481fcc',
      NEXTAUTH_SECRET: 'gestor-secret-tuagentx-2026-v2',
      NEXTAUTH_URL: 'https://gestor.tuagentx.com',
      NEXTAUTH_TRUST_HOST: 'true',
      REDIS_URL: 'redis://:7wzadPIuzVn84WkSfPUoOAIlb0PKCZK@127.0.0.1:6379'
    }
  }]
}
