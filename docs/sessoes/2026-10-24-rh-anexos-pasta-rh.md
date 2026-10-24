# 24/10/2026 — RH 2.14.x: anexos no desabafo, pasta RH e gestão do RH

Complemento da sessão de 23/10 (`2026-10-23-rh-tickets-desabafo.md`). Versões **2.14.0** e **2.14.1**.

## O que mudou

### Desabafo anônimo (página pública, antes do login)
- Texto do login agora é **"Não precisa logar. Sua mensagem será completamente anônima."** — sem citar RH nem Administrador. Botão do login passou para o âmbar (cor primária), que estava ilegível no violeta.
- **Campo "Setor" removido** (tabela, API e formulário). Não ficou claro o que o campo significava (setor de quem envia ou setor de destino), então foi retirado.
- **Anexo opcional** (`anexo_url`, `anexo_nome`, `anexo_tipo` na tabela `desabafos`):
  - multer em disco: `desabafo-<timestamp>-<rand>-<nome>`;
  - limite **20MB**; aceita PDF, DOCX, XLSX, imagens, vídeos, áudios, TXT/CSV;
  - o filtro NÃO aceita `application/octet-stream` por si só (antes um `.exe` passava);
  - erro do multer volta em **JSON** (antes vinha HTML 500), e o arquivo é apagado quando a mensagem é inválida.
- Mensagem continua obrigatória (mínimo 10 caracteres); o anexo é complementar.

### Lista de desabafos (RH/Administrador)
- Paleta trocada de violeta para **âmbar/neutro** (abas ativas `bg-amber-600`, card não lido com borda âmbar à esquerda, chip de anexo neutro).
- Clique no card abre **modal overlay** (fecha no X, no fundo e com Esc) com preview de imagem/vídeo/áudio e botão "Abrir" para PDF/outros.
- "Marcar como lido" continua no card e também no modal.

### Notificações
- Balão de não-lidas fica **no ícone do sino** em todos os modos (trilho, menu e topo). Removido o "(N)" do texto da linha do menu.

### Perfil RH com gestão de pessoas
- `perfilGestorRH` = `administrador`, `gerente`, **`rh`**: o RH gerencia ASO, Comunicados, Banco de Horas e Folgas (antes via esses módulos como funcionário — decisão de 23/10 superada).
- Frontend acompanha: `ehRH` em `ASO.jsx`, `BancoHoras.jsx`, `Comunicados.jsx` e `Folgas.jsx` inclui `rh`.
- RH continua **sem Receitas e sem Avaliações** (403 na API em `/api/receitas` e `/api/avaliacoes`); MIPs e Reclamações seguem só leitura.

### Barra lateral
- **Perfil RH**: Atendimento, Banco de Horas, Folgas, Comunicados, ASO e Desabafos direto no menu.
- **Administrador e Gerente**: esses itens ficam na pasta recolhível **"RH"** (estado `pastas.rh`), separados de Ferramentas/Configuração.
- **Funcionário e Líder**: continuam com os itens direto no menu ("Meu Banco de Horas", "Minhas Folgas", "Meu ASO").
- Balão de tickets agora sobrepõe o ícone de Atendimento (`IconeAtendimento`), inclusive dentro da pasta.

## Banco de dados
- `init.sql`: `desabafos` nasce com `anexo_url/anexo_nome/anexo_tipo`, recebe `ALTER ... ADD COLUMN IF NOT EXISTS` e `ALTER TABLE desabafos DROP COLUMN IF EXISTS setor`.
- Migração aplicada manualmente no banco de produção (`portal_mips_db`): colunas criadas e `setor` removida.

## 2.14.1 — Gerente com só 3 itens de RH (mesmo dia, a pedido do mantenedor)

- **Menu**: na pasta **RH**, o Gerente vê apenas **Folgas, Comunicados e Banco de Horas**. ASO, Atendimento e Desabafos saem do menu dele (Administrador mantém os 6).
- **API** (novos helpers em `backend/index.js`):
  - `perfilGestorASO` = `administrador` + `rh` → usada em ASO, agendamentos e locais de exame. Gerente recebe **403** em `/api/asos/resumo`, POST/PUT/DELETE e agendamentos; `GET /api/asos` e `/api/asos/meu` continuam mostrando só o registro dele.
  - `ehGestorAtendimento` = `administrador` + `rh` → usada nas rotas de tickets. Gerente perde a fila (`PATCH /api/tickets/:id` → 403, resumo retorna zeros) mas segue abrindo e respondendo os **próprios** tickets.
  - `perfilGestorRH` continua com `gerente` (Folgas, Comunicados, Banco de Horas) e `ehRH` segue valendo para reclamações/folgas/escalas.
- **Frontend**: `ASO.jsx` e `Atendimento.jsx` passam a tratar `ehRH` como `administrador`/`rh` (Gerente cai na visão de funcionário); `Sidebar.jsx` esconde Atendimento/ASO do Gerente no trilho e na pasta, e o polling do badge só roda para Administrador/RH.
- **Validado com token de Gerente**: Folgas/Comunicados/Banco de Horas 200/201; ASO resumo/criar 403; agendamento 403; `PATCH /tickets/:id` 403; `tickets/resumo` zeros; desabafos 403; Receitas/Reclamações 200. Admin e RH seguem com ASO e tickets 200.
- Versão **2.14.1** em `backend/package.json`, `frontend/package.json` e badge do README.

## Validação (24/10)
- `npm test`: **26/26**.
- Build Vite OK; `docker compose up -d --build` aplicado; `/api/health` → `{"ok":true}`.
- Com token de RH: desabafo público 201 (com TXT) e 400 para `.exe`/`.rar`; `/api/desabafos` 200 para RH/Administrador e **403 para Leitor**; ASO 201, Comunicado 201, lote de Banco de Horas 201, Folgas/Tickets 200; `/api/receitas` e `/api/avaliacoes` **403**.
- Dados de teste (desabafos, notificações `desabafo:%`, ASO, comunicado, lote e arquivos em `uploads/`) removidos.

## Pendências
- `CarolinaRH` precisa sair e entrar de novo para carregar o perfil atualizado.
- Decidir se as notificações antigas não lidas do Administrador devem ser apagadas.
