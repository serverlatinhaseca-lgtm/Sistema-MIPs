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

# Correção definitiva 29/09/2026 (3ª queda das fotos): uploads agora vivem no
# volume nomeado uploads_data (montado aqui em /uploads:ro), não mais no bind
# ./backend/uploads. Gera tar.gz ao lado do dump para o espelho do Drive levar.
if [ -d /uploads ]; then
  TAR="/backups/uploads-${DATA}.tar.gz"
  if tar -czf "$TAR" -C /uploads .; then
    echo "$(date -Is) uploads OK: $TAR ($(du -h "$TAR" | cut -f1))"
  else
    echo "$(date -Is) AVISO: falha ao compactar uploads (dump do banco OK)"
  fi
fi

# Retenção local: apaga dumps e tars de uploads com mais de 30 dias.
find /backups -maxdepth 1 -name 'mips-*.dump' -mtime +30 -delete
find /backups -maxdepth 1 -name 'uploads-*.tar.gz' -mtime +30 -delete

# Espelho no Google Drive: feito no Windows pela tarefa agendada
# 'MIPs-Espelho-Drive' (backup/espelhar-drive.ps1, 03:00) — nada aqui.
