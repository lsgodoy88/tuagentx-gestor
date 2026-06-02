#!/bin/bash
ACTION=$1
FILE="/srv/gestor/app/sw-update-notifier.tsx"

if [ "$ACTION" = "on" ]; then
  git show 958806b~1:app/sw-update-notifier.tsx > $FILE 2>/dev/null || \
  git show origin/main:app/sw-update-notifier.tsx > $FILE
  echo "✅ SW notificación ACTIVADO"
elif [ "$ACTION" = "off" ]; then
  cat > $FILE << 'COMPONENT'
// DESACTIVADO - reactivar cuando salga de pruebas
export default function SwUpdateNotifier() { return null }
COMPONENT
  echo "⛔ SW notificación DESACTIVADO"
else
  echo "Uso: bash sw-toggle.sh [on|off]"
fi

cd /srv/gestor && npm run build 2>&1 | tail -2 && pm2 restart gestor
