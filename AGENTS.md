# Sistema Central · Nova Esperança — AGENTS.md

Portal interno (MIPs, receitas, avaliações, reclamações, etiquetas, financeiro, backup).
Stack: React 18 + Vite 8 + Tailwind 3 + React Router 7 | Node.js 22 + Express 5 | PostgreSQL 15 | Docker Compose.

## Estrutura

- `backend/` — API Express (`index.js` gordo + regras puras em `avaliacoes.js`, `aso.js`, `folgas.js`, `tickets.js`, cada um com `*.test.js`). Seeds: `modelos-avaliacao.json`, `clientes-iniciais.json`. Schema/migrações: só `init.sql`, aplicado pelo backend no boot — não crie sistema de migration.
- `frontend/src/` — app React (`App.jsx` rotas, `api.js`, `pages/`, `components/`). `api.js` usa base relativa em HTTPS (proxy Nginx) e `hostname:7001` direto em HTTP — use-o, não `axios` direto.
- `frontend/public/admin-tools/etiquetas.html` + `caixas.html` — ferramenta Etiquetas legada em JS vanilla; edite os HTMLs direto, não existe componente React equivalente.
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
- Versão sincronizada em `backend/package.json` + `frontend/package.json` + badge `README.md`.
- Perfis: Funcionário (sem sidebar) < Líder < Gerente < Administrador (único com backup, usuários, personalização). **RH** (22/10/2026) é um perfil de gestão de pessoas: ASO, Banco de Horas, Folgas, Atendimento, Comunicados + MIPs e Reclamações **só leitura**; sem Receitas, Avaliações, Usuários ou Configurações. Vale como RH quem tem perfil `rh`, `gerente` ou `administrador` (`ehRH` no backend).
- **Sempre commitar E dar push após qualquer alteração** (22/10/2026, pedido do mantenedor): terminou a tarefa, rode `npm test` quando tocar em regra de negócio, faça o commit com mensagem descritiva em português e envie com `git push origin main`. Trabalho concluído não fica só no working tree nem só no commit local — tem que estar no GitHub. Só não dê push se o mantenedor pedir explicitamente para segurar.

## Git nesta máquina

Não existe `git.exe` no Windows (nada em `Program Files`, nem no PATH). O Git fica no **WSL (Ubuntu)** — use sempre via `wsl`:

```bash
wsl -e bash -lc 'cd /mnt/c/Users/Marcelo/Projetos/Sistema-MIPs && git status --short'
wsl -e bash -lc 'cd /mnt/c/Users/Marcelo/Projetos/Sistema-MIPs && git add -A && git commit -m "Assunto: resumo" && git push origin main'
```

`gh` já está autenticado no WSL (`serverlatinhaseca-lgtm`, escopo `repo`) e serve de credential helper — push funciona sem senha. `node`/`npm` também não existem no Windows: teste/build rodam em container (`docker run --rm -v "<repo>/backend:/app" -w /app node:22-alpine npm test`).

## Sessões

`AGENTS.md` é a memória permanente (commitado). Resumos/decisões temporárias vão em `docs/sessoes/AAAA-MM-DD-topico.md` e devem ser commitados.
