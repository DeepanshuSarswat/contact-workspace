import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ContactListResponse } from '@contacts/shared';
import { createApp } from '../src/app';
import { createTestPool, insertContact, resetDb } from './helpers/db';

const pool = createTestPool();
const app = createApp({ pool });

const SAME_TIME = '2025-06-01T10:00:00Z';

beforeAll(async () => {
  await resetDb(pool);
  await insertContact(pool, {
    firstName: 'Ravi',
    lastName: 'Kumar',
    email: 'ravi@acme.io',
    phone: '+91 98765 43210',
    company: 'Acme',
    tags: ['VIP', 'Customer'],
    createdAt: '2025-01-01T00:00:00Z',
  });
  await insertContact(pool, {
    firstName: 'Priya',
    lastName: 'Sharma',
    email: 'priya@globex.com',
    phone: '+1 (555) 010-2030',
    company: 'Globex',
    tags: ['Lead'],
    createdAt: '2025-02-01T00:00:00Z',
  });
  await insertContact(pool, {
    firstName: 'anil',
    lastName: 'kapoor',
    email: null,
    phone: null,
    company: 'acme',
    tags: ['VIP'],
    createdAt: '2025-03-01T00:00:00Z',
  });
  await insertContact(pool, {
    firstName: 'Zoe',
    lastName: '50%_off',
    email: 'zoe@example.com',
    createdAt: '2025-04-01T00:00:00Z',
  });
  // same created_at for all 20, so only the id tie-breaker keeps paging exact
  for (let i = 0; i < 20; i++) {
    await insertContact(pool, {
      firstName: `Bulk${String(i).padStart(2, '0')}`,
      lastName: 'Same',
      createdAt: SAME_TIME,
    });
  }
});

afterAll(() => pool.end());

async function list(query: Record<string, string | string[] | number>) {
  const res = await request(app).get('/api/contacts').query(query);
  return { status: res.status, body: res.body as ContactListResponse };
}

async function walkForward(query: Record<string, string | number>) {
  const pages: number[][] = [];
  let cursor: string | null | undefined;
  do {
    const res = await list({ ...query, ...(cursor ? { cursor } : {}) });
    expect(res.status).toBe(200);
    pages.push(res.body.data.map((c) => c.id));
    cursor = res.body.pageInfo.nextCursor;
  } while (cursor && pages.length < 50);
  return pages;
}

describe('GET /api/contacts — paging and sorting', () => {
  it('returns the first page with defaults (newest first) and a total', async () => {
    const res = await list({});
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(24);
    expect(res.body.total).toEqual({ count: 24, capped: false });
    expect(res.body.pageInfo).toEqual({ nextCursor: null, prevCursor: null });
    expect(res.body.data[0]!.firstName).toBe('Bulk19'); // same time, highest id first
  });

  it.each([
    ['createdAt', 'desc'],
    ['createdAt', 'asc'],
    ['name', 'asc'],
    ['name', 'desc'],
  ])('pages through everything with no gaps or duplicates (%s %s)', async (sort, order) => {
    const full = (await list({ sort, order, limit: 100 })).body.data.map((c) => c.id);
    const pages = await walkForward({ sort, order, limit: 5 });

    expect(pages.flat()).toEqual(full);
    expect(new Set(pages.flat()).size).toBe(24);
    expect(pages.map((p) => p.length)).toEqual([5, 5, 5, 5, 4]);
  });

  it('prevCursor walks back to exactly the previous pages', async () => {
    const p1 = await list({ sort: 'name', limit: 5 });
    const p2 = await list({ sort: 'name', limit: 5, cursor: p1.body.pageInfo.nextCursor! });
    const p3 = await list({ sort: 'name', limit: 5, cursor: p2.body.pageInfo.nextCursor! });

    const back2 = await list({ sort: 'name', limit: 5, cursor: p3.body.pageInfo.prevCursor! });
    expect(back2.body.data.map((c) => c.id)).toEqual(p2.body.data.map((c) => c.id));

    const back1 = await list({ sort: 'name', limit: 5, cursor: back2.body.pageInfo.prevCursor! });
    expect(back1.body.data.map((c) => c.id)).toEqual(p1.body.data.map((c) => c.id));
    expect(back1.body.pageInfo.prevCursor).toBeNull();
    expect(back1.body.pageInfo.nextCursor).not.toBeNull();
  });

  it('sorts by name case-insensitively', async () => {
    const names = (await list({ sort: 'name', order: 'asc', limit: 100 })).body.data.map((c) =>
      `${c.firstName} ${c.lastName}`.toLowerCase(),
    );
    expect(names).toEqual([...names].sort());
    expect(names.indexOf('anil kapoor')).toBeLessThan(names.indexOf('priya sharma'));
  });
});

