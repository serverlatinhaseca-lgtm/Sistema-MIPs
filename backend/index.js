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
      CREATE TABLE IF NOT EXISTS colaboradores (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(120) NOT NULL,
        setor VARCHAR(100) NOT NULL,
        cargo VARCHAR(100) DEFAULT '',
        ativo BOOLEAN DEFAULT TRUE,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS avaliacoes (
        id SERIAL PRIMARY KEY,
        colaborador_id INT NOT NULL REFERENCES colaboradores(id),
        mes_referencia CHAR(7) NOT NULL,
        elaborado_por VARCHAR(150) NOT NULL,
        aplicado_por VARCHAR(150) NOT NULL,
        duracao_minutos INT NOT NULL DEFAULT 60,
        pontuacao_total INT NOT NULL,
        percentual INT NOT NULL,
        classificacao VARCHAR(20) NOT NULL,
        respostas JSONB NOT NULL,
        token_compartilhamento VARCHAR(64) UNIQUE NOT NULL,
        criado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (colaborador_id, mes_referencia)
      );
      CREATE INDEX IF NOT EXISTS avaliacoes_colaborador_mes_idx
        ON avaliacoes (colaborador_id, mes_referencia DESC);
    `);

    const check = await pool.query("SELECT * FROM usuarios WHERE email = 'admin'");
    if (check.rows.length === 0) {
      const hash = await bcrypt.hash(ADMIN_INITIAL_PASSWORD, 10);
      await pool.query("INSERT INTO usuarios (nome, email, senha, perfil) VALUES ($1, $2, $3, $4)", ['Administrador', 'admin', hash, 'Administrador']);
      console.log('✅ Usuário admin criado!');
    }
  } catch (err) { console.log('Erro ao inicializar:', err.message); }
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
    res.json({ token, user: { id: user.id, nome: user.nome, perfil: user.perfil, email: user.email } });
  } catch (error) { res.status(500).json({ error: 'Erro interno' }); }
});

// DASHBOARD
app.get('/api/dashboard', verificarToken, async (req, res) => {
  try {
    const mips = await pool.query('SELECT COUNT(*) FROM mips');
    const users = await pool.query('SELECT COUNT(*) FROM usuarios');
    const cats = await pool.query('SELECT COUNT(*) FROM categorias');
    const pendentes = await pool.query(`
      SELECT COUNT(*) FROM colaboradores c
      WHERE c.ativo = TRUE AND NOT EXISTS (
        SELECT 1 FROM avaliacoes a
        WHERE a.colaborador_id = c.id AND a.mes_referencia = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
      )
    `);
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
    const result = await pool.query('SELECT id, nome, email, perfil, criado_em FROM usuarios ORDER BY criado_em DESC');
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Erro' }); }
});

app.post('/api/usuarios', verificarToken, async (req, res) => {
  if (req.usuarioPerfil !== 'Administrador') return res.status(403).json({ error: 'Acesso negado' });
  const { nome, email, senha, perfil } = req.body;
  try {
    const hash = await bcrypt.hash(senha, 10);
    const result = await pool.query('INSERT INTO usuarios (nome, email, senha, perfil) VALUES ($1, $2, $3, $4) RETURNING id', [nome, email, hash, perfil]);
    res.status(201).json({ id: result.rows[0].id, mensagem: 'Criado!' });
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
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

app.get('/api/colaboradores', verificarToken, podeGerenciarAvaliacoes, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, MAX(a.mes_referencia) AS ultima_avaliacao
      FROM colaboradores c
      LEFT JOIN avaliacoes a ON a.colaborador_id = c.id
      WHERE c.ativo = TRUE
      GROUP BY c.id
      ORDER BY c.nome
    `);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Erro ao listar colaboradores' }); }
});

