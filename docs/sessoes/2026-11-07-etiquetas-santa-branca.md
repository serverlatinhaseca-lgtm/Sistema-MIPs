# 2026-11-07 — Etiquetas (impressão e cores) e Romaneio Santa Branca

## Etiquetas
- Desfeita a impressão em massa quebrada (um `\n` literal no JS travava a página) e refeita do zero:
  bloco "Imprimir vários dias"; cada dia sai em folhas próprias.
- Cabeçalho de cada folha: entrega, data, total de pães por unidade e nº de etiquetas.
- Cores por tipo de pão voltaram (desde a 2.14.2 `colorFor()` devolvia hex e a classe CSS não casava).
- Unidade da Johnson volta a ser "LANCHES"; unidades em maiúsculas (`label.pid` → `productId`).
- Johnson / margarina: cor por turno na 1ª linha (1º azul, 2º magenta, 3º roxo) + legenda.
- Santa Branca chegou a ser feita como aba das Etiquetas (04ad68e) e foi **retirada** a pedido:
  o romaneio é uma ferramenta à parte.

## Romaneio Santa Branca (`/ferramentas/romaneio`, `admin-tools/romaneio.html`)
Substitui as planilhas `Santa Branca - <dia>.xlsx` e `Santa Branca - Total Pães.xlsx`.
- **Romaneio do dia**: escolhe a data, a base daquele dia da semana entra sozinha e é editável;
  entregas avulsas. Ao editar ou imprimir, o dia fica salvo (e passa a contar no financeiro).
- **Impressão** (Carta, 2 folhas por dia): frente = "SANTA BRANCA - SEGUNDA-FEIRA 19/10/2026" com
  Horário, Setor, Endereço, Francês, Leite, Integral, ASSINATURA, totais por bloco e geral;
  verso = pacotes por tamanho (Pacote / Qtd Pct / Total Pães) + separação por cliente.
  "Imprimir a semana" sai seg–sex em sequência. A altura das linhas se ajusta (≈7 mm num dia normal);
  colunas de largura fixa; cabe até 28 clientes + 10 avulsas; aviso acima de 38 linhas.
- **Cores** (tela e impressão, tons claros): francês laranja, leite verde, integral marrom (iguais às
  Etiquetas); blocos Escolas azul, Educação roxo, Demais secretarias terracota (faixa à esquerda e total).
- **Pacotes**: máx. 20 (francês/integral) e 30 (leite), menor nº de pacotes. Conferido com 19/10:
  francês 124 em 11 pct, leite 2.423 em 92 pct (72×30, 26, 6×20…), integral 2 em 1 pct.
- **Contagem do mês**: grade dia × AF × F/L/I, total und e kg (0,05 kg/pão, editável), faturamento
  por cliente, impressão em paisagem e CSV. Conferido com a planilha Total Pães (01/10 e 19/10).
- **Clientes e bases**: 28 clientes (horário, endereço, AF) e quantidades de seg a sex; máximo do pacote.
- Backend: só entrou a chave `romaneio` em `CHAVES_FERRAMENTAS_ADMIN` (tabela já existia).

## Observações
- Na planilha "Total Pães" (aba Faturamento) o RH e a Secretaria de Saúde 2 eram somados duas vezes
  (ex.: Paço = K37 + W37, sendo que K37 já incluía W37). O sistema soma uma vez só.
- "Secrataria" (erro da planilha) virou "Secretaria". EMEIF Maria Apparecida e Sylvia Braga usam o
  endereço do romaneio (Rua Independência, 300), não o da aba CLIENTES. A coluna de números à esquerda
  do romaneio da planilha (sem título) não foi levada.
- **Uploads vazios**: `uploads_data` está vazio desde 03/11 e os `backups/uploads-*.tar.gz` desde 04/11
  têm 87 bytes (vazios); o backend avisa "5 referência(s) no banco". Não foi mexido — precisa restaurar
  de um backup antigo/Drive.
- `backend/index.js` tem alterações locais não commitadas (fallback de login por query string / sem
  Content-Type) que já estavam rodando no container; não entraram nos commits.
