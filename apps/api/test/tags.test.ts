import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { ApiErrorBody, BulkTagResponse, Contact, Tag } from '@contacts/shared';
import { createApp } from '../src/app';
import { createTestPool, insertContact, resetDb } from './helpers/db';

const pool = createTestPool();
const app = createApp({ pool });

let ravi: number;
let priya: number;
let john: number;

beforeEach(async () => {
  await resetDb(pool);
  ravi = await insertContact(pool, { firstName: 'Ravi', tags: ['VIP'] });
  priya = await insertContact(pool, { firstName: 'Priya' });
  john = await insertContact(pool, { firstName: 'John', tags: ['Lead'] });
});

afterAll(() => pool.end());

const addTag = (id: number | string, body: unknown) =>
  request(app)
    .post(`/api/contacts/${id}/tags`)
    .send(body as object);
const removeTag = (id: number | string, tagId: number | string) =>
  request(app).delete(`/api/contacts/${id}/tags/${tagId}`);
const bulk = (body: unknown) =>
  request(app)
    .post('/api/contacts/bulk-tags')
    .send(body as object);

const tagNames = (c: Contact) => c.tags.map((t) => t.name);

async function activities(contactId: number) {
  const { rows } = await pool.query<{ type: string; payload: Record<string, unknown> }>(
    'SELECT type, payload FROM contact_activity WHERE contact_id = $1 ORDER BY id',
    [contactId],
  );
  return rows;
}

async function tagId(name: string) {
  const { rows } = await pool.query<{ id: number }>('SELECT id FROM tags WHERE name = $1', [name]);
  return rows[0]!.id;
}

describe('GET /api/tags', () => {
  it('lists all tags alphabetically', async () => {
    const res = await request(app).get('/api/tags');
    expect(res.status).toBe(200);
    expect((res.body as Tag[]).map((t) => t.name)).toEqual(['Lead', 'VIP']);
  });
});

