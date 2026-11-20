import { randomUUID } from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Pool } from './db/pool';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { contactsRouter } from './routes/contacts';
import { healthRouter } from './routes/health';
import { contactTagsRouter, tagsRouter } from './routes/tags';
import { createContactService } from './services/contactService';
import { createTagService } from './services/tagService';

export interface AppDeps {
  pool: Pool;
}

export function createApp({ pool }: AppDeps) {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  const contactService = createContactService(pool);
  const tagService = createTagService(pool);

  app.use('/api/health', healthRouter(pool));
  app.use('/api/tags', tagsRouter(tagService));
  app.use('/api/contacts', contactTagsRouter(tagService));
  app.use('/api/contacts', contactsRouter(contactService));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
