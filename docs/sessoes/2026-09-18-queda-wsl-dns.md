# 2026-09-18 — Queda geral (backend + DNS) + blindagem

## Resumo
PC servidor reiniciou sozinho às 14:29 (Windows, reboot limpo sem motivo registrado).
Todos os containers caíram juntos; `db` e `dns` só voltaram com start manual às 15:14.
Internet da empresa cai junto porque o DNS da rede passa por este PC.
Implementado: healthcheck no `dnsmasq`, watchdog `MIPs-Watchdog`, decisão de DNS no roteador.

## Timeline (BRT)
- 14:29:20 logoff → 14:29:24 shutdown limpo (6006) → 14:29:46 boot (6005) → 14:29:48 login automático
- ~14:31 backend/frontend voltam (Docker AutoStart); db/dns ficam parados
- 15:14 start manual de db + dns no painel Docker
- Backend ficou ~44 min em `Aguardando banco de dados...` e reconectou sozinho (retry OK)
- Postgres fez recovery automático, sem perda aparente (validar backup 02:30 da próxima madrugada)

## Causa raiz (evidências, não achismo)
- Windows uptime = boot 14:29; WSL boot junto → reboot do Windows, não crash do Docker/app
- Desligamento LIMPO (6006, Kernel-Power 109 "Kernel API"), SEM 1074 (nada interativo/registrado),
  SEM 41/6008 (sem queda de energia), SEM BSOD/dump, SEM atividade de Windows Update no dia
  (nada 00:00–14:30; último HotFix 10/09), SEM tarefa de reboot agendada
- Candidatos restantes: botão power (toque curto = limpo sem 1074) + religar; reboot via AnyDesk
  (instalado e rodando); programa chamando shutdown direto via API
- PENDENTE com o Marcelo: quem estava no PC/AnyDesk às 14:29? Ação do botão power?
- Achado lateral: PC tentou dormir às 06:16 via "Application API" (abortou em 7s) — timeouts já
  estão em "Nunca" (Alto desempenho), então foi pedido explícito de algum programa/ação

## Decisão DNS (roteador Intelbras W5-1200G) — Marcelo aplicando
- Teste provou: `mips.lan` via gateway (.1) = NXDOMAIN; via PC (.150) = OK. Logo o .150 TEM que
  ser o DNS primário (secundário só entra em timeout, nunca em NXDOMAIN).
- Menu > Rede > LAN: DNS1 = 192.168.0.150, DNS2 = 192.168.0.1 (gateway — internet já funciona por ele)
- Reserva IP: 192.168.0.150 ↔ MAC D8-5E-D3-28-EE-00 (hoje o servidor está em DHCP dinâmico!)
- Depois: reconectar Wi-Fi dos aparelhos; `ipconfig /all` deve listar os dois DNS
- Comportamento: PC no ar = tudo + mips.lan; PC caído = internet ok (~2-5s), só portal cai

## Mudanças aplicadas hoje
1. `docker-compose.yml`: healthcheck funcional no `dnsmasq`
   (`nslookup mips.lan 127.0.0.1`), intervalo 15s — era o único serviço sem healthcheck
2. `scripts/watchdog.ps1` + tarefa agendada `MIPs-Watchdog` (logon + a cada 5 min, PowerShell oculto,
   só com sessão aberta). Usa `compose start` nos parados — NUNCA `up -d` (ver armadilha abaixo)
3. Testado: parei o `backup` de propósito, watchdog religou sozinho sem tocar nos demais

## ARMADILHA IMPORTANTE: ping-pong /mnt/c vs C:\ (descoberto hoje na marra)
- `docker compose up -d` rodado do WSL grava binds como `/mnt/c/...`; rodado do Windows (docker.exe)
  grava como `C:\...`. Cada lado considera o outro "diferente" e RECRIA os containers com bind mount
  (db, backend, backup, dns) a cada `up`. Frontend (sem volumes) nunca é afetado.
- O watchdog com `up -d` + comandos manuais do WSL ficaram se recriando mutuamente a tarde inteira
  (cada recreate do db = recovery do Postgres + ~1 min de portal fora do ar).
- REGRA: operações `up` sempre do MESMO lado; preferir Windows (docker.exe com caminho C:\),
  que converge. O watchdog usa `start` e é imune a isso. Não voltar `up -d` no watchdog!
- Debug do dia: RestartCount 0 + StartedAt 15:14 = start manual via painel (daemon não religou db/dns
  sozinho apesar de `restart: always` — não confiar só nisso)

## A fazer
- [ ] Confirmar reserva DHCP + DNS1/DNS2 aplicados no W5-1200G
- [ ] Descobrir quem/o que reiniciou o Windows às 14:29 (perguntar + checar botão power/AnyDesk)
- [ ] Descobrir o que pediu suspensão às 06:16 (Application API)
- [ ] Conferir backup automático da próxima madrugada (banco sofreu vários restarts hoje)
