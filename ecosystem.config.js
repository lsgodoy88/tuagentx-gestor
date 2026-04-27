module.exports = {
  apps: [{
    name: 'gestor',
    script: 'npm',
    args: 'start',
    env: { PORT: 3010 },
    cwd: '/srv/gestor'
  }]
}
