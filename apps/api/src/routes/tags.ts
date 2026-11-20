import { Router } from 'express';
import { z } from 'zod';
import { addTagSchema, bulkTagSchema } from '@contacts/shared';
import { parseBody, parseParams } from '../lib/validate';
import type { TagService } from '../services/tagService';
import { idParamsSchema } from './contacts';

const contactTagParamsSchema = idParamsSchema.extend({
  tagId: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export function tagsRouter(tags: TagService) {
  const router = Router();
  router.get('/', async (_req, res) => {
    res.json(await tags.list());
  });
  return router;
}

export function contactTagsRouter(tags: TagService) {
  const router = Router();

  router.post('/bulk-tags', async (req, res) => {
    const input = parseBody(bulkTagSchema, req);
    res.json(await tags.bulkAssign(input));
  });

  router.post('/:id/tags', async (req, res) => {
    const { id } = parseParams(idParamsSchema, req);
    const { name } = parseBody(addTagSchema, req);
    res.json(await tags.addToContact(id, name));
  });

  router.delete('/:id/tags/:tagId', async (req, res) => {
    const { id, tagId } = parseParams(contactTagParamsSchema, req);
    res.json(await tags.removeFromContact(id, tagId));
  });

  return router;
}
