#!/bin/bash
source /srv/gestor/.env
curl -s -X POST https://gestor.tuagentx.com/api/rutas/procesar-dia \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  >> /var/log/tuagentx-rutas.log 2>&1
echo "" >> /var/log/tuagentx-rutas.log
