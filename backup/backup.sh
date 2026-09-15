#!/bin/sh
# backup.sh — dump diário do PostgreSQL no padrão aceito pela interface
# (mips-AAAAMMDD-HHMMSS.dump), com retenção de 30 dias.
set -eu

DATA=$(date +%Y%m%d-%H%M%S)
ARQ="/backups/mips-${DATA}.dump"

export PGPASSWORD="${PGPASSWORD:?PGPASSWORD não definido}"
pg_dump -h "${PGHOST:-db}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-mips_db}" \
  -Fc --no-owner --no-privileges -f "$ARQ"

echo "$(date -Is) backup OK: $ARQ ($(du -h "$ARQ" | cut -f1))"

# Retenção local: apaga dumps com mais de 30 dias (manuais e automáticos).
find /backups -maxdepth 1 -name 'mips-*.dump' -mtime +30 -delete

# Espelho no Google Drive (config montada em /etc/rclone/rclone.conf).
if [ -f "$RCLONE_CONFIG" ]; then
  rclone copy /backups gdrive:MIPs-backups --include 'mips-*.dump' --log-level NOTICE \
    && echo "$(date -Is) drive OK: espelho atualizado" \
    && rclone delete gdrive:MIPs-backups --min-age 90d --log-level NOTICE \
    && echo "$(date -Is) drive OK: retenção remota (90 dias) aplicada"
else
  echo "$(date -Is) drive PULADO: $RCLONE_CONFIG ausente"
fi
