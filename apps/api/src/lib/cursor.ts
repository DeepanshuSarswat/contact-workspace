import { z } from 'zod';
import { SORT_FIELDS, SORT_ORDERS, type SortField, type SortOrder } from '@contacts/shared';
import { badRequest } from './errors';

// base64url JSON, opaque to the client and validated on decode
const cursorSchema = z.object({
  s: z.enum(SORT_FIELDS), // sort
  o: z.enum(SORT_ORDERS), // order
  v: z.string().max(300), // sort value of the last row
  id: z.number().int().positive(), // id of the last row
  d: z.enum(['next', 'prev']),
});

export type Cursor = z.infer<typeof cursorSchema>;
export type Direction = Cursor['d'];

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function decodeCursor(raw: string, sort: SortField, order: SortOrder): Cursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw badRequest('Invalid cursor');
  }
  const result = cursorSchema.safeParse(parsed);
  if (!result.success) throw badRequest('Invalid cursor');

  if (result.data.s !== sort || result.data.o !== order) {
    throw badRequest('Cursor does not match the current sort. Start again from the first page.');
  }
  return result.data;
}

const activityCursorSchema = z.object({ a: z.number().int().positive() });

export function encodeActivityCursor(lastId: number): string {
  return Buffer.from(JSON.stringify({ a: lastId })).toString('base64url');
}

export function decodeActivityCursor(raw: string): number {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw badRequest('Invalid cursor');
  }
  const result = activityCursorSchema.safeParse(parsed);
  if (!result.success) throw badRequest('Invalid cursor');
  return result.data.a;
}
