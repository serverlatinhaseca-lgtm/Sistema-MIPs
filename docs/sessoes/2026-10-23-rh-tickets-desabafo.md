# RH — aparência, tickets e desabafo anônimo (23/10/2026)

## Pedido
1. Dashboard do RH **igual ao do Administrador** (o anterior ficou com aparência errada).
2. Barra lateral sem a pasta RH (itens direto no menu).
3. Balão no botão de ticket com a quantidade de tickets para responder.
4. Tickets com **Atendendo / Pendente / Concluído**; concluídos vão para um
   **Histórico com filtros de pesquisa**.
5. **Anexo na abertura** do ticket.
6. **ASO, Comunicados e Banco de Horas** como funcionário para o perfil RH
   (não como gestão).
7. **Desabafo anônimo** acessível na tela de login, antes do login, chegando
   para o **RH e o Administrador**.

## Decisões
- Status de ticket enxugados para 3. Migração no boot:
  `Aberto|Em andamento → Atendendo`, `Aguardando funcionário → Pendente`,
  `Resolvido|Fechado → Concluído`.
- Mensagem do funcionário devolve o ticket para `Atendendo` (fila do RH);
  resposta do RH deixa `Pendente`; resposta do RH em ticket `Concluído`
  reabre como `Atendendo`.
- Badge do Atendimento = tickets com status `Atendendo`.
- Anexo da abertura gravado como primeira mensagem (`ticket_mensagens`),
  sem alterar o schema.
- Anexo do chat (50MB) passou a ser aceito também no `POST /api/tickets`.
- Backend separa dois escopos:
  - `ehRH`: `rh`, `gerente`, `administrador` → Folgas, Atendimento,
    Reclamações (leitura), notificações.
  - `perfilGestorRH`: `administrador`, `gerente` → gestão de ASO, Comunicados
    e Banco de Horas. O perfil `rh` cai no fluxo de funcionário (vê o próprio
    ASO/banco de horas e lê os comunicados).
- Desabafo é público (`POST /api/desabafos` sem token), sem vínculo com
  usuário, limite de 5 envios por 10 min por IP. Lista em `/api/desabafos`
  para `rh` e `administrador`, com marcação de lido.
- Versão 2.13.0.

## Implementação
- `backend/tickets.js` + `tickets.test.js`: novos status,
  `statusAposMensagem()` e `ticketEncerrado()`.
- `backend/index.js`:
  - `perfilGestorRH` aplicado em 29 pontos (locais de exame, ASO,
    comunicados, banco de horas).
  - `/api/tickets` com `situacao=ativos|historico`, `de`, `ate`, `busca` e
    categoria; SLA ignora `Concluído`.
  - Novos endpoints: `GET /api/tickets/resumo`, `GET /api/rh/dashboard`,
    `POST /api/desabafos`, `GET /api/desabafos`,
    `PATCH /api/desabafos/:id/lido`.
  - `PATCH /api/tickets/:id`: `Concluído` grava `fechado_em`, os demais
    limpam; notificação de conclusão.
- `backend/init.sql` + `inicializarFase2()`: default `Atendendo`, migração dos
  status antigos e tabela `desabafos`.
- Frontend:
  - `Dashboard.jsx`: painel do RH no mesmo desenho do Administrador
    (cabeçalho, faixa, 4 cartões e pizza de reclamações).
  - `Sidebar.jsx`: pasta RH achatada, item Desabafos, badge de tickets
    (polling de 60s em `/api/tickets/resumo`).
  - `Atendimento.jsx`: abas Em atendimento/Histórico, filtros de status,
    categoria e datas, Concluir/Reabrir, anexo na abertura, bloqueio de
    mensagem em ticket concluído.
  - `Desabafo.jsx` (pública) e `Desabafos.jsx` (RH/Administrador).
  - `Login.jsx`: botão "Desabafo anônimo".
  - `Notificacoes.jsx` / `NotificationBell.jsx`: tipo `desabafo`.

## Verificação
- `npm test`: 26/26 (inclui as transições de status).
- Build do frontend OK; `docker compose up -d --build` aplicado.
- `/api/health` → `{"ok":true}`; uploads com 47 arquivos.
- Migração conferida: 2 tickets em `Atendendo`, nenhum status antigo.
- API com token de RH:
  - 200 em `/api/desabafos`, `/api/rh/dashboard`, `/api/asos/meu`,
    `/api/folgas/solicitacoes`, `/api/tickets`.
  - 403 em `POST /api/asos`, `POST /api/comunicados`,
    `POST /api/banco-horas/lotes`.
  - Leitor em `/api/desabafos` → 403.
- `POST /api/desabafos` sem token → 201; desabafo de teste e notificações
  removidos depois da validação.
