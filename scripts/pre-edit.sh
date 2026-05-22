#!/bin/bash
# Backup automático antes de editar archivos críticos
# Uso: bash pre-edit.sh /ruta/archivo.tsx

FILE="$1"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Uso: pre-edit.sh /ruta/archivo"
  exit 1
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/srv/gestor/.edit-backups"
mkdir -p "$BACKUP_DIR"

FILENAME=$(basename "$FILE")
BACKUP="$BACKUP_DIR/${FILENAME}.${TIMESTAMP}.bak"
cp "$FILE" "$BACKUP"

echo "✅ Backup: $BACKUP"
echo "   Restaurar: cp '$BACKUP' '$FILE'"
