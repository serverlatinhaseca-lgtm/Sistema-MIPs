# 2026-09-29 — Ajuste de fotos no editor de MIP (tamanho + posição)

## Pedido
No editor de texto da MIP, poder transformar as fotos: tamanho e posição.

## O que foi feito (só o editor de MIP tem texto rico — `CriarMIP.jsx`/Quill)
- **Painel da foto**: clicar numa foto dentro do editor abre um balão com:
  - Tamanho: Original, P (300px), M (500px), G (800px), Total (100%).
  - Posição: Esquerda (texto contorna), Centro, Direita (texto contorna).
  - Remover foto.
- O ajuste é gravado como **estilo inline + `data-tam`/`data-ali` no `<img>`**,
  então aparece igual na visualização (`DetalheMIP`) e sobrevive a salvar/editar
  (o HTML é o que vai ao banco). Sem dependência nova (módulos de resize do Quill
  são da era Quill 1 e brigam com o `quill@2.0.2` pinado).
- O painel se fecha ao clicar fora, digitar ou rolar; a foto é re-localizada pelo
  `src` a cada clique, então o ReactQuill nunca "perde" a foto ao sincronizar.
- **`index.css`**: as regras globais que forçavam toda imagem a `display:block +
  margin auto` (e `width:100%` no celular) agora **is**entam fotos com ajuste
  manual (`:not([data-ali])` / `:not([data-tam])`). Conteúdo antigo (sem esses
  atributos) renderiza exatamente como antes no desktop; no celular, fotos da MIP
  sem ajuste passam a ocupar 100% da largura (igual ao editor — antes ficavam no
  tamanho natural).

## Validação
- `npm run build` do frontend: OK (via imagem `sistema-mips-backend`, sem Node no WSL).
- Não testado com clique real (sem navegador aqui): conferir em Criar MIP → inserir
  foto → clicar nela → trocar tamanho/posição → salvar → abrir a MIP e comparar.
