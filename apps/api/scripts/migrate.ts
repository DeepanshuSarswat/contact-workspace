import { createPool } from '../src/db/pool';
import { runMigrations } from '../src/db/migrate';

const pool = createPool();
try {
  await runMigrations(pool, (msg) => console.log(`[migrate] ${msg}`));
} catch (err) {
  console.error('[migrate]', (err as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
