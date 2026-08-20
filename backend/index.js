const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { prepararAvaliacao } = require('./avaliacoes');
const MODELOS_AVALIACAO = require('./modelos-avaliacao.json');

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
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true, mode: 0o777 });
}

app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, uniqueSuffix + '-' + safeName);
  }
});
const upload = multer({ storage: storage, limits: { fileSize: 10 * 1024 * 1024 } });

const pool = new Pool({ 
  user: process.env.DB_USER || 'postgres', 
  host: process.env.DB_HOST || 'db', 
  database: process.env.DB_NAME || 'mips_db', 
  password: process.env.DB_PASS || 'postgres', 
  port: 5432 
});

async function conectarComRetentativa() {
  let conectado = false;
  while (!conectado) {
    try {
      await pool.query('SELECT 1');
      conectado = true;
      console.log('✅ Conectado ao banco de dados com sucesso!');
      await inicializarBancoEAdmin();
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
        autor_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
      CREATE TABLE IF NOT EXISTS configuracoes_portal (
        id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        nome_site VARCHAR(150) NOT NULL DEFAULT 'Portal MIPs',
        logo_site TEXT NOT NULL DEFAULT '',
        logo_avaliacao TEXT NOT NULL DEFAULT '',
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
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
        alterado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
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

    const check = await pool.query("SELECT * FROM usuarios WHERE email = 'admin'");
    if (check.rows.length === 0) {
      const hash = await bcrypt.hash(ADMIN_INITIAL_PASSWORD, 10);
      await pool.query("INSERT INTO usuarios (nome, email, senha, perfil, deve_alterar_senha) VALUES ($1, $2, $3, $4, FALSE)", ['Administrador', 'admin', hash, 'Administrador']);
      console.log('✅ Usuário admin criado!');
    }
  } catch (err) { console.log('Erro ao inicializar:', err.message); }
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
    next();
  } catch (err) { return res.status(401).json({ error: 'Token inválido' }); }
};

const somenteAdministrador = (req, res, next) => {
  if (String(req.usuarioPerfil || '').toLowerCase() !== 'administrador') {
    return res.status(403).json({ error: 'Acesso exclusivo do Administrador' });
  }
  next();
};

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
    res.json({ token, deve_alterar_senha: Boolean(user.deve_alterar_senha), user: { id: user.id, nome: user.nome, perfil: user.perfil, email: user.email, deve_alterar_senha: Boolean(user.deve_alterar_senha) } });
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

app.get('/api/configuracoes-portal', async (_req, res) => {
  try {
    const result = await pool.query("SELECT nome_site,logo_site,logo_avaliacao FROM configuracoes_portal WHERE id=1");
    res.json(result.rows[0] || { nome_site: 'Portal MIPs', logo_site: '', logo_avaliacao: '' });
  } catch (error) { res.status(500).json({ error: 'Erro ao carregar identidade visual' }); }
});

app.put('/api/configuracoes-portal', verificarToken, async (req, res) => {
  if (String(req.usuarioPerfil).toLowerCase() !== 'administrador') return res.status(403).json({ error: 'Acesso negado' });
  const { nome_site, logo_site = '', logo_avaliacao = '' } = req.body;
  if (!String(nome_site || '').trim()) return res.status(400).json({ error: 'Informe o nome do site' });
  try {
    const result = await pool.query(`INSERT INTO configuracoes_portal (id,nome_site,logo_site,logo_avaliacao,atualizado_em) VALUES (1,$1,$2,$3,CURRENT_TIMESTAMP) ON CONFLICT (id) DO UPDATE SET nome_site=EXCLUDED.nome_site,logo_site=EXCLUDED.logo_site,logo_avaliacao=EXCLUDED.logo_avaliacao,atualizado_em=CURRENT_TIMESTAMP RETURNING nome_site,logo_site,logo_avaliacao`, [nome_site.trim(), String(logo_site), String(logo_avaliacao)]);
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Erro ao salvar identidade visual' }); }
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
    const host = req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    res.json({ url: `${protocol}://${host}/uploads/${req.file.filename}` });
  } catch (err) { res.status(500).json({ error: 'Erro upload' }); }
});

// MIPS
app.get('/api/mips', verificarToken, async (req, res) => {
  try {
    let query = `SELECT m.*, u.nome as autor_nome FROM mips m LEFT JOIN usuarios u ON m.autor_id = u.id`;
    if (req.usuarioPerfil === 'Leitor') query += ` WHERE m.status = 'Publicado'`;
    query += ` ORDER BY m.criado_em DESC`;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Erro listar' }); }
});

app.get('/api/mips/buscar', verificarToken, async (req, res) => {
  const { q } = req.query;
  try {
    let query = `SELECT m.*, u.nome as autor_nome FROM mips m LEFT JOIN usuarios u ON m.autor_id = u.id WHERE m.search_vector @@ plainto_tsquery('portuguese', $1)`;
    if (req.usuarioPerfil === 'Leitor') query += ` AND m.status = 'Publicado'`;
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
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Erro buscar' }); }
});

app.post('/api/mips', verificarToken, async (req, res) => {
  if (req.usuarioPerfil === 'Leitor') return res.status(403).json({ error: 'Acesso negado' });
  const { codigo, titulo, resumo, objetivo, conteudo, status } = req.body;
  let s = (req.usuarioPerfil === 'Editor' && status === 'Publicado') ? 'Em Revisão' : status;
  try {
    const r = await pool.query(
      `INSERT INTO mips (codigo, titulo, resumo, objetivo, conteudo, status, autor_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [codigo||'MIP-GERAL', titulo||'Sem Título', resumo||'', objetivo||'', conteudo||'', s||'Em Revisão', req.usuarioId]
    );
    res.status(201).json({ id: r.rows[0].id, mensagem: 'Salvo!' });
  } catch (err) { res.status(500).json({ error: 'Erro salvar' }); }
});

app.put('/api/mips/:id', verificarToken, async (req, res) => {
  if (req.usuarioPerfil === 'Leitor') return res.status(403).json({ error: 'Acesso negado' });
  const { codigo, titulo, resumo = '', objetivo = '', conteudo = '', status = 'Em Revisão' } = req.body;
  const novoStatus = 'Em Revisão';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const atual = await client.query('SELECT * FROM mips WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!atual.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'MIP não encontrada' }); }
    const m = atual.rows[0];
    await client.query(`INSERT INTO mip_versoes (mip_id,codigo,titulo,resumo,objetivo,conteudo,status,alterado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [m.id,m.codigo,m.titulo,m.resumo,m.objetivo,m.conteudo,m.status,req.usuarioId]);
    await client.query(`UPDATE mips SET codigo=$1,titulo=$2,resumo=$3,objetivo=$4,conteudo=$5,status=$6 WHERE id=$7`, [codigo,titulo,resumo,objetivo,conteudo,novoStatus,req.params.id]);
    await client.query('COMMIT');
    res.json({ mensagem: 'MIP atualizada e enviada novamente para aprovação do Administrador.', status: novoStatus });
  } catch (error) { await client.query('ROLLBACK'); res.status(500).json({ error: 'Erro ao atualizar MIP' }); }
  finally { client.release(); }
});

app.get('/api/mips/:id/versoes', verificarToken, async (req, res) => {
  if (req.usuarioPerfil === 'Leitor') return res.status(403).json({ error: 'Acesso negado' });
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
  try { await pool.query("UPDATE mips SET status = 'Publicado' WHERE id = $1", [req.params.id]); res.json({ mensagem: 'Aprovada!' }); } 
  catch (error) { res.status(500).json({ error: 'Erro aprovar' }); }
});

app.delete('/api/mips/:id', verificarToken, async (req, res) => {
  if (req.usuarioPerfil === 'Leitor') return res.status(403).json({ error: 'Acesso negado' });
  try { await pool.query('DELETE FROM mips WHERE id = $1', [req.params.id]); res.json({ mensagem: 'Excluída' }); } 
  catch (error) { res.status(500).json({ error: 'Erro excluir' }); }
});

// USUÁRIOS
app.get('/api/usuarios', verificarToken, async (req, res) => {
  if (req.usuarioPerfil !== 'Administrador') return res.status(403).json({ error: 'Acesso negado' });
  try {
    const result = await pool.query(`SELECT u.id,u.nome,u.email,u.perfil,u.setor,u.cargo,u.lider_id,l.nome AS lider_nome,u.modelo_avaliacao_id,m.nome AS modelo_avaliacao_nome,u.deve_alterar_senha,u.criado_em FROM usuarios u LEFT JOIN usuarios l ON l.id=u.lider_id LEFT JOIN modelos_avaliacao m ON m.id=u.modelo_avaliacao_id ORDER BY u.nome`);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Erro' }); }
});

app.post('/api/usuarios', verificarToken, async (req, res) => {
  if (req.usuarioPerfil !== 'Administrador') return res.status(403).json({ error: 'Acesso negado' });
  const { nome, email, senha, perfil, lider_id = null, modelo_avaliacao_id = null } = req.body;
  if (['leitor','editor'].includes(String(perfil).toLowerCase()) && !lider_id) return res.status(400).json({ error: 'Selecione o responsável pela avaliação deste usuário' });
  try {
    const hash = await bcrypt.hash(senha, 10);
    if (lider_id) { const perfilResponsavel=String(perfil).toLowerCase()==='leitor'?'editor':'administrador';const lider=await pool.query('SELECT id FROM usuarios WHERE id=$1 AND LOWER(perfil)=$2',[Number(lider_id),perfilResponsavel]);if(!lider.rows.length)return res.status(400).json({error:`O responsável selecionado precisa ter perfil ${perfilResponsavel==='editor'?'Editor':'Administrador'}`}); }
    let nomeModelo = '';
    if(modelo_avaliacao_id){const modelo=await pool.query('SELECT id,nome FROM modelos_avaliacao WHERE id=$1 AND ativo=TRUE',[Number(modelo_avaliacao_id)]);if(!modelo.rows.length)return res.status(400).json({error:'Modelo de avaliação inválido'});nomeModelo=modelo.rows[0].nome;}
    if(String(perfil).toLowerCase() !== 'administrador' && !modelo_avaliacao_id) return res.status(400).json({error:'Selecione a função/modelo de avaliação'});
    const result = await pool.query('INSERT INTO usuarios (nome,email,senha,perfil,setor,cargo,lider_id,modelo_avaliacao_id,deve_alterar_senha) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE) RETURNING id', [nome,email,hash,perfil,nomeModelo,nomeModelo,['leitor','editor'].includes(String(perfil).toLowerCase())?Number(lider_id):null,modelo_avaliacao_id?Number(modelo_avaliacao_id):null]);
    res.status(201).json({ id: result.rows[0].id, mensagem: 'Criado!' });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Este usuário de acesso já está cadastrado' });
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

app.put('/api/usuarios/:id', verificarToken, async (req, res) => {
  if (String(req.usuarioPerfil).toLowerCase() !== 'administrador') return res.status(403).json({ error: 'Acesso negado' });
  const { nome, email, perfil, lider_id = null, modelo_avaliacao_id = null } = req.body;
  const perfilNormalizado = String(perfil || '').toLowerCase();
  if (String(req.params.id) === String(req.usuarioId) && perfilNormalizado !== 'administrador') return res.status(400).json({ error: 'O Administrador não pode remover o próprio acesso administrativo' });
  if (!String(nome || '').trim() || !String(email || '').trim() || !['leitor','editor','administrador'].includes(perfilNormalizado)) return res.status(400).json({ error: 'Preencha nome, login e perfil corretamente' });
  if (['leitor','editor'].includes(perfilNormalizado) && !lider_id) return res.status(400).json({ error: 'Selecione o responsável pela avaliação deste usuário' });
  try {
    let nomeModelo = '';
    if (modelo_avaliacao_id) { const m=await pool.query('SELECT nome FROM modelos_avaliacao WHERE id=$1 AND ativo=TRUE',[Number(modelo_avaliacao_id)]);if(!m.rows.length)return res.status(400).json({error:'Modelo de avaliação inválido'});nomeModelo=m.rows[0].nome; }
    if (perfilNormalizado !== 'administrador' && !modelo_avaliacao_id) return res.status(400).json({ error: 'Selecione a função/modelo de avaliação' });
    if (lider_id) { const esperado=perfilNormalizado==='leitor'?'editor':'administrador';const r=await pool.query('SELECT id FROM usuarios WHERE id=$1 AND LOWER(perfil)=$2',[Number(lider_id),esperado]);if(!r.rows.length)return res.status(400).json({error:`O responsável precisa ter perfil ${esperado==='editor'?'Editor':'Administrador'}`}); }
    const result=await pool.query('UPDATE usuarios SET nome=$1,email=$2,perfil=$3,setor=$4,cargo=$4,lider_id=$5,modelo_avaliacao_id=$6 WHERE id=$7 RETURNING id',[nome.trim(),email.trim(),perfil,nomeModelo,['leitor','editor'].includes(perfilNormalizado)?Number(lider_id):null,modelo_avaliacao_id?Number(modelo_avaliacao_id):null,req.params.id]);
    if(!result.rows.length)return res.status(404).json({error:'Usuário não encontrado'});
    res.json({mensagem:'Perfil atualizado com sucesso.'});
  } catch (error) { if(error.code==='23505')return res.status(409).json({error:'Este login já está sendo utilizado'});res.status(500).json({error:'Erro ao atualizar usuário'}); }
});

app.delete('/api/usuarios/:id', verificarToken, async (req, res) => {
  if (req.usuarioPerfil !== 'Administrador') return res.status(403).json({ error: 'Acesso negado' });
  try {
    if (req.params.id === req.usuarioId) return res.status(400).json({ error: 'Não exclua a si mesmo' });
    await pool.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
    res.json({ mensagem: 'Excluído!' });
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

// RECEITAS
app.get('/api/receitas', verificarToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM receitas ORDER BY titulo ASC');
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Erro' }); }
});

app.post('/api/receitas', verificarToken, async (req, res) => {
  if (req.usuarioPerfil === 'Leitor') return res.status(403).json({ error: 'Acesso negado' });
  const { titulo, rendimento_base, ingredientes } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO receitas (titulo, rendimento_base, ingredientes) VALUES ($1, $2, $3) RETURNING id',
      [titulo, rendimento_base, JSON.stringify(ingredientes)]
    );
    res.status(201).json({ id: result.rows[0].id, mensagem: 'Salvo!' });
  } catch (error) { res.status(500).json({ error: 'Erro' }); }
});

app.put('/api/receitas/:id', verificarToken, async (req, res) => {
  if (req.usuarioPerfil === 'Leitor') return res.status(403).json({ error: 'Acesso negado' });
  const { titulo, rendimento_base, ingredientes } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const atual = await client.query('SELECT * FROM receitas WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!atual.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Receita não encontrada' }); }
    const r = atual.rows[0];
    await client.query('INSERT INTO receita_versoes (receita_id,titulo,rendimento_base,ingredientes,alterado_por) VALUES ($1,$2,$3,$4::jsonb,$5)', [r.id,r.titulo,r.rendimento_base,JSON.stringify(r.ingredientes),req.usuarioId]);
    await client.query('UPDATE receitas SET titulo=$1,rendimento_base=$2,ingredientes=$3::jsonb WHERE id=$4', [titulo,Number(rendimento_base),JSON.stringify(ingredientes),req.params.id]);
    await client.query('COMMIT');
    res.json({ mensagem: 'Receita atualizada e versão anterior arquivada.' });
  } catch (error) { await client.query('ROLLBACK'); console.error('Erro ao atualizar receita:', error.message); res.status(500).json({ error: 'Erro ao atualizar receita. Verifique os dados dos ingredientes.' }); }
  finally { client.release(); }
});

app.get('/api/receitas/:id/versoes', verificarToken, async (req, res) => {
  if (req.usuarioPerfil === 'Leitor') return res.status(403).json({ error: 'Acesso negado' });
  const [historico, atual] = await Promise.all([
    pool.query(`SELECT v.*,u.nome AS alterado_por_nome FROM receita_versoes v LEFT JOIN usuarios u ON u.id=v.alterado_por WHERE v.receita_id=$1 ORDER BY v.criado_em ASC`, [req.params.id]),
    pool.query('SELECT * FROM receitas WHERE id=$1', [req.params.id]),
  ]);
  if (!atual.rows.length) return res.status(404).json({ error: 'Receita não encontrada' });
  const linhas = historico.rows.map((v, indice) => ({ ...v, numero_versao: indice + 1, alteracoes: alteracoesReceita(v, historico.rows[indice + 1] || atual.rows[0]) })).reverse();
  res.json(linhas);
});

app.delete('/api/receitas/:id', verificarToken, async (req, res) => {
  if (req.usuarioPerfil === 'Leitor') return res.status(403).json({ error: 'Acesso negado' });
  try {
    await pool.query('DELETE FROM receitas WHERE id = $1', [req.params.id]);
    res.json({ mensagem: 'Excluída!' });
  } catch (error) { res.status(500).json({ error: 'Erro' }); }
});

// AVALIAÇÕES MENSAIS
const podeGerenciarAvaliacoes = (req, res, next) => {
  if (!['administrador', 'editor'].includes(String(req.usuarioPerfil || '').toLowerCase())) {
    return res.status(403).json({ error: 'Acesso restrito a líderes e administradores' });
  }
  next();
};

app.get('/api/modelos-avaliacao', verificarToken, async (_req, res) => {
  const result=await pool.query('SELECT id,nome,chave FROM modelos_avaliacao WHERE ativo=TRUE ORDER BY nome');
  res.json(result.rows);
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
      SELECT u.id,u.nome,u.setor,u.cargo,u.perfil,u.modelo_avaliacao_id,MAX(a.mes_referencia) AS ultima_avaliacao
      FROM usuarios u LEFT JOIN avaliacoes a ON a.usuario_avaliado_id=u.id
      WHERE u.modelo_avaliacao_id IS NOT NULL ${String(req.usuarioPerfil).toLowerCase()==='editor'?"AND LOWER(u.perfil)='leitor' AND u.lider_id=$1":''}
      GROUP BY u.id ORDER BY u.nome
    `, String(req.usuarioPerfil).toLowerCase()==='editor'?[req.usuarioId]:[]);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Erro ao listar colaboradores' }); }
});

app.get('/api/avaliacoes/lembretes', verificarToken, podeGerenciarAvaliacoes, async (req, res) => {
  const mes = req.query.mes || new Date().toISOString().slice(0, 7);
  if (!/^[0-9]{4}-[0-9]{2}$/.test(mes)) return res.status(400).json({ error: 'Mês inválido' });
  try {
    const result = await pool.query(`
      SELECT u.id,u.nome,u.setor,u.cargo
      FROM usuarios u WHERE u.modelo_avaliacao_id IS NOT NULL ${String(req.usuarioPerfil).toLowerCase()==='editor'?"AND LOWER(u.perfil)='leitor' AND u.lider_id=$2":''} AND NOT EXISTS (
        SELECT 1 FROM avaliacoes a WHERE a.usuario_avaliado_id=u.id AND a.mes_referencia=$1
      )
      ORDER BY u.nome
    `, String(req.usuarioPerfil).toLowerCase()==='editor'?[mes,req.usuarioId]:[mes]);
    res.json({ mes, quantidade: result.rows.length, pendentes: result.rows });
  } catch (error) { res.status(500).json({ error: 'Erro ao buscar lembretes' }); }
});

app.get('/api/avaliacoes', verificarToken, podeGerenciarAvaliacoes, async (req, res) => {
  const valores = [];
  let filtro = String(req.usuarioPerfil).toLowerCase()==='editor' ? 'WHERE c.lider_id = $1' : '';
  if (String(req.usuarioPerfil).toLowerCase()==='editor') valores.push(req.usuarioId);
  if (req.query.colaborador_id) {
    valores.push(Number(req.query.colaborador_id));
    filtro += `${filtro ? ' AND' : 'WHERE'} a.usuario_avaliado_id = $${valores.length}`;
  }
  try {
    const result = await pool.query(`
      SELECT a.id, a.usuario_avaliado_id AS colaborador_id, a.mes_referencia, a.percentual, a.pontuacao_total,
             a.classificacao, a.aplicado_por, a.criado_em, a.token_compartilhamento,
             c.nome AS colaborador_nome, c.setor, c.cargo
      FROM avaliacoes a JOIN usuarios c ON c.id=a.usuario_avaliado_id
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
      WHERE a.id = $1 ${String(req.usuarioPerfil).toLowerCase()==='editor'?'AND c.lider_id=$2':''}
    `, String(req.usuarioPerfil).toLowerCase()==='editor'?[req.params.id,req.usuarioId]:[req.params.id]);
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
  const { colaborador_id, mes_referencia, elaborado_por, aplicado_por, respostas } = req.body;
  if (!colaborador_id || !/^[0-9]{4}-[0-9]{2}$/.test(String(mes_referencia || ''))) {
    return res.status(400).json({ error: 'Colaborador e mês de referência são obrigatórios' });
  }
  if (!String(elaborado_por || '').trim() || !String(aplicado_por || '').trim()) {
    return res.status(400).json({ error: 'Informe quem elaborou e quem aplicou a avaliação' });
  }
  try {
    const permitido=await pool.query(`SELECT id,modelo_avaliacao_id FROM usuarios WHERE id=$1 AND modelo_avaliacao_id IS NOT NULL ${String(req.usuarioPerfil).toLowerCase()==='editor'?"AND LOWER(perfil)='leitor' AND lider_id=$2":''}`,String(req.usuarioPerfil).toLowerCase()==='editor'?[Number(colaborador_id),req.usuarioId]:[Number(colaborador_id)]);
    if(!permitido.rows.length)return res.status(403).json({error:'Este funcionário não está vinculado a você'});
    const perguntas=await pool.query('SELECT * FROM perguntas_avaliacao WHERE ativa=TRUE AND modelo_avaliacao_id=$1 ORDER BY ordem,id',[permitido.rows[0].modelo_avaliacao_id]);
    const calculo = prepararAvaliacaoDinamica(perguntas.rows,respostas);
    const tokenCompartilhamento = randomUUID();
    const result = await pool.query(`
      INSERT INTO avaliacoes (
        usuario_avaliado_id, mes_referencia, elaborado_por, aplicado_por,
        pontuacao_total, percentual, classificacao, respostas, token_compartilhamento, criado_por
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
    `, [
      Number(colaborador_id), mes_referencia, elaborado_por.trim(), aplicado_por.trim(),
      calculo.pontuacaoTotal, calculo.percentual,
      calculo.classificacao, JSON.stringify(calculo.respostas), tokenCompartilhamento, req.usuarioId,
    ]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Este colaborador já foi avaliado neste mês' });
    if (error.message?.includes('nota válida') || error.message?.includes('obrigatória')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erro ao salvar avaliação' });
  }
});

app.put('/api/avaliacoes/:id', verificarToken, podeGerenciarAvaliacoes, async (req, res) => {
  const { colaborador_id, mes_referencia, elaborado_por, aplicado_por, respostas } = req.body;
  if (!colaborador_id || !/^[0-9]{4}-[0-9]{2}$/.test(String(mes_referencia || ''))) return res.status(400).json({ error: 'Usuário e mês de referência são obrigatórios' });
  if (!String(elaborado_por || '').trim() || !String(aplicado_por || '').trim()) return res.status(400).json({ error: 'Informe quem elaborou e quem aplicou a avaliação' });
  try {
    const existente = await pool.query(`SELECT a.usuario_avaliado_id,a.respostas FROM avaliacoes a JOIN usuarios u ON u.id=a.usuario_avaliado_id WHERE a.id=$1 ${String(req.usuarioPerfil).toLowerCase()==='editor'?'AND u.lider_id=$2':''}`,String(req.usuarioPerfil).toLowerCase()==='editor'?[req.params.id,req.usuarioId]:[req.params.id]);
    if(!existente.rows.length)return res.status(404).json({error:'Avaliação não encontrada'});
    if(Number(colaborador_id)!==Number(existente.rows[0].usuario_avaliado_id))return res.status(400).json({error:'O usuário de uma avaliação concluída não pode ser alterado'});
    const perguntasSnapshot=(existente.rows[0].respostas||[]).map((r,index)=>({id:r.pergunta_id||r.competencia,titulo:r.titulo,pergunta:r.pergunta,criterios:r.criterios||[],obrigatoria:Boolean(r.obrigatoria),ordem:index+1}));
    const calculo = prepararAvaliacaoDinamica(perguntasSnapshot,respostas);
    const result = await pool.query(`UPDATE avaliacoes SET mes_referencia=$1,elaborado_por=$2,aplicado_por=$3,pontuacao_total=$4,percentual=$5,classificacao=$6,respostas=$7 WHERE id=$8 RETURNING *`, [mes_referencia,elaborado_por.trim(),aplicado_por.trim(),calculo.pontuacaoTotal,calculo.percentual,calculo.classificacao,JSON.stringify(calculo.respostas),req.params.id]);
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
    const result = await pool.query(`DELETE FROM avaliacoes a WHERE a.id=$1 ${String(req.usuarioPerfil).toLowerCase()==='editor'?'AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id=a.usuario_avaliado_id AND u.lider_id=$2)':''} RETURNING id`, String(req.usuarioPerfil).toLowerCase()==='editor'?[req.params.id,req.usuarioId]:[req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Avaliação não encontrada' });
    res.json({ mensagem: 'Avaliação excluída.' });
  } catch (error) { res.status(500).json({ error: 'Erro ao excluir avaliação' }); }
});

app.listen(PORT, () => console.log(`🚀 Backend rodando na porta ${PORT}`));
