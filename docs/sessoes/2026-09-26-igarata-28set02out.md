# Sessão 2026-09-26 — Pedidos Igaratá 28/09–02/10 (CI 204/2026)

## 1. Fonte
- `D:\Usuário\Downloads\doc03851320260925173136.pdf` (5 págs escaneadas):
  pág. 1 = empenho da ata (só kg, não entra nas etiquetas);
  págs. 2–5 = desjejum + lanche da tarde por escola, seg 28/09 a sex 02/10.
- Todas as quantidades foram cruzadas qtd × gramagem = kg da última coluna
  (ex.: 500×0,05=25 kg; 70×0,05=3,5 kg na Leonina sem qtd explícita).

## 2. Lançamento (131 pedidos em `ferramentas_admin_estado`, chave `etiquetas`)
- 50 manuais (`source: manual`, formato idêntico ao da interface, com
  `route/shift: null`, `includeDateLabels: false`, `parts` pela divisão do pacote).
- 81 fixos (`source: fixo`) da base salva no banco (`settings.fixed.igarata`,
  que tem CULTURA e SECRETARIA DE ESPORTES além do padrão do código):
  seg/qua→segQua (16, 354), ter/qui→terQui (16, 354), sex→sexta (17, 464).
- Manuais por dia: seg 16 (1830 pães) + lanche Petronilha 130 / Leonina 120
  (`afternoon: true`); ter 5 (560); qua 18 (2110) + lanche 130/120;
  qui 7 (640); sex 4 (670).
- Backup prévio: `backups/etiquetas-pre-igarata-28set02out-20260926.json` (não commitar).

## 3. Decisões de mapeamento
- `MINI PÃO FRANCÊS INTEGRAL` → produto custom já existente
  `custom-igarata-1788350022901` ("Mini Pão Francês Integral", pct 50),
  mesmo usado em 14/09.
- Nomes pela convenção do banco (PDF difere): `CCPDC` (PDF: CCPCD) e
  `EMEIF LEONINA VIEIRA DE BARROS` (PDF: EMEF LEONINA).
- Terça: item "30 PÃO DE LEITE" com kg rotulado "PÃO FRANCÊS" (erro do PDF) —
  lançado como leite 30 pela gramagem 0,05.
- Nada commitado (só dado no banco + backup local).
