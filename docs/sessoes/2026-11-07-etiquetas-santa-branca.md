# 2026-11-07 — Etiquetas: impressão, cores e aba Santa Branca

## Feito
- Desfeita a impressão em massa quebrada (um `\n` literal no JS travava a página) e refeita do zero:
  bloco "Imprimir vários dias"; cada dia sai em folhas próprias.
- Cabeçalho de cada folha de etiquetas: entrega, data, total de pães por unidade e nº de etiquetas.
- Cores por tipo de pão voltaram (desde a 2.14.2 `colorFor()` devolvia hex e a classe CSS não casava).
- Unidade da Johnson volta a ser "LANCHES"; unidades em maiúsculas (`label.pid` → `productId`).
- Johnson / margarina: cor por turno na 1ª linha (1º azul, 2º magenta, 3º roxo) + legenda.
- **Aba Santa Branca** (substitui as planilhas `Santa Branca - <dia>.xlsx` e `Santa Branca - Total Pães.xlsx`):
  - 28 clientes com nº, horário, endereço e AF; base de segunda a sexta (Configurações → Santa Branca).
  - Pacotes: máx. 20 (francês/integral) e 30 (leite), menor nº de pacotes — conferido com a planilha de
    19/10: francês 124 em 11 pct, leite 2.423 em 92 pct, integral 2 em 1 pct.
  - "Imprimir romaneio (frente e verso)": frente = romaneio de entrega com assinatura e subtotais por bloco;
    verso = pacotes por tamanho + separação por cliente. Sempre 2 páginas por dia (também na impressão em massa).
  - Financeiro → Santa Branca: grade do mês (dia × AF × F/L/I), total und e kg, faturamento por cliente,
    impressão em paisagem e CSV.

## Observações
- Na planilha "Total Pães" (aba Faturamento) o RH e a Secretaria de Saúde 2 eram somados duas vezes
  (ex.: Paço = K37 + W37, sendo que K37 já incluía W37). O sistema soma uma vez só.
- Nomes com erro de digitação na planilha ("Secrataria") foram corrigidos para "Secretaria".
- EMEIF Maria Apparecida e Sylvia Braga usam o endereço do romaneio (Rua Independência, 300), não o da aba CLIENTES.
