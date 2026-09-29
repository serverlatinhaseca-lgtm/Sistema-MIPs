# 2026-09-29 — Fotos sumiram de novo (3ª vez) → correção DEFINITIVA com volume nomeado

## Sintoma
Imagens da personalização quebradas de novo (404). Host `backend/uploads/`: 43 arquivos
intactos; container `/app/uploads`: 0 arquivos. Mesmo desync de bind das 2 quedas
anteriores (ver `2026-09-24-fotos-uploads.md`). `restart backend` religou na hora.

## Por que as mitigações anteriores não bastaram
Em 24/09 blindamos com diagnóstico no boot + watchdog com auto-restart + check
pós-deploy. Isso detectava e curava, mas a causa (bind mount 9p WSL/Windows
`./backend/uploads:/app/uploads`, que o Docker dessincroniza no recreate/reboot)
continuava lá — era questão de tempo até cair de novo. E caiu hoje.

## Correção definitiva (desta vez na causa)
- **`docker-compose.yml`**: backend usa `uploads_data:/app/uploads` (volume nomeado,
  disco da VM Linux — sem 9p, sem desync, sobrevive a recreate/restart/reboot).
  `backend/uploads/` no host vira legado (semente da migração, não é mais montado).
- **`backup/backup.sh`**: gera `backups/uploads-AAAAmmdd-HHMMSS.tar.gz` do volume
  (montado `:ro` no container de backup) ao lado do dump, retenção 30 dias.
  Verificado hoje: tar de 56 MB com os 43 arquivos.
- **`backup/espelhar-drive.ps1`**: passa a espelhar `mips-*.dump` + `uploads-*.tar.gz`
  para `Drive\backups`; `backend\uploads` vira espelho legado best-effort.
- **`scripts/watchdog.ps1`**: sem auto-restart e sem `Test-Path` no host (não faz
  mais sentido com volume); só registra 404 para investigação.
- **`backend/index.js` / `.dockerignore` / `AGENTS.md`**: mensagens e docs
  atualizadas para o volume (restaurar do tar do Drive, nunca `down -v` sem backup).

## Migração executada hoje
`up -d --build backend backup` → volume `sistema-mips_uploads_data` criado vazio →
`docker cp backend/uploads/. portal_mips_backend:/app/uploads/` (43 arquivos) →
`restart backend` de prova: **43 após restart** (com bind ia a 0) + HTTP 200 nas 5
URLs referenciadas, direto (`:7001`) e via nginx (`:80`). Testes: 18/18 OK.

## Riscos assumidos / próximos passos
- Volume some com `docker compose down -v` (junto com o banco) — AGENTS.md avisa.
  Rede de segurança: tar diário no Drive (`Drive\backups\uploads-*.tar.gz`).
- Conferir no Windows: tarefa `MIPs-Espelho-Drive` de amanhã 03:00 deve levar o
  `uploads-20260929-*.tar.gz` para o Drive. Verificar `G:\Meu Drive\Natan\Backup Sistema\backups`.
- Apagado o tar vazio de boot (`uploads-20260929-102536.tar.gz`, 87 bytes, gerado
  pelo catch-up antes da migração) para não confundir.
