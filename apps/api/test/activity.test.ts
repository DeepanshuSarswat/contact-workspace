import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { ActivityListResponse, ApiErrorBody, Contact } from '@contacts/shared';
import { createApp } from '../src/app';
import { createTestPool, insertContact, resetDb } from './helpers/db';

const pool = createTestPool();
const app = createApp({ pool });

let ravi: number;
let priya: number;

beforeEach(async () => {
  await resetDb(pool);
  ravi = await insertContact(pool, { firstName: 'Ravi', company: 'Acme' });
  priya = await insertContact(pool, { firstName: 'Priya' });
});

afterAll(() => pool.end());

const activity = async (id: number | string, query: Record<string, string | number> = {}) => {
  const res = await request(app).get(`/api/contacts/${id}/activity`).query(query);
  return { status: res.status, body: res.body as ActivityListResponse & ApiErrorBody };
};

async function makeHistory() {
  await request(app).patch(`/api/contacts/${ravi}`).send({ company: 'HighLevel', version: 1 });
  const tagged = await request(app).post(`/api/contacts/${ravi}/tags`).send({ name: 'VIP' });
  const vipId = (tagged.body as Contact).tags[0]!.id;
  await request(app).delete(`/api/contacts/${ravi}/tags/${vipId}`);
  await request(app)
    .post('/api/contacts/bulk-tags')
    .send({ contactIds: [ravi], tagName: 'Lead' });
  return vipId;
}

describe('GET /api/contacts/:id/activity', () => {
  it('returns every kind of change, newest first, with contact id and timestamp', async () => {
    const vipId = await makeHistory();
    const { status, body } = await activity(ravi);

    expect(status).toBe(200);
    expect(body.data.map((a) => a.type)).toEqual([
      'TAG_ADDED', // bulk "Lead"
      'TAG_REMOVED',
      'TAG_ADDED',
      'CONTACT_UPDATED',
    ]);
    for (const a of body.data) {
      expect(a.contactId).toBe(ravi);
      expect(Number.isNaN(Date.parse(a.createdAt))).toBe(false);
    }
    expect(body.data[0]!.payload).toMatchObject({ tagName: 'Lead', bulk: true });
    expect(body.data[1]!.payload).toEqual({ tagId: vipId, tagName: 'VIP' });
    expect(body.data[3]!.payload).toEqual({
      changes: { company: { from: 'Acme', to: 'HighLevel' } },
    });
  });

  it('respects limit (most recent N)', async () => {
    await makeHistory();
    const { body } = await activity(ravi, { limit: 2 });
    expect(body.data.map((a) => a.type)).toEqual(['TAG_ADDED', 'TAG_REMOVED']);
  });

  it('pages through the whole history with nextCursor, with no gaps or repeats', async () => {
    await makeHistory(); // 4 entries
    await request(app)
      .post('/api/contacts/bulk-tags')
      .send({ contactIds: [ravi], tagName: 'Partner' });

    const all = (await activity(ravi)).body;
    expect(all.data).toHaveLength(5);
    expect(all.nextCursor).toBeNull();

    const seen: number[] = [];
    let cursor: string | null | undefined;
    let pages = 0;
    do {
      const { status, body } = await activity(ravi, { limit: 2, ...(cursor ? { cursor } : {}) });
      expect(status).toBe(200);
      seen.push(...body.data.map((a) => a.id));
      cursor = body.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(3); // 2 + 2 + 1
    expect(seen).toEqual(all.data.map((a) => a.id));
  });

  it('pages correctly when entries share the same timestamp (id breaks the tie)', async () => {
    await pool.query(
      `INSERT INTO contact_activity (contact_id, type, payload, created_at)
       SELECT $1, 'TAG_ADDED', jsonb_build_object('tagId', g, 'tagName', 't' || g),
              '2025-01-01T00:00:00.123456Z'
       FROM generate_series(1, 5) g`,
      [ravi],
    );
    const first = (await activity(ravi, { limit: 3 })).body;
    const second = (await activity(ravi, { limit: 3, cursor: first.nextCursor! })).body;
    const names = [...first.data, ...second.data].map(
      (a) => (a.payload as { tagName: string }).tagName,
    );
    expect(names).toEqual(['t5', 't4', 't3', 't2', 't1']);
    expect(second.nextCursor).toBeNull();
  });

  it('400 for a malformed cursor', async () => {
    expect((await activity(ravi, { cursor: 'not-a-cursor' })).status).toBe(400);
    const wrongShape = Buffer.from(JSON.stringify({ a: 'x' })).toString('base64url');
    expect((await activity(ravi, { cursor: wrongShape })).status).toBe(400);
  });

  it("only returns the requested contact's activity", async () => {
    await makeHistory();
    expect((await activity(priya)).body.data).toEqual([]);
  });

  it('does not log rejected changes (conflicts, duplicate emails, validation errors)', async () => {
    await insertContact(pool, { firstName: 'Taken', email: 'taken@x.io' });
    await request(app).patch(`/api/contacts/${ravi}`).send({ company: 'B', version: 1 });
    await request(app).patch(`/api/contacts/${ravi}`).send({ company: 'A', version: 1 }); // stale
    await request(app).patch(`/api/contacts/${ravi}`).send({ email: 'taken@x.io', version: 2 });
    await request(app).patch(`/api/contacts/${ravi}`).send({ email: 'bad', version: 2 });

    const { body } = await activity(ravi);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]!.payload).toEqual({ changes: { company: { from: 'Acme', to: 'B' } } });
  });

  it('404 for an unknown contact, 400 for bad id or limit', async () => {
    expect((await activity(999999)).status).toBe(404);
    expect((await activity('abc')).status).toBe(400);
    expect((await activity(ravi, { limit: 0 })).status).toBe(400);
    expect((await activity(ravi, { limit: 101 })).status).toBe(400);
  });
});
