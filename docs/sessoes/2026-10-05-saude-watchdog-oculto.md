# 2026-10-05 — Saúde geral + fim do flash do PowerShell (watchdog)

## Saúde (verificado 05/10 ~08:45)
- Containers: `db`, `backend`, `frontend`, `dnsmasq` = **healthy**, up 4 dias; `backup` rodando.
- API: `curl localhost:7001/api/health` → `{"ok":true}`.
- Uploads no volume: **43 arquivos** (esperado 43+) — OK.
- Banco: 14 MB, `pg_isready`/healthcheck OK.
- Backup automático (container, 02:30): dumps `mips-*.dump` (~1,8 MB) + `uploads-*.tar.gz`
  (~56 MB) gerados **todos os dias 30/09→05/10** — OK. Retenção 30 dias ativa.
- Espelho Drive (`MIPs-Espelho-Drive`, 03:00): última execução hoje 03:00, resultado 0,
  `robocopy exit 1` (arquivos copiados = sucesso), `OK fim` — OK.
- Removido `backups/mips-20260930-001619.dump` (0 bytes, resto do incidente de 29/09).

## Flash do PowerShell (watchdog a cada 5 min) — CORRIGIDO
- Causa: `powershell.exe` é app de console; mesmo com `-WindowStyle Hidden`, o Agendador
  em modo interativo aloca uma janela que pisca a cada execução (PT5M confirmado no trigger).
- Fix: novo `scripts/run-hidden.vbs` — a tarefa chama `wscript.exe` nele, que roda o `.ps1`
  com `Run(..., 0, True)` (zero janela). Testado via `schtasks /RUN`: LastTaskResult 0,
  containers intactos. Observe nas próximas horas que o flash sumiu.
- `MIPs-Espelho-Drive` (03:00) NÃO foi alterada: a tarefa é de dono admin (Marcelo só tem
  leitura) e precisa de 1 clique no UAC. Quando quiser: duplo-clique em
  `scripts/fix-espelho-oculto.bat` → confirma o UAC → pronto. Pisca 1x/dia às 3h, baixa prioridade.

## Atenções (não urgentes)
- Disco C: em **93% (9,1 GB livres)** — se apertar, rode `docker builder prune` (13 GB
  de cache de build recuperáveis, não apaga containers/volumes).
- Watchdog marcava LastTaskResult 1 antes da troca (sem impacto funcional — containers
  religavam); com o launcher, passou a 0.
