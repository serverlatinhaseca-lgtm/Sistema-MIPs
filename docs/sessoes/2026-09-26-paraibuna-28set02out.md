# Sessão 2026-09-26 (cont.) — Paraibuna 28/09–02/10 + Igaratá não apareceu

## 1. Igaratá "não apareceu nas etiquetas para imprimir"
- Causa provável: a tela carrega os pedidos do banco **ao abrir a página**
  (`carregarEtiquetasDoBanco`); os 131 pedidos foram inseridos com a página
  já aberta, então é preciso **recarregar (F5)**.
- Depois: aba Igaratá → **Data da entrega** = 28/09 (etc.).
  A lista filtra por entrega + data (`activeOrders`), sem data não mostra nada.
- Pedidos confirmados no banco (16+16 seg, 5+16 ter, 18+16 qua, 7+16 qui, 4+17 sex).

## 2. Paraibuna (29 pedidos, backup `backups/etiquetas-pre-paraibuna-29set02out-20260926.json`)
- Roça 29/09 (`route: roca`, sem fixos): Geraldo Martins L150;
  Espírito Santo L30+F30; Bairro do Cedro L60+F60; Otacília L120+F120;
  Bairro do Salto L20+F10 → totais 380 leite / 220 francês = imagem.
- Cidade (`route: cidade` + fixos CAPS 10 / MOTORISTAS 30):
  28/09: Creche F80, Zoé L130, Santinha F100+L100, Instituto F160 (340/230);
  30/09: Creche F80, Zoé F150, Santinha F100+L100, Instituto L160 (330/260);
  02/10: Creche F80, Zoé F150, Santinha F100, Instituto L160 (330/160).
- Prédio da Educação sem pedido nos 3 dias (linha vazia na imagem).
- Nada commitado (só dado no banco + backup local).
