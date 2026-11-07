# 2026-11-07 — Fotos (uploads) restauradas

## Sintoma
Log do backend: `📁 uploads: 0 arquivo(s) visível(is) no container, 5 referência(s) no banco`.
Os `backups/uploads-*.tar.gz` de 04/11, 05/11 e 07/11 (10:36) tinham 87 bytes (tar vazio).

## Causa
- Os volumes `sistema-mips_pgdata` e `sistema-mips_uploads_data` têm a **mesma data de criação**:
  03/11/2026 16:12 (19:12Z) → foram removidos e recriados juntos (`docker compose down -v` ou remoção
  manual dos volumes).
- Às 16:26 o banco foi restaurado (`mips-20261103-1926xx-antes-restauracao.dump`, 127 KB = banco
  recém-criado, gerado pela própria restauração), **mas as fotos não**.
- Os backups diários continuaram rodando e passaram a compactar o volume vazio.
- O banco não perdeu conteúdo de fotos: o dump de 03/11 15:27 (antes do incidente) e o atual
  referenciam as mesmas 7 URLs `/uploads/...` (contagem via `pg_dump --data-only | grep /uploads/`;
  o diagnóstico do boot só olha `configuracoes_portal`, por isso mostra 5).

## Feito
1. Último backup bom: `backups/uploads-20261103-152717.tar.gz` (48 arquivos, 60,9 MB) — contém as
   7 fotos referenciadas (os outros 41 são arquivos antigos sem referência).
2. Extraído no volume vazio (`tar -xzf ... -C /u`, com checagem de volume vazio antes) e
   `docker compose restart backend` → log `📁 uploads: 48 arquivo(s) visível(is)`.
3. As 7 URLs referenciadas respondem 200 via `http://localhost/uploads/...` (logos, banner,
   PDF de ASO, foto de desabafo).
4. Backup manual: `docker exec portal_mips_backup /usr/local/bin/backup.sh` →
   `mips-20261107-123927.dump` (6,6 MB) + `uploads-20261107-123927.tar.gz` (58,1 MB, não vazio).

## Sem backup em 06/11
O Windows foi desligado em 05/11 04:53 (evento 1074, pelo SISTEMA — provável reinício de atualização)
e o Docker só voltou em 07/11 10:36, quando o catch-up do boot gerou o backup do dia. Às 02:30 de
06/11 não havia container rodando.

## Rotina conferida
- Container `backup`: `crond` ativo, `30 2 * * * /usr/local/bin/backup.sh` (banco + fotos, retenção 30 dias),
  com catch-up no boot se o PC estava desligado às 02:30.
- Tarefa do Windows `MIPs-Espelho-Drive`: Ready, última execução 07/11 03:00 (resultado 0), próxima
  08/11 03:00, destino `G:\Meu Drive\Natan\Backup Sistema`.

## Para não repetir
NUNCA `docker compose down -v` (já no AGENTS.md). Depois de qualquer restauração do banco, restaurar
também o `uploads-*.tar.gz` do mesmo horário e conferir o log `📁 uploads: N arquivo(s)` (N > 0).
