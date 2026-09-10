/**
 * Persistência do FieldService App.
 * - Produção: PostgreSQL quando DATABASE_URL estiver definida.
 * - Desenvolvimento local: mantém fallback nos arquivos JSON existentes.
 *
 * O formato das coleções não muda, portanto o frontend e as respostas da API
 * continuam exatamente com a mesma estrutura anterior.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const usePostgres = Boolean(process.env.DATABASE_URL);
let pool = null;

if (!usePostgres && !fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getPool() {
  if (!usePostgres) return null;
  if (!pool) {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
      max: Number(process.env.PG_POOL_MAX || 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    pool.on('error', (err) => console.error('[db] Erro inesperado no PostgreSQL:', err));
  }
  return pool;
}

function filePath(collection) {
  return path.join(DATA_DIR, `${collection}.json`);
}

async function initDatabase() {
  if (!usePostgres) return;
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS app_collections (
      collection_name VARCHAR(80) PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT app_collections_data_array CHECK (jsonb_typeof(data) = 'array')
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_app_collections_updated_at
    ON app_collections (updated_at DESC)
  `);
  console.log('[db] PostgreSQL conectado e esquema verificado.');
}

async function readCollection(collection) {
  if (!usePostgres) {
    const file = filePath(collection);
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, 'utf-8').trim();
    if (!raw) return [];
    try { return JSON.parse(raw); }
    catch (err) {
      console.error(`[db] Falha ao ler ${collection}.json:`, err.message);
      return [];
    }
  }

  const result = await getPool().query(
    'SELECT data FROM app_collections WHERE collection_name = $1',
    [collection]
  );
  if (!result.rows.length) return [];
  return result.rows[0].data || [];
}

async function writeCollection(collection, data) {
  if (!Array.isArray(data)) throw new TypeError('A coleção precisa ser um array.');

  if (!usePostgres) {
    fs.writeFileSync(filePath(collection), JSON.stringify(data, null, 2), 'utf-8');
    return;
  }

  await getPool().query(
    `INSERT INTO app_collections (collection_name, data, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (collection_name)
     DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    [collection, JSON.stringify(data)]
  );
}

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function collectionExists(collection) {
  if (!usePostgres) return fs.existsSync(filePath(collection));
  const result = await getPool().query(
    'SELECT 1 FROM app_collections WHERE collection_name = $1 LIMIT 1', [collection]
  );
  return result.rowCount > 0;
}

async function closeDatabase() {
  if (pool) await pool.end();
}

module.exports = {
  readCollection,
  writeCollection,
  genId,
  initDatabase,
  collectionExists,
  closeDatabase,
  DATA_DIR,
  usePostgres,
};
