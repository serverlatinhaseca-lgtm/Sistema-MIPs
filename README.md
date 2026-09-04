# Sistema Central · Nova Esperança

> Portal interno para padronização operacional, gestão de receitas, avaliações de desempenho, reclamações e ferramentas de produção.

![Versão](https://img.shields.io/badge/versão-2.5.0-ff8d2f)
![React](https://img.shields.io/badge/React-18-61dafb)
![Node.js](https://img.shields.io/badge/Node.js-18-339933)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169e1)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ed)

## Sobre o sistema

O Sistema Central reúne em um único portal os processos internos da Nova Esperança. A aplicação funciona em computadores e celulares, possui modo claro e escuro e separa os acessos conforme a função de cada usuário.

### Novidades da versão 2.1.0

- Pop-ups de MIP aprovada, reprovada com orientação e aguardando revisão;
- Aba independente **Validades**, removendo esse fluxo da Johnson;
- Regras de validade configuráveis por produto, dias e quantidade de etiquetas;
- Fabricação configurável para o segundo e terceiro turnos;
- Exclusão segura de tipos de pão pela interface;
- Tipos personalizados exibidos com capitalização normal;
- Salvamento de locais recorrentes nas etiquetas genéricas.

### Novidades da versão 2.2.0

- Arquivamento em massa de etiquetas selecionadas;
- Arquivamento de todas as etiquetas de um mês;
- Consulta do arquivo por mês, restauração e exclusão;
- Aba Financeiro preenchida automaticamente pelos clientes das etiquetas;
- Relação automática de cada cliente com suas unidades;
- Consolidação mensal por cliente, unidade e produto;
- Exportação da consulta financeira em CSV.

### Novidades da versão 2.3.0

- Financeiro com subaba própria para Igaratá, Paraibuna, Johnson e Genéricas;
- Unidades agrupadas automaticamente por setor, incluindo Educação, Saúde e Assistência Social;
- Consulta mensal e CSV separados pelo cliente selecionado;
- Arquivo organizado por cliente e dia, seguindo a lógica dos PDFs;
- Restauração e exclusão do arquivo diário completo;
- Validades com 28 etiquetas no primeiro turno;
- Segundo e terceiro turnos reunidos em um único arquivo com 40 etiquetas e fabricação no dia seguinte;
- Regra adicional de 5 etiquetas com validade de três dias;
- Layout visual anterior das etiquetas preservado.

### Novidades da versão 2.4.0

- Quantidade de etiquetas editável para cada dia antes da geração;
- Alteração diária não modifica os valores padrão;
- Edição completa das regras de validade pela interface;
- Quantidade padrão independente para o 1º turno;
- Quantidade padrão conjunta para o 2º e 3º turnos;
- Dias de validade e nome da regra editáveis;
- Prazo de fabricação do arquivo conjunto configurável.

### Correção da versão 2.4.1

- Todos os turnos de validade são impressos no mesmo PDF diário;
- O 1º turno aparece primeiro;
- O lote conjunto do 2º e 3º turnos aparece depois;
- Uma linha completa em branco separa os dois lotes;
- A separação permanece alinhada mesmo com quantidades diárias personalizadas;
- Nome do arquivo unificado em `VALIDADES_DD.MM.pdf`;
- Arquivo histórico de validade novamente agrupado por dia.

### Novidades da versão 2.5.0

- Filtro de tipo de pão no resumo Financeiro;
- Filtros de cliente, mês, setor, unidade e pão podem ser combinados;
- Cópia de um dia completo para uma nova data;
- Cópia disponível nas etiquetas ativas e no Arquivo;
- Edição de pedidos já cadastrados;
- Alteração de setor/local, tipo de pão e quantidade;
- Recálculo automático dos pacotes após a edição;
- Edição compatível com pedidos fixos, manuais, genéricos e validades;
- Persistência no banco corrigida para regras de validade e arquivo diário.

### Módulos disponíveis

| Módulo | Principais recursos |
|---|---|
| MIPs | Criação, edição, aprovação, reprovação com orientação e histórico detalhado de versões |
| Receitas | Cadastro, cálculo proporcional, arredondamento automático, edição e histórico |
| Avaliações | Modelos por função, perguntas configuráveis, avaliação mensal e histórico de desempenho |
| Reclamações | Clientes, tipos, prioridades, SLA, cronômetro, fotos, conclusão e indicadores |
| Etiquetas | Rotas, pedidos fixos, tipos de pão, impressão Pimaco 6187, PDF e totais por tipo |
| Pacotes e Caixas | Cálculos de produção, configurações e resumos consolidados |
| Usuários | Perfis, vínculos de liderança, senha temporária e categorias adicionais de acesso |
| Personalização | Nome do portal, logo do sistema e logo dos relatórios de avaliação |
| Backup | Geração, download, exclusão e restauração do PostgreSQL pela interface |

## Perfis de acesso

### Funcionário

- Consulta MIPs e receitas publicadas;
- Visualiza suas próprias avaliações e histórico de desempenho;
- Consulta as métricas de reclamações;
- Altera a própria senha;
- Utiliza uma interface simplificada, sem barra lateral.

### Líder

- Possui as permissões operacionais de criação e edição;
- Avalia somente os funcionários vinculados à sua equipe;
- Registra e acompanha reclamações;
- Consulta as próprias avaliações.

### Gerente

- Possui as permissões operacionais de Líder;
- Visualiza avaliações de todos os líderes e funcionários;
- Recebe avaliação exclusivamente do Administrador e utiliza modelo definido no cadastro;
- Registra e acompanha reclamações.

### Administrador

- Possui acesso completo ao portal;
- Aprova ou reprova MIPs;
- Gerencia usuários, modelos, perguntas, clientes e tipos de reclamação;
- Personaliza o portal;
- Acessa Etiquetas e Pacotes/Caixas;
- Gera, baixa, exclui e restaura backups do banco.

## Avaliações de desempenho

- Os modelos iniciais reproduzem os formulários fornecidos para Embalagem, Forneiro, Líderes, Motorista, Padeiro e Auxiliar de Padeiro;
- O Administrador pode criar modelos e adicionar, editar ou remover perguntas;
- Cada avaliação é publicada automaticamente no perfil do usuário avaliado;
- Líderes visualizam somente a própria equipe;
- O histórico apresenta evolução mensal e destaque visual da meta de 80%;
- Avaliações antigas preservam as perguntas e critérios utilizados na época.

## Gestão de reclamações

Cada reclamação contém:

- Cliente;
- Tipo de reclamação;
- Líder responsável;
- Descrição;
- Fotos e anexos;
- Nível de importância;
- Prazo automático e status.

| Prioridade inicial | Cor | Prazo padrão |
|---|---:|---:|
| Não urgente | Verde | 24 horas |
| Média | Amarelo | 3 horas |
| Imediata | Vermelho | 1 hora |

Os três prazos podem ser alterados pelo Administrador em **Central de configurações → Reclamações**. Alterações afetam novas reclamações e não modificam os prazos já iniciados.

O painel apresenta totais, reclamações abertas, atrasadas e concluídas, tempo médio de solução e gráficos por tipo, cliente, líder, prioridade e mês.

## Backup e restauração

O Administrador encontra os backups em:

```text
Central de configurações → Backup do banco
```

O sistema permite:

- Gerar uma cópia completa em formato PostgreSQL `.dump`;
- Baixar o arquivo para outro computador;
- Excluir cópias antigas;
- Restaurar um backup existente;
- Consultar o histórico das operações.

Antes de restaurar, o sistema exige a senha atual do Administrador e gera automaticamente uma cópia do banco vigente. Os arquivos permanecem na pasta `backups` do servidor e não são publicados pelo Nginx.

## Requisitos

- Docker Engine;
- Docker Compose;
- Git, caso as atualizações sejam feitas pelo GitHub;
- Portas `7070`, `7001` e `7002` disponíveis no servidor.

## Instalação

### 1. Clonar o projeto

```bash
git clone https://github.com/serverlatinhaseca-lgtm/Sistema-MIPs.git
cd Sistema-MIPs
```

### 2. Criar o arquivo de ambiente

```bash
cp .env.example .env
nano .env
```

Exemplo:

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=DEFINA_UMA_SENHA_FORTE_PARA_O_BANCO
POSTGRES_DB=mips_db
JWT_SECRET=COLE_AQUI_UMA_CHAVE_ALEATORIA_DE_64_CARACTERES
ADMIN_INITIAL_PASSWORD=DEFINA_UMA_SENHA_INICIAL_FORTE
```

Gere uma chave JWT segura com:

```bash
openssl rand -hex 32
```

### 3. Construir e iniciar

```bash
docker compose up -d --build
docker compose ps
```

### 4. Acessar

```text
Portal: http://IP_DO_SERVIDOR:7070
API:    http://IP_DO_SERVIDOR:7001
```

A conta administrativa inicial utiliza a senha definida em `ADMIN_INITIAL_PASSWORD`. Essa variável não redefine a senha depois que a conta já existe.

## Atualização segura

```bash
cd ~/Sistema-MIPs
git pull --ff-only origin main
docker compose up -d --build
docker compose ps
```

> **Importante:** não execute `docker compose down -v` em produção. A opção `-v` remove o volume do PostgreSQL e apaga o banco.

As migrações necessárias são aplicadas automaticamente pelo backend durante a inicialização.

## Comandos úteis

### Verificar a API

```bash
curl http://localhost:7001/api/health
```

Resultado esperado:

```json
{"ok":true}
```

### Consultar os serviços

```bash
docker compose ps
```

### Consultar logs

```bash
docker compose logs --tail=100 backend
docker compose logs --tail=100 frontend
docker compose logs --tail=100 db
```

### Reiniciar os serviços

```bash
docker compose restart
```

## Testes e validação

### Backend

```bash
cd backend
npm test
```

### Frontend

```bash
cd frontend
npm ci
npm run build
```

Antes da publicação da versão 2.0.0 foram validados:

- Compilação de produção do frontend;
- Sintaxe do backend;
- JavaScript da ferramenta Etiquetas;
- Testes das regras de avaliação;
- Instalação limpa das dependências do backend;
- Integridade do pacote de distribuição;
- Presença do `.env.example` e das configurações Docker.

## Estrutura do projeto

```text
Sistema-MIPs/
├── backend/
│   ├── index.js
│   ├── init.sql
│   ├── modelos-avaliacao.json
│   ├── clientes-iniciais.json
│   └── Dockerfile
├── frontend/
│   ├── public/admin-tools/
│   ├── src/components/
│   ├── src/pages/
│   └── Dockerfile
├── backups/                 # Criada no servidor; não enviada ao GitHub
├── docker-compose.yml
├── .env.example
└── README.md
```

## Solução de problemas

### Porta 7001 já está em uso

```bash
docker ps --filter publish=7001 --format 'table {{.ID}}\t{{.Names}}\t{{.Ports}}'
```

Pare somente o contêiner antigo do próprio Sistema MIPs antes de subir a nova versão.

### Conflito com o nome do contêiner

Isso pode ocorrer após mudar o nome da pasta ou iniciar o mesmo Compose com outro nome de projeto:

```bash
docker ps -a --filter name=portal_mips
```

Confirme os contêineres encontrados antes de removê-los.

### Backend não fica saudável

```bash
docker compose logs --tail=150 backend
docker compose logs --tail=100 db
```

Confira principalmente as variáveis do `.env` e a saúde do PostgreSQL.

### Alteração não apareceu no navegador

```bash
git pull --ff-only origin main
docker compose up -d --build
```

Depois faça uma atualização forçada no navegador com `Ctrl + F5`.

## Segurança

- Nunca envie o arquivo `.env` ao GitHub;
- Nunca envie arquivos `.dump`, uploads ou volumes do PostgreSQL ao repositório;
- Mantenha o repositório privado quando houver código ou informações internas;
- Utilize uma chave JWT longa e senhas exclusivas;
- Baixe periodicamente os backups para outro computador;
- Não exponha diretamente as portas do PostgreSQL na internet.

---

**Sistema Central · Nova Esperança — versão 2.0.0**  
Tecnologia e tradição em produção de pães.