describe('POST /api/contacts/:id/tags', () => {
  it('adds an existing tag and records TAG_ADDED', async () => {
    const res = await addTag(priya, { name: 'VIP' });
    expect(res.status).toBe(200);
    expect(tagNames(res.body as Contact)).toEqual(['VIP']);
    expect(await activities(priya)).toEqual([
      { type: 'TAG_ADDED', payload: { tagId: await tagId('VIP'), tagName: 'VIP' } },
    ]);
  });

  it('creates a new tag on first use', async () => {
    const res = await addTag(priya, { name: 'Partner' });
    expect(tagNames(res.body as Contact)).toEqual(['Partner']);
    const all = (await request(app).get('/api/tags')).body as Tag[];
    expect(all.map((t) => t.name)).toEqual(['Lead', 'Partner', 'VIP']);
  });

  it('reuses an existing tag regardless of case (no "vip" duplicate)', async () => {
    const res = await addTag(priya, { name: '  vip ' });
    expect(tagNames(res.body as Contact)).toEqual(['VIP']);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM tags');
    expect(rows[0].n).toBe(2);
  });

  it('is idempotent: adding a tag the contact already has is a no-op', async () => {
    const res = await addTag(ravi, { name: 'VIP' });
    expect(res.status).toBe(200);
    expect(tagNames(res.body as Contact)).toEqual(['VIP']);
    expect(await activities(ravi)).toEqual([]);
  });

  it('does not change the contact version (tags never cause edit conflicts)', async () => {
    const res = await addTag(ravi, { name: 'Customer' });
    expect((res.body as Contact).version).toBe(1);
    // tag changes must not make version 1 stale
    const save = await request(app)
      .patch(`/api/contacts/${ravi}`)
      .send({ company: 'Acme', version: 1 });
    expect(save.status).toBe(200);
  });

  it('two users creating the same new tag at once end up sharing one tag', async () => {
    const [a, b] = await Promise.all([
      addTag(ravi, { name: 'Brand New' }),
      addTag(priya, { name: 'brand new' }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM tags WHERE lower(name) = 'brand new'`,
    );
    expect(rows[0].n).toBe(1);
  });

  it.each([
    ['missing name', {}],
    ['blank name', { name: '  ' }],
    ['too long', { name: 'x'.repeat(51) }],
    ['bad characters', { name: '<b>VIP</b>' }],
  ])('400 for %s', async (_label, body) => {
    const res = await addTag(ravi, body);
    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).error.code).toBe('VALIDATION_ERROR');
  });

  it('404 for a missing contact, and no tag is created', async () => {
    expect((await addTag(999999, { name: 'Ghost' })).status).toBe(404);
    const { rows } = await pool.query(`SELECT 1 FROM tags WHERE name = 'Ghost'`);
    expect(rows).toEqual([]);
  });
});

describe('DELETE /api/contacts/:id/tags/:tagId', () => {
  it('removes the tag and records TAG_REMOVED', async () => {
    const vip = await tagId('VIP');
    const res = await removeTag(ravi, vip);
    expect(res.status).toBe(200);
    expect(tagNames(res.body as Contact)).toEqual([]);
    expect(await activities(ravi)).toEqual([
      { type: 'TAG_REMOVED', payload: { tagId: vip, tagName: 'VIP' } },
    ]);
  });

  it('keeps the tag itself so other contacts are unaffected', async () => {
    await addTag(priya, { name: 'VIP' });
    await removeTag(ravi, await tagId('VIP'));
    const p = (await request(app).get(`/api/contacts/${priya}`)).body as Contact;
    expect(tagNames(p)).toEqual(['VIP']);
  });

  it('is idempotent: removing a tag the contact does not have is a no-op', async () => {
    const res = await removeTag(priya, await tagId('VIP'));
    expect(res.status).toBe(200);
    expect(await activities(priya)).toEqual([]);
  });

  it('404 for a missing contact or tag, 400 for a bad id', async () => {
    expect((await removeTag(999999, await tagId('VIP'))).status).toBe(404);
    expect((await removeTag(ravi, 999999)).status).toBe(404);
    expect((await removeTag(ravi, 'abc')).status).toBe(400);
  });
});

describe('POST /api/contacts/bulk-tags', () => {
  it('tags many contacts, skipping ones that already have it, and reports unknown ids', async () => {
    const res = await bulk({ contactIds: [ravi, priya, john, 999999], tagName: 'VIP' });
    expect(res.status).toBe(200);
    const body = res.body as BulkTagResponse;
    expect(body).toMatchObject({ tagged: 2, alreadyTagged: 1, notFound: [999999] });
    expect(body.tag.name).toBe('VIP');

    for (const id of [ravi, priya, john]) {
      const c = (await request(app).get(`/api/contacts/${id}`)).body as Contact;
      expect(tagNames(c)).toContain('VIP');
    }
  });

  it('records one TAG_ADDED (bulk) per newly tagged contact only', async () => {
    await bulk({ contactIds: [ravi, priya, john], tagName: 'VIP' });
    expect(await activities(ravi)).toEqual([]); // already had it
    expect(await activities(priya)).toEqual([
      { type: 'TAG_ADDED', payload: { tagId: await tagId('VIP'), tagName: 'VIP', bulk: true } },
    ]);
    expect(await activities(john)).toHaveLength(1);
  });

  it('creates the tag if needed and is safe to repeat', async () => {
    const first = (await bulk({ contactIds: [ravi, priya], tagName: 'Q4 Campaign' }))
      .body as BulkTagResponse;
    const again = (await bulk({ contactIds: [ravi, priya], tagName: 'q4 campaign' }))
      .body as BulkTagResponse;
    expect(first).toMatchObject({ tagged: 2, alreadyTagged: 0 });
    expect(again).toMatchObject({ tagged: 0, alreadyTagged: 2 });
    expect(again.tag).toEqual(first.tag);
  });

  it('handles overlapping bulk requests at the same time without errors or duplicates', async () => {
    const ids = [ravi, priya, john];
    const results = await Promise.all([
      bulk({ contactIds: ids, tagName: 'Overlap' }),
      bulk({ contactIds: [...ids].reverse(), tagName: 'Overlap' }),
      bulk({ contactIds: [john, ravi], tagName: 'Overlap' }),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    const totalTagged = results.reduce((n, r) => n + (r.body as BulkTagResponse).tagged, 0);
    expect(totalTagged).toBe(3); // each contact tagged exactly once overall

    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM contact_activity WHERE type = 'TAG_ADDED'`,
    );
    expect(rows[0].n).toBe(3);
  });

  it.each([
    ['empty selection', { contactIds: [], tagName: 'VIP' }],
    [
      'over the 1000 limit',
      { contactIds: Array.from({ length: 1001 }, (_, i) => i + 1), tagName: 'VIP' },
    ],
    ['non-integer ids', { contactIds: ['a'], tagName: 'VIP' }],
    ['missing tag name', { contactIds: [1] }],
  ])('400 for %s', async (_label, body) => {
    const res = await bulk(body);
    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).error.code).toBe('VALIDATION_ERROR');
  });
});
