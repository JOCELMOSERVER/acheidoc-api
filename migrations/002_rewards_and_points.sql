CREATE TABLE IF NOT EXISTS pontos_entrega (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(160) NOT NULL,
  endereco TEXT NOT NULL,
  horario VARCHAR(120),
  telefone VARCHAR(30),
  provincia VARCHAR(80),
  municipio VARCHAR(80),
  agente_id UUID UNIQUE REFERENCES agentes(id) ON DELETE SET NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE documentos ADD COLUMN IF NOT EXISTS ponto_entrega_id UUID REFERENCES pontos_entrega(id) ON DELETE SET NULL;
ALTER TABLE documentos ADD COLUMN IF NOT EXISTS codigo_resgate VARCHAR(20);
ALTER TABLE documentos ADD COLUMN IF NOT EXISTS chave_entrega VARCHAR(20);

CREATE TABLE IF NOT EXISTS resgates_pontos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  utilizador_id UUID NOT NULL REFERENCES utilizadores(id) ON DELETE CASCADE,
  beneficio_codigo VARCHAR(40) NOT NULL,
  beneficio_nome VARCHAR(200) NOT NULL,
  pontos_usados INTEGER NOT NULL CHECK (pontos_usados > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'SOLICITADO' CHECK (status IN ('SOLICITADO','PROCESSADO','CANCELADO')),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processado_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_documentos_ponto_entrega ON documentos(ponto_entrega_id);
CREATE INDEX IF NOT EXISTS idx_pontos_entrega_agente ON pontos_entrega(agente_id);
CREATE INDEX IF NOT EXISTS idx_resgates_utilizador ON resgates_pontos(utilizador_id, criado_em DESC);

INSERT INTO pontos_entrega (nome, endereco, horario, telefone, provincia, municipio)
SELECT 'Ponto Mutamba', 'Largo da Mutamba, Luanda', 'Seg-Sex: 08h-17h', '+244 923 000 001', 'Luanda', 'Ingombota'
WHERE NOT EXISTS (SELECT 1 FROM pontos_entrega WHERE nome = 'Ponto Mutamba');

INSERT INTO pontos_entrega (nome, endereco, horario, telefone, provincia, municipio)
SELECT 'Ponto Viana', 'Estrada de Catete, Viana', 'Seg-Sex: 08h-17h', '+244 923 000 002', 'Luanda', 'Viana'
WHERE NOT EXISTS (SELECT 1 FROM pontos_entrega WHERE nome = 'Ponto Viana');

INSERT INTO pontos_entrega (nome, endereco, horario, telefone, provincia, municipio)
SELECT 'Ponto Benguela Centro', 'Rua Principal, Benguela', 'Seg-Sex: 08h-17h', '+244 923 000 003', 'Benguela', 'Benguela'
WHERE NOT EXISTS (SELECT 1 FROM pontos_entrega WHERE nome = 'Ponto Benguela Centro');