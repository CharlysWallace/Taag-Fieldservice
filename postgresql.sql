-- FieldService App — PostgreSQL
-- Este esquema mantém exatamente o mesmo formato de dados que o frontend/API já usam.
-- Cada coleção do antigo /data/*.json é armazenada em JSONB no PostgreSQL.
-- Isso permite migrar sem alterar telas, campos, rotas ou comportamento do aplicativo.

CREATE TABLE IF NOT EXISTS app_collections (
  collection_name VARCHAR(80) PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_collections_data_array CHECK (jsonb_typeof(data) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_app_collections_updated_at
  ON app_collections (updated_at DESC);

-- As coleções abaixo são criadas vazias. O seed do Node.js preencherá
-- automaticamente as coleções iniciais somente quando "usuarios" estiver vazia.
INSERT INTO app_collections (collection_name, data) VALUES
  ('tecnicos', '[]'::jsonb),
  ('usuarios', '[]'::jsonb),
  ('clientes', '[]'::jsonb),
  ('ordens_servico', '[]'::jsonb),
  ('solicitacoes_cadastro', '[]'::jsonb),
  ('notificacoes', '[]'::jsonb)
ON CONFLICT (collection_name) DO NOTHING;
