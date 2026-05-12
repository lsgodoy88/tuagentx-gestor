# Runbook TuAgentX — Despliegue y DR

## Stack
- **VPS**: Ubuntu 24.04, IP 167.88.39.242, zona Bogotá UTC-5
- **Procesos PM2**: gestor (3010), gestor-worker, panel (3000), master (3020), mcp (3040), info, pm2-logrotate
- **Docker**: postgres (5432), redis (6379), evolution (8080), bot (3001), osrm-ibague (5000), media
- **Cloudflare**: DNS naranja, cache `/_next/static` 1 año
- **R2 (Cloudflare)**: backups en `r2:tuagentx/backups/YYYY-MM-DD/`

## Levantar desde cero (DR completo)

### 1. VPS Ubuntu 24.04
```bash
sudo apt update && sudo apt install -y curl git nginx certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs docker.io docker-compose-v2
sudo usermod -aG docker $USER
npm install -g pm2 rclone
```

### 2. Restaurar secrets desde R2
```bash
mkdir -p /etc/tuagentx/secrets
rclone copy r2:tuagentx/backups/YYYY-MM-DD/secrets-YYYY-MM-DD.tar.gz /tmp/
tar -xzf /tmp/secrets-YYYY-MM-DD.tar.gz -C /
```

### 3. Levantar Docker stack
```bash
cd /srv/whatsapp-stack
docker compose up -d
```

### 4. Restaurar BD
```bash
rclone copy r2:tuagentx/backups/YYYY-MM-DD/postgres-YYYY-MM-DD.sql.gz /tmp/
zcat /tmp/postgres-YYYY-MM-DD.sql.gz | docker exec -i postgres psql -U evolution -d postgres
```

### 5. Clonar repos
```bash
cd /srv
git clone git@github.com:lsgodoy88/tuagentx-gestor.git gestor
git clone git@github.com:lsgodoy88/tuagentx-panel.git panel
git clone git@github.com:lsgodoy88/tuagentx-master.git master
```

### 6. .env por servicio
Copiar `.env` de secrets restaurados a cada `/srv/{gestor,panel,master}/`

### 7. Build + arrancar PM2
```bash
for app in gestor panel master; do
  cd /srv/$app && npm ci && npm run build
done
pm2 start /etc/tuagentx/ecosystem.config.js
pm2 save
pm2 startup  # ejecutar el comando que imprime
```

### 8. Nginx + certificados
```bash
sudo cp /etc/tuagentx/nginx/* /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/tuagentx /etc/nginx/sites-enabled/
sudo certbot --nginx -d gestor.tuagentx.com -d panel.tuagentx.com -d master.tuagentx.com
sudo systemctl reload nginx
```

### 9. Cloudflare
- Apuntar DNS A de cada subdominio a la IP del nuevo VPS
- Modo: naranja (proxy activo)
- Caching → Configuration → Purge Everything

### 10. Cron
```bash
crontab -e
# Pegar:
*/5 * * * * cd /srv/panel && node scripts/monitor.js >> /home/luis/logs/monitor.log 2>&1
0 7 * * * /etc/tuagentx/backup.sh >> /home/luis/logs/tuagentx-backup.log 2>&1
```

## RTO/RPO

- **RTO** (Recovery Time Objective): 2 horas
- **RPO** (Recovery Point Objective): 24 horas (backup diario a las 7am Bogotá)

## Backups

- Diario 7am Bogotá → R2 (`r2:tuagentx/backups/YYYY-MM-DD/`)
- Retención: 7 días
- Restauración probada: 12 mayo 2026

## Variables críticas (.env)

```
DATABASE_URL=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
CRON_SECRET=
UPTRES_SECRET=
SENTRY_DSN=
R2_ENDPOINT=
R2_ACCESS_KEY=
R2_SECRET_KEY=
```

## Incidentes comunes

### "UpTres no responde"
1. Verificar status UpTres
2. Logs: `pm2 logs gestor-worker --lines 50`
3. Workers ahora reintentan 3x con backoff (1, 2, 4 min)

### "Redis lleno"
```bash
docker exec redis redis-cli FLUSHALL  # ⚠️ pierde jobs en cola
```

### "Postgres slow"
```bash
docker exec postgres psql -U evolution -d evolution -c "
SELECT pid, query, state, now() - query_start as duration
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY duration DESC LIMIT 10;"
```

### Restart todo
```bash
pm2 restart all
docker compose -f /srv/whatsapp-stack/docker-compose.yml restart
```
