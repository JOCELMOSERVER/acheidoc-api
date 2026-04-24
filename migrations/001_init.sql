CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS utilizadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(200) NOT NULL UNIQUE,
  telefone VARCHAR(30),
  password_hash TEXT NOT NULL,
  pontos INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO','BLOQUEADO')),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(200) NOT NULL UNIQUE,
  telefone VARCHAR(30),
  password_hash TEXT NOT NULL,
  pontos INTEGER NOT NULL DEFAULT 0,
  provincia VARCHAR(80),
  status VARCHAR(20) NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO','INATIVO','BLOQUEADO')),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(200) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documentos (
  id VARCHAR(40) PRIMARY KEY,
  tipo VARCHAR(80) NOT NULL,
  nome_proprietario VARCHAR(200) NOT NULL,
  bi VARCHAR(20),
  data_nascimento DATE,
  morada TEXT,
  provincia VARCHAR(80),
  foto_url TEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE','PUBLICADO','REJEITADO','CORRECAO_SOLICITADA','DISPONIVEL_LEVANTAMENTO','ENTREGUE')),
  risco VARCHAR(20) NOT NULL DEFAULT 'MEDIO' CHECK (risco IN ('BAIXO','MEDIO','ALTO')),
  publicado_por UUID REFERENCES utilizadores(id) ON DELETE SET NULL,
  revisto_por UUID REFERENCES admin(id) ON DELETE SET NULL,
  observacao_correcao TEXT,
  data_publicacao TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data_revisao TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pagamentos (
  id VARCHAR(40) PRIMARY KEY,
  doc_id VARCHAR(40) NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
  utilizador_id UUID REFERENCES utilizadores(id) ON DELETE SET NULL,
  valor NUMERIC(10,2) NOT NULL DEFAULT 500.00,
  status VARCHAR(20) NOT NULL DEFAULT 'AGUARDANDO' CHECK (status IN ('AGUARDANDO','PAGO','REJEITADO')),
  entidade VARCHAR(10),
  referencia VARCHAR(20),
  telefone VARCHAR(30),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmado_em TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(200) NOT NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('utilizador','agente','admin')),
  token VARCHAR(6) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  usado BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(200) NOT NULL,
  token VARCHAR(6) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  usado BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pending_user_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(200) NOT NULL UNIQUE,
  nome VARCHAR(120) NOT NULL,
  telefone VARCHAR(30),
  password_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documentos_status ON documentos(status);
CREATE INDEX IF NOT EXISTS idx_pagamentos_doc_id ON pagamentos(doc_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_email ON password_reset_tokens(email, tipo);
CREATE INDEX IF NOT EXISTS idx_email_verification ON email_verification_tokens(email);
CREATE INDEX IF NOT EXISTS idx_pending_registrations_email ON pending_user_registrations(email);
