import { describe, expect, it } from 'vitest';
import { createTestPool } from './helpers/db';

describe('database connection loss', () => {
  it('survives Postgres terminating an idle pooled connection (no process crash)', async () => {
    const pool = createTestPool();
    try {
      // same as a database restart killing an idle connection
      const victim = await pool.connect();
      const { rows } = await victim.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
      victim.release(); // back to the pool, now idle

      const killer = createTestPool();
      await killer.query('SELECT pg_terminate_backend($1)', [rows[0]!.pid]);
      await killer.end();

      await new Promise((r) => setTimeout(r, 100));

      const after = await pool.query<{ ok: number }>('SELECT 1 AS ok');
      expect(after.rows[0]!.ok).toBe(1);
    } finally {
      await pool.end();
    }
  });
});
