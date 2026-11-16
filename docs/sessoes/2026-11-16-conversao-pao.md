# 16/11/2026 — Conversão em pão (relatório PDF → faturamento em pão)

Pedido: alguns clientes são faturados só em pão; antes era feito na planilha
`G:\Meu Drive\Natan\Calculadora Hospital Santos Dumont.xlsx` (abas Sants, Unimed Jaca,
Unimed Sanja, São José, Ambev). Agora: soltar o PDF do "Relatório de Clientes" e ver o resultado.

## Regra da planilha (aba Sants)
- Cada item: quantidade × preço da tabela do cliente (os preços do PDF são ignorados).
- Total ÷ 2 → metade em Pão francês (R$ 0,79) e metade em Pão de leite (R$ 0,95), ARREDONDAR.PARA.CIMA.
- Colunas extras: tudo em francês kg (R$ 13), mini francês (0,58), mini leite (0,68).

## Decisões
- Ferramenta vanilla em `admin-tools/conversao.html` (padrão Romaneio), chave `conversao`.
- PDF lido no navegador com pdf.js (cdnjs), nada sobe ao servidor.
- Divisão por % configurável por cliente; todas as abas vieram com 50/50 — as outras abas da
  planilha usavam fórmulas diferentes (Unimed/São José: total inteiro em cada pão; Ambev: itens de
  francês viram francês e o resto vira leite). Ajustar em "Clientes e preços" se necessário.
- Nomes dos clientes como no sistema de pedidos: abas Unimed Jaca → "Unimed - Jacarei",
  Unimed Sanja → "Unimed Pronto Atendimento SJC", Ambev → "Ambev Jacareí" (reconhecidos no PDF).
  "São José" ficou sem texto de reconhecimento: no 1º PDF, escolher a tabela e clicar
  "Sempre usar … para este PDF".

- A pedido, cada cliente tem **todos os produtos de todas as abas** (48): a própria aba primeiro,
  com o preço dela; o que só existe em outra aba entra com o preço da 1ª aba onde aparece
  (ordem Sants, Unimed Jaca, Unimed Sanja, São José, Ambev). Flag `allProducts` completa dados
  salvos antigos uma única vez.

- Depois (pedido): **tabela única** de produtos e preços para todos — "são todos o mesmo preço".
  Valem os preços do Santos Dumont; São José passou a usar Presunto R$ 35 e Pão de forma integral
  R$ 16 (antes 30 e 15 na aba dela). **Ambev tem preço diferente**: exceções em "Regras dos
  clientes" → Pão francês cortado 0,70, Pão de forma integral 15, Presunto 30, Lata de milho 56.
  Cada cliente guarda só as regras (reconhecer no PDF, pães/%) e os preços próprios. Vínculos
  item do PDF → produto valem para todos. Migração automática dos dados já salvos (v1 → v2).

## Teste
Relatório (23).pdf (Santos Dumont, 08 a 14/11/2026): 10 itens lidos, quantidades iguais ao
"Produtos Totais"; 9 casados automaticamente, "Leite em caixinha Zero Lactose" fica para escolher.
Total R$ 1.806,66 → 1.144 francês + 951 leite.