app.post('/api/colaboradores', verificarToken, podeGerenciarAvaliacoes, async (req, res) => {
  const { nome, setor, cargo = '' } = req.body;
  if (!String(nome || '').trim() || !String(setor || '').trim()) {
    return res.status(400).json({ error: 'Nome e setor são obrigatórios' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO colaboradores (nome, setor, cargo) VALUES ($1, $2, $3) RETURNING *',
      [nome.trim(), setor.trim(), String(cargo).trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Erro ao cadastrar colaborador' }); }
});

app.get('/api/avaliacoes/lembretes', verificarToken, podeGerenciarAvaliacoes, async (req, res) => {
  const mes = req.query.mes || new Date().toISOString().slice(0, 7);
  if (!/^[0-9]{4}-[0-9]{2}$/.test(mes)) return res.status(400).json({ error: 'Mês inválido' });
  try {
    const result = await pool.query(`
      SELECT c.id, c.nome, c.setor, c.cargo
      FROM colaboradores c
      WHERE c.ativo = TRUE AND NOT EXISTS (
        SELECT 1 FROM avaliacoes a WHERE a.colaborador_id = c.id AND a.mes_referencia = $1
      )
      ORDER BY c.nome
    `, [mes]);
    res.json({ mes, quantidade: result.rows.length, pendentes: result.rows });
  } catch (error) { res.status(500).json({ error: 'Erro ao buscar lembretes' }); }
});

app.get('/api/avaliacoes', verificarToken, podeGerenciarAvaliacoes, async (req, res) => {
  const valores = [];
  let filtro = '';
  if (req.query.colaborador_id) {
    valores.push(Number(req.query.colaborador_id));
    filtro = 'WHERE a.colaborador_id = $1';
  }
  try {
    const result = await pool.query(`
      SELECT a.id, a.colaborador_id, a.mes_referencia, a.percentual, a.pontuacao_total,
             a.classificacao, a.aplicado_por, a.criado_em, a.token_compartilhamento,
             c.nome AS colaborador_nome, c.setor, c.cargo
      FROM avaliacoes a JOIN colaboradores c ON c.id = a.colaborador_id
      ${filtro}
      ORDER BY a.mes_referencia DESC, c.nome
    `, valores);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Erro ao listar avaliações' }); }
});

app.get('/api/avaliacoes/compartilhada/:token', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, c.nome AS colaborador_nome, c.setor, c.cargo
      FROM avaliacoes a JOIN colaboradores c ON c.id = a.colaborador_id
      WHERE a.token_compartilhamento = $1
    `, [req.params.token]);
    if (!result.rows.length) return res.status(404).json({ error: 'Avaliação não encontrada' });
    const avaliacao = result.rows[0];
    const historico = await pool.query(`
      SELECT mes_referencia, percentual, classificacao
      FROM avaliacoes WHERE colaborador_id = $1
      ORDER BY mes_referencia
    `, [avaliacao.colaborador_id]);
    res.json({ ...avaliacao, historico: historico.rows });
  } catch (error) { res.status(500).json({ error: 'Erro ao abrir avaliação' }); }
});

app.get('/api/avaliacoes/:id', verificarToken, podeGerenciarAvaliacoes, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, c.nome AS colaborador_nome, c.setor, c.cargo
      FROM avaliacoes a JOIN colaboradores c ON c.id = a.colaborador_id
      WHERE a.id = $1
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Avaliação não encontrada' });
    const avaliacao = result.rows[0];
    const historico = await pool.query(`
      SELECT mes_referencia, percentual, classificacao
      FROM avaliacoes WHERE colaborador_id = $1 ORDER BY mes_referencia
    `, [avaliacao.colaborador_id]);
    res.json({ ...avaliacao, historico: historico.rows });
  } catch (error) { res.status(500).json({ error: 'Erro ao abrir avaliação' }); }
});

app.post('/api/avaliacoes', verificarToken, podeGerenciarAvaliacoes, async (req, res) => {
  const { colaborador_id, mes_referencia, elaborado_por, aplicado_por, duracao_minutos = 60, respostas } = req.body;
  if (!colaborador_id || !/^[0-9]{4}-[0-9]{2}$/.test(String(mes_referencia || ''))) {
    return res.status(400).json({ error: 'Colaborador e mês de referência são obrigatórios' });
  }
  if (!String(elaborado_por || '').trim() || !String(aplicado_por || '').trim()) {
    return res.status(400).json({ error: 'Informe quem elaborou e quem aplicou a avaliação' });
  }
  try {
    const calculo = prepararAvaliacao(respostas);
    const tokenCompartilhamento = randomUUID();
    const result = await pool.query(`
      INSERT INTO avaliacoes (
        colaborador_id, mes_referencia, elaborado_por, aplicado_por, duracao_minutos,
        pontuacao_total, percentual, classificacao, respostas, token_compartilhamento, criado_por
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
    `, [
      Number(colaborador_id), mes_referencia, elaborado_por.trim(), aplicado_por.trim(),
      Number(duracao_minutos), calculo.pontuacaoTotal, calculo.percentual,
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

app.listen(PORT, () => console.log(`🚀 Backend rodando na porta ${PORT}`));
