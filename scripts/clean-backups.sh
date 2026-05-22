#!/bin/bash
find /srv/gestor/.edit-backups -name "*.bak" -mtime +7 -delete 2>/dev/null
echo "Backups antiguos limpiados"
