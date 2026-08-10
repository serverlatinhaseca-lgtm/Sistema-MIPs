CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    senha VARCHAR(255) NOT NULL,
    perfil VARCHAR(20) CHECK (perfil IN ('Administrador', 'Editor', 'Leitor')) NOT NULL,
    ativo BOOLEAN DEFAULT TRUE,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categorias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(100) NOT NULL,
    parent_id UUID REFERENCES categorias(id) ON DELETE CASCADE,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE mips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo VARCHAR(20) UNIQUE NOT NULL,
    titulo VARCHAR(200) NOT NULL,
    categoria_id UUID REFERENCES categorias(id),
    resumo TEXT,
    objetivo TEXT,
    conteudo TEXT,
    status VARCHAR(20) CHECK (status IN ('Rascunho', 'Em Revisão', 'Publicado')) DEFAULT 'Rascunho',
    autor_id UUID REFERENCES usuarios(id),
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('portuguese', coalesce(titulo, '')), 'A') ||
        setweight(to_tsvector('portuguese', coalesce(resumo, '')), 'B') ||
        setweight(to_tsvector('portuguese', coalesce(conteudo, '')), 'C')
    ) STORED
);

CREATE INDEX mips_search_idx ON mips USING GIN (search_vector);

CREATE TABLE mip_relacionamentos (
    mip_id UUID REFERENCES mips(id) ON DELETE CASCADE,
    mip_relacionada_id UUID REFERENCES mips(id) ON DELETE CASCADE,
    PRIMARY KEY (mip_id, mip_relacionada_id)
);

INSERT INTO usuarios (nome, email, senha, perfil) 
VALUES ('Administrador', 'admin', '$2b$10$Xm5o/z/43D/uY3oR03A58uW8uC04B5U9.Y26U19gC19.957E.6R6O', 'Administrador');
