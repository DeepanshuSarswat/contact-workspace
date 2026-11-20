import { Router } from 'express';
import { z } from 'zod';
import {
  listActivityQuerySchema,
  listContactsQuerySchema,
  updateContactSchema,
} from '@contacts/shared';
import { parseBody, parseParams, parseQuery } from '../lib/validate';
import type { ContactService } from '../services/contactService';

export const idParamsSchema = z.object({
  id: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export function contactsRouter(contacts: ContactService) {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = parseQuery(listContactsQuerySchema, req);
    res.json(await contacts.list(query));
  });

  router.get('/:id', async (req, res) => {
    const { id } = parseParams(idParamsSchema, req);
    res.json(await contacts.get(id));
  });

  router.patch('/:id', async (req, res) => {
    const { id } = parseParams(idParamsSchema, req);
    const input = parseBody(updateContactSchema, req);
    res.json(await contacts.update(id, input));
  });

  router.get('/:id/activity', async (req, res) => {
    const { id } = parseParams(idParamsSchema, req);
    const { limit, cursor } = parseQuery(listActivityQuerySchema, req);
    res.json(await contacts.activity(id, limit, cursor));
  });

  return router;
}
