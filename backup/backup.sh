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

# Retenção: apaga dumps com mais de 30 dias (manuais e automáticos).
find /backups -maxdepth 1 -name 'mips-*.dump' -mtime +30 -delete
