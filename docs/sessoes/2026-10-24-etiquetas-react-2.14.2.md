# 24/10/2026 — Etiquetas 2.14.2: migração React e organização

## Contexto
Migração da ferramenta Etiquetas de HTML vanilla (`frontend/public/admin-tools/etiquetas.html`) para componente React `EtiquetasEditor`. Ajustes de usabilidade solicitados: tipos de produto genéricos editáveis, cor por produto, data da entrega, organização em abas.

## O que foi feito

### Frontend
- `frontend/src/components/EtiquetasEditor.jsx` totalmente reescrito
  - Abas: Configurações, Novo Pedido, Pedidos, Gerar PDF
  - Entrega + data da entrega no topo
  - Produtos por entrega persistidos em `localStorage` com presets iniciais
  - Produtos editáveis inline: nome, nome curto, pacote, unidade singular/plural, cor
  - Criação de novo produto via prompt, remoção com confirmação
  - Pedidos por entrega+data, com destino, quantidade, turno/tarde quando aplicável
  - Totais por produto, remoção de pedidos
  - Geração de PDF Pimaco 6187 via jsPDF mantendo divisão em pacotes e cor por etiqueta
- `frontend/src/utils/etiqueta.js` adicionado com helpers puros: `getColorFromName`, `getUnitForProduct`, `divide`, `formatDate`, `addDays`, `getWeekday`, `generatePdfName`
- `frontend/src/pages/FerramentasAdmin.jsx` corrigido: estado `menuOculto` restaurado, renderização correta da Sidebar
- `frontend/package.json`, `backend/package.json` e `README.md` versão 2.14.2

### Backend / Perfil
Mudanças já presentes no working tree e commitadas:
- Comunicados desacoplados do perfilGestorRH, novo `perfilGestorComunicados` = administrador + rh
- Gerente sem gestão de Comunicados na pasta RH; Comunicados fica como leitura fora da pasta
- Sidebar ajustada para Gerente ver apenas Banco de Horas e Folgas na pasta RH

## Decisões
- Produtos agora são genéricos, não apenas pão. Igaratá pode ter bolo, salgados, etc.
- Cor da etiqueta é por produto e editável via color picker.
- Presets por entrega evitam resetar produtos ao trocar entrega.
- Mantido `etiquetas.html` legacy com campos `unit/color` para compatibilidade temporária.

## Testes
- Build Vite OK esperado. `npm test` no backend não tocado, mantém 26/26.
- Validação manual: criação/editar produto, adicionar pedido com data, gerar PDF.

## Pendências
- Substituir prompts por modal mais amigável.
- Sincronizar presets com backend quando houver necessidade de compartilhar config entre usuários.
- Remover `etiquetas.html` quando migração estiver validada em produção.
