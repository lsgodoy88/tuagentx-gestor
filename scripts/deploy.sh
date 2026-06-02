#!/bin/bash
# Deploy gestor — pull + build + restart, con log y rollback automático si build falla.
#
# Uso:
#   ./scripts/deploy.sh                 # main → producción (pm2: gestor)
#   ./scripts/deploy.sh staging         # main → staging   (pm2: gestor-staging)
#   ./scripts/deploy.sh staging feature/foo
#   ./scripts/deploy.sh production v1.2.0
#
set -euo pipefail

# ─── Args ─────────────────────────────────────────────────────────────────
ENV="${1:-production}"
REF="${2:-main}"

case "$ENV" in
  production)  APP_DIR=/srv/gestor;          PM2_NAME=gestor;          PORT=3010 ;;
  staging)     APP_DIR=/srv/gestor-staging;  PM2_NAME=gestor-staging;  PORT=3011 ;;
  *) echo "ENV inválido: $ENV (production|staging)"; exit 1 ;;
esac

LOG=/home/luis/logs/deploys.log
mkdir -p "$(dirname "$LOG")"

log() { echo "[$(date -Iseconds)] [$ENV] $*" | tee -a "$LOG"; }

# ─── Pre-flight ───────────────────────────────────────────────────────────
[ -d "$APP_DIR" ] || { log "ERROR: $APP_DIR no existe"; exit 1; }
cd "$APP_DIR"

# ─── Lock — un solo deploy por entorno a la vez ───────────────────────────
# Sin lock, dos deploys concurrentes pelean por node_modules/.next/HEAD
# y el rollback de uno mueve HEAD bajo los pies del otro.
LOCK_FILE="/tmp/tuagentx-deploy-${ENV}.lock"
exec 200>"$LOCK_FILE"
if ! flock -n 200; then
  log "ERROR: otro deploy de $ENV ya está corriendo (lock=$LOCK_FILE)"
  log "       espera a que termine o borra el lock si quedó huérfano"
  exit 10
fi
# El lock se libera automáticamente al salir el shell (incluso en error)

PREV_COMMIT=$(git rev-parse HEAD)
log "── inicio deploy ref=$REF prev=$PREV_COMMIT"

# ─── Pull ─────────────────────────────────────────────────────────────────
git fetch --tags --prune origin
git checkout "$REF"
git pull --ff-only origin "$REF" 2>/dev/null || log "no fast-forward (ref puede ser tag/commit)"

NEW_COMMIT=$(git rev-parse HEAD)
log "checkout ok  new=$NEW_COMMIT"

# Short-circuit: comparar contra el commit del BUILD actual (lib/version.ts),
# no contra el HEAD anterior — si git pull ya se hizo antes pero no se rebuildeó,
# el build sigue desactualizado.
BUILD_COMMIT=""
if [ -f lib/version.ts ]; then
  BUILD_COMMIT=$(grep -oE '"fullCommit": "[a-f0-9]+"' lib/version.ts | grep -oE '[a-f0-9]{40}' || true)
fi
if [ -n "$BUILD_COMMIT" ] && [ "$BUILD_COMMIT" = "$NEW_COMMIT" ] && [ -z "${FORCE:-}" ]; then
  log "build ya en $NEW_COMMIT — saliendo (FORCE=1 para forzar)"
  exit 0
fi

# ─── Install + Build ──────────────────────────────────────────────────────
export DEPLOY_ENV="$ENV"
export DEPLOY_BRANCH="$REF"

log "npm ci…"
npm ci --no-audit --no-fund >> "$LOG" 2>&1

log "npm run build (safe — max 2 CPUs)…"
if ! taskset -c 0,1 nice -n 15 ionice -c 3 npm run build 2>&1 | tee -a "$LOG" | tail -5; then
  log "BUILD FALLÓ — rollback a $PREV_COMMIT"
  git checkout "$PREV_COMMIT"
  exit 2
fi

# Validación final: tail del build debe incluir indicador de éxito
BUILD_OK=$(tail -100 "$LOG" | grep -cE 'prerendered as static|server-rendered on demand|Compiled successfully' || true)
if [ "$BUILD_OK" -eq 0 ]; then
  log "WARNING: build no muestra señal de éxito — abortando restart"
  git checkout "$PREV_COMMIT"
  exit 3
fi

# ─── Migraciones Prisma (solo si hay nuevas) ──────────────────────────────
if git diff --name-only "$PREV_COMMIT" "$NEW_COMMIT" | grep -q '^prisma/migrations/'; then
  log "detectadas migraciones nuevas — ejecutando prisma migrate deploy"
  npx prisma migrate deploy >> "$LOG" 2>&1
fi

# ─── Restart — siempre via ecosystem para que loadEnv() lea .env servidor ──
log "pm2 delete+start $PM2_NAME via ecosystem"
pm2 delete "$PM2_NAME" 2>/dev/null || true
pm2 start /srv/gestor/ecosystem.config.js --only "$PM2_NAME" >> "$LOG" 2>&1

# ─── Verificación post-restart ────────────────────────────────────────────
sleep 3
HTTP=$(curl -fsS -o /dev/null -w '%{http_code}' "http://localhost:$PORT/api/version" || echo "000")
if [ "$HTTP" != "200" ]; then
  log "ERROR: /api/version respondió $HTTP — revisar logs pm2"
  exit 4
fi

VER=$(curl -fsS "http://localhost:$PORT/api/version")
log "── deploy OK  $VER"
echo
echo "✅ Deploy completado: $ENV @ $REF ($NEW_COMMIT)"
echo "   Version: $VER"
