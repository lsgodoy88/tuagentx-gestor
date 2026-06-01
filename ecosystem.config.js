module.exports = {
  apps: [{
    name: 'gestor',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -p 3010',
    cwd: '/srv/gestor',
    env: {
      REDIS_URL: 'redis://:7wzadPIuzVn84WkSfPUoOAIlb0PKCZK@127.0.0.1:6379'
    }
  }]
}
