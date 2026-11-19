# Sessão 2026-11-19 — Agente de etiquetas para o OpenCode

## Objetivo
Passar o cadastro de etiquetas a partir de PDF (Igaratá) e .xls (Paraibuna) para um agente
no OpenCode com `opencode/deepseek-v4.1-flash-free`, sem depender do modelo acertar o formato do banco.

## O que foi feito
- `scripts/etiquetas/extrair.py` + `extrair.ps1`: PDF → linhas de tabela (texto lido por célula,
  porque `find_tables().extract()` embaralha "0,05" → "005 ,"); .xls/.xlsx com cor de fundo
  (`[fundo AMARELO]`, a planilha rural usa "amarelo = pão de leite"). Página sem texto = escaneada.
  Instalado `xlrd` no WSL (`pip3 install --user --break-system-packages xlrd`).
- `scripts/etiquetas/lancar.js` + `lancar.ps1`: roda no container `portal_mips_backend`; lê JSON
  simples (`entrega`, `rota`, `data`, `local`, `produto`, `quantidade`, `tarde`), casa local com o
  cadastro (apelidos CCPCD→CCPDC, EMEF LEONINA→EMEIF…; casamento por palavras), produto por id ou
  nome, divide pacotes, põe base fixa do banco (Igaratá segQua/terQui/sexta, Paraibuna cidade CAPS),
  bloqueia duplicado e avisa dia que já tem pedido. Sem `-Aplicar` é só prévia; com `-Aplicar`
  faz backup e grava em transação (`SELECT … FOR UPDATE`).
- `.opencode/agents/etiquetas.md`: agente primário com o passo a passo e as pegadinhas dos arquivos;
  permissão de bash libera extrair/prévia e pede confirmação em `-Aplicar`.

## Teste (prévia, nada gravado)
Arquivos `PED 35.2026.pdf` (CI 269/2026) + planilhas 4ª semana nov CIDADE/RURAL →
`backups/pedidos-igarata-paraibuna-23a27nov.json`: 162 pedidos (78 manuais + 84 fixos).
Totais da Paraibuna batem com a linha TOTAL. No PDF, quarta vem datada "24.11" (é 25/11) e
Benedito "24.1". A pág. 1 (empenho em kg) não fecha com a soma dos dias (francês/integral/leite) —
é só empenho, não entra nas etiquetas.
