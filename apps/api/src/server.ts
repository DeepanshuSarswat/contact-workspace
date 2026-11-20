import { createApp } from './app';
import { env } from './config/env';
import { createPool } from './db/pool';
import { logger } from './lib/logger';

const pool = createPool();
const app = createApp({ pool });

const server = app.listen(env.API_PORT, () => {
  logger.info(`API listening on http://localhost:${env.API_PORT}`);
});

function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  server.close(async (err) => {
    await pool.end().catch(() => {});
    if (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
