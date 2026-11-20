import { Router } from 'express';
import type { Pool } from '../db/pool';

export function healthRouter(pool: Pool) {
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'up' });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'down' });
    }
  });

  return router;
}
