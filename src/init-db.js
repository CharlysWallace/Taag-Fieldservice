require('dotenv').config();
const { initDatabase, closeDatabase, usePostgres } = require('./db');

(async () => {
  if (!usePostgres) {
    console.log('[db:init] DATABASE_URL não definida. Nada a criar no PostgreSQL.');
    return;
  }
  try {
    await initDatabase();
    console.log('[db:init] Banco pronto.');
  } catch (err) {
    console.error('[db:init] Falha:', err);
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
})();
