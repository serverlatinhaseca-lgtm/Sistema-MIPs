# Sessão 2026-09-26 — Base margarina Johnson: volta do CMP-MANSERV

## 1. Pedido
- Atualizar a base dos pães com margarina da Johnson pela foto da planilha
  (`WhatsApp Image 2026-09-26 at 08.03.12.jpeg` = pág. 1 da aba `Pão J&J`
  de `Planilha de pães da Johnson atualização 24-09.xlsx`), conferindo as quantidades.

## 2. Conferência (aba Pão J&J × base atual de 16/09)
- 2º turno idêntico (533 com / 27 sem) e 3º turno idêntico (259 com / 10 sem).
- 1º turno idêntico, exceto **1 linha nova amarela**: `CMP Manserv` 30 c/ marg.
- Totais novos: 1º = 793 (769 com + 24 sem), 2º = 560, 3º = 269;
  geral 1622 (1561 com + 61 sem) — bate com a linha de totais da planilha
  (769/24, 533/27, 259/10).

## 3. Alterações
- `frontend/public/admin-tools/etiquetas.html`:
  - `MARGARINE_BASE_ROWS`: + `["1º TURNO","CMP - MANSERV",30,"com"]`;
    comentário atualizado (fonte 24/09/2026 + foto 26/09, totais 793/560/269).
  - `JOHNSON_SECTORS`: + `"CMP - MANSERV"` (volta ao dropdown; `WWGF` mantido).
- Banco `ferramentas_admin_estado` (chave `etiquetas`, caminho
  `settings.fixed.margarina."1º TURNO"`): item CMP adicionado via SQL
  (idempotente, com `NOT ... @>). Backup prévio em
  `backups/etiquetas-pre-cmp-manserv-20260926.json` (não commitar).
- Frontend rebuildado (`docker compose up -d --build frontend`) e validado:
  portal 200, `etiquetas.html` no ar contém `CMP - MANSERV`;
  totais no banco: 1º 769/24, 2º 533/27, 3º 259/10.

## 4. Notas
- Backend não tem regra Johnson/margarina (só `etiquetas.html` + estado no banco).
- Versões não alteradas (mudança só de base, como em 16/09).
- `git status` mostra muito trabalho não commitado de outras frentes
  (ASO, fotos, etc.) — nada foi commitado aqui; este doc segue untracked
  como os últimos (`2026-09-17-backup.md`, `2026-09-24-fotos-uploads.md`).
