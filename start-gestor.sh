#!/bin/bash
set -a
source /srv/gestor/.env
set +a
exec /srv/gestor/node_modules/next/dist/bin/next start --port 3010
