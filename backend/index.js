const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { randomUUID } = require('crypto');
const { prepararAvaliacao } = require('./avaliacoes');
const { calcularASO, classificarFaixa, normalizarFaixaPlanilha, FAIXAS_VALIDAS } = require('./aso');
const XLSX = (() => { try { return require('xlsx'); } catch { return null; } })();
const { excelSerialToISO } = require('./aso');
const { CATEGORIAS_TICKET, STATUS_TICKET, PRIORIDADES_TICKET, SLA_HORAS, numeroTicket, prazoSLA, statusAposMensagem, ticketEncerrado } = require('./tickets');
const AdmZip = (() => { try { return require('adm-zip'); } catch { return null; } })();
const { MODELOS, TIPOS_FOLGA, TIMES, gerarFolgasCiclo } = require('./folgas');
const { NIVEIS: NIVEIS_AJUDA, filtrarPorNivel } = require('./ajuda');
const MODELOS_AVALIACAO = require('./modelos-avaliacao.json');
const CLIENTES_INICIAIS = require('./clientes-iniciais.json');
const executarArquivo = promisify(execFile);

const app = express();
const PORT = process.env.PORT || 7001;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_INITIAL_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD;

if (!JWT_SECRET || !ADMIN_INITIAL_PASSWORD) {
  throw new Error('JWT_SECRET e ADMIN_INITIAL_PASSWORD devem ser definidos no ambiente.');
}

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const uploadDir = path.join(__dirname, 'uploads');
const backupDir = path.join(__dirname, 'backups');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true, mode: 0o777 });
}
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });

