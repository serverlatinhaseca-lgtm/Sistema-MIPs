#!/bin/sh
# docker-entrypoint.sh — catch-up do backup no boot.
# Se o PC estava desligado às 02:30 (sem dump de hoje), gera o dump agora;
# caso contrário, não faz nada. Depois assume o cron diário.
set -eu

HOJE=$(date +%Y%m%d)
if ls /backups/mips-${HOJE}-*.dump >/dev/null 2>&1; then
  echo "$(date -Is) boot: dump de hoje já existe — catch-up dispensado"
else
  echo "$(date -Is) boot: sem dump de hoje (PC provavelmente desligado às 02:30) — gerando catch-up..."
  if /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1; then
    echo "$(date -Is) boot: catch-up OK"
  else
    echo "$(date -Is) boot: AVISO: catch-up falhou (ver /var/log/backup.log); o cron das 02:30 continua valendo"
  fi
fi

exec crond -f -l 2
