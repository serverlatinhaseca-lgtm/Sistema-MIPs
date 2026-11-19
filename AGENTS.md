# Sistema Central · Nova Esperança — AGENTS.md

Portal interno (MIPs, receitas, avaliações, reclamações, etiquetas, financeiro, backup).
Stack: React 18 + Vite 8 + Tailwind 3 + React Router 7 | Node.js 22 + Express 5 | PostgreSQL 15 | Docker Compose.

## Estrutura

- `backend/` — API Express (`index.js` gordo + regras puras em `avaliacoes.js`, `aso.js`, `folgas.js`, `tickets.js`, cada um com `*.test.js`). Seeds: `modelos-avaliacao.json`, `clientes-iniciais.json`. Schema/migrações: só `init.sql`, aplicado pelo backend no boot — não crie sistema de migration.
- `frontend/src/` — app React (`App.jsx` rotas, `api.js`, `pages/`, `components/`). `api.js` usa base relativa em HTTPS (proxy Nginx) e `hostname:7001` direto em HTTP — use-o, não `axios` direto.
- `frontend/public/admin-tools/etiquetas.html` + `caixas.html` + `romaneio.html` + `conversao.html` + `gerdau.html` — ferramentas administrativas em JS vanilla (iframe via `FerramentasAdmin.jsx`, estado em `/api/ferramentas-admin/:chave`); edite os HTMLs direto, não existe componente React equivalente.
- `frontend/` — build Vite servido via Nginx (`nginx.conf`: `/api/` e `/uploads/` proxiam para `backend:7001`, resto é SPA fallback). Sem HTTPS por decisão — `mips.lan` resolve via `dnsmasq`.
- `docker-compose.yml` — serviços `db`, `backend` (`7001`+`7002`), `frontend` (`80`), `dnsmasq`, `backup`. Health: `curl http://localhost:7001/api/health` → `{"ok":true}`.
- `backup/` — `backup.sh` gera `mips-*.dump` + `uploads-*.tar.gz` em `./backups` (cron 02:30, retenção 30 dias); espelho no Windows via tarefa `MIPs-Espelho-Drive` (`espelhar-drive.ps1`, 03:00). Sem rclone.
- `android/` — WebView para `http://mips.lan`; único CI é `.github/workflows/build-apk.yml`. Sem lint/typecheck.
- Nunca commitar: `.env`, `*.dump`, `backups/`, `backend/uploads/*`, `frontend/certs/*.pem` (cobertos pelo `.gitignore` raiz).

## Comandos (nesta ordem)

```bash
cp .env.example .env  # só na 1ª vez; depois edite (POSTGRES_*, JWT_SECRET via `openssl rand -hex 32`, ADMIN_INITIAL_PASSWORD)
docker compose up -d --build
docker compose ps
curl http://localhost:7001/api/health  # esperado: {"ok":true}
```

```bash
cd backend && npm test        # node --test: aso + avaliacoes + folgas + tickets
cd frontend && npm ci && npm run build
docker compose logs --tail=100 backend|frontend|db
docker compose restart
```

Atualização segura em produção:

```bash
git pull --ff-only origin main
docker compose up -d --build
docker exec portal_mips_backend ls /app/uploads | wc -l  # esperado: 40+; se 0, restaurar backups/uploads-*.tar.gz para /app/uploads
docker compose logs --tail=5 backend  # esperado: "📁 uploads: N arquivo(s) visível(is)"
```

NUNCA `docker compose down -v` em produção — apaga `pgdata` (banco) e `uploads_data` (fotos).
Autorização permanente do mantenedor (17/09/2026): pode rodar `up -d --build`, `ps`, `logs`, `restart` sem pedir — só avise depois.

## Convenções

