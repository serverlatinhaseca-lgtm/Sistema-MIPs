# Sistema Central · Nova Esperança — AGENTS.md

Portal interno (MIPs, receitas, avaliações, reclamações, etiquetas, financeiro, backup).
Stack: React 18 + Vite 8 + Tailwind 3 + React Router 7 | Node.js 22 + Express 5 | PostgreSQL 15 | Docker Compose.

## Estrutura

- `backend/` — API Express em arquivo único `index.js` + `avaliacoes.js` (regras) + seeds `modelos-avaliacao.json`, `clientes-iniciais.json` + `init.sql`. Testes com `node --test` (`avaliacoes.test.js`). Uploads em `backend/uploads/`.
- `frontend/src/` — app React (`App.jsx`, `pages/`, `components/`, `api.js`). Ferramenta Etiquetas tem parte legada em JS vanilla: `frontend/public/admin-tools/etiquetas.html` e `caixas.html` — edite esses HTMLs direto, não procure componente React equivalente.
- `frontend/` — build Vite servido via Nginx (`nginx.conf`, `Dockerfile`). Certificados locais em `frontend/certs/` (gitignored via `frontend/.gitignore`).
- `docker-compose.yml` — serviços `db`, `backend`, `frontend`, `dnsmasq`, `backup`. Portal só em `80` (HTTP; sem HTTPS por decisão — `mips.lan` resolve via `dnsmasq`), API em `7001` (`/api/health`).
- `backup/` — dump diário do Postgres no container `backup` (`backup.sh`, `crontab` 02:30, retenção local 30 dias) + espelho no Windows via tarefa agendada `MIPs-Espelho-Drive` (`espelhar-drive.ps1`, 03:00) para `G:\Meu Drive\Natan\Backup Sistema`. Sem rclone (era do servidor Linux antigo, removido em 17/09/2026).
- `android/` — WebView para `http://mips.lan`, build do APK via GitHub Actions (`.github/workflows/build-apk.yml`).
- `backups/`, `backend/uploads/`, `*.dump` — dados locais, nunca commitar.

## Comandos (nesta ordem)

```bash
cp .env.example .env  # só na primeira vez; depois edite .env (POSTGRES_*, JWT_SECRET via `openssl rand -hex 32`, ADMIN_INITIAL_PASSWORD)
docker compose up -d --build
docker compose ps
curl http://localhost:7001/api/health  # esperado: {"ok":true}
```

Backend (sem dependência extra, usa `node --test`):

```bash
cd backend
npm test
```

Frontend:

```bash
cd frontend
npm ci
npm run build
```

Logs / diagnóstico:

```bash
docker compose logs --tail=100 backend
docker compose logs --tail=100 frontend
docker compose logs --tail=100 db
docker compose restart
```

Atualização segura em produção:

```bash
git pull --ff-only origin main
docker compose up -d --build
# Pós-deploy obrigatório (24/09/2026, 2ª queda das fotos): o bind ./backend/uploads
# pode dessincronizar no recreate — o container enxerga a pasta vazia e o site dá 404.
docker exec portal_mips_backend ls /app/uploads | wc -l  # tem que bater com ls backend/uploads
docker compose logs --tail=5 backend  # esperado: "📁 uploads: N arquivo(s) visível(is)"
# Se zerado ou 404: docker compose restart backend (re-monta o bind)
```

NUNCA rode `docker compose down -v` em produção — apaga o volume `pgdata` e o banco.

Autorização permanente do mantenedor (17/09/2026): o agente pode rodar `docker compose up -d --build`, `ps`, `logs` e `restart` sem pedir confirmação — só avise depois o que foi feito.

## Convenções

- Backend: CommonJS (`require`), validação com `zod`, auth JWT + `bcryptjs`, upload com `multer` (limite 10 MB). Migrações aplicadas automaticamente pelo backend no boot a partir de `init.sql` — não crie sistema de migration novo.
- Frontend: chamadas HTTP centralizadas em `src/api.js` (use-o em vez de `axios` direto); rotas em `App.jsx`; Quill via `react-quill-new` (pin `quill@2.0.2` em `overrides` — não atualizar sem testar `npm run build`).
- Etiquetas: impressão Pimaco 6187 em PDF; regras de turnos/validades e clientes (Johnson, Igaratá, Paraibuna, genéricas) têm lógica espalhada entre `backend/index.js` e `admin-tools/etiquetas.html` — ao mudar regra, verifique os dois lados e o Financeiro.
- Versão do produto em `backend/package.json` + `frontend/package.json` + badge no `README.md` — mantenha as três sincronizadas.
- Perfis: Funcionário (simplificado, sem sidebar) < Líder < Gerente < Administrador (único com backup, usuários, personalização).

## Segurança / Git

- NUNCA commitar: `.env`, `*.dump`, `backend/uploads/*`, `backups/*`, `frontend/certs/*.pem`.
- ATENÇÃO: não há `.gitignore` na raiz. Sempre use `git add <caminho-explícito>` — nunca `git add -A` / `git add .`, pois há `.env` e `backups/` untracked neste ambiente.
- Repositório deve permanecer privado; não exponha a porta do Postgres na internet.

## Contexto compartilhado entre sessões

Este arquivo é a memória permanente do projeto (commitado, vale para toda a equipe).
Decisões temporárias ou resumos de sessão vão em `docs/sessoes/AAAA-MM-DD-topico.md` (crie a pasta quando precisar) e devem ser commitados para a outra pessoa continuar de onde parou.
