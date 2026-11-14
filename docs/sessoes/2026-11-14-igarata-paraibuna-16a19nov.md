# Sessão 2026-11-14 — Igaratá + Paraibuna 16–19/11 e romaneio de Paraibuna

## 1. Pedidos lançados (122 em `ferramentas_admin_estado`, chave `etiquetas`)
- Backup prévio: `backups/etiquetas-pre-igarata-paraibuna-16a19nov-20261114.json` (não commitar).
- **Igaratá** (CI 264/2026, PDF `PED 34.2026.pdf`; 20/11 feriado, sem sexta):
  - 16/11: 14 manuais (Irmã Paula integral 500 + leite 400; Carlos Gomes mini leite 150;
    Eunice mini leite 30; Alpina/Harmonia/Águas integral 30 + leite 30; Petronilha integral 220;
    Leonina integral 200; Benedito integral 330; CCPDC integral 20) + 16 fixos `segQua`.
  - 17/11: 7 manuais (leite: Irmã Paula 400, Harmonia/Alpina/Águas 30, CCPDC 20; mini leite
    Carlos Gomes 150, Eunice 30) + 16 fixos `terQui`.
  - 18/11: 10 manuais (francês: Irmã Paula 600, Harmonia/Alpina/Águas 30, Petronilha 220,
    Leonina 200, Benedito 330, CCPDC 20; mini francês Carlos Gomes 150, Eunice 30) + 16 fixos `segQua`.
  - 19/11: 7 manuais (integral: Irmã Paula 400, Harmonia/Alpina/Águas 30, CCPDC 20; mini integral
    `custom-igarata-1788350022901` Carlos Gomes 150, Eunice 30) + 16 fixos `terQui`.
  - Nomes pela convenção do banco: `CCPDC` (PDF: CCPCD), `EMEIF LEONINA` (PDF: EMEF).
- **Paraibuna** (imagens "3ª semana novembro"):
  - Cidade 16/11: Creche F80, Zoé F100, Santinha F100 + L70, Instituto F160 (440/70) + CAPS fixo L10.
  - Roça 17/11: Geraldo Martins L60; Espírito Santo L25 + F25; Cedro L30 + F30; Otacília L100 + F100;
    Salto L20 (235 L / 155 F).
  - Cidade 18/11: Creche F80, Zoé L100, Santinha F100 + L100, Instituto L160 (180/360) + CAPS fixo L10.
  - ETEC e Prédio da Educação sem pedido.

## 2. Romaneio de Paraibuna no site
- Etiquetas → aba Paraibuna → botão **Imprimir romaneio** (só aparece em Paraibuna).
- Usa o dia + rota abertos (`activeOrders()`): uma linha por local, unidades por produto,
  nº de pacotes e coluna "Recebido por"; linha TOTAL; rodapé Motorista / Conferido por.
- Folha Carta comum (`.romaneio-sheet`), não usa a grade Pimaco; depois de imprimir a área
  de impressão volta para as etiquetas (`afterprint` → `renderPreviewAndPrint`).
- Página aberta antes do lançamento precisa de **F5** (salvamento é PUT do estado inteiro).
