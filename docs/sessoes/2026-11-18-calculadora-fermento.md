# 18/11/2026 — Calculadora de fermento (v2.16.0)

## Pedido
Padronizar quanto fermento colocar na massa do pão francês. A dose muda com a temperatura da massa, a temperatura ambiente e o tempo disponível até assar.

## Dados da padaria
- Base: **175 g de fermento seco para 50 kg de farinha** (0,35%).
- A massa sai da masseira a **19–20 °C**. Vai da máquina direto para o carrinho e cresce cerca de **8 h** até assar. Não tem estufa nem climatização.
- Usada por todos os perfis, inclusive os padeiros (Funcionário). Mostra fermento seco e fresco.

## Decisões
- A conta fica no backend (`backend/fermento.js`, testado) e a página só chama a API. Assim, celular, PC e app usam exatamente a mesma regra.
- Modelo: o fermento precisa entregar o mesmo "trabalho" da base, ou seja, dose × ∫ atividade(T(t)) dt constante.
  - A atividade dobra a cada 9 °C, ficando entre 2 e 36 °C.
  - No carrinho, a massa vai da temperatura de saída até a do ambiente em curva exponencial (τ = 1,5 h).
  - Com isso dá para calcular a dose para qualquer tempo e temperatura, e prever em quanto tempo a dose padrão fica pronta.
- Avisos:
  - fermento abaixo de 0,1% ou acima de 1,5% da farinha
  - ambiente acima de 32 °C ou abaixo de 14 °C
  - massa fora de 16–28 °C
  - tempo menor que 2 h
- Água: água = 3 × massa − farinha − ambiente − atrito (padrão 12 °C). Se precisar, troca parte da água por gelo (calor latente 80). A hidratação padrão é 60%.
- Tem uma tabela imprimível (ambiente 16–32 °C × 4–12 h) para colar na parede.

## Valores presumidos (ajustar em "Base de cálculo", só Administrador)
- Ambiente da base: **24 °C**. A padaria não informou; é o valor que mais pesa na calibração.
- τ 1,5 h, dobra a cada 9 °C, atrito 12 °C, hidratação 60%, fresco = seco × 3.

## Próximos passos possíveis
- Registrar as fornadas (dose usada × resultado) para ajustar a base com dados reais.