app.use('/uploads', express.static(uploadDir));

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (_err) {
    res.status(503).json({ ok: false, error: 'Banco de dados indisponível' });
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, uniqueSuffix + '-' + safeName);
  }
});
const upload = multer({ storage: storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Diagnóstico no boot (quedas 24/09 e 29/09/2026): uploads vivem no volume
// nomeado uploads_data (29/09/2026 em diante). Se refs > 0 e volume vazio, é
// ausência real no volume — restaurar do tar em backups/uploads-*.tar.gz
// (espelhado no Drive). O watchdog registra 404 sem auto-restart.
async function diagnosticarUploads() {
  try {
    const visiveis = fs.readdirSync(uploadDir).filter(f => f !== '.gitkeep').length;
    let refs = 0;
    try {
      const r = await pool.query("SELECT logo_site,logo_avaliacao,imagem_login,COALESCE(ajuda_icone,'') AS ajuda_icone,COALESCE(imagem_dashboard,'') AS imagem_dashboard FROM configuracoes_portal WHERE id=1");
      if (r.rows.length) refs = Object.values(r.rows[0]).filter(v => String(v || '').startsWith('/uploads/')).length;
    } catch { /* tabela pode não existir ainda no primeiro boot */ }
    console.log(`📁 uploads: ${visiveis} arquivo(s) visível(is) no container, ${refs} referência(s) no banco`);
    if (refs > 0 && visiveis === 0) console.error('⚠️ uploads vazio no volume com referências no banco — restaurar backups/uploads-*.tar.gz (Drive) para /app/uploads');
  } catch (err) { console.error('⚠️ falha no diagnóstico de uploads:', err.message); }
}

const pool = new Pool({ 
  user: process.env.DB_USER || 'postgres', 
  host: process.env.DB_HOST || 'db', 
  database: process.env.DB_NAME || 'mips_db', 
  password: process.env.DB_PASS || 'postgres', 
  port: 5432 
});

const ambientePostgres = () => ({...process.env,PGPASSWORD:process.env.DB_PASS || 'postgres'});
const nomeBackup = () => `mips-${new Date().toISOString().replace(/[-:]/g,'').replace('T','-').slice(0,15)}.dump`;
const caminhoBackupSeguro = nome => {
  if(!/^mips-[0-9]{8}-[0-9]{6}(?:-antes-restauracao)?\.dump$/.test(String(nome||''))) return null;
  return path.join(backupDir,nome);
};
async function gerarBackup(sufixo=''){
  const nome=nomeBackup().replace('.dump',`${sufixo}.dump`),destino=path.join(backupDir,nome);
  await executarArquivo('pg_dump',['-h',process.env.DB_HOST||'db','-U',process.env.DB_USER||'postgres','-d',process.env.DB_NAME||'mips_db','-Fc','--no-owner','--no-privileges','-f',destino],{env:ambientePostgres(),timeout:120000});
  return {nome,tamanho:fs.statSync(destino).size,criado_em:fs.statSync(destino).mtime};
}

async function conectarComRetentativa() {
  let conectado = false;
  while (!conectado) {
    try {
      await pool.query('SELECT 1');
      conectado = true;
      console.log('✅ Conectado ao banco de dados com sucesso!');
      await inicializarBancoEAdmin();
      await diagnosticarUploads();
    } catch (err) {
      console.log('⏳ Aguardando banco de dados...');
      await new Promise(res => setTimeout(res, 2000));
    }
  }
}

async function inicializarBancoEAdmin() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        senha VARCHAR(255) NOT NULL,
        perfil VARCHAR(50) NOT NULL,
        setor VARCHAR(100) NOT NULL DEFAULT '',
        cargo VARCHAR(100) NOT NULL DEFAULT '',
        lider_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS categorias (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS mips (
        id SERIAL PRIMARY KEY,
        codigo VARCHAR(20) UNIQUE NOT NULL,
        titulo VARCHAR(255) NOT NULL,
        resumo TEXT,
        objetivo TEXT,
        conteudo TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'Em Revisão',
        orientacao_correcao TEXT DEFAULT '',
        autor_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        search_vector tsvector
      );
      CREATE TABLE IF NOT EXISTS receitas (
        id SERIAL PRIMARY KEY,
        titulo VARCHAR(255) NOT NULL,
        rendimento_base INT NOT NULL,
        ingredientes JSONB NOT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS setor VARCHAR(100) NOT NULL DEFAULT '';
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cargo VARCHAR(100) NOT NULL DEFAULT '';
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS lider_id INT REFERENCES usuarios(id) ON DELETE SET NULL;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS deve_alterar_senha BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE mips ADD COLUMN IF NOT EXISTS orientacao_correcao TEXT DEFAULT '';
      ALTER TABLE mips ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
      CREATE TABLE IF NOT EXISTS configuracoes_portal (
        id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        nome_site VARCHAR(150) NOT NULL DEFAULT 'Portal - Nova Esperança',
        logo_site TEXT NOT NULL DEFAULT '',
        logo_avaliacao TEXT NOT NULL DEFAULT '',
        imagem_login TEXT NOT NULL DEFAULT '',
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE configuracoes_portal ADD COLUMN IF NOT EXISTS imagem_login TEXT NOT NULL DEFAULT '';
      ALTER TABLE configuracoes_portal ADD COLUMN IF NOT EXISTS ajuda_icone TEXT NOT NULL DEFAULT '';
      ALTER TABLE configuracoes_portal ADD COLUMN IF NOT EXISTS imagem_dashboard TEXT NOT NULL DEFAULT '';
      CREATE TABLE IF NOT EXISTS ajuda_respostas (
        id SERIAL PRIMARY KEY,
        pergunta VARCHAR(180) NOT NULL,
        gatilhos TEXT NOT NULL DEFAULT '',
        resposta TEXT NOT NULL,
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE ajuda_respostas ADD COLUMN IF NOT EXISTS nivel VARCHAR(20) NOT NULL DEFAULT 'funcionario';
      INSERT INTO configuracoes_portal (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
      CREATE TABLE IF NOT EXISTS ferramentas_admin_estado (
        chave VARCHAR(60) PRIMARY KEY,
        dados JSONB NOT NULL DEFAULT '{}'::jsonb,
        atualizado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS modelos_avaliacao (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(120) UNIQUE NOT NULL,
        chave VARCHAR(120) UNIQUE NOT NULL,
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS modelo_avaliacao_id INT REFERENCES modelos_avaliacao(id) ON DELETE SET NULL;
      CREATE TABLE IF NOT EXISTS perguntas_avaliacao (
        id SERIAL PRIMARY KEY,
        titulo VARCHAR(120) NOT NULL,
        pergunta TEXT NOT NULL,
        criterios JSONB NOT NULL DEFAULT '[]',
        obrigatoria BOOLEAN NOT NULL DEFAULT FALSE,
        ordem INT NOT NULL DEFAULT 0,
        ativa BOOLEAN NOT NULL DEFAULT TRUE,
        modelo_avaliacao_id INT REFERENCES modelos_avaliacao(id) ON DELETE CASCADE,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS mip_versoes (
        id SERIAL PRIMARY KEY, mip_id INT NOT NULL REFERENCES mips(id) ON DELETE CASCADE,
        codigo VARCHAR(20) NOT NULL, titulo VARCHAR(255) NOT NULL, resumo TEXT,
        objetivo TEXT, conteudo TEXT NOT NULL, status VARCHAR(50) NOT NULL,
        alterado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS receita_versoes (
        id SERIAL PRIMARY KEY, receita_id INT NOT NULL REFERENCES receitas(id) ON DELETE CASCADE,
        titulo VARCHAR(255) NOT NULL, rendimento_base INT NOT NULL, ingredientes JSONB NOT NULL,
        peso_pao NUMERIC,
        alterado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE receitas ADD COLUMN IF NOT EXISTS peso_pao NUMERIC;
      ALTER TABLE receita_versoes ADD COLUMN IF NOT EXISTS peso_pao NUMERIC;
      CREATE TABLE IF NOT EXISTS avaliacoes (
        id SERIAL PRIMARY KEY,
        usuario_avaliado_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        mes_referencia CHAR(7) NOT NULL,
        elaborado_por VARCHAR(150) NOT NULL,
        aplicado_por VARCHAR(150) NOT NULL,
        pontuacao_total INT NOT NULL,
        percentual INT NOT NULL,
        classificacao VARCHAR(20) NOT NULL,
        respostas JSONB NOT NULL,
        token_compartilhamento VARCHAR(64) UNIQUE NOT NULL,
        criado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (usuario_avaliado_id, mes_referencia)
      );
      CREATE INDEX IF NOT EXISTS avaliacoes_usuario_mes_idx
        ON avaliacoes (usuario_avaliado_id, mes_referencia DESC);
      CREATE TABLE IF NOT EXISTS clientes_reclamacao (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(180) UNIQUE NOT NULL,
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS tipos_reclamacao (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(150) UNIQUE NOT NULL,
        prioridade VARCHAR(10) NOT NULL DEFAULT 'verde',
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS setores_reclamacao (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(150) UNIQUE NOT NULL,
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS usuario_setores (
        usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        setor_id INT NOT NULL REFERENCES setores_reclamacao(id) ON DELETE CASCADE,
        PRIMARY KEY (usuario_id, setor_id)
      );
      CREATE TABLE IF NOT EXISTS configuracao_reclamacoes (
        id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
        prazo_verde_min INT NOT NULL DEFAULT 1440,
        prazo_amarelo_min INT NOT NULL DEFAULT 180,
        prazo_vermelho_min INT NOT NULL DEFAULT 60,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO configuracao_reclamacoes (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;
      CREATE TABLE IF NOT EXISTS reclamacoes (
        id SERIAL PRIMARY KEY,
        cliente_id INT NOT NULL REFERENCES clientes_reclamacao(id),
        assunto VARCHAR(220) DEFAULT '',
        tipo_id INT NOT NULL REFERENCES tipos_reclamacao(id),
        lider_responsavel_id INT NOT NULL REFERENCES usuarios(id),
        descricao TEXT NOT NULL,
        anexos JSONB NOT NULL DEFAULT '[]'::jsonb,
        prioridade VARCHAR(10) NOT NULL DEFAULT 'verde',
        prazo_em TIMESTAMP,
        status VARCHAR(15) NOT NULL DEFAULT 'aberto',
        concluido_em TIMESTAMP,
        concluido_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
        criado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS reclamacoes_criado_em_idx ON reclamacoes (criado_em DESC);
      ALTER TABLE reclamacoes ALTER COLUMN assunto DROP NOT NULL;
      ALTER TABLE reclamacoes ADD COLUMN IF NOT EXISTS prioridade VARCHAR(10) NOT NULL DEFAULT 'verde';
      ALTER TABLE reclamacoes ADD COLUMN IF NOT EXISTS prazo_em TIMESTAMP;
      ALTER TABLE reclamacoes ADD COLUMN IF NOT EXISTS status VARCHAR(15) NOT NULL DEFAULT 'aberto';
      ALTER TABLE reclamacoes ADD COLUMN IF NOT EXISTS concluido_em TIMESTAMP;
      ALTER TABLE reclamacoes ADD COLUMN IF NOT EXISTS concluido_por INT REFERENCES usuarios(id) ON DELETE SET NULL;
      ALTER TABLE reclamacoes ADD COLUMN IF NOT EXISTS setor_id INT REFERENCES setores_reclamacao(id) ON DELETE SET NULL;
      ALTER TABLE tipos_reclamacao ADD COLUMN IF NOT EXISTS prioridade VARCHAR(10) NOT NULL DEFAULT 'verde';
      UPDATE reclamacoes SET prazo_em = criado_em + INTERVAL '24 hours' WHERE prazo_em IS NULL;
      CREATE TABLE IF NOT EXISTS categorias_acesso (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(100) UNIQUE NOT NULL,
        permissoes JSONB NOT NULL DEFAULT '[]'::jsonb,
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS backup_auditoria (
        id SERIAL PRIMARY KEY,
        arquivo VARCHAR(180) NOT NULL,
        acao VARCHAR(30) NOT NULL,
        usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS notificacoes (
        id SERIAL PRIMARY KEY,
        usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        tipo VARCHAR(40) NOT NULL,
        titulo VARCHAR(220) NOT NULL,
        mensagem TEXT NOT NULL DEFAULT '',
        link VARCHAR(220) NOT NULL DEFAULT '',
        referencia VARCHAR(80) NOT NULL DEFAULT '',
        lida BOOLEAN NOT NULL DEFAULT FALSE,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS notificacoes_usuario_idx ON notificacoes (usuario_id, lida, criado_em DESC);
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS categoria_acesso_id INT REFERENCES categorias_acesso(id) ON DELETE SET NULL;
      INSERT INTO perguntas_avaliacao (titulo,pergunta,criterios,obrigatoria,ordem)
      SELECT * FROM (VALUES
        ('Manipulação higiênica','O colaborador cumpre corretamente as práticas de higiene, organização e limpeza durante a produção?','["Colabora com a higienização das máquinas e organização ao finalizar a produção.","Cumpre a higienização das demais áreas.","Mantém a área de embalagem organizada."]'::jsonb,FALSE,1),
        ('Trabalho em equipe','Demonstra cooperação e contribui positivamente para os objetivos comuns?','["É educado e mantém diálogo claro.","Respeita a hierarquia da empresa.","Comunica erros e situações que possam afetar a equipe."]'::jsonb,FALSE,2),
        ('Proatividade','Demonstra iniciativa para resolver problemas e melhorar o trabalho?','["Antecipa necessidades.","Sugere melhorias.","Participa de treinamentos e orientações."]'::jsonb,TRUE,3),
        ('Comprometimento','Cumpre horários, responsabilidades e acordos estabelecidos?','["É pontual e assíduo.","Cumpre as tarefas combinadas.","Demonstra responsabilidade."]'::jsonb,FALSE,4),
        ('Higiene pessoal','Mantém apresentação e higiene pessoal adequadas ao trabalho?','["Utiliza uniforme limpo.","Mantém higiene pessoal adequada.","Cumpre as regras de proteção individual."]'::jsonb,FALSE,5),
        ('Produtividade','Executa suas atividades com qualidade e dentro do tempo esperado?','["Mantém ritmo adequado.","Evita desperdícios.","Entrega com qualidade."]'::jsonb,FALSE,6),
        ('Gerais','Apresenta bom desempenho geral e postura profissional?','["Segue os procedimentos.","Recebe orientações de forma positiva.","Contribui para o ambiente de trabalho."]'::jsonb,FALSE,7)
      ) AS padrao(titulo,pergunta,criterios,obrigatoria,ordem)
      WHERE NOT EXISTS (SELECT 1 FROM perguntas_avaliacao);
      UPDATE perguntas_avaliacao
      SET pergunta = REGEXP_REPLACE(pergunta, '^\\s*SEÇÃO\\s+[0-9]+\\s*:\\s*', '', 'i')
      WHERE pergunta ~* '^\\s*SEÇÃO\\s+[0-9]+\\s*:';
    `);
    await inicializarModelosAvaliacao();
    await inicializarReclamacoes();
    await inicializarNotificacoes();
    await migrarPesoPao();
    await inicializarAjuda();
    await inicializarIngredientesSugestao();
    await inicializarASO();
    await inicializarFase2();
    await inicializarBancoHoras();
    await inicializarFolgas();

    const check = await pool.query("SELECT * FROM usuarios WHERE email = 'admin'");
    if (check.rows.length === 0) {
      const hash = await bcrypt.hash(ADMIN_INITIAL_PASSWORD, 10);
      await pool.query("INSERT INTO usuarios (nome, email, senha, perfil, deve_alterar_senha) VALUES ($1, $2, $3, $4, FALSE)", ['Administrador', 'admin', hash, 'Administrador']);
      console.log('✅ Usuário admin criado!');
    }
  } catch (err) { console.log('Erro ao inicializar:', err.message); }
}

async function inicializarReclamacoes() {
  // Mapeamento provisório tipo→prioridade (18/09/2026); a nutri vai definir a lista final.
  const tipos = [['Pão duro','amarelo'],['Pão esfarelado','verde'],['Pão com aspecto velho','amarelo'],['Pão mofado','vermelho'],['Produto sem validade','vermelho'],['Entrega atrasada','amarelo'],['Falta de itens','amarelo'],['Entrega não realizada','vermelho']];
  for (const [nome,prioridade] of tipos) {
    await pool.query('INSERT INTO tipos_reclamacao (nome,prioridade) VALUES ($1,$2) ON CONFLICT (nome) DO NOTHING', [nome,prioridade]);
    // Promove o padrão só onde ainda está o default 'verde' — não sobrescreve ajuste feito em Configurações.
    if (prioridade !== 'verde') await pool.query("UPDATE tipos_reclamacao SET prioridade=$1 WHERE nome=$2 AND prioridade='verde'", [prioridade,nome]);
  }
  for (const nome of CLIENTES_INICIAIS) await pool.query('INSERT INTO clientes_reclamacao (nome) VALUES ($1) ON CONFLICT (nome) DO NOTHING', [nome]);
  // Setores gerais (sem separar por turno; o líder define o horário). ADM responde ao diretor.
  const setores = ['Embalagem','Produção','Logística','ADM'];
  for (const nome of setores) await pool.query('INSERT INTO setores_reclamacao (nome) VALUES ($1) ON CONFLICT (nome) DO NOTHING', [nome]);
  // Migração (idempotente): funde setores por turno nos gerais, preservando histórico.
  const fusoes = [['Embalagem',['Embalagem Manhã','Embalagem Tarde','Embalagem Noite']],['ADM',['ADM - Pedidos','ADM - Financeiro']]];
  for (const [destino,antigos] of fusoes) {
    await pool.query(`INSERT INTO usuario_setores (usuario_id,setor_id) SELECT us.usuario_id,(SELECT id FROM setores_reclamacao WHERE nome=$1) FROM usuario_setores us JOIN setores_reclamacao s ON s.id=us.setor_id WHERE s.nome=ANY($2) ON CONFLICT DO NOTHING`, [destino,antigos]);
    await pool.query(`DELETE FROM usuario_setores WHERE setor_id IN (SELECT id FROM setores_reclamacao WHERE nome=ANY($1))`, [antigos]);
    await pool.query(`UPDATE reclamacoes SET setor_id=(SELECT id FROM setores_reclamacao WHERE nome=$1) WHERE setor_id IN (SELECT id FROM setores_reclamacao WHERE nome=ANY($2))`, [destino,antigos]);
  }
  await pool.query(`UPDATE setores_reclamacao SET ativo=FALSE WHERE nome IN ('Embalagem Manhã','Embalagem Tarde','Embalagem Noite','ADM - Pedidos','ADM - Financeiro','Produção e Logística')`);
}

async function inicializarModelosAvaliacao() {
  for (const modelo of MODELOS_AVALIACAO) {
    const m = await pool.query(`INSERT INTO modelos_avaliacao (nome,chave) VALUES ($1,$2) ON CONFLICT (chave) DO UPDATE SET nome=EXCLUDED.nome,ativo=TRUE RETURNING id`, [modelo.nome,modelo.chave]);
    const modeloId = m.rows[0].id;
    const existente = await pool.query('SELECT COUNT(*) FROM perguntas_avaliacao WHERE modelo_avaliacao_id=$1',[modeloId]);
    if (Number(existente.rows[0].count) === 0) {
      for (let i=0;i<modelo.perguntas.length;i++) {
        const p=modelo.perguntas[i];
        const perguntaSemSecao = String(p.pergunta || '').replace(/^\s*SEÇÃO\s+\d+\s*:\s*/i, '');
        await pool.query('INSERT INTO perguntas_avaliacao (titulo,pergunta,criterios,obrigatoria,ordem,modelo_avaliacao_id) VALUES ($1,$2,$3,$4,$5,$6)',[p.titulo,perguntaSemSecao,JSON.stringify(p.criterios),p.obrigatoria,i+1,modeloId]);
      }
    }
  }
  await pool.query('DELETE FROM perguntas_avaliacao WHERE modelo_avaliacao_id IS NULL');
}

conectarComRetentativa();

const verificarToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(403).json({ error: 'Token ausente' });
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.usuarioId = decoded.id;
    req.usuarioPerfil = decoded.perfil;
    // Perfil RH é restrito aos módulos de RH: não usa Receitas nem Avaliações.
    // Bloqueia na API mesmo que a rota seja aberta direto pela URL.
    if (String(req.usuarioPerfil || '').toLowerCase() === 'rh' && /^\/api\/(receitas|avaliacoes)\b/i.test(req.path)) {
      return res.status(403).json({ error: 'Acesso não disponível para o perfil RH' });
    }
    next();
  } catch (err) { return res.status(401).json({ error: 'Token inválido' }); }
};

const somenteAdministrador = (req, res, next) => {
  if (String(req.usuarioPerfil || '').toLowerCase() !== 'administrador') {
    return res.status(403).json({ error: 'Acesso exclusivo do Administrador' });
  }
  next();
};

const normalizarPerfil = (perfil) => String(perfil || '').toLowerCase();
const restringirAoProprioTime = (perfil) => normalizarPerfil(perfil) === 'editor';

const CHAVES_FERRAMENTAS_ADMIN = new Set(['etiquetas', 'caixas']);

app.get('/api/ferramentas-admin/:chave', verificarToken, somenteAdministrador, async (req, res) => {
  if (!CHAVES_FERRAMENTAS_ADMIN.has(req.params.chave)) return res.status(404).json({ error: 'Ferramenta não encontrada' });
  try {
    const resultado = await pool.query(
      `SELECT dados, atualizado_em FROM ferramentas_admin_estado WHERE chave=$1`,
      [req.params.chave]
    );
    if (!resultado.rows.length) return res.status(404).json({ error: 'Ainda não existem dados salvos' });
    res.json(resultado.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar os dados da ferramenta' });
  }
});

app.put('/api/ferramentas-admin/:chave', verificarToken, somenteAdministrador, async (req, res) => {
  if (!CHAVES_FERRAMENTAS_ADMIN.has(req.params.chave)) return res.status(404).json({ error: 'Ferramenta não encontrada' });
  if (!req.body || typeof req.body.dados !== 'object' || Array.isArray(req.body.dados)) {
    return res.status(400).json({ error: 'Dados inválidos' });
  }
  try {
    const resultado = await pool.query(
      `INSERT INTO ferramentas_admin_estado (chave,dados,atualizado_por,atualizado_em)
       VALUES ($1,$2,$3,CURRENT_TIMESTAMP)
       ON CONFLICT (chave) DO UPDATE SET dados=EXCLUDED.dados, atualizado_por=EXCLUDED.atualizado_por, atualizado_em=CURRENT_TIMESTAMP
       RETURNING atualizado_em`,
      [req.params.chave, JSON.stringify(req.body.dados), req.usuarioId]
    );
    res.json({ mensagem: 'Dados salvos no banco', atualizado_em: resultado.rows[0].atualizado_em });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar os dados da ferramenta' });
  }
});

function prepararAvaliacaoDinamica(perguntas, respostas = []) {
  const normalizadas = perguntas.map((p) => {
    const r = respostas.find((item) => String(item.pergunta_id || item.competencia) === String(p.id)) || {};
    const nota = Number(r.nota);
    if (![0, 5, 8, 10].includes(nota)) throw new Error(`Selecione uma nota válida para ${p.titulo}.`);
    const observacao = String(r.observacao || '').trim();
    if (p.obrigatoria && !observacao) throw new Error(`A observação de ${p.titulo} é obrigatória.`);
    return { pergunta_id: p.id, competencia: String(p.id), titulo: p.titulo, pergunta: p.pergunta, criterios: p.criterios, obrigatoria: p.obrigatoria, nota, observacao };
  });
  const pontuacaoTotal = normalizadas.reduce((t, r) => t + r.nota, 0);
  const percentual = Math.round((pontuacaoTotal / (normalizadas.length * 10)) * 100);
  const classificacao = percentual <= 49 ? 'Ruim' : percentual <= 79 ? 'Regular' : percentual <= 90 ? 'Bom' : 'Ótimo';
  return { respostas: normalizadas, pontuacaoTotal, percentual, classificacao };
}

function textoSimples(valor) {
  return String(valor || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function alteracoesMip(anterior, posterior) {
  const campos = [['codigo','Código'],['titulo','Título'],['resumo','Resumo'],['objetivo','Objetivo'],['status','Status']];
  const alteracoes = campos.filter(([chave]) => String(anterior[chave] || '') !== String(posterior[chave] || '')).map(([chave,rotulo]) => ({ campo: rotulo, de: String(anterior[chave] || 'Vazio'), para: String(posterior[chave] || 'Vazio') }));
  if (String(anterior.conteudo || '') !== String(posterior.conteudo || '')) alteracoes.push({ campo: 'Conteúdo operacional', de: textoSimples(anterior.conteudo).slice(0,180) || 'Vazio', para: textoSimples(posterior.conteudo).slice(0,180) || 'Vazio' });
  return alteracoes;
}

function alteracoesReceita(anterior, posterior) {
  const alteracoes = [];
  if (String(anterior.titulo || '') !== String(posterior.titulo || '')) alteracoes.push({ campo: 'Nome da receita', de: anterior.titulo || 'Vazio', para: posterior.titulo || 'Vazio' });
  if (Number(anterior.rendimento_base) !== Number(posterior.rendimento_base)) alteracoes.push({ campo: 'Rendimento base', de: String(anterior.rendimento_base), para: String(posterior.rendimento_base) });
  if (String(anterior.peso_pao ?? '') !== String(posterior.peso_pao ?? '')) alteracoes.push({ campo: 'Peso do pão', de: anterior.peso_pao != null ? `${anterior.peso_pao} g` : 'Vazio', para: posterior.peso_pao != null ? `${posterior.peso_pao} g` : 'Vazio' });
  const lista = valor => Array.isArray(valor) ? valor : [];
  const antes = new Map(lista(anterior.ingredientes).map(i => [String(i.nome || '').trim().toLowerCase(), i]));
  const depois = new Map(lista(posterior.ingredientes).map(i => [String(i.nome || '').trim().toLowerCase(), i]));
  for (const [chave, item] of depois) {
    if (!antes.has(chave)) alteracoes.push({ campo: 'Ingrediente adicionado', de: '-', para: `${item.nome}: ${item.quantidade}` });
    else if (String(antes.get(chave).quantidade) !== String(item.quantidade)) alteracoes.push({ campo: `Quantidade de ${item.nome}`, de: String(antes.get(chave).quantidade), para: String(item.quantidade) });
  }
  for (const [chave, item] of antes) if (!depois.has(chave)) alteracoes.push({ campo: 'Ingrediente removido', de: `${item.nome}: ${item.quantidade}`, para: '-' });
  return alteracoes;
}

// AUTH
app.post('/api/auth/login', async (req, res) => {
  const { usuario, senha } = req.body;
  try {
    const result = await pool.query('SELECT * FROM usuarios WHERE email = $1', [usuario]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Usuário não encontrado' });
    const user = result.rows[0];
    const isValid = await bcrypt.compare(senha, user.senha);
    if (!isValid) return res.status(401).json({ error: 'Senha inválida' });
    const token = jwt.sign({ id: user.id, perfil: user.perfil }, JWT_SECRET, { expiresIn: '8h' });
    const categoria = user.categoria_acesso_id ? await pool.query('SELECT nome,permissoes FROM categorias_acesso WHERE id=$1 AND ativo=TRUE',[user.categoria_acesso_id]) : {rows:[]};
    res.json({ token, deve_alterar_senha: Boolean(user.deve_alterar_senha), user: { id: user.id, nome: user.nome, perfil: user.perfil, email: user.email, deve_alterar_senha: Boolean(user.deve_alterar_senha), categoria_acesso_id:user.categoria_acesso_id, categoria_acesso_nome:categoria.rows[0]?.nome||'', permissoes:categoria.rows[0]?.permissoes||[] } });
  } catch (error) { res.status(500).json({ error: 'Erro interno' }); }
});

app.put('/api/usuarios/me/senha', verificarToken, async (req, res) => {
  const { senha_atual, nova_senha } = req.body;
  if (!String(senha_atual || '')) return res.status(400).json({ error: 'Informe sua senha atual ou temporária' });
  if (String(nova_senha || '').length < 6) return res.status(400).json({ error: 'A nova senha precisa ter pelo menos 6 caracteres' });
  try {
    const result = await pool.query('SELECT senha FROM usuarios WHERE id=$1', [req.usuarioId]);
    if (!result.rows.length || !(await bcrypt.compare(senha_atual, result.rows[0].senha))) return res.status(400).json({ error: 'A senha atual ou temporária está incorreta' });
    const hash = await bcrypt.hash(nova_senha, 10);
    await pool.query('UPDATE usuarios SET senha=$1,deve_alterar_senha=FALSE WHERE id=$2', [hash, req.usuarioId]);
    res.json({ mensagem: 'Senha alterada com sucesso.' });
  } catch (error) { res.status(500).json({ error: 'Erro ao alterar senha' }); }
});

app.put('/api/usuarios/:id/redefinir-senha', verificarToken, async (req, res) => {
  if (String(req.usuarioPerfil).toLowerCase() !== 'administrador') return res.status(403).json({ error: 'Acesso negado' });
  const { senha_temporaria } = req.body;
  if (String(senha_temporaria || '').length < 6) return res.status(400).json({ error: 'A senha temporária precisa ter pelo menos 6 caracteres' });
  try {
    const hash = await bcrypt.hash(senha_temporaria, 10);
    const result = await pool.query('UPDATE usuarios SET senha=$1,deve_alterar_senha=TRUE WHERE id=$2 RETURNING id', [hash, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ mensagem: 'Senha temporária definida. O usuário deverá trocá-la no próximo acesso.' });
  } catch (error) { res.status(500).json({ error: 'Erro ao redefinir senha' }); }
});

// BACKUPS DO BANCO — acesso exclusivo do Administrador
app.get('/api/backups', verificarToken, somenteAdministrador, async (_req,res)=>{
  try{
    const arquivos=fs.readdirSync(backupDir).filter(n=>caminhoBackupSeguro(n)).map(nome=>{const s=fs.statSync(path.join(backupDir,nome));return{nome,tamanho:s.size,criado_em:s.mtime};}).sort((a,b)=>new Date(b.criado_em)-new Date(a.criado_em));
    const historico=await pool.query('SELECT b.*,u.nome AS usuario_nome FROM backup_auditoria b LEFT JOIN usuarios u ON u.id=b.usuario_id ORDER BY b.criado_em DESC LIMIT 30');
    res.json({arquivos,historico:historico.rows});
  }catch(error){res.status(500).json({error:'Erro ao listar backups'});}
});

app.post('/api/backups', verificarToken, somenteAdministrador, async (req,res)=>{
  try{const arquivo=await gerarBackup();await pool.query('INSERT INTO backup_auditoria (arquivo,acao,usuario_id) VALUES ($1,$2,$3)',[arquivo.nome,'gerado',req.usuarioId]);res.status(201).json(arquivo);}catch(error){console.error('Erro no backup:',error.message);res.status(500).json({error:'Não foi possível gerar o backup do banco'});}
});

app.get('/api/backups/:nome/download', verificarToken, somenteAdministrador, (req,res)=>{
  const arquivo=caminhoBackupSeguro(req.params.nome);if(!arquivo||!fs.existsSync(arquivo))return res.status(404).json({error:'Backup não encontrado'});res.download(arquivo,req.params.nome);
});

app.delete('/api/backups/:nome', verificarToken, somenteAdministrador, async (req,res)=>{
  const arquivo=caminhoBackupSeguro(req.params.nome);if(!arquivo||!fs.existsSync(arquivo))return res.status(404).json({error:'Backup não encontrado'});fs.unlinkSync(arquivo);await pool.query('INSERT INTO backup_auditoria (arquivo,acao,usuario_id) VALUES ($1,$2,$3)',[req.params.nome,'excluido',req.usuarioId]);res.json({mensagem:'Backup excluído.'});
});

app.post('/api/backups/:nome/restaurar', verificarToken, somenteAdministrador, async (req,res)=>{
  const arquivo=caminhoBackupSeguro(req.params.nome),senha=String(req.body?.senha||'');
  if(!arquivo||!fs.existsSync(arquivo))return res.status(404).json({error:'Backup não encontrado'});
  const adm=await pool.query('SELECT senha FROM usuarios WHERE id=$1',[req.usuarioId]);
  if(!adm.rows.length||!(await bcrypt.compare(senha,adm.rows[0].senha)))return res.status(400).json({error:'Senha do Administrador incorreta'});
  let sqlTemporario='';
  try{
    await gerarBackup('-antes-restauracao');
    sqlTemporario=path.join(backupDir,`.restauracao-${randomUUID()}.sql`);
    await executarArquivo('pg_restore',['--clean','--if-exists','--no-owner','--no-privileges','--file',sqlTemporario,arquivo],{env:ambientePostgres(),timeout:300000});
    const sqlCompativel=fs.readFileSync(sqlTemporario,'utf8')
      .replace(/^SET\s+transaction_timeout\s*=.*;\s*$/gmi,'')
      .replace(/^SET\s+idle_session_timeout\s*=.*;\s*$/gmi,'');
    fs.writeFileSync(sqlTemporario,sqlCompativel);
    await executarArquivo('psql',['-h',process.env.DB_HOST||'db','-U',process.env.DB_USER||'postgres','-d',process.env.DB_NAME||'mips_db','--set','ON_ERROR_STOP=1','--single-transaction','--file',sqlTemporario],{env:ambientePostgres(),timeout:300000});
    await inicializarBancoEAdmin();
    await pool.query('INSERT INTO backup_auditoria (arquivo,acao,usuario_id) VALUES ($1,$2,NULL)',[req.params.nome,'restaurado']);
    res.json({mensagem:'Banco restaurado com sucesso. Entre novamente no sistema.'});
  }catch(error){console.error('Erro na restauração:',error.stderr||error.message);const detalhe=String(error.stderr||error.message||'').trim().split('\n').slice(-2).join(' ').slice(0,500);res.status(500).json({error:`A restauração falhou. O backup automático anterior foi preservado.${detalhe?` Detalhe: ${detalhe}`:''}`});}
  finally{if(sqlTemporario&&fs.existsSync(sqlTemporario))fs.unlinkSync(sqlTemporario);}
});

app.get('/api/configuracoes-portal', async (_req, res) => {
  try {
    const result = await pool.query("SELECT nome_site,logo_site,logo_avaliacao,imagem_login,COALESCE(ajuda_icone,'') AS ajuda_icone,COALESCE(imagem_dashboard,'') AS imagem_dashboard FROM configuracoes_portal WHERE id=1");
    res.json(result.rows[0] || { nome_site: 'Portal - Nova Esperança', logo_site: '', logo_avaliacao: '', imagem_login: '', ajuda_icone: '', imagem_dashboard: '' });
  } catch (error) { res.status(500).json({ error: 'Erro ao carregar identidade visual' }); }
});

app.put('/api/configuracoes-portal', verificarToken, async (req, res) => {
  if (String(req.usuarioPerfil).toLowerCase() !== 'administrador') return res.status(403).json({ error: 'Acesso negado' });
  try {
    // Atualização parcial: cada bloco da personalização salva só o seu campo.
    const atual = (await pool.query("SELECT nome_site,logo_site,logo_avaliacao,imagem_login,COALESCE(ajuda_icone,'') AS ajuda_icone,COALESCE(imagem_dashboard,'') AS imagem_dashboard FROM configuracoes_portal WHERE id=1")).rows[0] || {};
    const nome_site = req.body.nome_site !== undefined ? String(req.body.nome_site).trim() : (atual.nome_site || 'Portal - Nova Esperança');
    const logo_site = req.body.logo_site !== undefined ? String(req.body.logo_site) : (atual.logo_site || '');
    const logo_avaliacao = req.body.logo_avaliacao !== undefined ? String(req.body.logo_avaliacao) : (atual.logo_avaliacao || '');
    const imagem_login = req.body.imagem_login !== undefined ? String(req.body.imagem_login) : (atual.imagem_login || '');
    const ajuda_icone = req.body.ajuda_icone !== undefined ? String(req.body.ajuda_icone) : (atual.ajuda_icone || '');
    const imagem_dashboard = req.body.imagem_dashboard !== undefined ? String(req.body.imagem_dashboard) : (atual.imagem_dashboard || '');
    if (!nome_site) return res.status(400).json({ error: 'Informe o nome do site' });
    const result = await pool.query(`INSERT INTO configuracoes_portal (id,nome_site,logo_site,logo_avaliacao,imagem_login,ajuda_icone,imagem_dashboard,atualizado_em) VALUES (1,$1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP) ON CONFLICT (id) DO UPDATE SET nome_site=EXCLUDED.nome_site,logo_site=EXCLUDED.logo_site,logo_avaliacao=EXCLUDED.logo_avaliacao,imagem_login=EXCLUDED.imagem_login,ajuda_icone=EXCLUDED.ajuda_icone,imagem_dashboard=EXCLUDED.imagem_dashboard,atualizado_em=CURRENT_TIMESTAMP RETURNING nome_site,logo_site,logo_avaliacao,imagem_login,ajuda_icone,imagem_dashboard`, [nome_site, logo_site, logo_avaliacao, imagem_login, ajuda_icone, imagem_dashboard]);
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Erro ao salvar identidade visual' }); }
});

// AJUDA — Lino (chat fake com respostas pré-programadas, editáveis em Configurações).
async function inicializarAjuda() {
  // [pergunta, gatilhos, resposta, nível mínimo de acesso]
  const padrao = [
    ['O que são MIPs?', 'mip,manual,manuais,procedimento,procedimentos', 'Os MIPs são os manuais de procedimento da Nova Esperança: cada um explica o passo a passo de uma tarefa (produção, embalagem, higiene...). Você pode ler, pesquisar e imprimir. Manuais novos passam por revisão antes de serem publicados.', 'funcionario'],
    ['Como encontro um manual (MIP)?', 'mip,mips,encontrar,localizar,pesquisar,buscar,codigo,consultar', 'Abra Manuais (MIPs) no Início ou na barra lateral. Pesquise pelo título ou pelo código (ex.: MIP-01) e toque no cartão para ler. Só aparecem os manuais já publicados.', 'funcionario'],
    ['Como funciona a calculadora de receitas?', 'receita,receitas,rendimento,peso,pao,paes,calculadora,massa,ingrediente,fornada', 'Na página Receitas, abra uma receita e diga quantos pães quer produzir: o sistema calcula o peso de cada ingrediente. O rendimento é automático: soma dos pesos dividida pelo peso unitário do pão.', 'funcionario'],
    ['Onde vejo minhas avaliações?', 'avaliacao,avaliacoes,desempenho,nota,performance,avaliar', 'Suas avaliações ficam em Avaliações (funcionário) ou Meu desempenho (líder e gerente). Todo mês seu responsável registra uma avaliação e você acompanha o histórico por lá.', 'funcionario'],
    ['Como acompanho as reclamações?', 'reclamacao,reclamacoes,acompanhar,metricas,indicadores,painel,cliente,setor,prazo', 'A página Reclamações mostra os indicadores por tipo, setor, líder, cliente e prioridade. Funcionários consultam os números; registrar, editar ou concluir reclamações é tarefa de líderes, gerentes e administradores (ou de quem tiver a permissão).', 'funcionario'],
    ['Como vejo os comunicados?', 'comunicado,comunicados,mural,aviso,avisos,oficial', 'Abra Comunicados pelo atalho do Início. Lá ficam os avisos oficiais da empresa, com data e conteúdo completo.', 'funcionario'],
    ['Para que servem as notificações?', 'notificacao,notificacoes,sino,aviso,avisos,som,apita', 'O sino no canto superior direito junta todos os avisos: reclamações novas, MIPs aguardando revisão ou aprovadas e avaliações publicadas. Ele apita quando chega algo novo e tudo fica registrado para ver depois.', 'funcionario'],
    ['Esqueci minha senha', 'senha,login,entrar,acesso,alterar,esqueci', 'Em Minha senha você troca sua senha quando quiser. Se não consegue entrar, peça ao administrador para redefinir.', 'funcionario'],
    ['Para que serve o Início?', 'inicio,dashboard,painel,atalho,atalhos,campanha,faixa,banner', 'O Início reúne a faixa de campanhas e os atalhos para Manuais, Receitas, Meu desempenho, Reclamações, Comunicados e Notificações. No celular, os atalhos viram cartões grandes para toque.', 'funcionario'],
    ['Quem é você?', 'lino,voce,quem,ajuda,oi,ola,opa,bom dia,boa tarde,boa noite', 'Eu sou o Lino, ajudante do Portal - Nova Esperança! Posso explicar as funções do sistema: pergunte sobre MIPs, receitas, avaliações, reclamações ou senha.', 'funcionario'],

    ['Como criar uma MIP?', 'criar,nova,mip,mips,cadastrar,manual,procedimento', 'Em Manuais (MIPs) → Nova MIP, preencha código, título, resumo, objetivo e conteúdo. Ao salvar, a MIP fica Em Revisão e o Administrador é avisado para aprovar. Você pode salvar como Rascunho e concluir depois.', 'lider'],
    ['Como corrigir uma MIP reprovada?', 'corrigir,correcao,reprovada,reprovado,revisao,editar,reenviar', 'Abra a MIP reprovada, leia as Correções solicitadas pelo Administrador e clique em Editar. Ajuste o conteúdo e salve: a MIP volta para Em Revisão. Ao editar qualquer MIP publicada, ela também retorna para aprovação.', 'lider'],
    ['Como avaliar minha equipe?', 'avaliar,avaliacao,avaliacoes,equipe,funcionario,colaborador,nota,desempenho', 'Em Avaliações → Nova avaliação, escolha o colaborador do seu time e o mês. Responda as competências do modelo, escreva as observações e publique. O funcionário recebe uma notificação e vê o resultado em Meu desempenho. A meta é 80%.', 'lider'],
    ['Como registro uma reclamação?', 'reclamacao,reclamacoes,cliente,mofado,reclamar,queixa', 'Em Reclamações → Nova reclamação, selecione cliente, tipo, líder responsável, setor e descrição. A prioridade e o prazo entram automaticamente pelo tipo; anexe até 10 fotos. O líder, a gerência e a nutri são avisados.', 'lider'],
    ['Como concluir uma reclamação?', 'concluir,reabrir,retorno,prazo,atrasada,status', 'Na lista de Reclamações, cada cartão mostra o prazo. Depois do retorno ao cliente, clique em Confirmar retorno e concluir. Se precisar voltar a tratar, use Reabrir reclamação.', 'lider'],
    ['Como funcionam os prazos das reclamações?', 'prazo,prazos,prioridade,verde,amarelo,vermelho,atraso,urgencia', 'O tipo da reclamação sugere a prioridade: verde (não urgente), amarelo (média) e vermelho (imediata). Cada prioridade tem um prazo configurado pelo Administrador; cartões atrasados ficam destacados em vermelho.', 'lider'],
    ['Onde vejo meu desempenho como líder?', 'meu,desempenho,lider,minha,avaliacao,historico', 'Use Meu desempenho no menu. Líderes são avaliados por gerentes ou administradores; gerentes são avaliados pelo Administrador. Você vê o histórico mensal, o percentual e o gráfico de evolução.', 'lider'],
    ['Como funciona a aprovação das MIPs?', 'aprovacao,aprovar,publicado,publicar,revisao', 'Quem cria ou edita envia a MIP para Em Revisão. Somente o Administrador aprova, reprova com orientações ou publica diretamente. Após a aprovação, o manual fica disponível para todos os funcionários.', 'lider'],

    ['Como avaliar líderes e equipes?', 'avaliar,lider,gerente,equipe,colaborador,avaliacao', 'Em Avaliações você pode registrar avaliações dos líderes e dos demais colaboradores. Escolha o colaborador, o mês e o modelo, responda as competências e publique. Gerentes são avaliados somente pelo Administrador.', 'gerente'],
    ['Como acompanhar o desempenho da equipe?', 'desempenho,equipe,historico,grafico,relatorio,meta,percentual', 'Em Avaliações, use os filtros por colaborador e mês e abra o histórico. É possível imprimir ou compartilhar a avaliação por link. A meta de desempenho é 80%.', 'gerente'],
    ['Como gerenciar as reclamações?', 'gerenciar,reclamacao,reclamacoes,setor,filtro,concluir,acompanhar', 'Em Reclamações, filtre por mês, setor, líder, tipo ou cliente. Veja prazos e prioridades, edite os dados e conclua ou reabra o atendimento. A exclusão de reclamações é exclusiva do Administrador.', 'gerente'],
    ['Como usar os relatórios de reclamações?', 'relatorio,relatorios,metricas,indicadores,imprimir,cliente,setor', 'A página Reclamações reúne gráficos por tipo, setor, líder, cliente, prioridade e mês. Use os filtros e o botão de impressão para gerar o relatório do período.', 'gerente'],
    ['Posso aprovar MIPs?', 'aprovar,publicar,revisao,aprovacao', 'Não. Gerentes podem consultar, criar e editar MIPs, mas a aprovação, a reprovação e a publicação são exclusivas do Administrador. Ao salvar uma edição, a MIP volta para Em Revisão.', 'gerente'],
    ['Como funciona a hierarquia das avaliações?', 'hierarquia,quem,avalia,avaliador,lider,gerente', 'Funcionários são avaliados pelos líderes; líderes, por gerentes ou administradores; gerentes, pelo Administrador. Cada usuário precisa ter um responsável e uma função/modelo de avaliação definidos no cadastro.', 'gerente'],

    ['Como aprovar ou reprovar uma MIP?', 'aprovar,reprovar,mip,correcao,publicar,revisao', 'Abra a MIP Em Revisão. Use Aprovar para publicar ou Reprovar para solicitar correções, explicando o que deve ser ajustado. O autor recebe notificação e, após corrigir, a MIP volta para Em Revisão.', 'administrador'],
    ['Como publicar uma MIP diretamente?', 'publicar,direto,publicado,diretamente,status', 'Ao criar uma MIP, escolha Status Inicial → Publicado Diretamente. Em MIPs já existentes, use Aprovar na tela do manual. Só o Administrador vê essa opção.', 'administrador'],
    ['Como cadastrar um usuário?', 'usuario,usuarios,cadastrar,novo,perfil,importar,planilha', 'Em Usuários → Novo Usuário, informe nome, login, perfil, líder responsável e função/modelo de avaliação. Para Funcionário, Líder e Gerente o responsável e o modelo são obrigatórios. Também é possível importar vários usuários por planilha .xlsx; os importados usam a senha 1234 e trocam no primeiro acesso.', 'administrador'],
    ['Como redefinir a senha de alguém?', 'redefinir,senha,temporaria,usuario,acesso,esqueceu', 'Em Usuários, clique no ícone de chave do usuário, gere ou digite uma senha temporária e confirme. O usuário deverá trocá-la no próximo acesso. A senha antiga não pode ser recuperada.', 'administrador'],
    ['Como criar modelos de avaliação?', 'modelo,modelos,avaliacao,pergunta,perguntas,criterios,copiar', 'Em Configurações → Avaliações, crie um modelo, adicione as competências, perguntas e critérios e marque as que exigem observação. Use Copiar modelo para reaproveitar uma estrutura e depois vincule o modelo ao usuário em Usuários.', 'administrador'],
    ['Como personalizar o portal?', 'configuracao,configuracoes,logo,login,banner,faixa,dashboard,icone,identidade', 'Em Configurações → Portal você troca o nome, logos, imagem do login, faixa do painel inicial e ícone do Lino. As imagens passam por um corte guiado antes de salvar.', 'administrador'],
    ['Como editar os tópicos do Lino?', 'lino,ajuda,topico,topicos,pergunta,resposta,nivel', 'Em Configurações → Ajuda (Lino), cadastre pergunta, palavras-chave, resposta e o nível de acesso (Funcionário, Líder, Gerente ou Administrador). Cada usuário vê os tópicos do seu nível e dos níveis inferiores.', 'administrador'],
    ['Como gerar etiquetas e caixas?', 'etiqueta,etiquetas,pimaco,caixa,caixas,imprimir,impressao,ferramenta', 'Em Ferramentas, abra Etiquetas (Pimaco 6187) ou Pacotes e Caixas. Preencha os dados, ajuste a impressão e use uma impressora compatível. As regras de turnos e clientes são aplicadas automaticamente.', 'administrador'],
    ['Como gerar ou restaurar um backup?', 'backup,backups,restaurar,copia,seguranca,postgres', 'Em Configurações → Backup do banco, clique em Gerar backup agora para criar uma cópia. Para restaurar, escolha um arquivo, informe sua senha de Administrador e confirme; o sistema cria antes um backup automático do estado atual.', 'administrador'],
    ['Como gerenciar os catálogos de reclamações?', 'catalogo,catalogos,cliente,clientes,tipo,tipos,setor,setores,prazos', 'Em Configurações → Reclamações, cadastre clientes, tipos, setores e prazos por prioridade. O tipo define a prioridade sugerida e o setor aparece na reclamação a partir do líder responsável.', 'administrador'],
    ['Como excluir uma reclamação?', 'excluir,apagar,reclamacao,definitivamente', 'Somente o Administrador pode excluir definitivamente uma reclamação. Na lista, use o ícone de lixeira no cartão. Para encerrar sem apagar, use Confirmar retorno e concluir.', 'administrador'],
  ];
  for (const [pergunta, gatilhos, resposta, nivel] of padrao) {
    const existe = await pool.query('SELECT id FROM ajuda_respostas WHERE pergunta=$1 LIMIT 1', [pergunta]);
    if (!existe.rows.length) {
      await pool.query('INSERT INTO ajuda_respostas (pergunta,gatilhos,resposta,nivel) VALUES ($1,$2,$3,$4)', [pergunta, gatilhos, resposta, nivel]);
    } else if (nivel !== 'funcionario') {
      // Migra as respostas antigas (que nasceram sem nível) sem sobrescrever
      // uma classificação já ajustada manualmente pelo Administrador.
      await pool.query("UPDATE ajuda_respostas SET nivel=$2 WHERE pergunta=$1 AND nivel='funcionario'", [pergunta, nivel]);
    }
  }
  await pool.query(`UPDATE ajuda_respostas SET gatilhos='lino,voce,quem,ajuda,oi,ola,opa,bom dia,boa tarde,boa noite', resposta='Eu sou o Lino, ajudante do Portal - Nova Esperança! Posso explicar as funções do sistema: pergunte sobre MIPs, receitas, avaliações, reclamações ou senha.' WHERE pergunta='Quem é você?' AND resposta LIKE '%mascote%'`);
  await pool.query("UPDATE ajuda_respostas SET nivel='administrador' WHERE pergunta='O que são as Etiquetas?' AND nivel='funcionario'");
  // Renome 19/09/2026: Portal MIPs → Portal - Nova Esperança (atualiza linhas já gravadas).
  await pool.query(`UPDATE ajuda_respostas SET resposta = REPLACE(resposta, 'Portal MIPs', 'Portal - Nova Esperança') WHERE resposta LIKE '%Portal MIPs%'`);
}
app.get('/api/ajuda/respostas', verificarToken, async (req, res) => {
  const r = await pool.query(`SELECT id,pergunta,gatilhos,resposta,nivel FROM ajuda_respostas WHERE ativo=TRUE ORDER BY CASE nivel WHEN 'funcionario' THEN 0 WHEN 'lider' THEN 1 WHEN 'gerente' THEN 2 ELSE 3 END, id`);
  res.json(filtrarPorNivel(r.rows, req.usuarioPerfil));
});
app.post('/api/configuracoes/ajuda/respostas', verificarToken, async (req, res) => {
  if (normalizarPerfil(req.usuarioPerfil) !== 'administrador') return res.status(403).json({ error: 'Acesso negado' });
  const pergunta = String(req.body?.pergunta || '').trim(), resposta = String(req.body?.resposta || '').trim(), gatilhos = String(req.body?.gatilhos || '').trim();
  const nivel = String(req.body?.nivel || 'funcionario').toLowerCase();
  if (pergunta.length < 3 || resposta.length < 3) return res.status(400).json({ error: 'Informe a pergunta e a resposta' });
  if (!NIVEIS_AJUDA.includes(nivel)) return res.status(400).json({ error: 'Nível de acesso inválido' });
  const r = await pool.query('INSERT INTO ajuda_respostas (pergunta,gatilhos,resposta,nivel) VALUES ($1,$2,$3,$4) RETURNING *', [pergunta, gatilhos, resposta, nivel]);
  res.status(201).json(r.rows[0]);
});
app.put('/api/configuracoes/ajuda/respostas/:id', verificarToken, async (req, res) => {
  if (normalizarPerfil(req.usuarioPerfil) !== 'administrador') return res.status(403).json({ error: 'Acesso negado' });
  const sets = [], vals = [];
  for (const [campo, minimo] of [['pergunta', 3], ['gatilhos', 0], ['resposta', 3]]) {
    if (req.body?.[campo] !== undefined) {
      const v = String(req.body[campo] || '').trim();
      if (v.length < minimo) return res.status(400).json({ error: 'Texto muito curto' });
      vals.push(v); sets.push(`${campo}=$${vals.length}`);
    }
  }
  if (req.body?.nivel !== undefined) {
    const nivel = String(req.body.nivel || '').toLowerCase();
    if (!NIVEIS_AJUDA.includes(nivel)) return res.status(400).json({ error: 'Nível de acesso inválido' });
    vals.push(nivel); sets.push(`nivel=$${vals.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar' });
  vals.push(req.params.id);
  const r = await pool.query(`UPDATE ajuda_respostas SET ${sets.join(', ')} WHERE id=$${vals.length} AND ativo=TRUE RETURNING *`, vals);
  if (!r.rows.length) return res.status(404).json({ error: 'Resposta não encontrada' });
  res.json(r.rows[0]);
});
app.delete('/api/configuracoes/ajuda/respostas/:id', verificarToken, async (req, res) => {
  if (normalizarPerfil(req.usuarioPerfil) !== 'administrador') return res.status(403).json({ error: 'Acesso negado' });
  await pool.query('UPDATE ajuda_respostas SET ativo=FALSE WHERE id=$1', [req.params.id]);
  res.json({ mensagem: 'Resposta desativada.' });
});

// DASHBOARD
app.get('/api/dashboard', verificarToken, async (req, res) => {
  try {
    const mips = await pool.query('SELECT COUNT(*) FROM mips');
    const users = await pool.query('SELECT COUNT(*) FROM usuarios');
    const cats = await pool.query('SELECT COUNT(*) FROM categorias');
    const pendentes = await pool.query(`
      SELECT COUNT(*) FROM usuarios u
      WHERE u.modelo_avaliacao_id IS NOT NULL ${String(req.usuarioPerfil).toLowerCase()==='editor'?'AND LOWER(u.perfil)=\'leitor\' AND u.lider_id=$1':''} AND NOT EXISTS (
        SELECT 1 FROM avaliacoes a
        WHERE a.usuario_avaliado_id = u.id AND a.mes_referencia = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
      )
    `, String(req.usuarioPerfil).toLowerCase()==='editor'?[req.usuarioId]:[]);
    res.json({
      totalMips: parseInt(mips.rows[0].count),
      totalUsuarios: parseInt(users.rows[0].count),
      totalCategorias: parseInt(cats.rows[0].count),
      avaliacoesPendentes: parseInt(pendentes.rows[0].count),
    });
  } catch (error) { res.status(500).json({ error: 'Erro no dashboard' }); }
});

// UPLOAD
app.post('/api/upload', verificarToken, upload.single('image'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo' });
    // URL relativa: o frontend serve /uploads/ via proxy na mesma origem,
    // então a imagem funciona por IP ou hostname, sem depender da porta 7001.
    res.json({ url: `/uploads/${req.file.filename}` });
  } catch (err) { res.status(500).json({ error: 'Erro upload' }); }
});

// MIPS
app.get('/api/mips', verificarToken, async (req, res) => {
  try {
    let query = `SELECT m.*, u.nome as autor_nome FROM mips m LEFT JOIN usuarios u ON m.autor_id = u.id`;
    if (['leitor','rh'].includes(normalizarPerfil(req.usuarioPerfil))) query += ` WHERE m.status = 'Publicado'`;
    query += ` ORDER BY m.criado_em DESC`;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Erro listar' }); }
});

// Avisos contextuais de MIPs. O navegador registra localmente quais avisos já
// foram lidos; a API sempre devolve o estado atual, sem criar dados descartáveis
// no banco.
app.get('/api/mips-notificacoes', verificarToken, async (req, res) => {
  try {
    const perfil = normalizarPerfil(req.usuarioPerfil);
    const parametros = [];
    let filtro;
    if (perfil === 'administrador') {
      filtro = "m.status = 'Em Revisão'";
    } else {
      parametros.push(req.usuarioId);
      filtro = "m.autor_id = $1 AND m.status IN ('Publicado','Reprovado')";
    }
    const resultado = await pool.query(
      `SELECT m.id,m.codigo,m.titulo,m.status,m.orientacao_correcao,m.atualizado_em
       FROM mips m WHERE ${filtro} ORDER BY m.atualizado_em DESC, m.id DESC LIMIT 20`,
      parametros
    );
    res.json(resultado.rows.map(m => ({
      ...m,
      tipo: m.status === 'Reprovado' ? 'correcao' : m.status === 'Publicado' ? 'aprovacao' : 'revisao'
    })));
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar notificações de MIPs' });
  }
});

app.get('/api/mips/buscar', verificarToken, async (req, res) => {
  const { q } = req.query;
  try {
    let query = `SELECT m.*, u.nome as autor_nome FROM mips m LEFT JOIN usuarios u ON m.autor_id = u.id WHERE m.search_vector @@ plainto_tsquery('portuguese', $1)`;
    if (['leitor','rh'].includes(normalizarPerfil(req.usuarioPerfil))) query += ` AND m.status = 'Publicado'`;
    query += ` ORDER BY m.criado_em DESC`;
    const result = await pool.query(query, [q]);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Erro busca' }); }
});

app.get('/api/mips/:id', verificarToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`SELECT m.*, u.nome as autor_nome FROM mips m LEFT JOIN usuarios u ON m.autor_id = u.id WHERE m.id = $1`, [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'MIP não encontrada' });
    // Funcionário e perfil RH só leem MIPs publicadas.
    if (['leitor','rh'].includes(normalizarPerfil(req.usuarioPerfil)) && result.rows[0].status !== 'Publicado') {
      return res.status(403).json({ error: 'MIP não disponível' });
    }
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Erro buscar' }); }
});

app.post('/api/mips', verificarToken, async (req, res) => {
  if (['leitor','rh'].includes(normalizarPerfil(req.usuarioPerfil))) return res.status(403).json({ error: 'Acesso negado' });
  const { codigo, titulo, resumo, objetivo, conteudo, status } = req.body;
  let s = (normalizarPerfil(req.usuarioPerfil) !== 'administrador' && status === 'Publicado') ? 'Em Revisão' : status;
  try {
    const r = await pool.query(
      `INSERT INTO mips (codigo, titulo, resumo, objetivo, conteudo, status, autor_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [codigo||'MIP-GERAL', titulo||'Sem Título', resumo||'', objetivo||'', conteudo||'', s||'Em Revisão', req.usuarioId]
    );
    if ((s || 'Em Revisão') === 'Em Revisão') notificarAdminsMip('mip_revisao', 'MIP aguardando revisão', `${codigo || 'MIP-GERAL'} — ${titulo || 'Sem Título'}`, r.rows[0].id);
    res.status(201).json({ id: r.rows[0].id, mensagem: 'Salvo!' });
  } catch (err) { res.status(500).json({ error: 'Erro salvar' }); }
});

app.put('/api/mips/:id', verificarToken, async (req, res) => {
  if (['leitor','rh'].includes(normalizarPerfil(req.usuarioPerfil))) return res.status(403).json({ error: 'Acesso negado' });
  const { codigo, titulo, resumo = '', objetivo = '', conteudo = '', status = 'Em Revisão' } = req.body;
  const novoStatus = 'Em Revisão';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const atual = await client.query('SELECT * FROM mips WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!atual.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'MIP não encontrada' }); }
    const m = atual.rows[0];
    await client.query(`INSERT INTO mip_versoes (mip_id,codigo,titulo,resumo,objetivo,conteudo,status,alterado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [m.id,m.codigo,m.titulo,m.resumo,m.objetivo,m.conteudo,m.status,req.usuarioId]);
    await client.query(`UPDATE mips SET codigo=$1,titulo=$2,resumo=$3,objetivo=$4,conteudo=$5,status=$6,orientacao_correcao='',atualizado_em=CURRENT_TIMESTAMP WHERE id=$7`, [codigo,titulo,resumo,objetivo,conteudo,novoStatus,req.params.id]);
    await client.query('COMMIT');
    notificarAdminsMip('mip_revisao', 'MIP aguardando revisão', `${codigo} — ${titulo}`, req.params.id);
    res.json({ mensagem: 'MIP atualizada e enviada novamente para aprovação do Administrador.', status: novoStatus });
  } catch (error) { await client.query('ROLLBACK'); res.status(500).json({ error: 'Erro ao atualizar MIP' }); }
  finally { client.release(); }
});

app.get('/api/mips/:id/versoes', verificarToken, async (req, res) => {
  if (['leitor','rh'].includes(normalizarPerfil(req.usuarioPerfil))) return res.status(403).json({ error: 'Acesso negado' });
  const [historico, atual] = await Promise.all([
    pool.query(`SELECT v.*,u.nome AS alterado_por_nome FROM mip_versoes v LEFT JOIN usuarios u ON u.id=v.alterado_por WHERE v.mip_id=$1 ORDER BY v.criado_em ASC`, [req.params.id]),
    pool.query('SELECT * FROM mips WHERE id=$1', [req.params.id]),
  ]);
  if (!atual.rows.length) return res.status(404).json({ error: 'MIP não encontrada' });
  const linhas = historico.rows.map((v, indice) => ({ ...v, numero_versao: indice + 1, alteracoes: alteracoesMip(v, historico.rows[indice + 1] || atual.rows[0]) })).reverse();
  res.json(linhas);
});

app.patch('/api/mips/:id/aprovar', verificarToken, async (req, res) => {
  if (req.usuarioPerfil !== 'Administrador') return res.status(403).json({ error: 'Acesso negado' });
  try { const r = await pool.query("UPDATE mips SET status = 'Publicado', orientacao_correcao='', atualizado_em=CURRENT_TIMESTAMP WHERE id = $1 RETURNING id,autor_id,codigo,titulo", [req.params.id]); if (r.rows.length) { const m = r.rows[0]; criarNotificacao(m.autor_id, 'mip_aprovacao', 'MIP aprovada', `${m.codigo} — ${m.titulo}`, `/mips/${m.id}`, `mip:${m.id}`); } res.json({ mensagem: 'Aprovada!' }); } 
  catch (error) { res.status(500).json({ error: 'Erro aprovar' }); }
});

app.patch('/api/mips/:id/reprovar', verificarToken, async (req, res) => {
  if (normalizarPerfil(req.usuarioPerfil) !== 'administrador') return res.status(403).json({ error: 'Acesso negado' });
  const orientacao = String(req.body?.orientacao || '').trim();
  if (orientacao.length < 5) return res.status(400).json({ error: 'Descreva claramente as correções necessárias' });
  try {
    const result = await pool.query("UPDATE mips SET status='Reprovado', orientacao_correcao=$1, atualizado_em=CURRENT_TIMESTAMP WHERE id=$2 RETURNING id,autor_id,codigo,titulo", [orientacao, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'MIP não encontrada' });
    const m = result.rows[0];
    criarNotificacao(m.autor_id, 'mip_correcao', 'Correções solicitadas', `${m.codigo} — ${m.titulo}: ${orientacao}`, `/mips/${m.id}`, `mip:${m.id}`);
    res.json({ mensagem: 'MIP devolvida ao autor para correção.' });
  } catch (error) { res.status(500).json({ error: 'Erro ao reprovar MIP' }); }
});

app.delete('/api/mips/:id', verificarToken, async (req, res) => {
  if (['leitor','rh'].includes(normalizarPerfil(req.usuarioPerfil))) return res.status(403).json({ error: 'Acesso negado' });
  try { await pool.query('DELETE FROM mips WHERE id = $1', [req.params.id]); res.json({ mensagem: 'Excluída' }); } 
  catch (error) { res.status(500).json({ error: 'Erro excluir' }); }
});

// USUÁRIOS
async function salvarSetoresUsuario(usuarioId, setorIds) {
  const ids = Array.isArray(setorIds) ? [...new Set(setorIds.map(Number).filter(Number.isInteger))] : [];
  if (ids.length) {
    const conf = await pool.query('SELECT COUNT(*)::int AS total FROM setores_reclamacao WHERE id=ANY($1::int[]) AND ativo=TRUE', [ids]);
    if (Number(conf.rows[0].total) !== ids.length) throw Object.assign(new Error('Selecione setores válidos'), { status: 400 });
  }
  await pool.query('DELETE FROM usuario_setores WHERE usuario_id=$1', [usuarioId]);
  for (const id of ids) await pool.query('INSERT INTO usuario_setores (usuario_id,setor_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [usuarioId, id]);
}
app.get('/api/usuarios', verificarToken, async (req, res) => {
  if (String(req.usuarioPerfil || '').toLowerCase() !== 'administrador') return res.status(403).json({ error: 'Acesso negado' });
  try {
    const result = await pool.query(`SELECT u.id,u.nome,u.email,u.perfil,u.setor,u.cargo,u.matricula,u.cpf,u.lider_id,l.nome AS lider_nome,u.modelo_avaliacao_id,m.nome AS modelo_avaliacao_nome,u.categoria_acesso_id,ca.nome AS categoria_acesso_nome,u.deve_alterar_senha,u.criado_em,COALESCE((SELECT JSON_AGG(JSON_BUILD_OBJECT('id',s.id,'nome',s.nome) ORDER BY s.nome) FROM usuario_setores us JOIN setores_reclamacao s ON s.id=us.setor_id WHERE us.usuario_id=u.id),'[]'::json) AS setores FROM usuarios u LEFT JOIN usuarios l ON l.id=u.lider_id LEFT JOIN modelos_avaliacao m ON m.id=u.modelo_avaliacao_id LEFT JOIN categorias_acesso ca ON ca.id=u.categoria_acesso_id ORDER BY u.nome`);
    const linhas = result.rows.map(r => ({ ...r, setor_ids: Array.isArray(r.setores) ? r.setores.map(s => s.id) : [] }));
    res.json(linhas);
  } catch (error) { res.status(500).json({ error: 'Erro' }); }
});

app.post('/api/usuarios', verificarToken, async (req, res) => {
  if (String(req.usuarioPerfil || '').toLowerCase() !== 'administrador') return res.status(403).json({ error: 'Acesso negado' });
  const { nome, email, senha, perfil, lider_id = null, modelo_avaliacao_id = null, categoria_acesso_id = null, setor_ids = [], matricula = '', cpf = '' } = req.body;
  if (!['leitor','editor','gerente','rh','administrador'].includes(normalizarPerfil(perfil))) return res.status(400).json({ error: 'Perfil inválido' });
  if (['leitor','editor','gerente'].includes(normalizarPerfil(perfil)) && !lider_id) return res.status(400).json({ error: 'Selecione o responsável pela avaliação deste usuário' });
  try {
    const hash = await bcrypt.hash(senha, 10);
    if (lider_id) {
      const perfilUsuario = normalizarPerfil(perfil);
      const perfisPermitidos = perfilUsuario === 'leitor' ? ['editor'] : perfilUsuario === 'editor' ? ['gerente','administrador'] : ['administrador'];
      const lider=await pool.query('SELECT id FROM usuarios WHERE id=$1 AND LOWER(perfil)=ANY($2::text[])',[Number(lider_id),perfisPermitidos]);
      if(!lider.rows.length)return res.status(400).json({error:'O responsável selecionado não possui o perfil adequado'});
    }
    let nomeModelo = '';
    if(modelo_avaliacao_id){const modelo=await pool.query('SELECT id,nome FROM modelos_avaliacao WHERE id=$1 AND ativo=TRUE',[Number(modelo_avaliacao_id)]);if(!modelo.rows.length)return res.status(400).json({error:'Modelo de avaliação inválido'});nomeModelo=modelo.rows[0].nome;}
    if(['leitor','editor','gerente'].includes(normalizarPerfil(perfil)) && !modelo_avaliacao_id) return res.status(400).json({error:'Selecione a função/modelo de avaliação'});
    const recebeAvaliacao = ['leitor','editor','gerente'].includes(normalizarPerfil(perfil));
    const result = await pool.query('INSERT INTO usuarios (nome,email,senha,perfil,setor,cargo,matricula,cpf,lider_id,modelo_avaliacao_id,categoria_acesso_id,deve_alterar_senha) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE) RETURNING id', [nome,email,hash,perfil,nomeModelo,nomeModelo,String(matricula||'').trim(),String(cpf||'').trim(),recebeAvaliacao?Number(lider_id):null,recebeAvaliacao&&modelo_avaliacao_id?Number(modelo_avaliacao_id):null,categoria_acesso_id?Number(categoria_acesso_id):null]);
    try { await salvarSetoresUsuario(result.rows[0].id, setor_ids); }
    catch (e) { return res.status(e.status || 500).json({ error: e.message }); }
    res.status(201).json({ id: result.rows[0].id, mensagem: 'Criado!' });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Este usuário de acesso já está cadastrado' });
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

app.put('/api/usuarios/:id', verificarToken, async (req, res) => {
  if (String(req.usuarioPerfil).toLowerCase() !== 'administrador') return res.status(403).json({ error: 'Acesso negado' });
  const { nome, email, perfil, lider_id = null, modelo_avaliacao_id = null, categoria_acesso_id = null, setor_ids = null, matricula, cpf } = req.body;
  const perfilNormalizado = String(perfil || '').toLowerCase();
  if (String(req.params.id) === String(req.usuarioId) && perfilNormalizado !== 'administrador') return res.status(400).json({ error: 'O Administrador não pode remover o próprio acesso administrativo' });
  if (!String(nome || '').trim() || !String(email || '').trim() || !['leitor','editor','gerente','rh','administrador'].includes(perfilNormalizado)) return res.status(400).json({ error: 'Preencha nome, login e perfil corretamente' });
  if (['leitor','editor','gerente'].includes(perfilNormalizado) && !lider_id) return res.status(400).json({ error: 'Selecione o responsável pela avaliação deste usuário' });
  try {
    let nomeModelo = '';
    if (modelo_avaliacao_id) { const m=await pool.query('SELECT nome FROM modelos_avaliacao WHERE id=$1 AND ativo=TRUE',[Number(modelo_avaliacao_id)]);if(!m.rows.length)return res.status(400).json({error:'Modelo de avaliação inválido'});nomeModelo=m.rows[0].nome; }
    if (['leitor','editor','gerente'].includes(perfilNormalizado) && !modelo_avaliacao_id) return res.status(400).json({ error: 'Selecione a função/modelo de avaliação' });
    if (lider_id) {
      const permitidos=perfilNormalizado==='leitor'?['editor']:perfilNormalizado==='editor'?['gerente','administrador']:['administrador'];
      const r=await pool.query('SELECT id FROM usuarios WHERE id=$1 AND LOWER(perfil)=ANY($2::text[])',[Number(lider_id),permitidos]);
      if(!r.rows.length)return res.status(400).json({error:'O responsável selecionado não possui o perfil adequado'});
    }
    const recebeAvaliacao=['leitor','editor','gerente'].includes(perfilNormalizado);
    const result=await pool.query('UPDATE usuarios SET nome=$1,email=$2,perfil=$3,setor=$4,cargo=$4,matricula=COALESCE($9,matricula),cpf=COALESCE($10,cpf),lider_id=$5,modelo_avaliacao_id=$6,categoria_acesso_id=$7 WHERE id=$8 RETURNING id',[nome.trim(),email.trim(),perfil,nomeModelo,recebeAvaliacao?Number(lider_id):null,recebeAvaliacao&&modelo_avaliacao_id?Number(modelo_avaliacao_id):null,categoria_acesso_id?Number(categoria_acesso_id):null,req.params.id,matricula!==undefined?String(matricula).trim():null,cpf!==undefined?String(cpf).trim():null]);
    if(!result.rows.length)return res.status(404).json({error:'Usuário não encontrado'});
    if (setor_ids !== null && setor_ids !== undefined) {
      try { await salvarSetoresUsuario(Number(req.params.id), setor_ids); }
      catch (e) { return res.status(e.status || 500).json({ error: e.message }); }
    }
    res.json({mensagem:'Perfil atualizado com sucesso.'});
  } catch (error) { if(error.code==='23505')return res.status(409).json({error:'Este login já está sendo utilizado'});res.status(500).json({error:'Erro ao atualizar usuário'}); }
});

app.delete('/api/usuarios/:id', verificarToken, async (req, res) => {
  if (String(req.usuarioPerfil || '').toLowerCase() !== 'administrador') return res.status(403).json({ error: 'Acesso negado' });
  try {
    if (String(req.params.id) === String(req.usuarioId)) return res.status(400).json({ error: 'Não exclua a si mesmo' });
    await pool.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
    res.json({ mensagem: 'Excluído!' });
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

// IMPORTAÇÃO DE USUÁRIOS POR PLANILHA (cadastro em massa, senha padrão "1234").
// Colunas do modelo (aba "Usuarios"): nome | login | perfil | matricula | cpf |
// responsavel_login | funcao_modelo | categoria_acesso | setores.
// - perfil aceito: Funcionario (ou Leitor), Lider (ou Editor), Gerente, Administrador.
// - Funcionario/Lider/Gerente exigem responsavel_login + funcao_modelo.
// - categoria_acesso e setores são opcionais (setores separados por ";" ou ",").
// - Todos os criados recebem senha padrão "1234" (hash bcrypt) + deve_alterar_senha=TRUE.
const SENHA_PADRAO_IMPORTACAO_USUARIOS = '1234';
const importarUsuariosXLSX = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const normalizarPerfilImportacao = (valor) => {
  const v = String(valor || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (['funcionario', 'funcionarios', 'leitor', 'colaborador', 'colaboradores'].includes(v)) return 'Leitor';
  if (['lider', 'lideres', 'editor', 'lideranca'].includes(v)) return 'Editor';
  if (['gerente', 'gerentes', 'gestor', 'gestores'].includes(v)) return 'Gerente';
  if (['rh', 'r.h', 'recursos humanos', 'recursoshumanos', 'rhumanos'].includes(v)) return 'RH';
  if (['administrador', 'administradores', 'admin', 'adm'].includes(v)) return 'Administrador';
  return null;
};
const CABECALHO_USUARIOS = ['nome', 'login', 'perfil', 'matricula', 'cpf', 'responsavel_login', 'funcao_modelo', 'categoria_acesso', 'setores'];

// Modelo da planilha para download (abas "Usuarios" + "Listas" oculta + "Instruções").
// As listas suspensas são geradas na hora com os dados atuais do banco: todo
// Líder/Gerente/Administrador cadastrado (inclusive adicionado manualmente) já
// aparece como opção em responsavel_login; funções, categorias e setores idem.
// Basta baixar o modelo de novo para ver os cadastros mais recentes.
const MAX_LINHAS_MODELO_USUARIOS = 500;
app.get('/api/usuarios/modelo-planilha', verificarToken, somenteAdministrador, async (req, res) => {
  if (!XLSX) return res.status(500).json({ error: 'Gerador de planilha indisponível no servidor' });
  try {
    const [usuariosDb, modelosDb, categoriasDb, setoresDb] = await Promise.all([
      pool.query(`SELECT email FROM usuarios WHERE LOWER(perfil) IN ('editor','gerente','administrador') ORDER BY email`),
      pool.query('SELECT nome FROM modelos_avaliacao WHERE ativo=TRUE ORDER BY nome'),
      pool.query('SELECT nome FROM categorias_acesso ORDER BY nome'),
      pool.query('SELECT nome FROM setores_reclamacao WHERE ativo=TRUE ORDER BY nome'),
    ]);
    const unicos = (lista) => [...new Set(lista.map((v) => String(v || '').trim()).filter(Boolean))].slice(0, 200);
    const responsaveis = unicos(usuariosDb.rows.map((u) => u.email));
    const funcoes = unicos(modelosDb.rows.map((m) => m.nome));
    const categorias = unicos(categoriasDb.rows.map((c) => c.nome));
    const setores = unicos(setoresDb.rows.map((s) => s.nome));
    // Aba "Usuarios": só o cabeçalho — colunas C, F, G, H e I têm lista suspensa.
    const ws = XLSX.utils.aoa_to_sheet([CABECALHO_USUARIOS]);
    ws['!cols'] = [
      { wch: 26 }, { wch: 18 }, { wch: 15 }, { wch: 12 }, { wch: 18 },
      { wch: 20 }, { wch: 24 }, { wch: 20 }, { wch: 28 },
    ];
    // Aba "Listas" (oculta): opções vivas do banco que alimentam as suspensas.
    const listasAoa = [['responsavel_login (quem pode avaliar)', 'funcao_modelo (nome exato)', 'categoria_acesso (nome exato)', 'setores (combine com " ; ")']];
    const altura = Math.max(responsaveis.length, funcoes.length, categorias.length, setores.length, 1);
    for (let i = 0; i < altura; i++) listasAoa.push([responsaveis[i] || '', funcoes[i] || '', categorias[i] || '', setores[i] || '']);
    const wsListas = XLSX.utils.aoa_to_sheet(listasAoa);
    wsListas['!cols'] = [{ wch: 36 }, { wch: 36 }, { wch: 36 }, { wch: 36 }];
    const instrucoes = [
      ['IMPORTAÇÃO DE USUÁRIOS — COMO PREENCHER'],
      [''],
      ['1. Preencha uma linha por usuário na aba "Usuarios". Não altere o nome das colunas.'],
      ['2. As colunas perfil, responsavel_login, funcao_modelo, categoria_acesso e setores já vêm com LISTA SUSPENSA (setinha na célula) preenchida com os dados atuais do sistema — é só escolher. Também dá para digitar.'],
      [`3. Cadastrou um Líder, função, categoria ou setor novo? Baixe o modelo de novo: as listas são geradas na hora (${responsaveis.length} responsável(is), ${funcoes.length} função(ões), ${categorias.length} categoria(s), ${setores.length} setor(es) neste arquivo).`],
      ['4. Colunas obrigatórias: nome | login | perfil.'],
      ['5. Perfil aceito (pode usar qualquer um destes nomes):'],
      ['   - Funcionario (ou Leitor): quem recebe avaliação de um Líder.'],
      ['   - Lider (ou Editor): avaliado por um Gerente ou Administrador.'],
      ['   - Gerente: avaliado por um Administrador.'],
      ['   - RH: acesso aos módulos de RH (ASO, Banco de Horas, Folgas, Atendimento e Comunicados) — sem responsável e sem função.'],
      ['   - Administrador: acesso total, sem responsável e sem função.'],
      ['6. Para Funcionario, Lider e Gerente, escolha também: responsavel_login (quem avalia) + funcao_modelo (nome exato da função).'],
      ['7. Opcionais: matricula | cpf | categoria_acesso | setores (para mais de um setor, combine com " ; " — ex.: Produção; Embalagem).'],
      ['8. Exemplo de linha: Maria Silva | maria.silva | Funcionario | 1001 | 123.456.789-00 | aline | Embalagem | (vazio) | Embalagem; Logística'],
      ['9. SENHA PADRÃO: todos os usuários importados recebem a senha "1234".'],
      ['   Cada pessoa deve trocar a senha no primeiro acesso (o sistema exige a troca).'],
      ['10. Se o login já existir no sistema, aquela linha é ignorada (relatório mostra o motivo).'],
      ['11. Salve o arquivo como .xlsx e importe na tela Gerenciamento de Usuários → Importar planilha.'],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(instrucoes);
    ws2['!cols'] = [{ wch: 115 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Usuarios');
    XLSX.utils.book_append_sheet(wb, wsListas, 'Listas');
    XLSX.utils.book_append_sheet(wb, ws2, 'Instruções');
    let buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    // Listas suspensas (validação de dados) aplicadas direto no XML, pois o gerador
    // não as emite. Se algo falhar, o modelo é entregue mesmo assim, só sem as setinhas.
    try {
      if (AdmZip) {
        const fim = 1 + MAX_LINHAS_MODELO_USUARIOS; // linhas 2..501 (limite da importação)
        const validacoes = ['<dataValidation type="list" allowBlank="1" showErrorMessage="0" sqref="C2:C' + fim + '"><formula1>"Funcionario,Lider,Gerente,RH,Administrador"</formula1></dataValidation>'];
        if (responsaveis.length) validacoes.push('<dataValidation type="list" allowBlank="1" showErrorMessage="0" sqref="F2:F' + fim + '"><formula1>Listas!$A$2:$A$' + (1 + responsaveis.length) + '</formula1></dataValidation>');
        if (funcoes.length) validacoes.push('<dataValidation type="list" allowBlank="1" showErrorMessage="0" sqref="G2:G' + fim + '"><formula1>Listas!$B$2:$B$' + (1 + funcoes.length) + '</formula1></dataValidation>');
        if (categorias.length) validacoes.push('<dataValidation type="list" allowBlank="1" showErrorMessage="0" sqref="H2:H' + fim + '"><formula1>Listas!$C$2:$C$' + (1 + categorias.length) + '</formula1></dataValidation>');
        // Setores também têm setinha (escolha um e complete com " ; " para combinar vários).
        if (setores.length) validacoes.push('<dataValidation type="list" allowBlank="1" showErrorMessage="0" sqref="I2:I' + fim + '"><formula1>Listas!$D$2:$D$' + (1 + setores.length) + '</formula1></dataValidation>');
        const zip = new AdmZip(buf);
        const wbEntry = zip.getEntry('xl/workbook.xml');
        if (wbEntry) {
          const wbXml = zip.readAsText(wbEntry).replace('<sheet name="Listas"', '<sheet name="Listas" state="hidden"');
          zip.deleteFile('xl/workbook.xml');
          zip.addFile('xl/workbook.xml', Buffer.from(wbXml, 'utf8'));
        }
        const wsEntry = zip.getEntry('xl/worksheets/sheet1.xml');
        if (wsEntry) {
          const wsXml = zip.readAsText(wsEntry);
          if (wsXml.includes('</sheetData>')) {
            const bloco = '<dataValidations count="' + validacoes.length + '">' + validacoes.join('') + '</dataValidations>';
            zip.deleteFile('xl/worksheets/sheet1.xml');
            zip.addFile('xl/worksheets/sheet1.xml', Buffer.from(wsXml.replace('</sheetData>', '</sheetData>' + bloco), 'utf8'));
            buf = zip.toBuffer();
          }
        }
      }
    } catch (e) { console.error('Modelo de usuários entregue sem listas suspensas:', e.message); }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="modelo-importacao-usuarios.xlsx"');
    res.send(buf);
  } catch (e) { res.status(500).json({ error: 'Erro ao gerar o modelo da planilha' }); }
});

// Importação em massa: recebe .xlsx (campo "arquivo"), cria usuários com senha "1234".
app.post('/api/usuarios/importar', verificarToken, somenteAdministrador, importarUsuariosXLSX.single('arquivo'), async (req, res) => {
  if (!XLSX) return res.status(500).json({ error: 'Leitor de planilha indisponível no servidor' });
  if (!req.file) return res.status(400).json({ error: 'Anexe a planilha (.xlsx) preenchida a partir do modelo' });
  let registros;
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets['Usuarios'] || wb.Sheets[wb.SheetNames[0]];
    registros = XLSX.utils.sheet_to_json(ws, { defval: '' });
    // Cabeçalhos tolerantes a maiúsculas/minúsculas e espaços ("Nome" = "nome").
    registros = registros.map((row) => {
      const normalizada = {};
      for (const [k, v] of Object.entries(row)) normalizada[String(k || '').trim().toLowerCase()] = v;
      return normalizada;
    });
  } catch (e) { return res.status(400).json({ error: 'Não foi possível ler a planilha. Use o modelo oficial (.xlsx)' }); }
  if (!registros.length) return res.status(400).json({ error: 'A planilha não possui linhas para importar' });
  if (registros.length > 500) return res.status(400).json({ error: 'Máximo de 500 linhas por importação' });
  try {
    const [usuariosDb, modelosDb, categoriasDb, setoresDb] = await Promise.all([
      pool.query('SELECT id, email, perfil FROM usuarios'),
      pool.query('SELECT id, nome FROM modelos_avaliacao WHERE ativo=TRUE'),
      pool.query('SELECT id, nome FROM categorias_acesso'),
      pool.query('SELECT id, nome FROM setores_reclamacao WHERE ativo=TRUE'),
    ]);
    const porLogin = new Map(usuariosDb.rows.map((u) => [String(u.email || '').trim().toLowerCase(), u]));
    const modeloPorNome = new Map(modelosDb.rows.map((m) => [String(m.nome || '').trim().toLowerCase(), m]));
    const categoriaPorNome = new Map(categoriasDb.rows.map((c) => [String(c.nome || '').trim().toLowerCase(), c]));
    const setorPorNome = new Map(setoresDb.rows.map((s) => [String(s.nome || '').trim().toLowerCase(), s]));
    const hashPadrao = await bcrypt.hash(SENHA_PADRAO_IMPORTACAO_USUARIOS, 10);
    let criados = 0;
    const ignorados = [];
    for (let i = 0; i < registros.length; i++) {
      const linhaPlanilha = i + 2; // +1 cabeçalho, +1 base 1
      const r = registros[i];
      const nome = String(r.nome ?? '').trim();
      const login = String(r.login ?? '').trim();
      const perfil = normalizarPerfilImportacao(r.perfil);
      const matricula = String(r.matricula ?? '').trim();
      const cpf = String(r.cpf ?? '').trim();
      const responsavelLogin = String(r.responsavel_login ?? r.responsavel ?? '').trim().toLowerCase();
      const funcaoModeloNome = String(r.funcao_modelo ?? r.funcao ?? r.modelo ?? '').trim();
      const categoriaNome = String(r.categoria_acesso ?? r.categoria ?? '').trim();
      const setoresTexto = String(r.setores ?? r.setor ?? '').trim();
      const falhar = (motivo) => ignorados.push({ linha: linhaPlanilha, login: login || '—', nome: nome || '—', motivo });
      if (nome.length < 2) { falhar('Informe o nome (mínimo 2 letras)'); continue; }
      if (!login) { falhar('Informe o login'); continue; }
      if (!perfil) { falhar('Perfil inválido — use: Funcionario, Lider, Gerente, RH ou Administrador'); continue; }
      if (porLogin.has(login.toLowerCase())) { falhar('Login já cadastrado — linha ignorada'); continue; }
      const ehAvaliado = ['Leitor', 'Editor', 'Gerente'].includes(perfil);
      let liderId = null, modeloId = null, modeloNome = '';
      if (ehAvaliado) {
        if (!responsavelLogin) { falhar('Informe o responsavel_login (quem avalia este usuário)'); continue; }
        const responsavel = porLogin.get(responsavelLogin);
        if (!responsavel) { falhar(`Responsável "${responsavelLogin}" não encontrado (use um login já cadastrado)`); continue; }
        const esperados = perfil === 'Leitor' ? ['editor'] : perfil === 'Editor' ? ['gerente', 'administrador'] : ['administrador'];
        if (!esperados.includes(String(responsavel.perfil || '').toLowerCase())) {
          falhar(`Responsável "${responsavelLogin}" não tem o perfil adequado (${perfil === 'Leitor' ? 'precisa ser Líder' : perfil === 'Editor' ? 'precisa ser Gerente ou Administrador' : 'precisa ser Administrador'})`);
          continue;
        }
        liderId = Number(responsavel.id);
        if (!funcaoModeloNome) { falhar('Informe a funcao_modelo (nome exato da função de avaliação)'); continue; }
        const modelo = modeloPorNome.get(funcaoModeloNome.toLowerCase());
        if (!modelo) { falhar(`Função "${funcaoModeloNome}" não encontrada (use o nome exato do cadastro em Modelos)`); continue; }
        modeloId = Number(modelo.id);
        modeloNome = modelo.nome;
      }
      let categoriaId = null;
      if (categoriaNome) {
        const cat = categoriaPorNome.get(categoriaNome.toLowerCase());
        if (!cat) { falhar(`Categoria "${categoriaNome}" não encontrada`); continue; }
        categoriaId = Number(cat.id);
      }
      const setorIds = [];
      if (setoresTexto) {
        const nomes = setoresTexto.split(/[;,\n]+/).map((s) => s.trim()).filter(Boolean);
        let setorOk = true;
        for (const n of nomes) {
          const s = setorPorNome.get(n.toLowerCase());
          if (!s) { falhar(`Setor "${n}" não encontrado`); setorOk = false; break; }
          setorIds.push(Number(s.id));
        }
        if (!setorOk) continue;
      }
      try {
        const ins = await pool.query(
          'INSERT INTO usuarios (nome,email,senha,perfil,setor,cargo,matricula,cpf,lider_id,modelo_avaliacao_id,categoria_acesso_id,deve_alterar_senha) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE) RETURNING id',
          [nome, login, hashPadrao, perfil, modeloNome, modeloNome, matricula, cpf, liderId, modeloId, categoriaId]
        );
        try { await salvarSetoresUsuario(Number(ins.rows[0].id), setorIds); }
        catch (e) { await pool.query('DELETE FROM usuarios WHERE id=$1', [ins.rows[0].id]); falhar(e.message || 'Setores inválidos'); continue; }
        porLogin.set(login.toLowerCase(), { id: ins.rows[0].id, email: login, perfil });
        criados++;
      } catch (e) {
        if (e.code === '23505') falhar('Login já cadastrado — linha ignorada');
        else falhar('Erro ao salvar no banco');
      }
    }
    await registrarLog(req.usuarioId, 'importar', 'usuario', null, `${criados} criados, ${ignorados.length} ignorados (senha padrão ${SENHA_PADRAO_IMPORTACAO_USUARIOS})`);
    res.json({ criados, ignorados, senha_padrao: SENHA_PADRAO_IMPORTACAO_USUARIOS });
  } catch (e) { res.status(500).json({ error: 'Erro ao importar a planilha' }); }
});

// RECEITAS
// Rendimento = soma dos pesos dos ingredientes ÷ peso unitário do pão (arredonda p/ baixo).
function calcularRendimento(ingredientes, pesoPao) {
  const lista = Array.isArray(ingredientes) ? ingredientes : [];
  const total = lista.reduce((t, i) => t + (Number(i.quantidade) || 0), 0);
  const peso = Number(pesoPao);
  if (!(total > 0) || !(peso > 0)) return { total, rendimento: null };
  return { total, rendimento: Math.floor(total / peso) };
}
function validarReceita(titulo, ingredientes, pesoPao) {
  if (!String(titulo || '').trim()) return 'Informe o nome da receita';
  if (!Array.isArray(ingredientes) || !ingredientes.length || ingredientes.length > 50) return 'Informe ao menos 1 ingrediente';
  for (const i of ingredientes) {
    if (!String(i.nome || '').trim()) return 'Todo ingrediente precisa de nome';
    if (!Number.isFinite(Number(i.quantidade)) || Number(i.quantidade) < 0) return `Peso inválido em "${i.nome || '?'}'`;
  }
  const { total, rendimento } = calcularRendimento(ingredientes, pesoPao);
  if (!(total > 0)) return 'A soma dos pesos precisa ser maior que zero';
  if (!(Number(pesoPao) > 0)) return 'Informe o peso unitário do pão';
  if (rendimento == null || rendimento < 1) return 'Peso do pão maior que a massa total — rendimento zero';
  return null;
}
// Backfill: deriva o peso do pão das receitas legadas (total ÷ rendimento informado).
async function migrarPesoPao() {
  try {
    await pool.query(`UPDATE receitas SET peso_pao = ROUND(t.total_calc / NULLIF(rendimento_base,0), 1)
      FROM (SELECT id AS rid, (SELECT COALESCE(SUM(CASE WHEN elem->>'quantidade' ~ '^[0-9]+(\\.[0-9]+)?$' THEN (elem->>'quantidade')::numeric ELSE 0 END),0)
        FROM jsonb_array_elements(COALESCE(ingredientes,'[]'::jsonb)) elem) AS total_calc
        FROM receitas WHERE peso_pao IS NULL AND rendimento_base > 0) t
      WHERE receitas.id = t.rid AND t.total_calc > 0`);
  } catch (e) { console.error('Erro no backfill do peso do pão:', e.message); }
}
// Sugestões de ingredientes (19/09/2026): cada salvamento de receita alimenta esta
// tabela, que serve o autocomplete do formulário. Sobrevive à exclusão de receitas.
async function inicializarIngredientesSugestao() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS ingredientes_receita (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(150) NOT NULL,
      ultima_quantidade NUMERIC,
      usos INT NOT NULL DEFAULT 1,
      atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS ingredientes_receita_nome_idx ON ingredientes_receita (lower(nome))`);
    // Semeia com o que já existe nas receitas (só o que ainda não está na tabela).
    await pool.query(`INSERT INTO ingredientes_receita (nome, ultima_quantidade, usos)
      SELECT nome, MAX(qtd), COUNT(*) FROM (
        SELECT btrim(elem->>'nome') AS nome,
          CASE WHEN elem->>'quantidade' ~ '^[0-9]+(\\.[0-9]+)?$' THEN (elem->>'quantidade')::numeric ELSE NULL END AS qtd
        FROM receitas, jsonb_array_elements(COALESCE(ingredientes,'[]'::jsonb)) elem
      ) s WHERE nome <> '' GROUP BY nome
      ON CONFLICT ((lower(nome))) DO NOTHING`);
  } catch (e) { console.error('Erro ao inicializar sugestões de ingredientes:', e.message); }
}
async function registrarIngredientesSugestao(clientOrPool, ingredientes) {
  const lista = Array.isArray(ingredientes) ? ingredientes : [];
  const vistos = new Set();
  for (const item of lista) {
    const nome = String(item?.nome || '').trim();
    if (!nome || nome.length > 150) continue;
    const chave = nome.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const qtd = Number(item.quantidade);
    try {
      await clientOrPool.query(
        `INSERT INTO ingredientes_receita (nome, ultima_quantidade, usos) VALUES ($1, $2, 1)
         ON CONFLICT ((lower(nome))) DO UPDATE SET usos = ingredientes_receita.usos + 1,
           ultima_quantidade = COALESCE(EXCLUDED.ultima_quantidade, ingredientes_receita.ultima_quantidade),
           atualizado_em = CURRENT_TIMESTAMP`,
        [nome, Number.isFinite(qtd) ? qtd : null]
      );
    } catch (e) { console.error('Erro ao registrar sugestão de ingrediente:', e.message); }
  }
}
app.get('/api/receitas', verificarToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM receitas ORDER BY titulo ASC');
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Erro' }); }
});

app.post('/api/receitas', verificarToken, async (req, res) => {
  if (['leitor','rh'].includes(normalizarPerfil(req.usuarioPerfil))) return res.status(403).json({ error: 'Acesso negado' });
  const { titulo, ingredientes, peso_pao } = req.body;
  const erro = validarReceita(titulo, ingredientes, peso_pao);
  if (erro) return res.status(400).json({ error: erro });
  const { rendimento } = calcularRendimento(ingredientes, peso_pao);
  try {
    const result = await pool.query(
      'INSERT INTO receitas (titulo, rendimento_base, ingredientes, peso_pao) VALUES ($1, $2, $3, $4) RETURNING id',
      [String(titulo).trim(), rendimento, JSON.stringify(ingredientes), Number(peso_pao)]
    );
    await registrarIngredientesSugestao(pool, ingredientes);
    res.status(201).json({ id: result.rows[0].id, mensagem: 'Salvo!' });
  } catch (error) { res.status(500).json({ error: 'Erro' }); }
});

app.put('/api/receitas/:id', verificarToken, async (req, res) => {
  if (['leitor','rh'].includes(normalizarPerfil(req.usuarioPerfil))) return res.status(403).json({ error: 'Acesso negado' });
  const { titulo, ingredientes, peso_pao } = req.body;
  const erro = validarReceita(titulo, ingredientes, peso_pao);
  if (erro) return res.status(400).json({ error: erro });
  const { rendimento } = calcularRendimento(ingredientes, peso_pao);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const atual = await client.query('SELECT * FROM receitas WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!atual.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Receita não encontrada' }); }
    const r = atual.rows[0];
    await client.query('INSERT INTO receita_versoes (receita_id,titulo,rendimento_base,ingredientes,peso_pao,alterado_por) VALUES ($1,$2,$3,$4::jsonb,$5,$6)', [r.id,r.titulo,r.rendimento_base,JSON.stringify(r.ingredientes),r.peso_pao,req.usuarioId]);
    await client.query('UPDATE receitas SET titulo=$1,rendimento_base=$2,ingredientes=$3::jsonb,peso_pao=$4 WHERE id=$5', [String(titulo).trim(),rendimento,JSON.stringify(ingredientes),Number(peso_pao),req.params.id]);
    await client.query('COMMIT');
    await registrarIngredientesSugestao(pool, ingredientes);
    res.json({ mensagem: 'Receita atualizada e versão anterior arquivada.' });
  } catch (error) { await client.query('ROLLBACK'); console.error('Erro ao atualizar receita:', error.message); res.status(500).json({ error: 'Erro ao atualizar receita. Verifique os dados dos ingredientes.' }); }
  finally { client.release(); }
});

app.get('/api/ingredientes-sugestoes', verificarToken, async (_req, res) => {
  try {
    const result = await pool.query('SELECT nome, ultima_quantidade, usos FROM ingredientes_receita ORDER BY usos DESC, nome ASC LIMIT 200');
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Erro ao carregar sugestões de ingredientes' }); }
});

app.get('/api/receitas/:id/versoes', verificarToken, async (req, res) => {
  if (['leitor','rh'].includes(normalizarPerfil(req.usuarioPerfil))) return res.status(403).json({ error: 'Acesso negado' });
  const [historico, atual] = await Promise.all([
    pool.query(`SELECT v.*,u.nome AS alterado_por_nome FROM receita_versoes v LEFT JOIN usuarios u ON u.id=v.alterado_por WHERE v.receita_id=$1 ORDER BY v.criado_em ASC`, [req.params.id]),
    pool.query('SELECT * FROM receitas WHERE id=$1', [req.params.id]),
  ]);
  if (!atual.rows.length) return res.status(404).json({ error: 'Receita não encontrada' });
  const linhas = historico.rows.map((v, indice) => ({ ...v, numero_versao: indice + 1, alteracoes: alteracoesReceita(v, historico.rows[indice + 1] || atual.rows[0]) })).reverse();
  res.json(linhas);
});

app.delete('/api/receitas/:id', verificarToken, async (req, res) => {
  if (['leitor','rh'].includes(normalizarPerfil(req.usuarioPerfil))) return res.status(403).json({ error: 'Acesso negado' });
  try {
    await pool.query('DELETE FROM receitas WHERE id = $1', [req.params.id]);
    res.json({ mensagem: 'Excluída!' });
  } catch (error) { res.status(500).json({ error: 'Erro' }); }
});

// AVALIAÇÕES MENSAIS
const podeGerenciarAvaliacoes = (req, res, next) => {
  if (!['administrador', 'editor', 'gerente'].includes(normalizarPerfil(req.usuarioPerfil))) {
    return res.status(403).json({ error: 'Acesso restrito a líderes, gerentes e administradores' });
  }
  next();
};

app.get('/api/modelos-avaliacao', verificarToken, async (_req, res) => {
  const result=await pool.query('SELECT id,nome,chave FROM modelos_avaliacao WHERE ativo=TRUE ORDER BY nome');
  res.json(result.rows);
});

app.post('/api/modelos-avaliacao', verificarToken, async (req, res) => {
  if (normalizarPerfil(req.usuarioPerfil) !== 'administrador') return res.status(403).json({ error: 'Somente o Administrador pode criar modelos' });
  const nome = String(req.body?.nome || '').trim();
  if (nome.length < 2) return res.status(400).json({ error: 'Informe o nome do modelo' });
  const chave = nome.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
  try {
    const result = await pool.query('INSERT INTO modelos_avaliacao (nome,chave,ativo) VALUES ($1,$2,TRUE) RETURNING *',[nome,`${chave}-${Date.now().toString(36)}`]);
    res.status(201).json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Erro ao criar modelo de avaliação' }); }
});

app.post('/api/modelos-avaliacao/:id/copiar', verificarToken, async (req,res)=>{
  if(normalizarPerfil(req.usuarioPerfil)!=='administrador')return res.status(403).json({error:'Somente o Administrador pode copiar modelos'});
  const cliente=await pool.connect();
  try{
    await cliente.query('BEGIN');
    const origem=await cliente.query('SELECT id,nome FROM modelos_avaliacao WHERE id=$1 AND ativo=TRUE',[req.params.id]);
    if(!origem.rows.length){await cliente.query('ROLLBACK');return res.status(404).json({error:'Modelo não encontrado'});}
    const nome=String(req.body?.nome||`${origem.rows[0].nome} - Cópia`).trim();
    if(nome.length<2){await cliente.query('ROLLBACK');return res.status(400).json({error:'Informe o nome da cópia'});}
    const base=nome.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
    const novo=(await cliente.query('INSERT INTO modelos_avaliacao (nome,chave,ativo) VALUES ($1,$2,TRUE) RETURNING id,nome,chave',[nome,`${base}-${Date.now().toString(36)}`])).rows[0];
    await cliente.query(`INSERT INTO perguntas_avaliacao (titulo,pergunta,criterios,obrigatoria,ordem,modelo_avaliacao_id,ativa)
      SELECT titulo,pergunta,criterios,obrigatoria,ordem,$1,ativa FROM perguntas_avaliacao WHERE modelo_avaliacao_id=$2 AND ativa=TRUE ORDER BY ordem,id`,[novo.id,origem.rows[0].id]);
    await cliente.query('COMMIT');res.status(201).json(novo);
  }catch(error){await cliente.query('ROLLBACK');console.error(error);res.status(500).json({error:'Erro ao copiar modelo de avaliação'});}finally{cliente.release();}
});

app.get('/api/perguntas-avaliacao', verificarToken, async (req, res) => {
  let modeloId=req.query.modelo_id?Number(req.query.modelo_id):null;
  if(req.query.usuario_id){const u=await pool.query('SELECT modelo_avaliacao_id FROM usuarios WHERE id=$1',[Number(req.query.usuario_id)]);modeloId=u.rows[0]?.modelo_avaliacao_id;}
  if(!modeloId)return res.json([]);
  const result = await pool.query('SELECT * FROM perguntas_avaliacao WHERE ativa=TRUE AND modelo_avaliacao_id=$1 ORDER BY ordem,id',[modeloId]);
  res.json(result.rows);
});

app.post('/api/perguntas-avaliacao', verificarToken, async (req, res) => {
  if (String(req.usuarioPerfil).toLowerCase() !== 'administrador') return res.status(403).json({ error: 'Somente o Administrador pode alterar perguntas' });
  const { titulo, pergunta, criterios = [], obrigatoria = false, modelo_avaliacao_id } = req.body;
  if (!String(titulo||'').trim() || !String(pergunta||'').trim()) return res.status(400).json({ error: 'Título e pergunta são obrigatórios' });
  if(!modelo_avaliacao_id)return res.status(400).json({error:'Selecione o setor/modelo'});
  const ordem = await pool.query('SELECT COALESCE(MAX(ordem),0)+1 AS proxima FROM perguntas_avaliacao WHERE modelo_avaliacao_id=$1',[Number(modelo_avaliacao_id)]);
  const perguntaLimpa = pergunta.replace(/^\s*SEÇÃO\s+\d+\s*:\s*/i, '').trim();
  const result = await pool.query('INSERT INTO perguntas_avaliacao (titulo,pergunta,criterios,obrigatoria,ordem,modelo_avaliacao_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',[titulo.trim(),perguntaLimpa,JSON.stringify(criterios.filter(Boolean)),Boolean(obrigatoria),ordem.rows[0].proxima,Number(modelo_avaliacao_id)]);
  res.status(201).json(result.rows[0]);
});

app.put('/api/perguntas-avaliacao/:id', verificarToken, async (req, res) => {
  if (String(req.usuarioPerfil).toLowerCase() !== 'administrador') return res.status(403).json({ error: 'Somente o Administrador pode editar perguntas' });
  const { titulo, pergunta, criterios = [], obrigatoria = false } = req.body;
  const tituloLimpo = String(titulo || '').trim();
  const perguntaLimpa = String(pergunta || '').replace(/^\s*SEÇÃO\s+\d+\s*:\s*/i, '').trim();
  if (!tituloLimpo || !perguntaLimpa) return res.status(400).json({ error: 'Título e pergunta são obrigatórios' });
  if (!Array.isArray(criterios)) return res.status(400).json({ error: 'Os critérios precisam ser enviados em formato de lista' });
  try {
    const result = await pool.query(`UPDATE perguntas_avaliacao SET titulo=$1,pergunta=$2,criterios=$3::jsonb,obrigatoria=$4 WHERE id=$5 AND ativa=TRUE RETURNING *`, [tituloLimpo,perguntaLimpa,JSON.stringify(criterios.map(x=>String(x).trim()).filter(Boolean)),Boolean(obrigatoria),req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Pergunta não encontrada' });
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Erro ao editar pergunta' }); }
});

app.delete('/api/perguntas-avaliacao/:id', verificarToken, async (req, res) => {
  if (String(req.usuarioPerfil).toLowerCase() !== 'administrador') return res.status(403).json({ error: 'Somente o Administrador pode alterar perguntas' });
  const total = await pool.query('SELECT COUNT(*) FROM perguntas_avaliacao WHERE ativa=TRUE AND modelo_avaliacao_id=(SELECT modelo_avaliacao_id FROM perguntas_avaliacao WHERE id=$1)',[req.params.id]);
  if (Number(total.rows[0].count) <= 1) return res.status(400).json({ error: 'A avaliação precisa manter pelo menos uma pergunta' });
  await pool.query('UPDATE perguntas_avaliacao SET ativa=FALSE WHERE id=$1',[req.params.id]);
  res.json({ mensagem: 'Pergunta removida.' });
});

app.get('/api/colaboradores', verificarToken, podeGerenciarAvaliacoes, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id,u.nome,u.setor,u.cargo,u.perfil,u.modelo_avaliacao_id,u.lider_id,l.nome AS lider_nome,MAX(a.mes_referencia) AS ultima_avaliacao
      FROM usuarios u LEFT JOIN usuarios l ON l.id=u.lider_id LEFT JOIN avaliacoes a ON a.usuario_avaliado_id=u.id
      WHERE u.modelo_avaliacao_id IS NOT NULL ${restringirAoProprioTime(req.usuarioPerfil)?"AND LOWER(u.perfil)='leitor' AND u.lider_id=$1":''}
      GROUP BY u.id,l.nome ORDER BY u.nome
    `, restringirAoProprioTime(req.usuarioPerfil)?[req.usuarioId]:[]);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Erro ao listar colaboradores' }); }
});

app.get('/api/avaliacoes/lembretes', verificarToken, podeGerenciarAvaliacoes, async (req, res) => {
  const mes = req.query.mes || new Date().toISOString().slice(0, 7);
  if (!/^[0-9]{4}-[0-9]{2}$/.test(mes)) return res.status(400).json({ error: 'Mês inválido' });
  try {
    const result = await pool.query(`
      SELECT u.id,u.nome,u.setor,u.cargo
      FROM usuarios u WHERE u.modelo_avaliacao_id IS NOT NULL ${restringirAoProprioTime(req.usuarioPerfil)?"AND LOWER(u.perfil)='leitor' AND u.lider_id=$2":''} AND NOT EXISTS (
        SELECT 1 FROM avaliacoes a WHERE a.usuario_avaliado_id=u.id AND a.mes_referencia=$1
      )
      ORDER BY u.nome
    `, restringirAoProprioTime(req.usuarioPerfil)?[mes,req.usuarioId]:[mes]);
    res.json({ mes, quantidade: result.rows.length, pendentes: result.rows });
  } catch (error) { res.status(500).json({ error: 'Erro ao buscar lembretes' }); }
});

app.get('/api/avaliacoes', verificarToken, podeGerenciarAvaliacoes, async (req, res) => {
  const valores = [];
  let filtro = restringirAoProprioTime(req.usuarioPerfil) ? 'WHERE c.lider_id = $1' : '';
  if (restringirAoProprioTime(req.usuarioPerfil)) valores.push(req.usuarioId);
  if (req.query.colaborador_id) {
    valores.push(Number(req.query.colaborador_id));
    filtro += `${filtro ? ' AND' : 'WHERE'} a.usuario_avaliado_id = $${valores.length}`;
  }
  if (req.query.lider_id) {
    valores.push(Number(req.query.lider_id));
    filtro += `${filtro ? ' AND' : 'WHERE'} c.lider_id = $${valores.length}`;
  }
  try {
    const result = await pool.query(`
      SELECT a.id, a.usuario_avaliado_id AS colaborador_id, a.mes_referencia, a.percentual, a.pontuacao_total,
             a.classificacao, a.aplicado_por, a.criado_em, a.token_compartilhamento,
             c.nome AS colaborador_nome, c.setor, c.cargo,c.lider_id,l.nome AS lider_nome
      FROM avaliacoes a JOIN usuarios c ON c.id=a.usuario_avaliado_id LEFT JOIN usuarios l ON l.id=c.lider_id
      ${filtro}
      ORDER BY a.mes_referencia DESC, c.nome
    `, valores);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Erro ao listar avaliações' }); }
});

app.get('/api/avaliacoes/compartilhada/:token', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*,a.usuario_avaliado_id AS colaborador_id,c.nome AS colaborador_nome,c.setor,c.cargo
      FROM avaliacoes a JOIN usuarios c ON c.id=a.usuario_avaliado_id
      WHERE a.token_compartilhamento = $1
    `, [req.params.token]);
    if (!result.rows.length) return res.status(404).json({ error: 'Avaliação não encontrada' });
    const avaliacao = result.rows[0];
    const historico = await pool.query(`
      SELECT mes_referencia, percentual, classificacao
      FROM avaliacoes WHERE usuario_avaliado_id = $1
      ORDER BY mes_referencia
    `, [avaliacao.usuario_avaliado_id]);
    res.json({ ...avaliacao, historico: historico.rows });
  } catch (error) { res.status(500).json({ error: 'Erro ao abrir avaliação' }); }
});

app.get('/api/avaliacoes/:id', verificarToken, podeGerenciarAvaliacoes, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*,a.usuario_avaliado_id AS colaborador_id,c.nome AS colaborador_nome,c.setor,c.cargo
      FROM avaliacoes a JOIN usuarios c ON c.id=a.usuario_avaliado_id
      WHERE a.id = $1 ${restringirAoProprioTime(req.usuarioPerfil)?'AND c.lider_id=$2':''}
    `, restringirAoProprioTime(req.usuarioPerfil)?[req.params.id,req.usuarioId]:[req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Avaliação não encontrada' });
    const avaliacao = result.rows[0];
    const historico = await pool.query(`
      SELECT mes_referencia, percentual, classificacao
      FROM avaliacoes WHERE usuario_avaliado_id=$1 ORDER BY mes_referencia
    `, [avaliacao.usuario_avaliado_id]);
    res.json({ ...avaliacao, historico: historico.rows });
  } catch (error) { res.status(500).json({ error: 'Erro ao abrir avaliação' }); }
});

app.post('/api/avaliacoes', verificarToken, podeGerenciarAvaliacoes, async (req, res) => {
  const { colaborador_id, mes_referencia, respostas } = req.body;
  if (!colaborador_id || !/^[0-9]{4}-[0-9]{2}$/.test(String(mes_referencia || ''))) {
    return res.status(400).json({ error: 'Colaborador e mês de referência são obrigatórios' });
  }
  try {
    const permitido=await pool.query(`SELECT id,perfil,modelo_avaliacao_id FROM usuarios WHERE id=$1 AND modelo_avaliacao_id IS NOT NULL ${restringirAoProprioTime(req.usuarioPerfil)?"AND LOWER(perfil)='leitor' AND lider_id=$2":''}`,restringirAoProprioTime(req.usuarioPerfil)?[Number(colaborador_id),req.usuarioId]:[Number(colaborador_id)]);
    if(!permitido.rows.length)return res.status(403).json({error:'Este funcionário não está vinculado a você'});
    if(normalizarPerfil(permitido.rows[0].perfil)==='gerente'&&normalizarPerfil(req.usuarioPerfil)!=='administrador')return res.status(403).json({error:'Somente o Administrador pode avaliar Gerentes'});
    const aplicador=(await pool.query('SELECT nome FROM usuarios WHERE id=$1',[req.usuarioId])).rows[0]?.nome||'Usuário';
    const perguntas=await pool.query('SELECT * FROM perguntas_avaliacao WHERE ativa=TRUE AND modelo_avaliacao_id=$1 ORDER BY ordem,id',[permitido.rows[0].modelo_avaliacao_id]);
    const calculo = prepararAvaliacaoDinamica(perguntas.rows,respostas);
    const tokenCompartilhamento = randomUUID();
    const result = await pool.query(`
      INSERT INTO avaliacoes (
        usuario_avaliado_id, mes_referencia, elaborado_por, aplicado_por,
        pontuacao_total, percentual, classificacao, respostas, token_compartilhamento, criado_por
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
    `, [
      Number(colaborador_id), mes_referencia, aplicador, aplicador,
      calculo.pontuacaoTotal, calculo.percentual,
      calculo.classificacao, JSON.stringify(calculo.respostas), tokenCompartilhamento, req.usuarioId,
    ]);
    const av = result.rows[0];
    const avaliado = (await pool.query('SELECT nome,perfil FROM usuarios WHERE id=$1', [Number(colaborador_id)])).rows[0];
    if (avaliado) criarNotificacao(Number(colaborador_id), 'avaliacao_nova', 'Nova avaliação publicada', `${avaliado.nome} · referência ${mes_referencia}`, String(avaliado.perfil || '').toLowerCase() === 'leitor' ? '/avaliacoes' : '/meu-desempenho', `avaliacao:${av.id}`);
    res.status(201).json(av);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Este colaborador já foi avaliado neste mês' });
    if (error.message?.includes('nota válida') || error.message?.includes('obrigatória')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erro ao salvar avaliação' });
  }
});

app.put('/api/avaliacoes/:id', verificarToken, podeGerenciarAvaliacoes, async (req, res) => {
  const { colaborador_id, mes_referencia, respostas } = req.body;
  if (!colaborador_id || !/^[0-9]{4}-[0-9]{2}$/.test(String(mes_referencia || ''))) return res.status(400).json({ error: 'Usuário e mês de referência são obrigatórios' });
  try {
    const existente = await pool.query(`SELECT a.usuario_avaliado_id,a.respostas FROM avaliacoes a JOIN usuarios u ON u.id=a.usuario_avaliado_id WHERE a.id=$1 ${restringirAoProprioTime(req.usuarioPerfil)?'AND u.lider_id=$2':''}`,restringirAoProprioTime(req.usuarioPerfil)?[req.params.id,req.usuarioId]:[req.params.id]);
    if(!existente.rows.length)return res.status(404).json({error:'Avaliação não encontrada'});
    if(Number(colaborador_id)!==Number(existente.rows[0].usuario_avaliado_id))return res.status(400).json({error:'O usuário de uma avaliação concluída não pode ser alterado'});
    const perguntasSnapshot=(existente.rows[0].respostas||[]).map((r,index)=>({id:r.pergunta_id||r.competencia,titulo:r.titulo,pergunta:r.pergunta,criterios:r.criterios||[],obrigatoria:Boolean(r.obrigatoria),ordem:index+1}));
    const calculo = prepararAvaliacaoDinamica(perguntasSnapshot,respostas);
    const aplicador=(await pool.query('SELECT nome FROM usuarios WHERE id=$1',[req.usuarioId])).rows[0]?.nome||'Usuário';
    const result = await pool.query(`UPDATE avaliacoes SET mes_referencia=$1,elaborado_por=$2,aplicado_por=$3,pontuacao_total=$4,percentual=$5,classificacao=$6,respostas=$7 WHERE id=$8 RETURNING *`, [mes_referencia,aplicador,aplicador,calculo.pontuacaoTotal,calculo.percentual,calculo.classificacao,JSON.stringify(calculo.respostas),req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Avaliação não encontrada' });
    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Este usuário já foi avaliado neste mês' });
    if (error.message?.includes('nota válida') || error.message?.includes('obrigatória')) return res.status(400).json({ error: error.message });
    res.status(500).json({ error: 'Erro ao atualizar avaliação' });
  }
});

app.get('/api/minhas-avaliacoes', verificarToken, async (req, res) => {
  const result = await pool.query(`SELECT a.*,u.nome AS colaborador_nome,u.setor,u.cargo FROM avaliacoes a JOIN usuarios u ON u.id=a.usuario_avaliado_id WHERE a.usuario_avaliado_id=$1 ORDER BY a.mes_referencia DESC`, [req.usuarioId]);
  res.json(result.rows);
});

app.delete('/api/avaliacoes/:id', verificarToken, podeGerenciarAvaliacoes, async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM avaliacoes a WHERE a.id=$1 ${restringirAoProprioTime(req.usuarioPerfil)?'AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id=a.usuario_avaliado_id AND u.lider_id=$2)':''} RETURNING id`, restringirAoProprioTime(req.usuarioPerfil)?[req.params.id,req.usuarioId]:[req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Avaliação não encontrada' });
    res.json({ mensagem: 'Avaliação excluída.' });
  } catch (error) { res.status(500).json({ error: 'Erro ao excluir avaliação' }); }
});

// NOTIFICAÇÕES — central persistida (sino + badge no app). Sem popups bloqueantes.
// Eventos ao vivo não duplicam não-lidas; o backfill do boot nunca ressuscita lidas.
async function criarNotificacao(usuarioId, tipo, titulo, mensagem, link, referencia, soSeNuncaExistiu = false) {
  if (!usuarioId) return;
  try {
    const onde = soSeNuncaExistiu ? '' : ' AND lida=FALSE';
    const dup = await pool.query(`SELECT 1 FROM notificacoes WHERE usuario_id=$1 AND tipo=$2 AND referencia=$3${onde} LIMIT 1`, [Number(usuarioId), tipo, referencia || '']);
    if (dup.rows.length) return;
    await pool.query('INSERT INTO notificacoes (usuario_id,tipo,titulo,mensagem,link,referencia) VALUES ($1,$2,$3,$4,$5,$6)', [Number(usuarioId), tipo, titulo, mensagem || '', link || '', referencia || '']);
  } catch (e) { console.error('Erro ao criar notificação:', e.message); }
}
// Reclamação nova: líder responsável mencionado + Gerentes + Administradores + Ximene (nutri).
async function destinatariosReclamacao(liderId) {
  try {
    const r = await pool.query(`SELECT id FROM usuarios WHERE id=$1 OR LOWER(perfil) IN ('gerente','administrador') OR nome ILIKE '%ximene%'`, [Number(liderId)]);
    return [...new Set(r.rows.map(x => Number(x.id)))];
  } catch (e) { console.error('Erro ao buscar destinatários:', e.message); return [Number(liderId)]; }
}
async function notificarReclamacaoNova(reclamacaoId, soSeNuncaExistiu = false) {
  try {
    const r = await pool.query(`SELECT r.lider_responsavel_id,r.prioridade,c.nome AS cliente,t.nome AS tipo,s.nome AS setor FROM reclamacoes r JOIN clientes_reclamacao c ON c.id=r.cliente_id JOIN tipos_reclamacao t ON t.id=r.tipo_id LEFT JOIN setores_reclamacao s ON s.id=r.setor_id WHERE r.id=$1`, [Number(reclamacaoId)]);
    if (!r.rows.length) return;
    const { lider_responsavel_id, prioridade, cliente, tipo, setor } = r.rows[0];
    const pri = { verde: 'Não urgente', amarelo: 'Média', vermelho: 'Imediata' }[prioridade] || prioridade;
    const titulo = `Nova reclamação: ${tipo} — ${cliente}`;
    const mensagem = `Prioridade ${pri}${setor ? ` · Setor ${setor}` : ''}`;
    for (const uid of await destinatariosReclamacao(lider_responsavel_id)) await criarNotificacao(uid, 'reclamacao_nova', titulo, mensagem, '/reclamacoes', `reclamacao:${reclamacaoId}`, soSeNuncaExistiu);
  } catch (e) { console.error('Erro ao notificar reclamação:', e.message); }
}
async function notificarAdminsMip(tipo, titulo, mensagem, mipId, soSeNuncaExistiu = false) {
  try {
    const r = await pool.query(`SELECT id FROM usuarios WHERE LOWER(perfil)='administrador'`);
    for (const { id } of r.rows) await criarNotificacao(id, tipo, titulo, mensagem, `/mips/${mipId}`, `mip:${mipId}`, soSeNuncaExistiu);
  } catch (e) { console.error('Erro ao notificar admins:', e.message); }
}

app.get('/api/notificacoes', verificarToken, async (req, res) => {
  try {
    const limite = Math.min(Math.max(Number(req.query.limite) || 30, 1), 100);
    const somente = String(req.query.somente || '');
    const filtro = somente === 'nao-lidas' ? 'AND lida=FALSE' : somente === 'arquivadas' ? 'AND lida=TRUE' : '';
    const [itens, cont] = await Promise.all([
      pool.query(`SELECT id,tipo,titulo,mensagem,link,referencia,lida,criado_em FROM notificacoes WHERE usuario_id=$1 ${filtro} ORDER BY criado_em DESC,id DESC LIMIT $2`, [req.usuarioId, limite]),
      pool.query('SELECT COUNT(*) FILTER (WHERE lida=FALSE)::int AS nao_lidas, COUNT(*) FILTER (WHERE lida=TRUE)::int AS arquivadas FROM notificacoes WHERE usuario_id=$1', [req.usuarioId])
    ]);
    res.json({ itens: itens.rows, nao_lidas: cont.rows[0].nao_lidas, arquivadas: cont.rows[0].arquivadas });
  } catch (e) { res.status(500).json({ error: 'Erro ao carregar notificações' }); }
});
app.patch('/api/notificacoes/:id/lida', verificarToken, async (req, res) => {
  const lida = req.body?.lida === undefined ? true : Boolean(req.body.lida);
  await pool.query('UPDATE notificacoes SET lida=$1 WHERE id=$2 AND usuario_id=$3', [lida, req.params.id, req.usuarioId]);
  res.json({ ok: true });
});
app.post('/api/notificacoes/marcar-todas-lidas', verificarToken, async (req, res) => {
  await pool.query('UPDATE notificacoes SET lida=TRUE WHERE usuario_id=$1 AND lida=FALSE', [req.usuarioId]);
  res.json({ ok: true });
});

// Backfill idempotente no boot: registra o que já está pendente (nunca duplica,
// nem ressuscita lidas — eventos novos continuam chegando pelos gatilhos ao vivo).
async function inicializarNotificacoes() {
  try {
    await pool.query(`DELETE FROM notificacoes WHERE id NOT IN (SELECT MAX(id) FROM notificacoes GROUP BY usuario_id,tipo,referencia)`);
    const emRevisao = await pool.query(`SELECT id,codigo,titulo FROM mips WHERE status='Em Revisão'`);
    for (const m of emRevisao.rows) await notificarAdminsMip('mip_revisao', 'MIP aguardando revisão', `${m.codigo} — ${m.titulo}`, m.id, true);
    const recentes = await pool.query(`SELECT id,codigo,titulo,status,autor_id,orientacao_correcao FROM mips WHERE status IN ('Publicado','Reprovado') AND atualizado_em > NOW() - INTERVAL '30 days' LIMIT 100`);
    for (const m of recentes.rows) {
      if (m.status === 'Reprovado') await criarNotificacao(m.autor_id, 'mip_correcao', 'Correções solicitadas', `${m.codigo} — ${m.titulo}${m.orientacao_correcao ? `: ${m.orientacao_correcao}` : ''}`, `/mips/${m.id}`, `mip:${m.id}`, true);
      else await criarNotificacao(m.autor_id, 'mip_aprovacao', 'MIP aprovada', `${m.codigo} — ${m.titulo}`, `/mips/${m.id}`, `mip:${m.id}`, true);
    }
    const abertas = await pool.query(`SELECT id FROM reclamacoes WHERE status='aberto' LIMIT 200`);
    for (const r of abertas.rows) await notificarReclamacaoNova(r.id, true);
    const avals = await pool.query(`SELECT a.id,a.usuario_avaliado_id,a.mes_referencia,u.nome,u.perfil FROM avaliacoes a JOIN usuarios u ON u.id=a.usuario_avaliado_id WHERE a.criado_em > NOW() - INTERVAL '60 days' LIMIT 200`);
    for (const a of avals.rows) await criarNotificacao(a.usuario_avaliado_id, 'avaliacao_nova', 'Nova avaliação publicada', `${a.nome} · referência ${a.mes_referencia}`, String(a.perfil || '').toLowerCase() === 'leitor' ? '/avaliacoes' : '/meu-desempenho', `avaliacao:${a.id}`, true);
  } catch (e) { console.error('Erro no backfill de notificações:', e.message); }
}

// RECLAMAÇÕES
const podeRegistrarReclamacao = async (req) => {
  if (['administrador','editor','gerente'].includes(normalizarPerfil(req.usuarioPerfil))) return true;
  const r = await pool.query(`SELECT 1 FROM usuarios u JOIN categorias_acesso c ON c.id=u.categoria_acesso_id WHERE u.id=$1 AND c.ativo=TRUE AND c.permissoes ? 'reclamacoes.registrar'`,[req.usuarioId]);
  return Boolean(r.rows.length);
};

// Perfil RH consulta as reclamações (métricas e lista), mas não registra,
// edita, conclui nem reabre — isso continua em podeRegistrarReclamacao.
const podeVerReclamacoes = async (req) => ehRH(req.usuarioPerfil) || podeRegistrarReclamacao(req);

app.get('/api/reclamacoes/catalogos', verificarToken, async (req,res) => {
  const [clientes,tipos,lideres,setores,prazos]=await Promise.all([
    pool.query('SELECT id,nome FROM clientes_reclamacao WHERE ativo=TRUE ORDER BY nome'),
    pool.query("SELECT id,nome,COALESCE(prioridade,'verde') AS prioridade FROM tipos_reclamacao WHERE ativo=TRUE ORDER BY nome"),
    pool.query(`SELECT u.id,u.nome,COALESCE((SELECT JSON_AGG(JSON_BUILD_OBJECT('id',s.id,'nome',s.nome) ORDER BY s.nome) FROM usuario_setores us JOIN setores_reclamacao s ON s.id=us.setor_id WHERE us.usuario_id=u.id),'[]'::json) AS setores FROM usuarios u WHERE LOWER(u.perfil)='editor' ORDER BY u.nome`),
    pool.query('SELECT id,nome FROM setores_reclamacao WHERE ativo=TRUE ORDER BY nome'),
    pool.query('SELECT prazo_verde_min,prazo_amarelo_min,prazo_vermelho_min FROM configuracao_reclamacoes WHERE id=TRUE')
  ]);
  // Funcionário (sem permissão de registrar) não vê quem são os líderes responsáveis.
  const podeVerLideres = await podeVerReclamacoes(req);
  res.json({clientes:clientes.rows,tipos:tipos.rows,lideres:podeVerLideres?lideres.rows:[],setores:setores.rows,prazos:prazos.rows[0]});
});

function montarFiltrosReclamacoes(query, alias) {
  const conds = [], params = [];
  const col = c => alias ? `${alias}.${c}` : c;
  const mes = /^\d{4}-\d{2}$/.test(String(query.mes || '')) ? String(query.mes) : null;
  if (mes) { params.push(mes); conds.push(`TO_CHAR(${col('criado_em')},'YYYY-MM')=$${params.length}`); }
  for (const [q, c] of [['lider_id', 'lider_responsavel_id'], ['tipo_id', 'tipo_id'], ['cliente_id', 'cliente_id']]) {
    const v = Number(query[q]);
    if (Number.isInteger(v) && v > 0) { params.push(v); conds.push(`${col(c)}=$${params.length}`); }
  }
  const setor = String(query.setor || '').trim();
  if (setor) { params.push(`%${setor}%`); conds.push(`EXISTS (SELECT 1 FROM setores_reclamacao s WHERE s.id=${col('setor_id')} AND s.nome ILIKE $${params.length})`); }
  return { where: conds.length ? `WHERE ${conds.join(' AND ')}` : '', params, mes, setor };
}

app.get('/api/reclamacoes/metricas', verificarToken, async (req,res) => {
  const f = montarFiltrosReclamacoes(req.query, 'r');
  const fs = montarFiltrosReclamacoes(req.query, '');
  const [total,tipo,lider,setor,mes,cliente,prioridade,status,prazos]=await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total FROM reclamacoes r ${f.where}`, f.params),
    pool.query(`SELECT t.nome,COUNT(*)::int AS total FROM reclamacoes r JOIN tipos_reclamacao t ON t.id=r.tipo_id ${f.where} GROUP BY t.id,t.nome ORDER BY total DESC,t.nome`, f.params),
    pool.query(`SELECT u.nome,COUNT(*)::int AS total FROM reclamacoes r JOIN usuarios u ON u.id=r.lider_responsavel_id ${f.where} GROUP BY u.id,u.nome ORDER BY total DESC,u.nome`, f.params),
    pool.query(`SELECT COALESCE(s.nome,'Sem setor') AS nome,COUNT(*)::int AS total FROM reclamacoes r LEFT JOIN setores_reclamacao s ON s.id=r.setor_id ${f.where} GROUP BY s.nome ORDER BY total DESC,s.nome`, f.params),
    pool.query(`SELECT TO_CHAR(DATE_TRUNC('month',criado_em),'YYYY-MM') AS mes,COUNT(*)::int AS total FROM reclamacoes GROUP BY 1 ORDER BY 1`),
    pool.query(`SELECT c.nome,COUNT(*)::int AS total FROM reclamacoes r JOIN clientes_reclamacao c ON c.id=r.cliente_id ${f.where} GROUP BY c.id,c.nome ORDER BY total DESC,c.nome LIMIT 12`, f.params),
    pool.query(`SELECT r.prioridade AS nome,COUNT(*)::int AS total FROM reclamacoes r ${f.where} GROUP BY r.prioridade ORDER BY CASE r.prioridade WHEN 'vermelho' THEN 1 WHEN 'amarelo' THEN 2 ELSE 3 END`, f.params),
    pool.query(`SELECT r.status AS nome,COUNT(*)::int AS total FROM reclamacoes r ${f.where} GROUP BY r.status`, f.params),
    pool.query(`SELECT COUNT(*) FILTER (WHERE status='aberto')::int AS abertas,COUNT(*) FILTER (WHERE status='aberto' AND prazo_em<NOW())::int AS atrasadas,COUNT(*) FILTER (WHERE status='concluido')::int AS concluidas,COALESCE(ROUND((AVG(EXTRACT(EPOCH FROM (concluido_em-criado_em))/3600) FILTER (WHERE concluido_em IS NOT NULL))::numeric,1),0) AS media_horas FROM reclamacoes ${fs.where}`, fs.params)
  ]);
  res.json({mes:f.mes,filtros:{mes:f.mes,setor:f.setor,lider_id:Number(req.query.lider_id)||null,tipo_id:Number(req.query.tipo_id)||null,cliente_id:Number(req.query.cliente_id)||null},total:total.rows[0].total,por_tipo:tipo.rows,por_lider:(await podeVerReclamacoes(req))?lider.rows:[],por_setor:setor.rows,por_mes:mes.rows,por_cliente:cliente.rows,por_prioridade:prioridade.rows,por_status:status.rows,...prazos.rows[0]});
});

app.get('/api/reclamacoes', verificarToken, async (req,res) => {
  if (!(await podeVerReclamacoes(req))) return res.status(403).json({error:'Seu perfil possui acesso apenas às métricas'});
  const f = montarFiltrosReclamacoes(req.query, 'r');
  const r=await pool.query(`SELECT r.*,c.nome AS cliente_nome,t.nome AS tipo_nome,l.nome AS lider_nome,s.nome AS setor_nome,u.nome AS criado_por_nome FROM reclamacoes r JOIN clientes_reclamacao c ON c.id=r.cliente_id JOIN tipos_reclamacao t ON t.id=r.tipo_id JOIN usuarios l ON l.id=r.lider_responsavel_id LEFT JOIN setores_reclamacao s ON s.id=r.setor_id LEFT JOIN usuarios u ON u.id=r.criado_por ${f.where} ORDER BY r.criado_em DESC`, f.params);
  res.json(r.rows);
});

async function resolverSetorReclamacao(setor_id, liderId) {
  if (setor_id) {
    const s = await pool.query('SELECT id FROM setores_reclamacao WHERE id=$1 AND ativo=TRUE', [Number(setor_id)]);
    if (!s.rows.length) throw Object.assign(new Error('Selecione um setor válido'), { status: 400 });
    return Number(setor_id);
  }
  const primeiro = await pool.query('SELECT setor_id FROM usuario_setores WHERE usuario_id=$1 ORDER BY setor_id LIMIT 1', [Number(liderId)]);
  return primeiro.rows.length ? Number(primeiro.rows[0].setor_id) : null;
}

app.post('/api/reclamacoes', verificarToken, async (req,res) => {
  if (!(await podeRegistrarReclamacao(req))) return res.status(403).json({error:'Acesso negado'});
  const {cliente_id,tipo_id,lider_responsavel_id,setor_id,descricao,anexos=[],prioridade='verde'}=req.body;
  if(!cliente_id||!tipo_id||!lider_responsavel_id||!String(descricao||'').trim())return res.status(400).json({error:'Preencha todos os campos obrigatórios'});
  if(!Array.isArray(anexos)||anexos.length>10)return res.status(400).json({error:'Envie no máximo 10 anexos'});
  if(!['verde','amarelo','vermelho'].includes(prioridade))return res.status(400).json({error:'Selecione uma prioridade válida'});
  const lider=await pool.query("SELECT id FROM usuarios WHERE id=$1 AND LOWER(perfil)='editor'",[Number(lider_responsavel_id)]);
  if(!lider.rows.length)return res.status(400).json({error:'Selecione um usuário com perfil Líder'});
  let setorFinal=null;
  try { setorFinal = await resolverSetorReclamacao(setor_id, Number(lider_responsavel_id)); }
  catch (e) { return res.status(e.status || 500).json({ error: e.message }); }
  const cfg=(await pool.query('SELECT prazo_verde_min,prazo_amarelo_min,prazo_vermelho_min FROM configuracao_reclamacoes WHERE id=TRUE')).rows[0];
  const minutos={verde:cfg.prazo_verde_min,amarelo:cfg.prazo_amarelo_min,vermelho:cfg.prazo_vermelho_min}[prioridade];
  const r=await pool.query(`INSERT INTO reclamacoes (cliente_id,assunto,tipo_id,lider_responsavel_id,setor_id,descricao,anexos,prioridade,prazo_em,status,criado_por) VALUES ($1,'',$2,$3,$4,$5,$6,$7,NOW()+($8||' minutes')::interval,'aberto',$9) RETURNING id`,[Number(cliente_id),Number(tipo_id),Number(lider_responsavel_id),setorFinal,String(descricao).trim(),JSON.stringify(anexos),prioridade,String(minutos),req.usuarioId]);
  notificarReclamacaoNova(r.rows[0].id);
  res.status(201).json(r.rows[0]);
});

app.put('/api/reclamacoes/:id', verificarToken, async (req,res)=>{
  if(!(await podeRegistrarReclamacao(req)))return res.status(403).json({error:'Acesso negado'});
  const {cliente_id,tipo_id,lider_responsavel_id,setor_id,descricao,anexos=[],prioridade}=req.body;
  if(!cliente_id||!tipo_id||!lider_responsavel_id||!String(descricao||'').trim())return res.status(400).json({error:'Preencha todos os campos obrigatórios'});
  if(!Array.isArray(anexos)||anexos.length>10)return res.status(400).json({error:'Envie no máximo 10 anexos'});
  if(!['verde','amarelo','vermelho'].includes(prioridade))return res.status(400).json({error:'Selecione uma prioridade válida'});
  const lider=await pool.query("SELECT id FROM usuarios WHERE id=$1 AND LOWER(perfil)='editor'",[Number(lider_responsavel_id)]);
  if(!lider.rows.length)return res.status(400).json({error:'Selecione um usuário com perfil Líder'});
  let setorFinal=null;
  try { setorFinal = await resolverSetorReclamacao(setor_id, Number(lider_responsavel_id)); }
  catch (e) { return res.status(e.status || 500).json({ error: e.message }); }
  const cfg=(await pool.query('SELECT prazo_verde_min,prazo_amarelo_min,prazo_vermelho_min FROM configuracao_reclamacoes WHERE id=TRUE')).rows[0];
  const minutos={verde:cfg.prazo_verde_min,amarelo:cfg.prazo_amarelo_min,vermelho:cfg.prazo_vermelho_min}[prioridade];
  const r=await pool.query(`UPDATE reclamacoes SET cliente_id=$1,tipo_id=$2,lider_responsavel_id=$3,setor_id=$4,descricao=$5,anexos=$6,prioridade=$7,
    prazo_em=CASE WHEN status='aberto' THEN criado_em+($8||' minutes')::interval ELSE prazo_em END WHERE id=$9 RETURNING *`,[Number(cliente_id),Number(tipo_id),Number(lider_responsavel_id),setorFinal,String(descricao).trim(),JSON.stringify(anexos),prioridade,String(minutos),req.params.id]);
  if(!r.rows.length)return res.status(404).json({error:'Reclamação não encontrada'});res.json(r.rows[0]);
});

async function prepararStatusReclamacoes(){await pool.query(`ALTER TABLE reclamacoes ADD COLUMN IF NOT EXISTS status VARCHAR(15) NOT NULL DEFAULT 'aberto';ALTER TABLE reclamacoes ADD COLUMN IF NOT EXISTS concluido_em TIMESTAMP;ALTER TABLE reclamacoes ADD COLUMN IF NOT EXISTS concluido_por INT REFERENCES usuarios(id) ON DELETE SET NULL;`);}
app.post('/api/reclamacoes/:id/concluir',verificarToken,async(req,res)=>{if(!(await podeRegistrarReclamacao(req)))return res.status(403).json({error:'Acesso negado'});try{await prepararStatusReclamacoes();const r=await pool.query("UPDATE reclamacoes SET status='concluido',concluido_em=NOW(),concluido_por=$1 WHERE id=$2 RETURNING *",[req.usuarioId,req.params.id]);if(!r.rows.length)return res.status(404).json({error:'Reclamação não encontrada'});res.json(r.rows[0]);}catch(error){console.error(error);res.status(500).json({error:'Não foi possível concluir a reclamação'});}});
app.post('/api/reclamacoes/:id/reabrir',verificarToken,async(req,res)=>{if(!(await podeRegistrarReclamacao(req)))return res.status(403).json({error:'Acesso negado'});try{await prepararStatusReclamacoes();const r=await pool.query("UPDATE reclamacoes SET status='aberto',concluido_em=NULL,concluido_por=NULL WHERE id=$1 RETURNING *",[req.params.id]);if(!r.rows.length)return res.status(404).json({error:'Reclamação não encontrada'});res.json(r.rows[0]);}catch(error){console.error(error);res.status(500).json({error:'Não foi possível reabrir a reclamação'});}});

app.patch('/api/reclamacoes/:id/status', verificarToken, async (req,res) => {
  if (!(await podeRegistrarReclamacao(req))) return res.status(403).json({error:'Acesso negado'});
  const status=String(req.body?.status||'');
  if(!['aberto','concluido'].includes(status))return res.status(400).json({error:'Status inválido'});
  const r=await pool.query(`UPDATE reclamacoes SET status=$1,concluido_em=CASE WHEN $1='concluido' THEN NOW() ELSE NULL END,concluido_por=CASE WHEN $1='concluido' THEN $2 ELSE NULL END WHERE id=$3 RETURNING *`,[status,req.usuarioId,req.params.id]);
  if(!r.rows.length)return res.status(404).json({error:'Reclamação não encontrada'});
  res.json(r.rows[0]);
});
app.put('/api/reclamacoes/:id/status', verificarToken, async (req,res) => {
  if (!(await podeRegistrarReclamacao(req))) return res.status(403).json({error:'Acesso negado'});
  const status=String(req.body?.status||'');
  if(!['aberto','concluido'].includes(status))return res.status(400).json({error:'Status inválido'});
  try{const r=await pool.query(`UPDATE reclamacoes SET status=$1,concluido_em=CASE WHEN $1='concluido' THEN NOW() ELSE NULL END,concluido_por=CASE WHEN $1='concluido' THEN $2 ELSE NULL END WHERE id=$3 RETURNING *`,[status,req.usuarioId,req.params.id]);if(!r.rows.length)return res.status(404).json({error:'Reclamação não encontrada'});res.json(r.rows[0]);}catch(error){console.error('Erro ao alterar reclamação:',error.message);res.status(500).json({error:'Não foi possível alterar o status da reclamação'});}
});

app.delete('/api/reclamacoes/:id', verificarToken, async (req,res) => {
  if(normalizarPerfil(req.usuarioPerfil)!=='administrador')return res.status(403).json({error:'Somente o Administrador pode excluir reclamações'});
  await pool.query('DELETE FROM reclamacoes WHERE id=$1',[req.params.id]);res.json({mensagem:'Reclamação excluída.'});
});

for (const [rota,tabela] of [['clientes','clientes_reclamacao'],['tipos','tipos_reclamacao'],['setores','setores_reclamacao']]) {
  const prioridadeValida = p => ['verde','amarelo','vermelho'].includes(String(p||''));
  app.post(`/api/configuracoes/reclamacoes/${rota}`,verificarToken,async(req,res)=>{if(normalizarPerfil(req.usuarioPerfil)!=='administrador')return res.status(403).json({error:'Acesso negado'});const nome=String(req.body?.nome||'').trim();if(nome.length<2)return res.status(400).json({error:'Informe um nome válido'});try{
    const r = rota==='tipos'
      ? await pool.query(`INSERT INTO ${tabela} (nome,prioridade,ativo) VALUES ($1,$2,TRUE) ON CONFLICT (nome) DO UPDATE SET ativo=TRUE RETURNING *`,[nome,prioridadeValida(req.body?.prioridade)?req.body.prioridade:'verde'])
      : await pool.query(`INSERT INTO ${tabela} (nome,ativo) VALUES ($1,TRUE) ON CONFLICT (nome) DO UPDATE SET ativo=TRUE RETURNING *`,[nome]);
    res.status(201).json(r.rows[0]);}catch(e){res.status(500).json({error:'Erro ao salvar cadastro'});}});
  app.delete(`/api/configuracoes/reclamacoes/${rota}/:id`,verificarToken,async(req,res)=>{if(normalizarPerfil(req.usuarioPerfil)!=='administrador')return res.status(403).json({error:'Acesso negado'});await pool.query(`UPDATE ${tabela} SET ativo=FALSE WHERE id=$1`,[req.params.id]);res.json({mensagem:'Cadastro desativado.'});});
  app.put(`/api/configuracoes/reclamacoes/${rota}/:id`,verificarToken,async(req,res)=>{if(normalizarPerfil(req.usuarioPerfil)!=='administrador')return res.status(403).json({error:'Acesso negado'});try{
    if (rota==='tipos') {
      const sets=[],vals=[];
      if (req.body?.nome !== undefined) { const nome=String(req.body.nome||'').trim();if(nome.length<2)return res.status(400).json({error:'Informe um nome válido'});vals.push(nome);sets.push(`nome=$${vals.length}`); }
      if (req.body?.prioridade !== undefined) { if(!prioridadeValida(req.body.prioridade))return res.status(400).json({error:'Prioridade inválida'});vals.push(req.body.prioridade);sets.push(`prioridade=$${vals.length}`); }
      if (!sets.length) return res.status(400).json({error:'Nada para atualizar'});
      vals.push(req.params.id);
      const r=await pool.query(`UPDATE ${tabela} SET ${sets.join(', ')} WHERE id=$${vals.length} AND ativo=TRUE RETURNING *`,vals);
      if(!r.rows.length)return res.status(404).json({error:'Cadastro não encontrado'});return res.json(r.rows[0]);
    }
    const nome=String(req.body?.nome||'').trim();if(nome.length<2)return res.status(400).json({error:'Informe um nome válido'});const r=await pool.query(`UPDATE ${tabela} SET nome=$1 WHERE id=$2 AND ativo=TRUE RETURNING *`,[nome,req.params.id]);if(!r.rows.length)return res.status(404).json({error:'Cadastro não encontrado'});res.json(r.rows[0]);}catch(e){if(e.code==='23505')return res.status(409).json({error:'Já existe um cadastro com esse nome'});res.status(500).json({error:'Erro ao editar cadastro'});}});
}

app.put('/api/configuracoes/reclamacoes/prazos',verificarToken,async(req,res)=>{
  if(normalizarPerfil(req.usuarioPerfil)!=='administrador')return res.status(403).json({error:'Acesso negado'});
  const verde=Number(req.body?.prazo_verde_min),amarelo=Number(req.body?.prazo_amarelo_min),vermelho=Number(req.body?.prazo_vermelho_min);
  if(![verde,amarelo,vermelho].every(v=>Number.isInteger(v)&&v>=1&&v<=43200))return res.status(400).json({error:'Os prazos devem ter entre 1 minuto e 30 dias'});
  const r=await pool.query('UPDATE configuracao_reclamacoes SET prazo_verde_min=$1,prazo_amarelo_min=$2,prazo_vermelho_min=$3,atualizado_em=NOW() WHERE id=TRUE RETURNING *',[verde,amarelo,vermelho]);res.json(r.rows[0]);
});

app.get('/api/categorias-acesso',verificarToken,async(req,res)=>{if(normalizarPerfil(req.usuarioPerfil)!=='administrador')return res.status(403).json({error:'Acesso negado'});const r=await pool.query('SELECT * FROM categorias_acesso WHERE ativo=TRUE ORDER BY nome');res.json(r.rows);});
app.post('/api/categorias-acesso',verificarToken,async(req,res)=>{if(normalizarPerfil(req.usuarioPerfil)!=='administrador')return res.status(403).json({error:'Acesso negado'});const nome=String(req.body?.nome||'').trim(),permissoes=Array.isArray(req.body?.permissoes)?req.body.permissoes:[];if(nome.length<2)return res.status(400).json({error:'Informe o nome da categoria'});try{const r=await pool.query('INSERT INTO categorias_acesso (nome,permissoes,ativo) VALUES ($1,$2,TRUE) RETURNING *',[nome,JSON.stringify(permissoes)]);res.status(201).json(r.rows[0]);}catch(e){if(e.code==='23505')return res.status(409).json({error:'Já existe uma categoria com esse nome'});res.status(500).json({error:'Erro ao criar categoria'});}});
app.put('/api/categorias-acesso/:id',verificarToken,somenteAdministrador,async(req,res)=>{const nome=String(req.body?.nome||'').trim(),permissoes=Array.isArray(req.body?.permissoes)?req.body.permissoes:[];if(nome.length<2)return res.status(400).json({error:'Informe o nome da categoria'});try{const r=await pool.query('UPDATE categorias_acesso SET nome=$1,permissoes=$2::jsonb WHERE id=$3 AND ativo=TRUE RETURNING *',[nome,JSON.stringify(permissoes),req.params.id]);if(!r.rows.length)return res.status(404).json({error:'Categoria não encontrada'});res.json(r.rows[0]);}catch(e){if(e.code==='23505')return res.status(409).json({error:'Já existe uma categoria com esse nome'});res.status(500).json({error:'Erro ao editar categoria'});}});
app.delete('/api/categorias-acesso/:id',verificarToken,somenteAdministrador,async(req,res)=>{await pool.query('UPDATE usuarios SET categoria_acesso_id=NULL WHERE categoria_acesso_id=$1',[req.params.id]);const r=await pool.query('UPDATE categorias_acesso SET ativo=FALSE WHERE id=$1 RETURNING id',[req.params.id]);if(!r.rows.length)return res.status(404).json({error:'Categoria não encontrada'});res.json({mensagem:'Categoria removida e desvinculada dos usuários.'});});

// ============ MÓDULO ASO — Fase 1 (23/09/2026) ============
// Tabelas novas com FK para usuarios (não recria funcionários/usuários).
// Importação preserva faixa da planilha em faixa_importada; o cálculo
// e o job diário usam a regra do prompt (ver backend/aso.js).
async function inicializarASO() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS locais_exame (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(180) NOT NULL,
      cnpj VARCHAR(20) NOT NULL DEFAULT '',
      endereco TEXT NOT NULL DEFAULT '',
      cidade VARCHAR(120) NOT NULL DEFAULT '',
      uf CHAR(2) NOT NULL DEFAULT '',
      cep VARCHAR(10) NOT NULL DEFAULT '',
      telefone VARCHAR(30) NOT NULL DEFAULT '',
      email VARCHAR(120) NOT NULL DEFAULT '',
      responsavel VARCHAR(150) NOT NULL DEFAULT '',
      observacoes TEXT NOT NULL DEFAULT '',
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS asos (
      id SERIAL PRIMARY KEY,
      usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
      nome_funcionario VARCHAR(150) NOT NULL,
      matricula VARCHAR(30) NOT NULL DEFAULT '',
      data_admissao DATE,
      ultimo_exame DATE,
      vencimento DATE,
      pdf_url VARCHAR(255) NOT NULL DEFAULT '',
      dias_periodo INT,
      dias_restantes INT,
      percentual_restante NUMERIC,
      faixa VARCHAR(20) NOT NULL DEFAULT 'Pendente',
      faixa_importada VARCHAR(20) NOT NULL DEFAULT '',
      presenca_confirmada BOOLEAN NOT NULL DEFAULT FALSE,
      presenca_confirmada_em TIMESTAMP,
      criado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS asos_faixa_idx ON asos (faixa);
    CREATE INDEX IF NOT EXISTS asos_vencimento_idx ON asos (vencimento);
    CREATE TABLE IF NOT EXISTS agendamentos_aso (
      id SERIAL PRIMARY KEY,
      aso_id INT REFERENCES asos(id) ON DELETE CASCADE,
      usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
      nome_funcionario VARCHAR(150) NOT NULL,
      data_hora TIMESTAMP NOT NULL,
      local_id INT REFERENCES locais_exame(id) ON DELETE SET NULL,
      observacoes TEXT NOT NULL DEFAULT '',
      presenca_confirmada BOOLEAN NOT NULL DEFAULT FALSE,
      realizado BOOLEAN NOT NULL DEFAULT FALSE,
      criado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS agendamentos_aso_data_idx ON agendamentos_aso (data_hora);
    CREATE TABLE IF NOT EXISTS logs_auditoria (
      id SERIAL PRIMARY KEY,
      usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
      acao VARCHAR(60) NOT NULL,
      entidade VARCHAR(60) NOT NULL,
      entidade_id INT,
      detalhes TEXT NOT NULL DEFAULT '',
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS logs_auditoria_entidade_idx ON logs_auditoria (entidade, entidade_id);
  `);
}

async function registrarLog(usuarioId, acao, entidade, entidadeId, detalhes) {
  try {
    await pool.query(
      'INSERT INTO logs_auditoria (usuario_id,acao,entidade,entidade_id,detalhes) VALUES ($1,$2,$3,$4,$5)',
      [usuarioId || null, String(acao || '').slice(0, 60), String(entidade || '').slice(0, 60), entidadeId || null, String(detalhes || '')]
    );
  } catch (e) { console.error('Erro ao registrar log:', e.message); }
}

// RH = Gerente, Administrador e o perfil RH (criado em 22/10/2026).
// 24/10/2026: o Gerente ficou só com Folgas e Banco de Horas.
// ASO, Atendimento (fila do RH), Comunicados e Desabafos são de Administrador e RH.
const PERFIS_RH = ['administrador', 'gerente', 'rh'];
const ehRH = (perfil) => PERFIS_RH.includes(String(perfil || '').toLowerCase());
// Gestão de Folgas e Banco de Horas: Administrador, Gerente e RH.
// (O Gerente ficou só com esses dois módulos em 24/10/2026.)
const perfilGestorRH = (perfil) => ['administrador', 'gerente', 'rh'].includes(normalizarPerfil(perfil));
// Gestão de Comunicados: Administrador e RH (Gerente lê como funcionário).
const perfilGestorComunicados = (perfil) => ['administrador', 'rh'].includes(normalizarPerfil(perfil));
// Gestão de ASO (ASOs, agendamentos e locais de exame): Administrador e RH.
const perfilGestorASO = (perfil) => ['administrador', 'rh'].includes(normalizarPerfil(perfil));
// Fila de atendimento (tickets): Administrador e RH. O Gerente continua podendo
// abrir e responder os próprios tickets, como qualquer funcionário.
const ehGestorAtendimento = (perfil) => ['administrador', 'rh'].includes(normalizarPerfil(perfil));
// Quem recebe as notificações operacionais do RH (ticket novo/mensagem, folga
// solicitada, ASO vencido/confirmado): SOMENTE o perfil RH (22/10/2026).
// Gerente e Administrador saíram da lista a pedido do mantenedor.
const SQL_DESTINATARIOS_RH = `LOWER(perfil)='rh'`;

const pdfASO = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const safeName = String(file.originalname || 'aso.pdf').replace(/[^a-zA-Z0-9.-]/g, '_');
      cb(null, 'aso-' + uniqueSuffix + '-' + safeName);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/pdf$/i.test(file.mimetype || '') || /\.pdf$/i.test(file.originalname || '')) cb(null, true);
    else cb(new Error('Envie um arquivo PDF.'));
  }
});

function recalcLinhaASO(ultimoExame, vencimento, hoje = new Date().toISOString().slice(0, 10)) {
  const toISO = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : null);
  return calcularASO(toISO(ultimoExame), toISO(vencimento), hoje);
}

// Recalcula dias_restantes/percentual/faixa de todos; notifica mudanças de faixa e vencidos.
// Retorna { atualizados, mudancas }.
async function recalcularASOs(job = false) {
  const r = await pool.query('SELECT id,usuario_id,nome_funcionario,ultimo_exame,vencimento,faixa FROM asos');
  const hoje = new Date().toISOString().slice(0, 10);
  let atualizados = 0;
  const mudancas = [];
  for (const a of r.rows) {
    const c = recalcLinhaASO(a.ultimo_exame, a.vencimento, hoje);
    await pool.query(
      'UPDATE asos SET dias_periodo=$1,dias_restantes=$2,percentual_restante=$3,faixa=$4,atualizado_em=NOW() WHERE id=$5',
      [c.diasPeriodo, c.diasRestantes, c.percentualRestante, c.faixa, a.id]
    );
    atualizados++;
    if (a.faixa !== c.faixa) {
      mudancas.push({ id: a.id, nome: a.nome_funcionario, de: a.faixa, para: c.faixa });
      if (a.usuario_id) {
        const tipo = c.faixa === 'Vermelho' || c.vencido ? 'aso_vencido' : 'aso_faixa';
        await criarNotificacao(a.usuario_id, tipo, c.vencido ? 'ASO vencido' : `ASO mudou para ${c.faixa}`,
          `${a.nome_funcionario}: ${a.faixa || '?'} → ${c.faixa}`, '/aso', `aso:${a.id}:${c.faixa}`);
      }
    } else if (c.vencido && a.usuario_id) {
      await criarNotificacao(a.usuario_id, 'aso_vencido', 'ASO vencido',
        `${a.nome_funcionario}: vencimento ${String(a.vencimento).slice(0, 10)}`, '/aso', `aso:${a.id}:vencido`);
    }
  }
  if (job && mudancas.length) console.log(`[ASO job] ${atualizados} recalculados, ${mudancas.length} mudanças de faixa.`);
  return { atualizados, mudancas };
}

// Job diário à meia-noite (horário do servidor).
setInterval(async () => {
  try { await recalcularASOs(true); } catch (e) { console.error('Erro no job ASO:', e.message); }
}, 24 * 60 * 60 * 1000);

// ---- Locais de exame ----
app.get('/api/locais-exame', verificarToken, async (req, res) => {
  try {
    const busca = String(req.query.busca || '').trim();
    const situacao = String(req.query.situacao || 'ativos'); // ativos | inativos | todos
    const conds = [], params = [];
    if (situacao === 'ativos') conds.push('ativo=TRUE');
    else if (situacao === 'inativos') conds.push('ativo=FALSE');
    if (busca) { params.push(`%${busca}%`); conds.push(`(nome ILIKE $${params.length} OR cidade ILIKE $${params.length})`); }
    const r = await pool.query(`SELECT * FROM locais_exame ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''} ORDER BY ativo DESC, nome`, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar locais' }); }
});

app.post('/api/locais-exame', verificarToken, async (req, res) => {
  if (!perfilGestorASO(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  const b = req.body || {};
  const nome = String(b.nome || '').trim();
  if (nome.length < 2) return res.status(400).json({ error: 'Informe o nome do local' });
  try {
    const r = await pool.query(
      `INSERT INTO locais_exame (nome,cnpj,endereco,cidade,uf,cep,telefone,email,responsavel,observacoes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [nome, String(b.cnpj || '').trim(), String(b.endereco || '').trim(), String(b.cidade || '').trim(),
       String(b.uf || '').trim().toUpperCase().slice(0, 2), String(b.cep || '').trim(), String(b.telefone || '').trim(),
       String(b.email || '').trim(), String(b.responsavel || '').trim(), String(b.observacoes || '').trim()]
    );
    await registrarLog(req.usuarioId, 'criar', 'local_exame', r.rows[0].id, nome);
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar local' }); }
});

app.put('/api/locais-exame/:id', verificarToken, async (req, res) => {
  if (!perfilGestorASO(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  const b = req.body || {};
  const nome = String(b.nome || '').trim();
  if (nome.length < 2) return res.status(400).json({ error: 'Informe o nome do local' });
  const r = await pool.query(
    `UPDATE locais_exame SET nome=$1,cnpj=$2,endereco=$3,cidade=$4,uf=$5,cep=$6,telefone=$7,email=$8,
     responsavel=$9,observacoes=$10,ativo=COALESCE($11,ativo) WHERE id=$12 RETURNING *`,
    [nome, String(b.cnpj || ''), String(b.endereco || ''), String(b.cidade || ''), String(b.uf || '').toUpperCase().slice(0, 2),
     String(b.cep || ''), String(b.telefone || ''), String(b.email || ''), String(b.responsavel || ''),
     String(b.observacoes || ''), b.ativo === undefined ? null : Boolean(b.ativo), req.params.id]
  );
  if (!r.rows.length) return res.status(404).json({ error: 'Local não encontrado' });
  await registrarLog(req.usuarioId, 'editar', 'local_exame', r.rows[0].id, nome);
  res.json(r.rows[0]);
});

app.delete('/api/locais-exame/:id', verificarToken, async (req, res) => {
  if (!perfilGestorASO(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  const fut = await pool.query(
    `SELECT COUNT(*)::int AS total FROM agendamentos_aso WHERE local_id=$1 AND realizado=FALSE AND data_hora >= NOW()`,
    [req.params.id]
  );
  if (Number(fut.rows[0].total) > 0) {
    return res.status(409).json({ error: 'Há agendamentos futuros neste local. Inative em vez de excluir.', agendamentos_futuros: Number(fut.rows[0].total) });
  }
  const r = await pool.query('DELETE FROM locais_exame WHERE id=$1 RETURNING id', [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Local não encontrado' });
  await registrarLog(req.usuarioId, 'excluir', 'local_exame', req.params.id, '');
  res.json({ mensagem: 'Local excluído.' });
});

// ---- ASO ----
app.get('/api/asos', verificarToken, async (req, res) => {
  try {
    const { faixa, busca } = req.query;
    const conds = [], params = [];
    if (!perfilGestorASO(req.usuarioPerfil)) { params.push(req.usuarioId); conds.push('(a.usuario_id=$' + params.length + ')'); }
    if (faixa && FAIXAS_VALIDAS.includes(String(faixa))) { params.push(String(faixa)); conds.push(`faixa=$${params.length}`); }
    if (busca) { params.push(`%${String(busca).trim()}%`); conds.push(`(nome_funcionario ILIKE $${params.length} OR matricula ILIKE $${params.length})`); }
    const r = await pool.query(
      `SELECT a.*, l.nome AS local_nome FROM asos a LEFT JOIN agendamentos_aso ag ON ag.aso_id=a.id AND ag.realizado=FALSE
       LEFT JOIN locais_exame l ON l.id=ag.local_id ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''} ORDER BY a.vencimento NULLS LAST, a.nome_funcionario`,
      params
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar ASOs' }); }
});

app.get('/api/asos/resumo', verificarToken, async (req, res) => {
  try {
    if (!perfilGestorASO(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
    const r = await pool.query(`SELECT faixa,COUNT(*)::int AS total FROM asos GROUP BY faixa`);
    const contadores = { Vermelho: 0, Laranja: 0, Amarelo: 0, Verde: 0, Pendente: 0 };
    for (const x of r.rows) if (contadores[x.faixa] !== undefined) contadores[x.faixa] = x.total;
    const total = Object.values(contadores).reduce((t, v) => t + v, 0);
    res.json({ total, por_faixa: contadores });
  } catch (e) { res.status(500).json({ error: 'Erro ao resumir ASOs' }); }
});

app.get('/api/asos/meu', verificarToken, async (req, res) => {
  const r = await pool.query('SELECT * FROM asos WHERE usuario_id=$1 ORDER BY vencimento NULLS LAST LIMIT 1', [req.usuarioId]);
  if (!r.rows.length) {
    const u = await pool.query('SELECT nome FROM usuarios WHERE id=$1', [req.usuarioId]);
    const nome = u.rows[0]?.nome || '';
    const porNome = await pool.query('SELECT * FROM asos WHERE usuario_id IS NULL AND nome_funcionario ILIKE $1 ORDER BY vencimento NULLS LAST LIMIT 1', [nome]);
    return res.json(porNome.rows[0] || null);
  }
  const ag = await pool.query(
    `SELECT ag.*, l.nome AS local_nome FROM agendamentos_aso ag LEFT JOIN locais_exame l ON l.id=ag.local_id
     WHERE ag.aso_id=$1 ORDER BY ag.data_hora DESC LIMIT 5`, [r.rows[0].id]
  );
  res.json({ ...r.rows[0], agendamentos: ag.rows });
});

app.post('/api/asos', verificarToken, async (req, res) => {
  if (!perfilGestorASO(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  const b = req.body || {};
  const nome = String(b.nome_funcionario || '').trim();
  if (nome.length < 2) return res.status(400).json({ error: 'Informe o nome do funcionário' });
  let usuarioId = b.usuario_id ? Number(b.usuario_id) : null;
  if (!usuarioId) {
    const u = await pool.query('SELECT id FROM usuarios WHERE nome ILIKE $1 LIMIT 1', [nome]);
    if (u.rows.length) usuarioId = Number(u.rows[0].id);
  }
  const c = recalcLinhaASO(b.ultimo_exame || null, b.vencimento || null);
  try {
    const r = await pool.query(
      `INSERT INTO asos (usuario_id,nome_funcionario,matricula,data_admissao,ultimo_exame,vencimento,
       dias_periodo,dias_restantes,percentual_restante,faixa,faixa_importada,criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [usuarioId, nome, String(b.matricula || '').trim(), b.data_admissao || null, b.ultimo_exame || null,
       b.vencimento || null, c.diasPeriodo, c.diasRestantes, c.percentualRestante, c.faixa,
       String(b.faixa_importada || '').trim(), req.usuarioId]
    );
    await registrarLog(req.usuarioId, 'criar', 'aso', r.rows[0].id, nome);
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erro ao cadastrar ASO' }); }
});

app.put('/api/asos/:id', verificarToken, async (req, res) => {
  if (!perfilGestorASO(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  const atual = await pool.query('SELECT * FROM asos WHERE id=$1', [req.params.id]);
  if (!atual.rows.length) return res.status(404).json({ error: 'ASO não encontrado' });
  const b = req.body || {};
  const a = atual.rows[0];
  const ultimo = b.ultimo_exame !== undefined ? (b.ultimo_exame || null) : a.ultimo_exame;
  const venc = b.vencimento !== undefined ? (b.vencimento || null) : a.vencimento;
  const c = recalcLinhaASO(ultimo, venc);
  const faixaAntes = a.faixa;
  const r = await pool.query(
    `UPDATE asos SET nome_funcionario=COALESCE($1,nome_funcionario),matricula=COALESCE($2,matricula),
     data_admissao=COALESCE($3,data_admissao),ultimo_exame=$4,vencimento=$5,dias_periodo=$6,dias_restantes=$7,
     percentual_restante=$8,faixa=$9,usuario_id=COALESCE($10,usuario_id),atualizado_em=NOW() WHERE id=$11 RETURNING *`,
    [b.nome_funcionario ? String(b.nome_funcionario).trim() : null, b.matricula !== undefined ? String(b.matricula).trim() : null,
     b.data_admissao !== undefined ? (b.data_admissao || null) : null, ultimo, venc,
     c.diasPeriodo, c.diasRestantes, c.percentualRestante, c.faixa,
     b.usuario_id ? Number(b.usuario_id) : null, req.params.id]
  );
  await registrarLog(req.usuarioId, 'editar', 'aso', req.params.id, `${a.nome_funcionario} (${faixaAntes}→${c.faixa})`);
  if (faixaAntes !== c.faixa && r.rows[0].usuario_id) {
    await criarNotificacao(r.rows[0].usuario_id, 'aso_faixa', `ASO mudou para ${c.faixa}`,
      `${r.rows[0].nome_funcionario}: ${faixaAntes} → ${c.faixa}`, '/aso', `aso:${r.rows[0].id}:${c.faixa}`);
  }
  if (c.vencido) {
    if (r.rows[0].usuario_id) {
      await criarNotificacao(r.rows[0].usuario_id, 'aso_vencido', 'ASO vencido',
        `${r.rows[0].nome_funcionario}: vencimento ${String(venc).slice(0, 10)} — procure o RH`, '/aso', `aso:${r.rows[0].id}:vencido`);
    }
    const rhs = await pool.query(`SELECT id FROM usuarios WHERE ${SQL_DESTINATARIOS_RH}`);
    for (const rh of rhs.rows) {
      if (Number(rh.id) === Number(req.usuarioId)) continue;
      await criarNotificacao(rh.id, 'aso_vencido', 'ASO vencido',
        `${r.rows[0].nome_funcionario}: vencimento ${String(venc).slice(0, 10)}`, '/aso', `aso:${r.rows[0].id}:vencido-rh`);
    }
  }
  res.json(r.rows[0]);
});

// Importação em massa a partir da planilha (arquivo .xlsx OU JSON já convertido).
// Preserva faixa_importada da planilha; faixa calculada segue a regra do prompt.
const importarXLSX = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
app.post('/api/asos/importar', verificarToken, importarXLSX.single('arquivo'), async (req, res) => {
  if (!perfilGestorASO(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  let linhas = Array.isArray(req.body?.linhas) ? req.body.linhas : [];
  if (req.file) {
    if (!XLSX) return res.status(500).json({ error: 'Leitor de planilha indisponível no servidor' });
    try {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const ws = wb.Sheets['Planilha1'] || wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      // Layout da tabela ASO: col B=nome, C=admissão, D=último exame, E=vencimento, I=faixa (índices 1,2,3,4,8).
      linhas = rows.slice(3)
        .filter((r) => String(r[1] || '').trim().length >= 2)
        .map((r) => ({
          nome_funcionario: String(r[1]).trim(),
          data_admissao: typeof r[2] === 'number' ? excelSerialToISO(r[2]) : (r[2] || null),
          ultimo_exame: typeof r[3] === 'number' ? excelSerialToISO(r[3]) : (r[3] || null),
          vencimento: typeof r[4] === 'number' ? excelSerialToISO(r[4]) : (r[4] || null),
          faixa: r[8] || '',
        }));
    } catch (e) { return res.status(400).json({ error: 'Não foi possível ler a planilha' }); }
  }
  if (!linhas.length) return res.status(400).json({ error: 'Envie linhas para importar' });
  if (linhas.length > 500) return res.status(400).json({ error: 'Máximo de 500 linhas por importação' });
  let criados = 0, atualizados = 0;
  for (const l of linhas) {
    const nome = String(l.nome_funcionario || l.nome || '').trim();
    if (nome.length < 2) continue;
    const matricula = String(l.matricula || '').trim();
    const ultimo = l.ultimo_exame || null, venc = l.vencimento || null;
    const c = recalcLinhaASO(ultimo, venc);
    const faixaImportada = normalizarFaixaPlanilha(l.faixa || l.faixa_importada || '');
    let usuarioId = l.usuario_id ? Number(l.usuario_id) : null;
    if (!usuarioId) {
      const u = await pool.query('SELECT id FROM usuarios WHERE nome ILIKE $1 LIMIT 1', [nome]);
      if (u.rows.length) usuarioId = Number(u.rows[0].id);
    }
    const existe = await pool.query(
      `SELECT id FROM asos WHERE (matricula<>'' AND matricula=$1) OR (usuario_id IS NOT DISTINCT FROM $2 AND nome_funcionario ILIKE $3) LIMIT 1`,
      [matricula, usuarioId, nome]
    );
    if (existe.rows.length) {
      await pool.query(
        `UPDATE asos SET ultimo_exame=COALESCE($1,ultimo_exame),vencimento=COALESCE($2,vencimento),
         data_admissao=COALESCE($3,data_admissao),matricula=CASE WHEN $4<>'' THEN $4 ELSE matricula END,
         dias_periodo=$5,dias_restantes=$6,percentual_restante=$7,faixa=$8,faixa_importada=$9,
         usuario_id=COALESCE($10,usuario_id),atualizado_em=NOW() WHERE id=$11`,
        [ultimo, venc, l.data_admissao || null, matricula, c.diasPeriodo, c.diasRestantes,
         c.percentualRestante, c.faixa, faixaImportada === 'Pendente' ? '' : faixaImportada, usuarioId, existe.rows[0].id]
      );
      atualizados++;
    } else {
      await pool.query(
        `INSERT INTO asos (usuario_id,nome_funcionario,matricula,data_admissao,ultimo_exame,vencimento,
         dias_periodo,dias_restantes,percentual_restante,faixa,faixa_importada,criado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [usuarioId, nome, matricula, l.data_admissao || null, ultimo, venc, c.diasPeriodo,
         c.diasRestantes, c.percentualRestante, c.faixa, faixaImportada === 'Pendente' ? '' : faixaImportada, req.usuarioId]
      );
      criados++;
    }
  }
  await registrarLog(req.usuarioId, 'importar', 'aso', null, `${criados} criados, ${atualizados} atualizados`);
  res.json({ criados, atualizados });
});

app.post('/api/asos/recalcular', verificarToken, async (req, res) => {
  if (!perfilGestorASO(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  const r = await recalcularASOs();
  await registrarLog(req.usuarioId, 'recalcular', 'aso', null, `${r.atualizados} recalculados`);
  res.json(r);
});

app.post('/api/asos/:id/pdf', verificarToken, pdfASO.single('pdf'), async (req, res) => {
  if (!perfilGestorASO(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  if (!req.file) return res.status(400).json({ error: 'Envie o PDF do exame' });
  const url = `/uploads/${req.file.filename}`;
  const r = await pool.query('UPDATE asos SET pdf_url=$1,atualizado_em=NOW() WHERE id=$2 RETURNING *', [url, req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'ASO não encontrado' });
  await registrarLog(req.usuarioId, 'anexar_pdf', 'aso', req.params.id, url);
  if (r.rows[0].usuario_id) {
    await criarNotificacao(r.rows[0].usuario_id, 'aso_agendado', 'Novo documento de ASO',
      `${r.rows[0].nome_funcionario}: PDF atualizado`, '/aso', `aso:${r.rows[0].id}:pdf`);
  }
  res.json(r.rows[0]);
});

app.post('/api/asos/:id/confirmar-presenca', verificarToken, async (req, res) => {
  const r = await pool.query('SELECT * FROM asos WHERE id=$1', [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'ASO não encontrado' });
  const a = r.rows[0];
  if (!perfilGestorASO(req.usuarioPerfil) && Number(a.usuario_id) !== Number(req.usuarioId)) {
    return res.status(403).json({ error: 'Você só pode confirmar o próprio ASO' });
  }
  const upd = await pool.query(
    'UPDATE asos SET presenca_confirmada=TRUE,presenca_confirmada_em=NOW(),atualizado_em=NOW() WHERE id=$1 RETURNING *', [req.params.id]
  );
  await registrarLog(req.usuarioId, 'confirmar_presenca', 'aso', req.params.id, a.nome_funcionario);
  const destinosAso = await pool.query(`SELECT id FROM usuarios WHERE ${SQL_DESTINATARIOS_RH}`);
  for (const adm of destinosAso.rows) {
    await criarNotificacao(adm.id, 'aso_confirmado', 'Presença confirmada', `${a.nome_funcionario} confirmou presença no ASO`, '/aso', `aso:${a.id}:presenca`);
  }
  res.json(upd.rows[0]);
});

// ---- Agendamentos de ASO ----
app.get('/api/agendamentos-aso', verificarToken, async (req, res) => {
  try {
    let q = `SELECT ag.*, l.nome AS local_nome FROM agendamentos_aso ag LEFT JOIN locais_exame l ON l.id=ag.local_id`;
    const params = [];
    if (!perfilGestorASO(req.usuarioPerfil)) { params.push(req.usuarioId); q += ` WHERE ag.usuario_id=$${params.length}`; }
    q += ' ORDER BY ag.data_hora';
    const r = await pool.query(q, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar agendamentos' }); }
});

app.post('/api/agendamentos-aso', verificarToken, async (req, res) => {
  if (!perfilGestorASO(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  const b = req.body || {};
  const nome = String(b.nome_funcionario || '').trim();
  if (!b.aso_id || !b.data_hora || !nome) return res.status(400).json({ error: 'Informe funcionário, ASO e data/hora' });
  let localId = b.local_id ? Number(b.local_id) : null;
  if (localId) {
    const l = await pool.query('SELECT id FROM locais_exame WHERE id=$1 AND ativo=TRUE', [localId]);
    if (!l.rows.length) return res.status(400).json({ error: 'Selecione um local ativo' });
  }
  const aso = await pool.query('SELECT usuario_id,nome_funcionario FROM asos WHERE id=$1', [Number(b.aso_id)]);
  if (!aso.rows.length) return res.status(404).json({ error: 'ASO não encontrado' });
  const r = await pool.query(
    `INSERT INTO agendamentos_aso (aso_id,usuario_id,nome_funcionario,data_hora,local_id,observacoes,criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [Number(b.aso_id), aso.rows[0].usuario_id, nome, b.data_hora, localId, String(b.observacoes || '').trim(), req.usuarioId]
  );
  await registrarLog(req.usuarioId, 'criar', 'agendamento_aso', r.rows[0].id, `${nome} em ${b.data_hora}`);
  if (aso.rows[0].usuario_id) {
    await criarNotificacao(aso.rows[0].usuario_id, 'aso_agendado', 'ASO agendado',
      `${nome}: ${new Date(b.data_hora).toLocaleString('pt-BR')}`, '/aso', `agaso:${r.rows[0].id}`);
  }
  res.status(201).json(r.rows[0]);
});

app.put('/api/agendamentos-aso/:id', verificarToken, async (req, res) => {
  if (!perfilGestorASO(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  const b = req.body || {};
  const sets = [], vals = [];
  if (b.data_hora) { vals.push(b.data_hora); sets.push(`data_hora=$${vals.length}`); }
  if (b.local_id !== undefined) { vals.push(b.local_id || null); sets.push(`local_id=$${vals.length}`); }
  if (b.observacoes !== undefined) { vals.push(String(b.observacoes)); sets.push(`observacoes=$${vals.length}`); }
  if (b.presenca_confirmada !== undefined) { vals.push(Boolean(b.presenca_confirmada)); sets.push(`presenca_confirmada=$${vals.length}`); }
  if (b.realizado !== undefined) { vals.push(Boolean(b.realizado)); sets.push(`realizado=$${vals.length}`); }
  if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar' });
  vals.push(req.params.id);
  const r = await pool.query(`UPDATE agendamentos_aso SET ${sets.join(', ')} WHERE id=$${vals.length} RETURNING *`, vals);
  if (!r.rows.length) return res.status(404).json({ error: 'Agendamento não encontrado' });
  await registrarLog(req.usuarioId, 'editar', 'agendamento_aso', req.params.id, b.data_hora ? `reagendado para ${b.data_hora}` : 'atualizado');
  if (b.data_hora && r.rows[0].usuario_id) {
    await criarNotificacao(r.rows[0].usuario_id, 'aso_agendado', 'ASO reagendado',
      `${r.rows[0].nome_funcionario}: ${new Date(b.data_hora).toLocaleString('pt-BR')}`, '/aso', `agaso:${r.rows[0].id}:${b.data_hora}`);
  }
  res.json(r.rows[0]);
});

app.delete('/api/agendamentos-aso/:id', verificarToken, async (req, res) => {
  if (!perfilGestorASO(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  const r = await pool.query('DELETE FROM agendamentos_aso WHERE id=$1 RETURNING id', [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Agendamento não encontrado' });
  await registrarLog(req.usuarioId, 'excluir', 'agendamento_aso', req.params.id, '');
  res.json({ mensagem: 'Agendamento excluído.' });
});

app.post('/api/agendamentos-aso/:id/confirmar', verificarToken, async (req, res) => {
  const r = await pool.query('SELECT * FROM agendamentos_aso WHERE id=$1', [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Agendamento não encontrado' });
  const ag = r.rows[0];
  if (!perfilGestorASO(req.usuarioPerfil) && Number(ag.usuario_id) !== Number(req.usuarioId)) {
    return res.status(403).json({ error: 'Você só pode confirmar o próprio agendamento' });
  }
  const upd = await pool.query('UPDATE agendamentos_aso SET presenca_confirmada=TRUE WHERE id=$1 RETURNING *', [req.params.id]);
  await registrarLog(req.usuarioId, 'confirmar_presenca', 'agendamento_aso', req.params.id, ag.nome_funcionario);
  res.json(upd.rows[0]);
});

// ============ FASE 2 — Central de Notificações + Chat/Tickets (23/09/2026) ============
async function inicializarFase2() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS comunicados (
      id SERIAL PRIMARY KEY,
      titulo VARCHAR(220) NOT NULL,
      mensagem TEXT NOT NULL DEFAULT '',
      prioridade VARCHAR(10) NOT NULL DEFAULT 'Normal',
      segmento VARCHAR(20) NOT NULL DEFAULT 'todos',
      agendado_para TIMESTAMP,
      enviado_em TIMESTAMP,
      criado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS comunicado_leituras (
      comunicado_id INT NOT NULL REFERENCES comunicados(id) ON DELETE CASCADE,
      usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      lido_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (comunicado_id, usuario_id)
    );
    CREATE TABLE IF NOT EXISTS notificacoes_config (
      usuario_id INT PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
      prefs JSONB NOT NULL DEFAULT '{}'::jsonb,
      atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE SEQUENCE IF NOT EXISTS ticket_num_seq;
    CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY,
      numero VARCHAR(20) UNIQUE NOT NULL,
      usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
      nome_solicitante VARCHAR(150) NOT NULL DEFAULT '',
      categoria VARCHAR(20) NOT NULL DEFAULT 'Outro',
      titulo VARCHAR(220) NOT NULL,
      descricao TEXT NOT NULL DEFAULT '',
      status VARCHAR(25) NOT NULL DEFAULT 'Atendendo',
      prioridade VARCHAR(10) NOT NULL DEFAULT 'Média',
      prazo_sla TIMESTAMP,
      fechado_em TIMESTAMP,
      criado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets (status);
    CREATE INDEX IF NOT EXISTS tickets_usuario_idx ON tickets (usuario_id);
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS criado_por INT REFERENCES usuarios(id) ON DELETE SET NULL;
    ALTER TABLE tickets ALTER COLUMN status SET DEFAULT 'Atendendo';
    -- Migração para os 3 status enxutos (23/10/2026).
    UPDATE tickets SET status='Atendendo' WHERE status IN ('Aberto','Em andamento');
    UPDATE tickets SET status='Pendente' WHERE status='Aguardando funcionário';
    UPDATE tickets SET status='Concluído' WHERE status IN ('Resolvido','Fechado');
    CREATE TABLE IF NOT EXISTS ticket_mensagens (
      id SERIAL PRIMARY KEY,
      ticket_id INT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
      nome_autor VARCHAR(150) NOT NULL DEFAULT '',
      texto TEXT NOT NULL DEFAULT '',
      anexo_url VARCHAR(255) NOT NULL DEFAULT '',
      anexo_nome VARCHAR(220) NOT NULL DEFAULT '',
      anexo_tipo VARCHAR(100) NOT NULL DEFAULT '',
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS ticket_mensagens_ticket_idx ON ticket_mensagens (ticket_id, criado_em);
    -- Desabafo anônimo (23/10/2026): enviado antes do login, sem vínculo com usuário.
    CREATE TABLE IF NOT EXISTS desabafos (
      id SERIAL PRIMARY KEY,
      mensagem TEXT NOT NULL,
      setor VARCHAR(60) NOT NULL DEFAULT '',
      lido_em TIMESTAMP,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

const TIPOS_NOTIF_OBRIGATORIOS = new Set(['aso_vencido', 'comunicado_oficial']);

// Anexos do chat: PDF/DOCX/XLSX/JPG/PNG/MP4/áudio até 50MB.
const chatUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const safeName = String(file.originalname || 'anexo').replace(/[^a-zA-Z0-9.-]/g, '_');
      cb(null, 'chat-' + uniqueSuffix + '-' + safeName);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /pdf|msword|officedocument|spreadsheet|excel|jpeg|png|jpg|mp4|audio|video|octet-stream/i.test(file.mimetype || '')
      || /\.(pdf|docx?|xlsx?|jpe?g|png|mp4|webm|mp3|m4a|ogg|wav)$/i.test(file.originalname || '');
    if (ok) cb(null, true);
    else cb(new Error('Tipo de arquivo não permitido.'));
  }
});

async function prefsNotificacao(usuarioId) {
  const r = await pool.query('SELECT prefs FROM notificacoes_config WHERE usuario_id=$1', [usuarioId]);
  return r.rows[0]?.prefs || {};
}

async function criarNotificacaoRespeitandoPrefs(usuarioId, tipo, titulo, mensagem, link, referencia) {
  if (TIPOS_NOTIF_OBRIGATORIOS.has(tipo)) return criarNotificacao(usuarioId, tipo, titulo, mensagem, link, referencia);
  const prefs = await prefsNotificacao(usuarioId);
  if (prefs[tipo] === false) return; // usuário desativou este tipo
  return criarNotificacao(usuarioId, tipo, titulo, mensagem, link, referencia);
}

async function enviarComunicado(id) {
  const c = await pool.query('SELECT * FROM comunicados WHERE id=$1', [id]);
  if (!c.rows.length || c.rows[0].enviado_em) return null;
  const com = c.rows[0];
  const dest = com.segmento === 'todos'
    ? await pool.query('SELECT id FROM usuarios')
    : await pool.query('SELECT id FROM usuarios WHERE LOWER(perfil)=$1', [String(com.segmento).toLowerCase()]);
  const pri = String(com.prioridade || 'Normal');
  for (const u of dest.rows) {
    await criarNotificacao(Number(u.id), 'comunicado_oficial', `${pri === 'Normal' ? '📢' : pri === 'Alta' ? '🔔' : '🚨'} ${com.titulo}`,
      String(com.mensagem || '').slice(0, 200), '/comunicados', `comunicado:${com.id}`);
  }
  await pool.query('UPDATE comunicados SET enviado_em=NOW() WHERE id=$1', [id]);
  await registrarLog(com.criado_por, 'enviar', 'comunicado', id, `${dest.rows.length} destinatários`);
  return dest.rows.length;
}

// Despacha comunicados agendados (verificação a cada minuto).
setInterval(async () => {
  try {
    const r = await pool.query(`SELECT id FROM comunicados WHERE enviado_em IS NULL AND agendado_para IS NOT NULL AND agendado_para <= NOW() LIMIT 10`);
    for (const row of r.rows) await enviarComunicado(row.id);
  } catch (e) { console.error('Erro no agendador de comunicados:', e.message); }
}, 60 * 1000);

// ---- Preferências de notificação ----
app.get('/api/notificacoes/config', verificarToken, async (req, res) => {
  const prefs = await prefsNotificacao(req.usuarioId);
  res.json({ prefs, obrigatorios: [...TIPOS_NOTIF_OBRIGATORIOS] });
});

app.put('/api/notificacoes/config', verificarToken, async (req, res) => {
  const prefs = req.body?.prefs && typeof req.body.prefs === 'object' ? req.body.prefs : {};
  const limpas = {};
  for (const [k, v] of Object.entries(prefs)) {
    if (TIPOS_NOTIF_OBRIGATORIOS.has(k)) continue; // ASO vencido e comunicados oficiais não podem ser desativados
    limpas[String(k).slice(0, 40)] = Boolean(v);
  }
  await pool.query(
    `INSERT INTO notificacoes_config (usuario_id,prefs) VALUES ($1,$2) ON CONFLICT (usuario_id) DO UPDATE SET prefs=$2,atualizado_em=NOW()`,
    [req.usuarioId, JSON.stringify(limpas)]
  );
  res.json({ prefs: limpas });
});

// ---- Comunicados (RH) ----
const SEGMENTOS_COMUNICADO = ['todos', 'leitor', 'editor', 'gerente', 'administrador'];
const PRIORIDADES_COMUNICADO = ['Normal', 'Alta', 'Urgente'];

app.get('/api/comunicados', verificarToken, async (req, res) => {
  if (perfilGestorComunicados(req.usuarioPerfil)) {
    const r = await pool.query(
      `SELECT c.*, u.nome AS criado_por_nome,
       (SELECT COUNT(*)::int FROM comunicado_leituras l WHERE l.comunicado_id=c.id) AS leituras,
       (SELECT COUNT(*)::int FROM usuarios) AS destinatarios
       FROM comunicados c LEFT JOIN usuarios u ON u.id=c.criado_por ORDER BY c.criado_em DESC LIMIT 100`
    );
    return res.json(r.rows);
  }
  const r = await pool.query(
    `SELECT c.*, (l.usuario_id IS NOT NULL) AS lido FROM comunicados c
     LEFT JOIN comunicado_leituras l ON l.comunicado_id=c.id AND l.usuario_id=$1
     WHERE c.enviado_em IS NOT NULL AND (c.segmento='todos' OR LOWER(c.segmento)=LOWER($2))
     ORDER BY c.enviado_em DESC LIMIT 100`,
    [req.usuarioId, req.usuarioPerfil]
  );
  res.json(r.rows);
});

app.post('/api/comunicados', verificarToken, async (req, res) => {
  if (!perfilGestorComunicados(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  const b = req.body || {};
  const titulo = String(b.titulo || '').trim();
  if (titulo.length < 3) return res.status(400).json({ error: 'Informe o título do comunicado' });
  const prioridade = PRIORIDADES_COMUNICADO.includes(b.prioridade) ? b.prioridade : 'Normal';
  const segmento = SEGMENTOS_COMUNICADO.includes(String(b.segmento)) ? String(b.segmento) : 'todos';
  const agendado = b.agendado_para || null;
  const r = await pool.query(
    `INSERT INTO comunicados (titulo,mensagem,prioridade,segmento,agendado_para,criado_por) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [titulo, String(b.mensagem || ''), prioridade, segmento, agendado, req.usuarioId]
  );
  await registrarLog(req.usuarioId, 'criar', 'comunicado', r.rows[0].id, `${titulo} [${prioridade}/${segmento}]${agendado ? ` agendado ${agendado}` : ''}`);
  if (!agendado) await enviarComunicado(r.rows[0].id);
  res.status(201).json(r.rows[0]);
});

app.post('/api/comunicados/:id/enviar', verificarToken, async (req, res) => {
  if (!perfilGestorComunicados(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  const total = await enviarComunicado(req.params.id);
  if (total === null) return res.status(404).json({ error: 'Comunicado não encontrado ou já enviado' });
  res.json({ destinatarios: total });
});

app.post('/api/comunicados/:id/reenviar', verificarToken, async (req, res) => {
  if (!perfilGestorComunicados(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  const c = await pool.query('SELECT * FROM comunicados WHERE id=$1', [req.params.id]);
  if (!c.rows.length) return res.status(404).json({ error: 'Comunicado não encontrado' });
  await pool.query('UPDATE comunicados SET enviado_em=NULL WHERE id=$1', [req.params.id]);
  const total = await enviarComunicado(req.params.id);
  res.json({ destinatarios: total });
});

app.get('/api/comunicados/:id/leituras', verificarToken, async (req, res) => {
  if (!perfilGestorComunicados(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  const r = await pool.query(
    `SELECT u.nome, l.lido_em FROM comunicado_leituras l JOIN usuarios u ON u.id=l.usuario_id WHERE l.comunicado_id=$1 ORDER BY l.lido_em DESC`,
    [req.params.id]
  );
  res.json(r.rows);
});

app.post('/api/comunicados/:id/ler', verificarToken, async (req, res) => {
  await pool.query('INSERT INTO comunicado_leituras (comunicado_id,usuario_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, req.usuarioId]);
  res.json({ ok: true });
});

// ---- Tickets / Chat interno ----
app.get('/api/tickets', verificarToken, async (req, res) => {
  try {
    const { status, categoria, busca, situacao, de, ate } = req.query;
    const conds = [], params = [];
    if (!ehGestorAtendimento(req.usuarioPerfil)) { params.push(req.usuarioId); conds.push(`t.usuario_id=$${params.length}`); }
    if (status && STATUS_TICKET.includes(String(status))) { params.push(String(status)); conds.push(`t.status=$${params.length}`); }
    else if (String(situacao || '') === 'historico') conds.push(`t.status='Concluído'`);
    else if (String(situacao || '') === 'ativos') conds.push(`t.status<>'Concluído'`);
    if (categoria && CATEGORIAS_TICKET.includes(String(categoria))) { params.push(String(categoria)); conds.push(`t.categoria=$${params.length}`); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(de || ''))) { params.push(String(de)); conds.push(`t.criado_em >= $${params.length}::date`); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(ate || ''))) { params.push(String(ate)); conds.push(`t.criado_em < ($${params.length}::date + INTERVAL '1 day')`); }
    if (busca) {
      params.push(`%${String(busca).trim()}%`);
      conds.push(`(t.numero ILIKE $${params.length} OR t.titulo ILIKE $${params.length} OR EXISTS (SELECT 1 FROM ticket_mensagens m WHERE m.ticket_id=t.id AND m.texto ILIKE $${params.length}))`);
    }
    const r = await pool.query(
      `SELECT t.*, (SELECT COUNT(*)::int FROM ticket_mensagens m WHERE m.ticket_id=t.id) AS mensagens,
       CASE WHEN t.prazo_sla IS NOT NULL AND t.status <> 'Concluído' AND t.prazo_sla < NOW() THEN TRUE ELSE FALSE END AS sla_estourado
       FROM tickets t ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''} ORDER BY t.atualizado_em DESC LIMIT 200`,
      params
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar tickets' }); }
});

// Contadores do sino/badge: Atendendo = na fila do RH.
app.get('/api/tickets/resumo', verificarToken, async (req, res) => {
  try {
    if (!ehGestorAtendimento(req.usuarioPerfil)) return res.json({ atendendo: 0, pendentes: 0, concluidos: 0 });
    const r = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE status='Atendendo')::int AS atendendo,
              COUNT(*) FILTER (WHERE status='Pendente')::int AS pendentes,
              COUNT(*) FILTER (WHERE status='Concluído')::int AS concluidos
       FROM tickets`
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erro ao contar tickets' }); }
});

app.post('/api/tickets', verificarToken, chatUpload.single('anexo'), async (req, res) => {
  const b = req.body || {};
  const titulo = String(b.titulo || '').trim();
  if (titulo.length < 3) return res.status(400).json({ error: 'Informe o assunto' });
  const categoria = CATEGORIAS_TICKET.includes(b.categoria) ? b.categoria : 'Outro';
  const prioridade = PRIORIDADES_TICKET.includes(b.prioridade) ? b.prioridade : 'Média';
  const seq = (await pool.query(`SELECT nextval('ticket_num_seq') AS n`)).rows[0].n;
  const ano = new Date().getFullYear();
  const numero = numeroTicket(Number(seq), ano);
  const prazo = prazoSLA(prioridade);
  const u = await pool.query('SELECT nome FROM usuarios WHERE id=$1', [req.usuarioId]);
  const nome = u.rows[0]?.nome || '';
  const r = await pool.query(
    `INSERT INTO tickets (numero,usuario_id,nome_solicitante,categoria,titulo,descricao,status,prioridade,prazo_sla,criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,'Atendendo',$7,$8,$9) RETURNING *`,
    [numero, req.usuarioId, nome, categoria, titulo, String(b.descricao || ''), prioridade, prazo, req.usuarioId]
  );
  // Anexo enviado na abertura entra como primeira mensagem do ticket.
  if (req.file) {
    await pool.query(
      `INSERT INTO ticket_mensagens (ticket_id,usuario_id,nome_autor,texto,anexo_url,anexo_nome,anexo_tipo)
       VALUES ($1,$2,$3,'',$4,$5,$6)`,
      [r.rows[0].id, req.usuarioId, nome, `/uploads/${req.file.filename}`, req.file.originalname, req.file.mimetype]
    );
  }
  await registrarLog(req.usuarioId, 'criar', 'ticket', r.rows[0].id, `${numero} ${titulo}${req.file ? ' [anexo]' : ''}`);
  const rhs = await pool.query(`SELECT id FROM usuarios WHERE ${SQL_DESTINATARIOS_RH}`);
  for (const rh of rhs.rows) {
    if (Number(rh.id) === Number(req.usuarioId)) continue;
    await criarNotificacaoRespeitandoPrefs(rh.id, 'chat_novo', `Novo ticket ${numero}`, `${titulo} · ${prioridade}`, '/atendimento', `ticket:${r.rows[0].id}`);
  }
  res.status(201).json(r.rows[0]);
});

app.get('/api/tickets/:id', verificarToken, async (req, res) => {
  const t = await pool.query('SELECT * FROM tickets WHERE id=$1', [req.params.id]);
  if (!t.rows.length) return res.status(404).json({ error: 'Ticket não encontrado' });
  const tick = t.rows[0];
  if (!ehGestorAtendimento(req.usuarioPerfil) && Number(tick.usuario_id) !== Number(req.usuarioId)) {
    return res.status(403).json({ error: 'Você só vê os próprios tickets' });
  }
  const m = await pool.query(
    'SELECT m.*, u.perfil AS autor_perfil FROM ticket_mensagens m LEFT JOIN usuarios u ON u.id=m.usuario_id WHERE m.ticket_id=$1 ORDER BY m.criado_em',
    [req.params.id]
  );
  res.json({ ...tick, mensagens: m.rows });
});

app.post('/api/tickets/:id/mensagens', verificarToken, chatUpload.single('anexo'), async (req, res) => {
  const t = await pool.query('SELECT * FROM tickets WHERE id=$1', [req.params.id]);
  if (!t.rows.length) return res.status(404).json({ error: 'Ticket não encontrado' });
  const tick = t.rows[0];
  if (!ehGestorAtendimento(req.usuarioPerfil) && Number(tick.usuario_id) !== Number(req.usuarioId)) {
    return res.status(403).json({ error: 'Você só participa dos próprios tickets' });
  }
  if (ticketEncerrado(tick.status) && !ehGestorAtendimento(req.usuarioPerfil)) {
    return res.status(400).json({ error: 'Ticket concluído. Abra um novo se precisar.' });
  }
  const texto = String(req.body?.texto || '').trim();
  const anexo = req.file ? `/uploads/${req.file.filename}` : '';
  if (!texto && !anexo) return res.status(400).json({ error: 'Escreva uma mensagem ou anexe um arquivo' });
  const u = await pool.query('SELECT nome FROM usuarios WHERE id=$1', [req.usuarioId]);
  const r = await pool.query(
    `INSERT INTO ticket_mensagens (ticket_id,usuario_id,nome_autor,texto,anexo_url,anexo_nome,anexo_tipo)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.params.id, req.usuarioId, u.rows[0]?.nome || '', texto, anexo,
     req.file ? req.file.originalname : '', req.file ? req.file.mimetype : '']
  );
  // Resposta do RH deixa aguardando o funcionário; mensagem do funcionário volta
  // para a fila do RH (Atendendo). Ticket concluído reabre quando o RH responde.
  const autorEhRH = ehGestorAtendimento(req.usuarioPerfil);
  const novoStatus = statusAposMensagem(tick.status, autorEhRH);
  await pool.query('UPDATE tickets SET atualizado_em=NOW(), status=$2 WHERE id=$1', [req.params.id, novoStatus]);
  await registrarLog(req.usuarioId, 'mensagem', 'ticket', req.params.id, texto.slice(0, 120) || '[anexo]');
  // Notifica o outro lado: RH ↔ solicitante.
  const destinos = autorEhRH
    ? (tick.usuario_id ? [Number(tick.usuario_id)] : [])
    : (await pool.query(`SELECT id FROM usuarios WHERE ${SQL_DESTINATARIOS_RH}`)).rows.map((x) => Number(x.id));
  for (const uid of destinos) {
    if (uid === Number(req.usuarioId)) continue;
    await criarNotificacaoRespeitandoPrefs(uid, 'chat_msg', `💬 ${tick.numero}`, texto.slice(0, 150) || 'Novo anexo', '/atendimento', `ticket:${tick.id}:msg${r.rows[0].id}`);
  }
  res.status(201).json(r.rows[0]);
});

app.patch('/api/tickets/:id', verificarToken, async (req, res) => {
  if (!ehGestorAtendimento(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  const b = req.body || {};
  const sets = [], vals = [];
  if (b.status && STATUS_TICKET.includes(String(b.status))) { vals.push(String(b.status)); sets.push(`status=$${vals.length}`); }
  if (b.prioridade && PRIORIDADES_TICKET.includes(String(b.prioridade))) {
    vals.push(String(b.prioridade)); sets.push(`prioridade=$${vals.length}`);
    const prazo = new Date(Date.now() + SLA_HORAS[String(b.prioridade)] * 3600 * 1000);
    vals.push(prazo); sets.push(`prazo_sla=$${vals.length}`);
  }
  if (b.categoria && CATEGORIAS_TICKET.includes(String(b.categoria))) { vals.push(String(b.categoria)); sets.push(`categoria=$${vals.length}`); }
  if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar' });
  let fechadoSql = 'fechado_em';
  if (b.status === 'Concluído') fechadoSql = 'NOW()';
  else if (STATUS_TICKET.includes(String(b.status))) fechadoSql = 'NULL';
  vals.push(req.params.id);
  const r = await pool.query(
    `UPDATE tickets SET ${sets.join(', ')}, atualizado_em=NOW(), fechado_em=${fechadoSql} WHERE id=$${vals.length} RETURNING *`,
    vals
  );
  if (!r.rows.length) return res.status(404).json({ error: 'Ticket não encontrado' });
  await registrarLog(req.usuarioId, 'atualizar', 'ticket', req.params.id, JSON.stringify(b).slice(0, 200));
  if (r.rows[0].usuario_id && Number(r.rows[0].usuario_id) !== Number(req.usuarioId)) {
    const tipo = b.status === 'Concluído' ? 'chat_fechado' : 'chat_update';
    await criarNotificacaoRespeitandoPrefs(r.rows[0].usuario_id, tipo,
      b.status === 'Concluído' ? `Ticket ${r.rows[0].numero} concluído` : `Ticket ${r.rows[0].numero} atualizado`,
      `Status: ${r.rows[0].status}`, '/atendimento', `ticket:${r.rows[0].id}:${r.rows[0].status}`);
  }
  res.json(r.rows[0]);
});

// ---- Desabafo anônimo (23/10/2026) ----
// Preenchido na tela pública, antes do login: não guarda usuário, IP nem horário
// de identificação. Chega para o RH e para o Administrador.
const enviosDesabafo = new Map();
function podeEnviarDesabafo(ip) {
  const agora = Date.now(), janela = 10 * 60 * 1000, max = 5;
  const historico = (enviosDesabafo.get(ip) || []).filter((t) => agora - t < janela);
  if (historico.length >= max) return false;
  historico.push(agora);
  enviosDesabafo.set(ip, historico);
  return true;
}

// Nome original pode chegar em latin1 (busboy); converte quando fizer sentido.
function nomeArquivoLegivel(nome) {
  const original = String(nome || '');
  try {
    const convertido = Buffer.from(original, 'latin1').toString('utf8');
    return convertido.includes('\uFFFD') ? original : convertido;
  } catch { return original; }
}

// Upload de anexo no desabafo (PDF, imagem, vídeo, áudio até 20MB).
const desabafoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const safeName = String(file.originalname || 'anexo').replace(/[^a-zA-Z0-9.-]/g, '_');
      cb(null, 'desabafo-' + uniqueSuffix + '-' + safeName);
    }
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const tipo = String(file.mimetype || '').toLowerCase();
    const nome = String(file.originalname || '');
    const extensaoOk = /\.(pdf|docx?|xlsx?|jpe?g|png|gif|webp|mp4|webm|mov|mp3|m4a|ogg|wav|txt|csv)$/i.test(nome);
    const tipoOk = /^(application\/pdf|application\/msword|application\/vnd\.(openxmlformats|ms-excel)|image\/|video\/|audio\/|text\/)/.test(tipo);
    (extensaoOk || tipoOk) ? cb(null, true) : cb(new Error('Tipo de arquivo não permitido.'));
  }
});

// Responde em JSON quando o multer recusa o arquivo (antes vinha erro 500 em HTML).
const receberAnexoDesabafo = (req, res, next) => desabafoUpload.single('anexo')(req, res, (err) => {
  if (!err) return next();
  const mensagem = err.code === 'LIMIT_FILE_SIZE'
    ? 'O anexo pode ter no máximo 20MB.'
    : (err.message || 'Não foi possível enviar o anexo.');
  return res.status(400).json({ error: mensagem });
});

app.post('/api/desabafos', receberAnexoDesabafo, async (req, res) => {
  const descartarAnexo = () => {
    if (!req.file?.path) return;
    fs.unlink(req.file.path, () => {});
  };
  try {
    if (!podeEnviarDesabafo(req.ip || 'desconhecido')) {
      descartarAnexo();
      return res.status(429).json({ error: 'Muitos envios seguidos. Aguarde alguns minutos.' });
    }
    const mensagem = String(req.body?.mensagem || '').trim();
    if (mensagem.length < 10) {
      descartarAnexo();
      return res.status(400).json({ error: 'Escreva pelo menos 10 caracteres.' });
    }
    if (mensagem.length > 4000) {
      descartarAnexo();
      return res.status(400).json({ error: 'Mensagem muito longa (máximo 4000 caracteres).' });
    }
    const anexoUrl = req.file ? `/uploads/${req.file.filename}` : '';
    const anexoNome = req.file ? nomeArquivoLegivel(req.file.originalname) : '';
    const anexoTipo = req.file ? req.file.mimetype : '';
    const r = await pool.query('INSERT INTO desabafos (mensagem,anexo_url,anexo_nome,anexo_tipo) VALUES ($1,$2,$3,$4) RETURNING id', [mensagem, anexoUrl, anexoNome, anexoTipo]);
    const dest = await pool.query(`SELECT id FROM usuarios WHERE LOWER(perfil) IN ('rh','administrador')`);
    for (const u of dest.rows) {
      await criarNotificacao(u.id, 'desabafo', '🤫 Novo desabafo anônimo', anexoNome ? `Com anexo: ${anexoNome}` : 'Sem anexo', '/desabafos', `desabafo:${r.rows[0].id}`);
    }
    res.status(201).json({ ok: true });
  } catch (e) {
    descartarAnexo();
    res.status(500).json({ error: 'Não foi possível enviar agora. Tente novamente.' });
  }
});

const podeVerDesabafos = (perfil) => ['rh', 'administrador'].includes(normalizarPerfil(perfil));

app.get('/api/desabafos', verificarToken, async (req, res) => {
  if (!podeVerDesabafos(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH e ao Administrador' });
  try {
    const r = await pool.query('SELECT * FROM desabafos ORDER BY criado_em DESC LIMIT 300');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar desabafos' }); }
});

app.patch('/api/desabafos/:id/lido', verificarToken, async (req, res) => {
  if (!podeVerDesabafos(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH e ao Administrador' });
  try {
    const r = await pool.query('UPDATE desabafos SET lido_em=NOW() WHERE id=$1 RETURNING *', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Desabafo não encontrado' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erro ao marcar desabafo' }); }
});

// Indicadores do painel do RH (mesmo desenho do painel do Administrador).
app.get('/api/rh/dashboard', verificarToken, async (req, res) => {
  if (!ehRH(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  try {
    const [tickets, asos, folgas, mips, desabafos] = await Promise.all([
      pool.query(`SELECT COUNT(*) FILTER (WHERE status='Atendendo')::int AS atendendo,
                         COUNT(*) FILTER (WHERE status='Pendente')::int AS pendentes,
                         COUNT(*) FILTER (WHERE status='Concluído')::int AS concluidos FROM tickets`),
      pool.query(`SELECT COUNT(*) FILTER (WHERE faixa='Vermelho')::int AS vencidos,
                         COUNT(*) FILTER (WHERE faixa='Laranja')::int AS a_vencer FROM asos`),
      pool.query(`SELECT COUNT(*) FILTER (WHERE status='pendente')::int AS pendentes FROM solicitacoes_folga`),
      pool.query(`SELECT COUNT(*) FILTER (WHERE status='Publicado')::int AS publicadas FROM mips`),
      pool.query(`SELECT COUNT(*) FILTER (WHERE lido_em IS NULL)::int AS nao_lidos FROM desabafos`),
    ]);
    res.json({
      ticketsAtendendo: tickets.rows[0].atendendo,
      ticketsPendentes: tickets.rows[0].pendentes,
      ticketsConcluidos: tickets.rows[0].concluidos,
      asosVencidos: asos.rows[0].vencidos,
      asosAVencer: asos.rows[0].a_vencer,
      folgasPendentes: folgas.rows[0].pendentes,
      mipsPublicadas: mips.rows[0].publicadas,
      desabafosNaoLidos: desabafos.rows[0].nao_lidos,
    });
  } catch (e) { res.status(500).json({ error: 'Erro ao carregar indicadores' }); }
});

// ============ BANCO DE HORAS (23/09/2026) ============
// Match por matrícula (usuarios.matricula) + nome; CPF fica registrado (anti-troca).
// Cada PDF pertence a 1 funcionário — nunca compartilhado.
async function inicializarBancoHoras() {
  await pool.query(`
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS matricula VARCHAR(30) NOT NULL DEFAULT '';
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cpf VARCHAR(14) NOT NULL DEFAULT '';
    CREATE TABLE IF NOT EXISTS banco_horas_lotes (
      id SERIAL PRIMARY KEY,
      competencia CHAR(7) NOT NULL,
      status VARCHAR(15) NOT NULL DEFAULT 'rascunho',
      total INT NOT NULL DEFAULT 0,
      vinculados INT NOT NULL DEFAULT 0,
      nao_identificados INT NOT NULL DEFAULT 0,
      publicado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      publicado_em TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS banco_horas (
      id SERIAL PRIMARY KEY,
      lote_id INT REFERENCES banco_horas_lotes(id) ON DELETE CASCADE,
      usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
      nome_funcionario VARCHAR(150) NOT NULL,
      matricula VARCHAR(30) NOT NULL DEFAULT '',
      cpf VARCHAR(14) NOT NULL DEFAULT '',
      competencia CHAR(7) NOT NULL,
      pdf_url VARCHAR(255) NOT NULL DEFAULT '',
      status VARCHAR(20) NOT NULL DEFAULT 'nao_identificado',
      publicado BOOLEAN NOT NULL DEFAULT FALSE,
      publicado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
      publicado_em TIMESTAMP,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS banco_horas_usuario_idx ON banco_horas (usuario_id, competencia);
  `);
}

const COMP_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

async function vincularBH(matricula, nome) {
  const mat = String(matricula || '').trim();
  if (mat) {
    const u = await pool.query('SELECT id FROM usuarios WHERE matricula=$1 AND matricula<>\'\' LIMIT 1', [mat]);
    if (u.rows.length) return Number(u.rows[0].id);
  }
  const nm = String(nome || '').trim();
  if (nm.length >= 2) {
    const u = await pool.query('SELECT id FROM usuarios WHERE nome ILIKE $1 LIMIT 1', [nm]);
    if (u.rows.length) return Number(u.rows[0].id);
  }
  return null;
}

function salvarPDFBuffer(buffer, prefixo, nomeOriginal) {
  const safe = String(nomeOriginal || 'arquivo.pdf').replace(/[^a-zA-Z0-9.-]/g, '_');
  const nome = `${prefixo}-${Date.now()}-${Math.round(Math.random() * 1E9)}-${safe}`;
  fs.writeFileSync(path.join(uploadDir, nome), buffer);
  return `/uploads/${nome}`;
}

const bhUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 60 },
  fileFilter: (req, file, cb) => {
    const campo = file.fieldname;
    if (campo === 'mapeamento') {
      if (/spreadsheet|excel|officedocument|\.xlsx?$/i.test(`${file.mimetype} ${file.originalname}`)) return cb(null, true);
      return cb(new Error('O mapeamento deve ser um XLSX.'));
    }
    if (campo === 'pacote') {
      if (/zip/i.test(`${file.mimetype} ${file.originalname}`)) return cb(null, true);
      return cb(new Error('O pacote deve ser um ZIP.'));
    }
    if (/pdf$/i.test(file.mimetype || '') || /\.pdf$/i.test(file.originalname || '')) return cb(null, true);
    cb(new Error('Envie apenas PDFs nos arquivos.'));
  }
});

const bhIndividual = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/pdf$/i.test(file.mimetype || '') || /\.pdf$/i.test(file.originalname || '')) cb(null, true);
    else cb(new Error('Envie um arquivo PDF.'));
  }
});

app.post('/api/banco-horas/lotes', verificarToken, async (req, res) => {
  if (!perfilGestorRH(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  const competencia = String(req.body?.competencia || '').trim();
  if (!COMP_RE.test(competencia)) return res.status(400).json({ error: 'Competência inválida (use AAAA-MM)' });
  const r = await pool.query('INSERT INTO banco_horas_lotes (competencia) VALUES ($1) RETURNING *', [competencia]);
  await registrarLog(req.usuarioId, 'criar', 'banco_horas_lote', r.rows[0].id, competencia);
  res.status(201).json(r.rows[0]);
});

app.get('/api/banco-horas/lotes', verificarToken, async (req, res) => {
  if (!perfilGestorRH(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  const r = await pool.query(
    `SELECT l.*, u.nome AS publicado_por_nome FROM banco_horas_lotes l LEFT JOIN usuarios u ON u.id=l.publicado_por ORDER BY l.criado_em DESC LIMIT 60`
  );
  res.json(r.rows);
});

app.delete('/api/banco-horas/lotes/:id', verificarToken, async (req, res) => {
  if (!perfilGestorRH(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  const l = await pool.query('SELECT status FROM banco_horas_lotes WHERE id=$1', [req.params.id]);
  if (!l.rows.length) return res.status(404).json({ error: 'Lote não encontrado' });
  if (l.rows[0].status !== 'rascunho') return res.status(400).json({ error: 'Só é possível excluir rascunho' });
  const arqs = await pool.query('SELECT pdf_url FROM banco_horas WHERE lote_id=$1', [req.params.id]);
  for (const a of arqs.rows) {
    try { const f = path.join(uploadDir, path.basename(a.pdf_url)); if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* ignora */ }
  }
  await pool.query('DELETE FROM banco_horas_lotes WHERE id=$1', [req.params.id]);
  await registrarLog(req.usuarioId, 'excluir', 'banco_horas_lote', req.params.id, '');
  res.json({ mensagem: 'Rascunho excluído.' });
});

// Upload em massa: pdfs[] (drag&drop) + mapeamento.xlsx opcional + pacote.zip opcional.
app.post('/api/banco-horas/lotes/:id/arquivos', verificarToken, bhUpload.fields([
  { name: 'pdfs', maxCount: 50 }, { name: 'mapeamento', maxCount: 1 }, { name: 'pacote', maxCount: 1 },
]), async (req, res) => {
  if (!perfilGestorRH(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  const lote = await pool.query('SELECT * FROM banco_horas_lotes WHERE id=$1', [req.params.id]);
  if (!lote.rows.length) return res.status(404).json({ error: 'Lote não encontrado' });
  if (lote.rows[0].status !== 'rascunho') return res.status(400).json({ error: 'Lote já publicado' });
  const comp = lote.rows[0].competencia;
  const arquivos = req.files?.pdfs || [];
  const itens = []; // { buffer, nomeOriginal, matricula, nome, cpf }

  for (const f of arquivos) itens.push({ buffer: f.buffer, nomeOriginal: f.originalname, matricula: '', nome: '', cpf: '' });

  const pacote = req.files?.pacote?.[0];
  if (pacote) {
    if (!AdmZip) return res.status(500).json({ error: 'Leitor de ZIP indisponível no servidor' });
    try {
      const zip = new AdmZip(pacote.buffer);
      for (const e of zip.getEntries()) {
        if (e.isDirectory || !/\.pdf$/i.test(e.entryName)) continue;
        const base = path.basename(e.entryName);
        const mat = (base.match(/\d{3,}/) || [''])[0]; // matrícula no nome do arquivo
        itens.push({ buffer: e.getData(), nomeOriginal: base, matricula: mat, nome: '', cpf: '' });
      }
    } catch { return res.status(400).json({ error: 'Não foi possível ler o ZIP' }); }
  }

  const map = req.files?.mapeamento?.[0];
  let mapa = [];
  if (map) {
    if (!XLSX) return res.status(500).json({ error: 'Leitor de planilha indisponível no servidor' });
    try {
      const wb = XLSX.read(map.buffer, { type: 'buffer' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      const chave = (o, nomes) => {
        for (const k of Object.keys(o)) {
          const n = String(k).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (nomes.includes(n)) return String(o[k] ?? '').trim();
        }
        return '';
      };
      mapa = rows.map((o) => ({
        matricula: chave(o, ['matricula']),
        nome: chave(o, ['nome']),
        cpf: chave(o, ['cpf']),
        arquivo: chave(o, ['arquivo']),
        competencia: chave(o, ['competencia']) || comp,
      })).filter((m) => m.matricula || m.nome || m.arquivo);
    } catch { return res.status(400).json({ error: 'Não foi possível ler o XLSX' }); }
  }

  // Aplica o mapeamento aos PDFs pelo nome do arquivo.
  for (const it of itens) {
    const m = mapa.find((x) => x.arquivo && x.arquivo.toLowerCase() === String(it.nomeOriginal).toLowerCase());
    if (m) { it.matricula = it.matricula || m.matricula; it.nome = it.nome || m.nome; it.cpf = m.cpf; }
    if (!it.nome && it.matricula) {
      const u = await pool.query('SELECT nome FROM usuarios WHERE matricula=$1 LIMIT 1', [it.matricula]);
      if (u.rows.length) it.nome = u.rows[0].nome;
    }
  }
  // Linhas do XLSX sem PDF correspondente → status "PDF ausente" (sem arquivo).
  for (const m of mapa) {
    const achou = itens.some((it) => m.arquivo && m.arquivo.toLowerCase() === String(it.nomeOriginal).toLowerCase());
    if (!achou && (m.matricula || m.nome)) itens.push({ buffer: null, nomeOriginal: m.arquivo || '(sem arquivo)', matricula: m.matricula, nome: m.nome, cpf: m.cpf });
  }

  if (!itens.length) return res.status(400).json({ error: 'Nenhum arquivo ou linha para revisar' });
  let vinculados = 0, naoId = 0;
  const saida = [];
  for (const it of itens) {
    const usuarioId = await vincularBH(it.matricula, it.nome);
    const status = usuarioId ? 'vinculado' : (it.buffer ? 'nao_identificado' : 'pdf_ausente');
    if (status === 'vinculado') vinculados++; else naoId++;
    const pdfUrl = it.buffer ? salvarPDFBuffer(it.buffer, 'bh', it.nomeOriginal) : '';
    const r = await pool.query(
      `INSERT INTO banco_horas (lote_id,usuario_id,nome_funcionario,matricula,cpf,competencia,pdf_url,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.id, usuarioId, it.nome || it.nomeOriginal, it.matricula, it.cpf, comp, pdfUrl, status]
    );
    saida.push(r.rows[0]);
  }
  await pool.query('UPDATE banco_horas_lotes SET total=total+$1,vinculados=vinculados+$2,nao_identificados=nao_identificados+$3 WHERE id=$4',
    [saida.length, vinculados, naoId, req.params.id]);
  await registrarLog(req.usuarioId, 'enviar_arquivos', 'banco_horas_lote', req.params.id, `${saida.length} itens (${vinculados} vinculados)`);
  res.status(201).json({ itens: saida });
});

app.get('/api/banco-horas/lotes/:id/revisao', verificarToken, async (req, res) => {
  if (!perfilGestorRH(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  const r = await pool.query('SELECT * FROM banco_horas WHERE lote_id=$1 ORDER BY status, nome_funcionario', [req.params.id]);
  res.json(r.rows);
});

app.post('/api/banco-horas/lotes/:id/publicar', verificarToken, async (req, res) => {
  if (!perfilGestorRH(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  const lote = await pool.query('SELECT * FROM banco_horas_lotes WHERE id=$1', [req.params.id]);
  if (!lote.rows.length) return res.status(404).json({ error: 'Lote não encontrado' });
  if (lote.rows[0].status !== 'rascunho') return res.status(400).json({ error: 'Lote já publicado' });
  const itens = await pool.query(`SELECT * FROM banco_horas WHERE lote_id=$1 AND publicado=FALSE AND pdf_url<>''`, [req.params.id]);
  let publicados = 0;
  for (const it of itens.rows) {
    await pool.query('UPDATE banco_horas SET publicado=TRUE,publicado_por=$1,publicado_em=NOW() WHERE id=$2', [req.usuarioId, it.id]);
    if (it.usuario_id) {
      publicados++;
      await criarNotificacaoRespeitandoPrefs(it.usuario_id, 'banco_horas', '📄 Banco de Horas disponível',
        `Competência ${it.competencia} publicada`, '/banco-horas', `bh:${it.id}`);
    }
  }
  const pend = await pool.query(`SELECT COUNT(*)::int AS n FROM banco_horas WHERE lote_id=$1 AND publicado=FALSE`, [req.params.id]);
  await pool.query(`UPDATE banco_horas_lotes SET status='publicado',publicado_por=$1,publicado_em=NOW() WHERE id=$2`, [req.usuarioId, req.params.id]);
  await registrarLog(req.usuarioId, 'publicar', 'banco_horas_lote', req.params.id,
    `${publicados} publicados, ${pend.rows[0].n} pendentes (competência ${lote.rows[0].competencia})`);
  res.json({ publicados, pendentes: pend.rows[0].n });
});

// Upload individual: publica direto + notifica.
app.post('/api/banco-horas/individual', verificarToken, bhIndividual.single('pdf'), async (req, res) => {
  if (!perfilGestorRH(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  const competencia = String(req.body?.competencia || '').trim();
  if (!COMP_RE.test(competencia)) return res.status(400).json({ error: 'Competência inválida (use AAAA-MM)' });
  if (!req.file) return res.status(400).json({ error: 'Envie o PDF' });
  const usuarioId = req.body?.usuario_id ? Number(req.body.usuario_id)
    : await vincularBH(req.body?.matricula, req.body?.nome_funcionario);
  const nome = String(req.body?.nome_funcionario || '').trim()
    || (await pool.query('SELECT nome FROM usuarios WHERE id=$1', [usuarioId])).rows[0]?.nome || req.file.originalname;
  const pdfUrl = salvarPDFBuffer(req.file.buffer, 'bh', req.file.originalname);
  const r = await pool.query(
    `INSERT INTO banco_horas (usuario_id,nome_funcionario,matricula,cpf,competencia,pdf_url,status,publicado,publicado_por,publicado_em)
     VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8,NOW()) RETURNING *`,
    [usuarioId || null, nome, String(req.body?.matricula || ''), String(req.body?.cpf || ''),
     competencia, pdfUrl, usuarioId ? 'vinculado' : 'nao_identificado', req.usuarioId]
  );
  await registrarLog(req.usuarioId, 'publicar_individual', 'banco_horas', r.rows[0].id, `${nome} ${competencia}`);
  if (usuarioId) {
    await criarNotificacaoRespeitandoPrefs(usuarioId, 'banco_horas', '📄 Banco de Horas disponível',
      `Competência ${competencia} publicada`, '/banco-horas', `bh:${r.rows[0].id}`);
  }
  res.status(201).json(r.rows[0]);
});

app.get('/api/banco-horas/meus', verificarToken, async (req, res) => {
  const comp = String(req.query.competencia || '').trim();
  const params = [req.usuarioId];
  let f = 'WHERE publicado=TRUE AND usuario_id=$1';
  if (COMP_RE.test(comp)) { params.push(comp); f += ` AND competencia=$${params.length}`; }
  const r = await pool.query(`SELECT * FROM banco_horas ${f} ORDER BY competencia DESC`, params);
  res.json(r.rows);
});

app.delete('/api/banco-horas/:id', verificarToken, async (req, res) => {
  if (!perfilGestorRH(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  const r = await pool.query('SELECT pdf_url FROM banco_horas WHERE id=$1', [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Registro não encontrado' });
  try { const f = path.join(uploadDir, path.basename(r.rows[0].pdf_url)); if (r.rows[0].pdf_url && fs.existsSync(f)) fs.unlinkSync(f); } catch { /* ignora */ }
  await pool.query('DELETE FROM banco_horas WHERE id=$1', [req.params.id]);
  await registrarLog(req.usuarioId, 'excluir', 'banco_horas', req.params.id, '');
  res.json({ mensagem: 'Registro excluído.' });
});

// ============ FOLGAS ROTATIVAS (23/09/2026) ============
async function inicializarFolgas() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS escalas (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(150) NOT NULL,
      modelo VARCHAR(20) NOT NULL DEFAULT '5x2',
      tipo VARCHAR(20) NOT NULL DEFAULT 'Rotativa',
      time VARCHAR(5) NOT NULL DEFAULT '',
      inicio DATE NOT NULL,
      fim DATE NOT NULL,
      dias_gerados INT NOT NULL DEFAULT 0,
      status VARCHAR(15) NOT NULL DEFAULT 'rascunho',
      criado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS folgas (
      id SERIAL PRIMARY KEY,
      escala_id INT REFERENCES escalas(id) ON DELETE CASCADE,
      usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
      nome_funcionario VARCHAR(150) NOT NULL,
      data DATE NOT NULL,
      tipo VARCHAR(20) NOT NULL DEFAULT 'Rotativa',
      status VARCHAR(15) NOT NULL DEFAULT 'rascunho',
      criado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (usuario_id, data)
    );
    CREATE INDEX IF NOT EXISTS folgas_data_idx ON folgas (data);
    CREATE TABLE IF NOT EXISTS solicitacoes_folga (
      id SERIAL PRIMARY KEY,
      usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
      nome_solicitante VARCHAR(150) NOT NULL DEFAULT '',
      data_inicio DATE NOT NULL,
      data_fim DATE NOT NULL,
      motivo TEXT NOT NULL DEFAULT '',
      status VARCHAR(15) NOT NULL DEFAULT 'pendente',
      decidido_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function equipeDoLider(liderId) {
  const r = await pool.query('SELECT id FROM usuarios WHERE lider_id=$1 OR id=$1', [Number(liderId)]);
  return r.rows.map((x) => Number(x.id));
}

// Escopo de visualização: RH tudo; líder a própria equipe; funcionário só o próprio.
async function escopoFolgas(req) {
  const p = String(req.usuarioPerfil || '').toLowerCase();
  if (PERFIS_RH.includes(p)) return null; // tudo
  if (p === 'editor') return equipeDoLider(req.usuarioId);
  return [Number(req.usuarioId)];
}

app.get('/api/folgas/catalogos', verificarToken, async (req, res) => {
  const u = await pool.query('SELECT id,nome FROM usuarios ORDER BY nome');
  res.json({ modelos: MODELOS, tipos: TIPOS_FOLGA, times: TIMES, usuarios: u.rows });
});

app.post('/api/escalas', verificarToken, async (req, res) => {
  if (!ehRH(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  const b = req.body || {};
  const nome = String(b.nome || '').trim();
  const modelo = MODELOS.includes(b.modelo) ? b.modelo : '5x2';
  const tipo = TIPOS_FOLGA.includes(b.tipo) ? b.tipo : 'Rotativa';
  const usuarios = Array.isArray(b.usuarios) ? [...new Set(b.usuarios.map(Number).filter(Boolean))] : [];
  if (nome.length < 2 || !b.inicio || !b.fim || !usuarios.length) {
    return res.status(400).json({ error: 'Informe nome, período e funcionários' });
  }
  let datas;
  try {
    datas = gerarFolgasCiclo(modelo, b.inicio, b.fim, { diasSemana: b.dias_semana || [], time: b.time || 'A' });
  } catch (e) { return res.status(400).json({ error: e.message }); }
  const esc = await pool.query(
    `INSERT INTO escalas (nome,modelo,tipo,time,inicio,fim,dias_gerados,criado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [nome, modelo, tipo, String(b.time || ''), b.inicio, b.fim, datas.length * usuarios.length, req.usuarioId]
  );
  const nomes = await pool.query('SELECT id,nome FROM usuarios WHERE id=ANY($1::int[])', [usuarios]);
  const mapaNomes = new Map(nomes.rows.map((x) => [Number(x.id), x.nome]));
  let criadas = 0;
  const conflitos = [];
  for (const uid of usuarios) {
    for (const data of datas) {
      const existe = await pool.query('SELECT id FROM folgas WHERE usuario_id=$1 AND data=$2 LIMIT 1', [uid, data]);
      if (existe.rows.length) { conflitos.push({ usuario_id: uid, nome: mapaNomes.get(uid), data }); continue; }
      try {
        await pool.query(
          `INSERT INTO folgas (escala_id,usuario_id,nome_funcionario,data,tipo,status,criado_por)
           VALUES ($1,$2,$3,$4,$5,'rascunho',$6)`,
          [esc.rows[0].id, uid, mapaNomes.get(uid) || '', data, tipo, req.usuarioId]
        );
        criadas++;
      } catch { conflitos.push({ usuario_id: uid, nome: mapaNomes.get(uid), data }); }
    }
  }
  await registrarLog(req.usuarioId, 'criar', 'escala', esc.rows[0].id, `${nome} ${modelo}: ${criadas} folgas, ${conflitos.length} conflitos`);
  res.status(201).json({ escala: esc.rows[0], criadas, conflitos });
});

app.get('/api/escalas', verificarToken, async (req, res) => {
  if (!ehRH(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  const r = await pool.query('SELECT * FROM escalas ORDER BY criado_em DESC LIMIT 60');
  res.json(r.rows);
});

app.delete('/api/escalas/:id', verificarToken, async (req, res) => {
  if (!ehRH(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  const e = await pool.query('SELECT status FROM escalas WHERE id=$1', [req.params.id]);
  if (!e.rows.length) return res.status(404).json({ error: 'Escala não encontrada' });
  if (e.rows[0].status !== 'rascunho') return res.status(400).json({ error: 'Só é possível excluir rascunho' });
  await pool.query('DELETE FROM folgas WHERE escala_id=$1 AND status=$2', [req.params.id, 'rascunho']);
  await pool.query('DELETE FROM escalas WHERE id=$1', [req.params.id]);
  await registrarLog(req.usuarioId, 'excluir', 'escala', req.params.id, '');
  res.json({ mensagem: 'Rascunho excluído.' });
});

app.post('/api/escalas/:id/publicar', verificarToken, async (req, res) => {
  if (!ehRH(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  const e = await pool.query('SELECT * FROM escalas WHERE id=$1', [req.params.id]);
  if (!e.rows.length) return res.status(404).json({ error: 'Escala não encontrada' });
  if (e.rows[0].status !== 'rascunho') return res.status(400).json({ error: 'Escala já publicada' });
  const f = await pool.query(`UPDATE folgas SET status='publicada' WHERE escala_id=$1 AND status='rascunho' RETURNING usuario_id,nome_funcionario,data`, [req.params.id]);
  await pool.query(`UPDATE escalas SET status='publicada' WHERE id=$1`, [req.params.id]);
  const avisados = new Set();
  for (const x of f.rows) {
    if (x.usuario_id && !avisados.has(x.usuario_id)) {
      avisados.add(x.usuario_id);
      await criarNotificacaoRespeitandoPrefs(x.usuario_id, 'folga', '📅 Escala de folgas publicada',
        `${e.rows[0].nome}: confira suas folgas`, '/folgas', `escala:${e.rows[0].id}`);
    }
  }
  await registrarLog(req.usuarioId, 'publicar', 'escala', req.params.id, `${f.rows.length} folgas, ${avisados.size} avisados`);
  res.json({ publicadas: f.rows.length, avisados: avisados.size });
});

// Folga individual (RH).
app.post('/api/folgas', verificarToken, async (req, res) => {
  if (!ehRH(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  const b = req.body || {};
  const uid = Number(b.usuario_id);
  const tipo = TIPOS_FOLGA.includes(b.tipo) ? b.tipo : 'Pontual';
  if (!uid || !b.data) return res.status(400).json({ error: 'Informe funcionário e data' });
  const u = await pool.query('SELECT nome FROM usuarios WHERE id=$1', [uid]);
  if (!u.rows.length) return res.status(404).json({ error: 'Funcionário não encontrado' });
  const existe = await pool.query('SELECT id FROM folgas WHERE usuario_id=$1 AND data=$2 LIMIT 1', [uid, b.data]);
  if (existe.rows.length) return res.status(409).json({ error: 'Conflito: funcionário já tem folga neste dia' });
  const r = await pool.query(
    `INSERT INTO folgas (usuario_id,nome_funcionario,data,tipo,status,criado_por) VALUES ($1,$2,$3,$4,'publicada',$5) RETURNING *`,
    [uid, u.rows[0].nome, b.data, tipo, req.usuarioId]
  );
  await registrarLog(req.usuarioId, 'criar', 'folga', r.rows[0].id, `${u.rows[0].nome} ${b.data} ${tipo}`);
  await criarNotificacaoRespeitandoPrefs(uid, 'folga', '📅 Folga publicada',
    `${new Date(`${b.data}T12:00:00`).toLocaleDateString('pt-BR')} · ${tipo}`, '/folgas', `folga:${r.rows[0].id}`);
  res.status(201).json(r.rows[0]);
});

// Grade: folgas num período (filtro opcional por funcionário).
app.get('/api/folgas', verificarToken, async (req, res) => {
  const escopo = await escopoFolgas(req);
  const { inicio, fim, usuario_id } = req.query;
  const conds = [], params = [];
  if (escopo) { params.push(escopo); conds.push(`f.usuario_id=ANY($${params.length}::int[])`); }
  if (usuario_id) { params.push(Number(usuario_id)); conds.push(`f.usuario_id=$${params.length}`); }
  if (inicio) { params.push(inicio); conds.push(`f.data>=$${params.length}`); }
  if (fim) { params.push(fim); conds.push(`f.data<=$${params.length}`); }
  if (!ehRH(req.usuarioPerfil)) { conds.push(`f.status='publicada'`); }
  const r = await pool.query(
    `SELECT f.* FROM folgas f ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''} ORDER BY f.data LIMIT 1000`, params
  );
  res.json(r.rows);
});

app.delete('/api/folgas/:id', verificarToken, async (req, res) => {
  if (!ehRH(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  const r = await pool.query('DELETE FROM folgas WHERE id=$1 RETURNING id', [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Folga não encontrada' });
  await registrarLog(req.usuarioId, 'excluir', 'folga', req.params.id, '');
  res.json({ mensagem: 'Folga excluída.' });
});

app.get('/api/folgas/minhas', verificarToken, async (req, res) => {
  const ano = /^\d{4}$/.test(String(req.query.ano || '')) ? String(req.query.ano) : String(new Date().getFullYear());
  const r = await pool.query(
    `SELECT * FROM folgas WHERE usuario_id=$1 AND status='publicada' AND TO_CHAR(data,'YYYY')=$2 ORDER BY data`, [req.usuarioId, ano]
  );
  res.json(r.rows);
});

// Solicitações (funcionário pede, RH decide).
app.post('/api/folgas/solicitacoes', verificarToken, async (req, res) => {
  const b = req.body || {};
  if (!b.data_inicio || !b.data_fim) return res.status(400).json({ error: 'Informe o período' });
  if (String(b.data_fim) < String(b.data_inicio)) return res.status(400).json({ error: 'Período inválido' });
  const u = await pool.query('SELECT nome FROM usuarios WHERE id=$1', [req.usuarioId]);
  const r = await pool.query(
    `INSERT INTO solicitacoes_folga (usuario_id,nome_solicitante,data_inicio,data_fim,motivo) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.usuarioId, u.rows[0]?.nome || '', b.data_inicio, b.data_fim, String(b.motivo || '').slice(0, 500)]
  );
  await registrarLog(req.usuarioId, 'solicitar', 'solicitacao_folga', r.rows[0].id, `${b.data_inicio}→${b.data_fim}`);
  const rhs = await pool.query(`SELECT id FROM usuarios WHERE ${SQL_DESTINATARIOS_RH}`);
  for (const rh of rhs.rows) {
    if (Number(rh.id) === Number(req.usuarioId)) continue;
    await criarNotificacaoRespeitandoPrefs(rh.id, 'folga_solicitada', '📅 Solicitação de folga',
      `${u.rows[0]?.nome}: ${b.data_inicio} → ${b.data_fim}`, '/folgas', `solf:${r.rows[0].id}`);
  }
  res.status(201).json(r.rows[0]);
});

app.get('/api/folgas/solicitacoes', verificarToken, async (req, res) => {
  if (ehRH(req.usuarioPerfil)) {
    const r = await pool.query('SELECT * FROM solicitacoes_folga ORDER BY criado_em DESC LIMIT 100');
    return res.json(r.rows);
  }
  const r = await pool.query('SELECT * FROM solicitacoes_folga WHERE usuario_id=$1 ORDER BY criado_em DESC LIMIT 100', [req.usuarioId]);
  res.json(r.rows);
});

app.post('/api/folgas/solicitacoes/:id/decidir', verificarToken, async (req, res) => {
  if (!ehRH(req.usuarioPerfil)) return res.status(403).json({ error: 'Acesso restrito ao RH' });
  const decisao = String(req.body?.decisao || '');
  if (!['aprovada', 'recusada'].includes(decisao)) return res.status(400).json({ error: 'Decisão inválida' });
  const s = await pool.query('SELECT * FROM solicitacoes_folga WHERE id=$1', [req.params.id]);
  if (!s.rows.length) return res.status(404).json({ error: 'Solicitação não encontrada' });
  if (s.rows[0].status !== 'pendente') return res.status(400).json({ error: 'Solicitação já decidida' });
  await pool.query('UPDATE solicitacoes_folga SET status=$1,decidido_por=$2 WHERE id=$3', [decisao, req.usuarioId, req.params.id]);
  if (decisao === 'aprovada') {
    const sol = s.rows[0];
    const d0 = new Date(`${sol.data_inicio}T12:00:00Z`), d1 = new Date(`${sol.data_fim}T12:00:00Z`);
    for (let d = new Date(d0); d <= d1; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      const existe = await pool.query('SELECT id FROM folgas WHERE usuario_id=$1 AND data=$2 LIMIT 1', [sol.usuario_id, iso]);
      if (!existe.rows.length) {
        await pool.query(`INSERT INTO folgas (usuario_id,nome_funcionario,data,tipo,status,criado_por) VALUES ($1,$2,$3,'Pontual','publicada',$4)`,
          [sol.usuario_id, sol.nome_solicitante, iso, req.usuarioId]);
      }
    }
  }
  await registrarLog(req.usuarioId, 'decidir', 'solicitacao_folga', req.params.id, decisao);
  await criarNotificacaoRespeitandoPrefs(s.rows[0].usuario_id, 'folga', decisao === 'aprovada' ? '📅 Folga aprovada' : '📅 Folga recusada',
    `${s.rows[0].data_inicio} → ${s.rows[0].data_fim}`, '/folgas', `solf:${s.rows[0].id}:${decisao}`);
  res.json({ decisao });
});

app.listen(PORT, () => console.log(`🚀 Backend rodando na porta ${PORT}`));
