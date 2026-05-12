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

log "npm run build…"
if ! npm run build 2>&1 | tee -a "$LOG" | tail -5; then
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

# ─── Restart ──────────────────────────────────────────────────────────────
log "pm2 restart $PM2_NAME"
pm2 restart "$PM2_NAME" --update-env >> "$LOG" 2>&1

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
