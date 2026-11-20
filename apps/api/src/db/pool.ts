import pg from 'pg';
import { env } from '../config/env';
import { logger } from '../lib/logger';

// bigint comes back as a string by default; our ids fit in a JS number.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;
export type Queryable = pg.Pool | pg.PoolClient;

export function databaseUrl(): string {
  const url = env.NODE_ENV === 'test' ? env.TEST_DATABASE_URL : env.DATABASE_URL;
  if (!url) {
    const name = env.NODE_ENV === 'test' ? 'TEST_DATABASE_URL' : 'DATABASE_URL';
    throw new Error(`${name} is not set. Copy .env.example to .env (see README).`);
  }
  return url;
}

export function createPool(connectionString = databaseUrl()): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
  });

  // without a listener, a DB restart killing idle connections crashes the process
  pool.on('error', (err) => {
    logger.warn({ err }, 'Idle database connection lost; it will be replaced on next use');
  });

  return pool;
}

export async function withTransaction<T>(
  pool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
