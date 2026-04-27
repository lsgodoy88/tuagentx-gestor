module.exports = {
  apps: [{
    name: 'gestor-worker',
    script: 'npx',
    args: 'tsx workers/start.ts',
    cwd: '/srv/gestor'
  }]
}
