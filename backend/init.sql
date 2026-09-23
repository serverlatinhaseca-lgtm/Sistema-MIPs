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
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mip_versoes (
  id SERIAL PRIMARY KEY,
  mip_id INT NOT NULL REFERENCES mips(id) ON DELETE CASCADE,
  codigo VARCHAR(20) NOT NULL,
  titulo VARCHAR(255) NOT NULL,
  resumo TEXT,
  objetivo TEXT,
  conteudo TEXT NOT NULL,
  status VARCHAR(50) NOT NULL,
  alterado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS receita_versoes (
  id SERIAL PRIMARY KEY,
  receita_id INT NOT NULL REFERENCES receitas(id) ON DELETE CASCADE,
  titulo VARCHAR(255) NOT NULL,
  rendimento_base INT NOT NULL,
  ingredientes JSONB NOT NULL,
  alterado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS perguntas_avaliacao (
  id SERIAL PRIMARY KEY,
  titulo VARCHAR(120) NOT NULL,
  pergunta TEXT NOT NULL,
  criterios JSONB NOT NULL DEFAULT '[]',
  obrigatoria BOOLEAN NOT NULL DEFAULT FALSE,
  ordem INT NOT NULL DEFAULT 0,
  ativa BOOLEAN NOT NULL DEFAULT TRUE,
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

CREATE TABLE IF NOT EXISTS clientes_reclamacao (id SERIAL PRIMARY KEY,nome VARCHAR(180) UNIQUE NOT NULL,ativo BOOLEAN NOT NULL DEFAULT TRUE,criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS tipos_reclamacao (id SERIAL PRIMARY KEY,nome VARCHAR(150) UNIQUE NOT NULL,ativo BOOLEAN NOT NULL DEFAULT TRUE,criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS configuracao_reclamacoes (id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),prazo_verde_min INT NOT NULL DEFAULT 1440,prazo_amarelo_min INT NOT NULL DEFAULT 180,prazo_vermelho_min INT NOT NULL DEFAULT 60,atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
INSERT INTO configuracao_reclamacoes (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;
CREATE TABLE IF NOT EXISTS reclamacoes (id SERIAL PRIMARY KEY,cliente_id INT NOT NULL REFERENCES clientes_reclamacao(id),assunto VARCHAR(220) DEFAULT '',tipo_id INT NOT NULL REFERENCES tipos_reclamacao(id),lider_responsavel_id INT NOT NULL REFERENCES usuarios(id),descricao TEXT NOT NULL,anexos JSONB NOT NULL DEFAULT '[]'::jsonb,prioridade VARCHAR(10) NOT NULL DEFAULT 'verde',prazo_em TIMESTAMP,status VARCHAR(15) NOT NULL DEFAULT 'aberto',concluido_em TIMESTAMP,concluido_por INT REFERENCES usuarios(id) ON DELETE SET NULL,criado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS setores_reclamacao (id SERIAL PRIMARY KEY,nome VARCHAR(150) UNIQUE NOT NULL,ativo BOOLEAN NOT NULL DEFAULT TRUE,criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS usuario_setores (usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,setor_id INT NOT NULL REFERENCES setores_reclamacao(id) ON DELETE CASCADE,PRIMARY KEY (usuario_id, setor_id));
ALTER TABLE reclamacoes ADD COLUMN IF NOT EXISTS setor_id INT REFERENCES setores_reclamacao(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS categorias_acesso (id SERIAL PRIMARY KEY,nome VARCHAR(100) UNIQUE NOT NULL,permissoes JSONB NOT NULL DEFAULT '[]'::jsonb,ativo BOOLEAN NOT NULL DEFAULT TRUE,criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS backup_auditoria (id SERIAL PRIMARY KEY,arquivo VARCHAR(180) NOT NULL,acao VARCHAR(30) NOT NULL,usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS categoria_acesso_id INT REFERENCES categorias_acesso(id) ON DELETE SET NULL;

-- Módulo ASO — Fase 1 (23/09/2026). FK para usuarios; funcionários não são recriados.
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
