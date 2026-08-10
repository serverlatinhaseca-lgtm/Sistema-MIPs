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
