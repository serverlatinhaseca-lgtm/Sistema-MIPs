# 2026-11-21 — "Erro de DNS" intermitente ao abrir mips.lan

## Sintoma
Às vezes o navegador mostra erro de DNS em `http://mips.lan`; recarregando, abre.

## Diagnóstico
- Containers todos healthy; `portal_mips_dns` up 4 dias, RestartCount 0.
- Teste do servidor contra 192.168.0.150: 200/200 consultas a `mips.lan` OK, 40/40 externas OK.
  Carga baixa (~90 consultas/min). O dnsmasq NÃO está falhando.
- O DHCP do roteador entrega **dois DNS**: `192.168.0.150 192.168.0.1`
  (registro `DhcpNameServer` da placa Ethernet do servidor).
- `Resolve-DnsName mips.lan -Server 192.168.0.1` → **"O nome DNS não existe" (NXDOMAIN)**.
- Celulares (Android), Chrome e Windows não usam o DNS2 só quando o DNS1 cai: alternam/consultam
  em paralelo. Quando a pergunta vai para o roteador, a resposta é "não existe" e o navegador
  mostra o erro; no reload a pergunta vai para o .150 e funciona.
  A premissa da sessão 2026-09-18 ("secundário só entra em timeout") não vale na prática.

## Correção
1. **Roteador (manual, Marcelo)** — Intelbras W5-1200G, Rede > LAN (DHCP):
   DNS1 = 192.168.0.150, DNS2 = 192.168.0.150 (ou vazio). Depois reconectar o Wi-Fi dos
   aparelhos (ou `ipconfig /renew`). Efeito colateral aceito: com o PC servidor desligado,
   a rede fica sem DNS (sem internet) até ele voltar — watchdog + `restart: always` cobrem.
2. **`frontend/dnsmasq.conf`**: cache 100 → 1000, `dns-forward-max=500`, `domain-needed`,
   `bogus-priv`, e **log de consultas desligado** (o arquivo dentro do container tinha 166 MB
   em 5 dias, sem rotação, com o C: perto de cheio). Log truncado e container reiniciado;
   testado 100/100 OK, healthy.
