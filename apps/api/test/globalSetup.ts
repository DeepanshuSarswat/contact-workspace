import { createPool } from '../src/db/pool';
import { runMigrations } from '../src/db/migrate';

// Fresh schema for every run (also checks the migrations work from empty).
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set (copy .env.example to .env).');

  const pool = createPool(url);
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}