describe('GET /api/contacts — search', () => {
  it.each([
    ['name substring, any case', 'KUMA', ['Ravi']],
    ['full name across first + last', 'ravi kumar', ['Ravi']],
    ['email', 'globex', ['Priya']],
    ['phone ignoring formatting', '98765-43210', ['Ravi']],
    ['phone digits only', '5550102030', ['Priya']],
  ])('matches %s', async (_label, q, expected) => {
    const res = await list({ q });
    expect(res.body.data.map((c) => c.firstName)).toEqual(expected);
  });

  it('treats LIKE wildcards literally', async () => {
    expect((await list({ q: '50%_' })).body.data.map((c) => c.firstName)).toEqual(['Zoe']);
    expect((await list({ q: '%' })).body.data.map((c) => c.firstName)).toEqual(['Zoe']);
  });

  it('returns an empty page (not an error) when nothing matches', async () => {
    const res = await list({ q: 'no-such-person' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total.count).toBe(0);
  });
});

describe('GET /api/contacts — filters', () => {
  it('filters by tag, case-insensitively', async () => {
    const res = await list({ tag: 'vip', sort: 'name', order: 'asc' });
    expect(res.body.data.map((c) => c.firstName)).toEqual(['anil', 'Ravi']);
    expect(res.body.data[1]!.tags.map((t) => t.name)).toEqual(['Customer', 'VIP']);
  });

  it('requires ALL selected tags', async () => {
    const res = await list({ tag: ['VIP', 'Customer'] });
    expect(res.body.data.map((c) => c.firstName)).toEqual(['Ravi']);
  });

  it('returns nothing for an unknown tag', async () => {
    const res = await list({ tag: 'DoesNotExist' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('filters by company case-insensitively and combines with search and tags', async () => {
    expect(
      (await list({ company: 'ACME', sort: 'name', order: 'asc' })).body.data.map(
        (c) => c.firstName,
      ),
    ).toEqual(['anil', 'Ravi']);
    expect((await list({ company: 'acme', q: 'ravi' })).body.data.map((c) => c.firstName)).toEqual([
      'Ravi',
    ]);
    expect((await list({ company: 'acme', tag: 'Customer' })).body.total.count).toBe(1);
  });
});

describe('GET /api/contacts — invalid input', () => {
  it.each([
    [{ sort: 'email' }],
    [{ order: 'up' }],
    [{ limit: '0' }],
    [{ limit: '101' }],
    [{ limit: 'abc' }],
  ])('rejects %o with 400 VALIDATION_ERROR', async (query) => {
    const res = await list(query);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('rejects a garbage cursor with 400 BAD_REQUEST', async () => {
    const res = await list({ cursor: 'not-a-cursor' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'BAD_REQUEST' } });
  });

  it('rejects a cursor used with a different sort', async () => {
    const first = await list({ sort: 'name', limit: 5 });
    const res = await list({ sort: 'createdAt', cursor: first.body.pageInfo.nextCursor! });
    expect(res.status).toBe(400);
  });
});
