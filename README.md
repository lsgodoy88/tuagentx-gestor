# TuAgentX Gestor

SaaS para gestión de ventas en campo, cartera y despachos. Integración con UpTres ERP.

## Stack

- Next.js 16 (App Router)
- PostgreSQL + Prisma
- BullMQ + Redis (jobs/cron)
- NextAuth (sesiones JWT)
- PM2 (proceso)
- Cloudflare R2 (vouchers + backups)
- Sentry (errores)

## Setup local

```bash
git clone git@github.com:lsgodoy88/tuagentx-gestor.git
cd tuagentx-gestor
npm ci
cp .env.example .env  # configurar DATABASE_URL, NEXTAUTH_SECRET, etc.
npx prisma migrate deploy
npm run dev
```

## Deploy producción

Ver [DEPLOY.md](./DEPLOY.md) para runbook completo de despliegue desde cero y DR.

## Comandos útiles

```bash
# Build
cd /srv/gestor && npm run build 2>&1 | tail -5 && pm2 restart gestor

# Logs
pm2 logs gestor
pm2 logs gestor-worker

# Backup manual
/etc/tuagentx/backup.sh

# Health check
curl https://gestor.tuagentx.com/api/health
```

## Estructura

- `app/api/` — endpoints REST
- `app/dashboard/` — UI autenticada
- `lib/` — helpers compartidos (auth, fechas, recibos, prisma-selects)
- `lib/integracion/` — adapters (UpTres) + sync engine
- `prisma/` — schema + migraciones
- `workers/` — jobs BullMQ + cron scheduling

## Versionado

Ver [CHANGELOG.md](./CHANGELOG.md)
