# 2026-09-24 — Fotos da personalização sumiram (2ª vez)

## Sintoma
Imagens da personalização (logo, logo avaliação, imagem do login, ícone de ajuda,
banner do dashboard) quebradas no site. 2ª ocorrência (a 1ª foi a correção do PUT
com merge parcial em `backend/index.js`, que continua válida).

## Causa raiz (confirmada com evidências)
Bind mount `./backend/uploads:/app/uploads` **dessincronizado** após o recreate do
container do backend (deploy v2.10.0 Banco de Horas, ~23/09):
- Host `backend/uploads/`: **43 arquivos intactos** (inclui os 5 referenciados no banco).
- Container `/app/uploads`: **vazio** (0 arquivos).
- `curl` no backend (`:7001`) e via frontend (`:80`): **404** num arquivo existente no host.
- Banco íntegro (`configuracoes_portal` com as 5 URLs corretas), `nginx.conf` correto,
  espelho do Drive só vai local→Drive (não apaga origem).
- Não é perda de dados — é o container que não enxerga o disco (desync do
  compartilhamento de arquivos WSL/Docker, mesmo padrão da queda de WSL de 18/09).

## Correção imediata
- `docker compose restart backend` → bind re-montado: 43 arquivos visíveis, HTTP 200
  no backend e no frontend.

## Blindagem (para não haver 3ª vez)
1. **`backend/.dockerignore` (novo)** — `uploads/`, `backups/`, `.env`, etc. fora da
   imagem. Antes, o `COPY . .` assava fotos obsoletas na imagem e mascarava bind vazio.
2. **`backend/index.js` — `diagnosticarUploads()` no boot** — loga
   `📁 uploads: N arquivo(s) visível(is), M referência(s)` e alerta com `⚠️` se
   houver refs no banco com pasta vazia no container. Estreou no rebuild de hoje:
   `43 arquivo(s), 5 referência(s)`.
3. **`scripts/watchdog.ps1` — auto-cura (tarefa MIPs-Watchdog, a cada 5 min)** —
   lê `/api/configuracoes-portal`, testa cada `/uploads/*` via HEAD; se o arquivo
   **existe no disco mas dá 404**, faz `compose restart backend` e registra em
   `ProgramData\MIPs\logs\watchdog.log`. Se o arquivo **sumiu do disco**, só alerta
   (restart não adiantaria — restaurar do Drive).
4. **`AGENTS.md`** — bloco "Atualização segura" agora exige o check de uploads
   após todo `up -d --build`.
5. **Rebuild do backend executado** (`up -d --build backend`) para ativar o
   diagnóstico; bind sobreviveu ao recreate desta vez. Testes: 18/18 OK no container.

## Pendente (fazer no Windows)
- Conferir `G:\Meu Drive\Natan\Backup Sistema\uploads` — deve conter os 43 arquivos
  (o WSL aqui não monta `G:`, não deu para verificar). É a rede de segurança caso um
  dia o arquivo suma do disco de verdade.

## Como diagnosticar se voltar
1. `docker exec portal_mips_backend ls /app/uploads | wc -l` vs `ls backend/uploads`
2. `curl -o /dev/null -w '%{http_code}' http://localhost:7001/uploads/<arquivo>`
3. `docker compose logs --tail=5 backend` (linha `📁 uploads:`)
4. Vazio no container + cheio no host = bind dessincronizado → `restart backend`.
