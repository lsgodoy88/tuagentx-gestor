module.exports = {
  apps: [{
    name: 'gestor',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -p 3010',
    cwd: '/srv/gestor'
  }]
}
