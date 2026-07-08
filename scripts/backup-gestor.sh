#!/bin/bash
set -e
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUT="/tmp/db-gestor-backup-${TIMESTAMP}.sql"
docker exec postgres pg_dump -U evolution -d evolution -n gestor -F p > "$OUT"
SIZE=$(du -sh "$OUT" | cut -f1)
echo "✅ Backup completado: $OUT ($SIZE)"