- Backend: CommonJS (`require`), `zod`, JWT + `bcryptjs`, `multer` 10 MB. Boot exige `JWT_SECRET` e `ADMIN_INITIAL_PASSWORD` no env; `ADMIN_INITIAL_PASSWORD` só cria o admin inicial, não redefine senha existente.
- Regras de negócio puras/testáveis ficam nos módulos laterais (`aso.js`, `folgas.js`, `tickets.js`, `avaliacoes.js`) — edite a regra lá, não no `index.js`; rode `npm test` após mudar.
- Quill via `react-quill-new` com pin `quill@2.0.2` em `overrides` — não atualizar sem `npm run build`.
- Etiquetas: impressão Pimaco 6187; regras de turnos/validades e clientes (Johnson, Igaratá, Paraibuna, genéricas) espalhadas entre `backend/index.js` e `admin-tools/etiquetas.html` — ao mudar regra, verifique os dois lados e o Financeiro.
- Etiquetas → Financeiro, consulta (19/11/2026): período por **Dias escolhidos** (padrão; botões com os dias do mês, vários e não seguidos, `state.financeDays`, chave do saldo `dias_AAAA-MM-DD,...`) / Mês inteiro / De–até (`financePeriod()`, filtro por `o.date` ISO). Sem modo "semana" (o período da AF varia — pedido do mantenedor). Mostra tipos de produto por dia + total, **só os produtos fornecidos** (na tabela da AF também entram os que têm saldo digitado). Só **Igaratá**: tabela "Saldo da AF × fornecido" da planilha "Calculadora IGARATA.xlsx" — fornecido em kg (und × kg/und; padrão 0,05 pão, 0,03 mini, 0 = conferir em und), diferença = saldo AF − fornecido: **positivo = "Saldo positivo AF" (não é pendência)**, negativo = **pendência** (fornecido acima da AF), zero = sem pendência (regra do mantenedor, 19/11/2026). Com pendência, aparece a "Mensagem para o cliente" (textarea editável + Copiar; formato: pendência por produto, depois "Foi fornecido" com "(AF tinha: …)", kg com 2 casas). Cópia via `execCommand` (http não é contexto seguro); iframe com `allow="clipboard-write"`. Guardado em `settings.afIgarata` (`kgPerUnit[productId]`, `saldos["AAAA-MM-DD_AAAA-MM-DD"][productId]`), vai junto no PUT das etiquetas. **Cancelamento** (19/11/2026): registrado **na fila de pedidos** (botão "Cancelar"/"Desfazer cancel." em cada pedido; `cancelOrder`, total ou parcial + motivo) como `order.cancel = { qty, motivo, at, by }` no próprio pedido — não apagar o pedido. A impressão (etiquetas e romaneio Paraibuna) usa `printableOrders()`: cancelado inteiro não imprime, parcial imprime só o resto (`divide(resto, packageSize)`); totais por pão da fila descontam. O Financeiro **só mostra** (sem botões): `finDelivered(o)` = total − cancelado conta como fornecido (tabelas, kg, AF, CSV), bloco "Cancelamentos" e card no resumo em vermelho.
- Lançar pedidos de etiquetas a partir de PDF/planilha (19/11/2026): agente do **OpenCode desktop (Windows, sem WSL)** `.opencode/agents/etiquetas.md` (modelo `opencode/deepseek-v4.1-flash-free`). Ler: `scripts/etiquetas/extrair.ps1 <arquivos>` (roda `extrair.py` num container — imagem `mips-extrair:<hash>` construída sozinha do `Dockerfile` ao lado; PyMuPDF/xlrd/openpyxl; marca `[fundo AMARELO]`). Os `.ps1` ficam em UTF-8 **com BOM** (PowerShell 5.1). Gravar: monta `backups/pedidos-<rotulo>.json` e roda `scripts/etiquetas/lancar.ps1 <json>` (prévia; casa local/produto com o cadastro, põe a base fixa do banco, bloqueia duplicado) e depois `-Aplicar` (backup em `backups/etiquetas-pre-<rotulo>-*.json`, grava em transação). Depois: F5 na página de Etiquetas. Use esse fluxo também aqui no Claude.
- Romaneio Santa Branca (07/11/2026, `/ferramentas/romaneio` → `admin-tools/romaneio.html`, chave `romaneio`): ferramenta **separada das Etiquetas** (não gera etiqueta). Clientes + base por dia da semana (padrão `DEFAULT_CLIENTS`, das planilhas do Drive); dia salvo em `dados.days[AAAA-MM-DD]` ao editar ou imprimir. Pacotes: máx. 20 francês/integral e 30 leite, menor nº de pacotes. Impressão sempre 2 folhas por dia (frente = romaneio com ASSINATURA, verso = pacotes + separação) para frente e verso. Aba "Contagem do mês" = relatório do financeiro por AF (kg = und × `rules.kgPerUnit`, padrão 0,05); só conta dias salvos. Salvamento (10/11/2026): autosave em tudo; cada envio lê o banco e mescla com o que mudou desde a última sincronização (`synced`, guardado no localStorage) — não trocar por PUT direto, senão aba desatualizada apaga dados e login expirado (JWT 8h) perde edição.
- Conversão em pão (16/11/2026, `/ferramentas/conversao` → `admin-tools/conversao.html`, chave `conversao`): lê o PDF "Relatório de Clientes" no navegador (pdf.js 3.11.174 via cdnjs; usa a tabela "Produtos Totais", unidade vem das linhas dos pedidos), aplica a **tabela única** de produtos/preços (`dados.products`, seed = abas da planilha "Calculadora Hospital Santos Dumont.xlsx", preço do Santos Dumont) com exceções por cliente em `clients[].prices` (só a Ambev tem preço próprio) e divide o total entre os pães por % (`clients[].targets` = regras), `ceil` como o ARREDONDAR.PARA.CIMA. Ignora os preços do PDF. `dados.v = 2`; dados v1 (tabela por cliente) são migrados no `normalize`. Item→produto: vínculo global em `dados.aliases` (chave = nome do item normalizado) ou casamento automático por palavras (`autoMatch`, palavras-chave mini/leite/integral… têm que bater dos dois lados); unidade `g` → fator 0,001. Salvamento com o mesmo merge do Romaneio (lista por id em `products`, `clients` e `history`; chave a chave em `aliases`). Para consultar o banco: `docker exec portal_mips_db psql -U <DB_USER do backend> -d mips_db` (o `$POSTGRES_*` do container `db` não serve).
- Calculadora Gerdau (19/11/2026, `/ferramentas/gerdau` → `admin-tools/gerdau.html`, chave `gerdau`, só Administrador): planilha "Calculadora GERDAU.xlsx". Disponível para os congelados = AF + saldo anterior − outros produtos (quantidade × preço de cada item de `dados.extras`, ex.: pão de leite R$ 0,80 — o "− 104" da planilha era o pão de leite; não existe mais campo "Desconto", só `desconto` legado em registros antigos); divide por % entre os pacotes (`dados.items`, padrão Vermelho R$ 6,70 e Amarelo R$ 7,50, 7 und/pct, 50% cada), `TRUNC` em pacotes inteiros; a sobra vira saldo. Saldo atual = `sobra` do registro mais recente de `dados.history` (AF salva ou `kind: "ajuste"`); só o último registro pode ser desfeito. Campo "+ Saldo anterior" na tela vem preenchido com o saldo atual (editável; `ui.saldoManual`). Aba "Pedidos a cobrar" (pedido editável — volta ao formulário): `dados.orders` (pacotes a preço do pacote + `dados.extras`, ex.: Pão de leite R$ 0,80; `status` pendente/cobrado). Saldo inicial R$ 68,80 (AF da planilha, 816,10 − 130 pães de leite) lançado no banco em 19/11/2026. Salvamento com o mesmo merge do Romaneio (lista por id em `items`, `extras`, `orders` e `history`).
- Calculadora de fermento (18/11/2026, `/fermento` → `pages/CalculadoraFermento.jsx`, **todos os perfis**): pão francês/massa de sal, sem estufa. Regra pura em `backend/fermento.js` (+ `fermento.test.js`); a conta roda **no backend** (`POST /api/fermento/calcular`, `POST /api/fermento/atrito`) para todos usarem a mesma regra. Base em `ferramentas_admin_estado` chave `fermento` (`GET /api/fermento/config` todos, `PUT` só Administrador; padrão = 175 g seco / 50 kg **farinha**, massa 20 °C, 8 h, ambiente 24 °C presumido). Modelo: fermento × atividade × tempo constante; atividade dobra a cada `grausParaDobrar` °C; massa vai à temperatura ambiente com constante `tauHoras`. Água pela conta de 3 fatores + gelo (calor latente 80). Fresco = seco × `fatorFresco`.
- Versão sincronizada em `backend/package.json` + `frontend/package.json` + badge `README.md`.
- Perfis: Funcionário (sem sidebar) < Líder < Gerente < Administrador (único com backup, usuários, personalização). **RH** (22/10/2026) é um perfil de gestão de pessoas: **gerencia** ASO, Banco de Horas, Folgas, Atendimento e Comunicados (como Administrador — `perfilGestorRH`, `perfilGestorASO`, `perfilGestorComunicados`, `ehGestorAtendimento`); MIPs e Reclamações são **só leitura**; sem Receitas, Avaliações, Usuários ou Configurações. **Gerente** (24/10/2026) ficou só com **Folgas e Banco de Horas** — ASO, fila de Atendimento, Comunicados (só leitura, como funcionário) e Desabafos são de `rh`/`administrador` (403 na API); o Gerente ainda abre e responde os próprios tickets. Desabafos anônimos são visíveis para `rh` e `administrador`. Na barra lateral, `rh` vê os itens direto e Administrador/Gerente os veem dentro da pasta **RH** (5 itens para ADM, só Folgas para Gerente; Comunicados do Gerente fica fora da pasta). **Banco de Horas saiu do menu de todos os perfis e das categorias do Atendimento (19/11/2026)** — página `/banco-horas` e API continuam (links de notificações antigas); "Holerite" não existe no sistema. Vale como RH quem tem perfil `rh`, `gerente` ou `administrador` (`ehRH` no backend).
- **Sempre commitar E dar push após qualquer alteração** (22/10/2026, pedido do mantenedor): terminou a tarefa, rode `npm test` quando tocar em regra de negócio, faça o commit com mensagem descritiva em português e envie com `git push origin main`. Trabalho concluído não fica só no working tree nem só no commit local — tem que estar no GitHub. Só não dê push se o mantenedor pedir explicitamente para segurar.

## Git nesta máquina

Não existe `git.exe` no Windows (nada em `Program Files`, nem no PATH). O Git fica no **WSL (Ubuntu)** — use sempre via `wsl`:

```bash
wsl -e bash -lc 'cd /mnt/c/Users/Marcelo/Projetos/Sistema-MIPs && git status --short'
wsl -e bash -lc 'cd /mnt/c/Users/Marcelo/Projetos/Sistema-MIPs && git add -A && git commit -m "Assunto: resumo" && git push origin main'
```

`gh` já está autenticado no WSL e serve de credential helper — push funciona sem senha. Conta ativa: `eumobkk` (colaborador do repositório desde 10/11/2026); `serverlatinhaseca-lgtm` é a dona do repositório e segue logada, inativa. `node`/`npm` também não existem no Windows: teste/build rodam em container (`docker run --rm -v "<repo>/backend:/app" -w /app node:22-alpine npm test`).

## Sessões

`AGENTS.md` é a memória permanente (commitado). Resumos/decisões temporárias vão em `docs/sessoes/AAAA-MM-DD-topico.md` e devem ser commitados.
