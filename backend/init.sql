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

-- Fase 2 (23/09/2026): comunicados, preferências, tickets/chat.
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
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets (status);
CREATE INDEX IF NOT EXISTS tickets_usuario_idx ON tickets (usuario_id);
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

-- Desabafo anônimo (23/10/2026): preenchido antes do login, sem vínculo com usuário.
CREATE TABLE IF NOT EXISTS desabafos (
  id SERIAL PRIMARY KEY,
  mensagem TEXT NOT NULL,
  setor VARCHAR(60) NOT NULL DEFAULT '',
  lido_em TIMESTAMP,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Banco de Horas (23/09/2026): matrícula/CPF no usuário + lotes e lançamentos.
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

-- Folgas rotativas (23/09/2026).
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
