import type { Request } from 'express';
import type { z } from 'zod';
import { toFieldErrors } from '@contacts/shared';
import { validationError } from './errors';

function parseWith<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw validationError({ fields: toFieldErrors(result.error) });
  return result.data;
}

export const parseBody = <S extends z.ZodType>(schema: S, req: Request) =>
  parseWith(schema, req.body ?? {});

export const parseQuery = <S extends z.ZodType>(schema: S, req: Request) =>
  parseWith(schema, req.query);

export const parseParams = <S extends z.ZodType>(schema: S, req: Request) =>
  parseWith(schema, req.params);
