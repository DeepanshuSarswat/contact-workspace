import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { ApiErrorBody, Contact } from '@contacts/shared';
import { createApp } from '../src/app';
import { createTestPool, insertContact, resetDb } from './helpers/db';

const pool = createTestPool();
const app = createApp({ pool });

let ravi: number;
let priya: number;

beforeEach(async () => {
  await resetDb(pool);
  ravi = await insertContact(pool, {
    firstName: 'Ravi',
    lastName: 'Kumar',
    email: 'ravi@acme.io',
    phone: '+91 98765 43210',
    company: 'Acme',
    tags: ['VIP'],
    createdAt: '2025-01-01T00:00:00Z',
  });
  priya = await insertContact(pool, { firstName: 'Priya', email: 'priya@globex.com' });
});

afterAll(() => pool.end());

const get = (id: number | string) => request(app).get(`/api/contacts/${id}`);
const patch = (id: number | string, body: unknown) =>
  request(app)
    .patch(`/api/contacts/${id}`)
    .send(body as object);

async function activityCount(contactId: number) {
  const { rows } = await pool.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM contact_activity WHERE contact_id = $1',
    [contactId],
  );
  return rows[0]!.n;
}

describe('GET /api/contacts/:id', () => {
  it('returns the contact with its tags and version', async () => {
    const res = await get(ravi);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: ravi,
      firstName: 'Ravi',
      lastName: 'Kumar',
      email: 'ravi@acme.io',
      company: 'Acme',
      version: 1,
      tags: [{ name: 'VIP' }],
    });
  });

  it('404s for a missing contact and 400s for a non-numeric id', async () => {
    expect((await get(999999)).status).toBe(404);
    const bad = await get('abc');
    expect(bad.status).toBe(400);
    expect((bad.body as ApiErrorBody).error.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /api/contacts/:id — happy path', () => {
  it('updates fields, bumps version and updatedAt, keeps createdAt', async () => {
    const before = (await get(ravi)).body as Contact;
    const res = await patch(ravi, { company: 'HighLevel', phone: '', version: 1 });

    expect(res.status).toBe(200);
    const after = res.body as Contact;
    expect(after.company).toBe('HighLevel');
    expect(after.phone).toBeNull(); // "" clears the field
    expect(after.version).toBe(2);
    expect(after.createdAt).toBe(before.createdAt);
    expect(Date.parse(after.updatedAt)).toBeGreaterThan(Date.parse(before.updatedAt));
    expect(after.tags.map((t) => t.name)).toEqual(['VIP']);
  });

  it('normalises email to lower case', async () => {
    const res = await patch(ravi, { email: '  Ravi.K@ACME.io ', version: 1 });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('ravi.k@acme.io');
  });

  it('records a CONTACT_UPDATED activity with a from/to diff of changed fields only', async () => {
    await patch(ravi, { firstName: 'Ravindra', lastName: 'Kumar', version: 1 });
    const { rows } = await pool.query(
      'SELECT type, payload FROM contact_activity WHERE contact_id = $1',
      [ravi],
    );
    expect(rows).toEqual([
      {
        type: 'CONTACT_UPDATED',
        payload: { changes: { firstName: { from: 'Ravi', to: 'Ravindra' } } },
      },
    ]);
  });

  it('a no-op update does not bump the version or log activity', async () => {
    const res = await patch(ravi, { firstName: 'Ravi', version: 1 });
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
    expect(await activityCount(ravi)).toBe(0);
  });
});

describe('PATCH /api/contacts/:id — concurrent updates (optimistic locking)', () => {
  it('rejects a stale update: A and B open v1, B saves, A saves later', async () => {
    const userA = (await get(ravi)).body as Contact;
    const userB = (await get(ravi)).body as Contact;

    const bSaves = await patch(ravi, { company: 'Saved by B', version: userB.version });
    expect(bSaves.status).toBe(200);

    const aSaves = await patch(ravi, { company: 'Saved by A', version: userA.version });
    expect(aSaves.status).toBe(409);
    const err = (aSaves.body as ApiErrorBody).error;
    expect(err.code).toBe('VERSION_CONFLICT');
    expect((err.details as { current: Contact }).current).toMatchObject({
      company: 'Saved by B',
      version: 2,
    });

    // B's change wasn't overwritten
    expect(((await get(ravi)).body as Contact).company).toBe('Saved by B');
  });

  it('when many clients save the same version at once, exactly one wins', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => patch(ravi, { company: `Writer ${i}`, version: 1 })),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409, 409, 409, 409]);

    const final = (await get(ravi)).body as Contact;
    expect(final.version).toBe(2);
    expect(final.company).toBe(results.find((r) => r.status === 200)!.body.company);
    expect(await activityCount(ravi)).toBe(1);
  });

  it('even a no-op update with a stale version is a conflict', async () => {
    await patch(ravi, { company: 'X', version: 1 });
    expect((await patch(ravi, { firstName: 'Ravi', version: 1 })).status).toBe(409);
  });
});

describe('PATCH /api/contacts/:id — email uniqueness', () => {
  it('rejects an email already used by another contact (any case) with 409 EMAIL_TAKEN', async () => {
    const res = await patch(priya, { email: 'RAVI@acme.io', version: 1 });
    expect(res.status).toBe(409);
    expect((res.body as ApiErrorBody).error.code).toBe('EMAIL_TAKEN');
    // rolled back
    expect(((await get(priya)).body as Contact).email).toBe('priya@globex.com');
    expect(await activityCount(priya)).toBe(0);
  });

  it('allows several contacts to have no email', async () => {
    expect((await patch(ravi, { email: null, version: 1 })).status).toBe(200);
    expect((await patch(priya, { email: '', version: 1 })).status).toBe(200);
  });

  it('frees an email once its owner changes it', async () => {
    await patch(ravi, { email: 'new@acme.io', version: 1 });
    expect((await patch(priya, { email: 'ravi@acme.io', version: 1 })).status).toBe(200);
  });
});

describe('PATCH /api/contacts/:id — invalid input', () => {
  it.each([
    ['missing version', { firstName: 'X' }],
    ['only version', { version: 1 }],
    ['invalid email', { email: 'not-an-email', version: 1 }],
    ['invalid phone', { phone: 'call me', version: 1 }],
    ['blank first name', { firstName: '  ', version: 1 }],
    ['unknown field', { id: 5, firstName: 'X', version: 1 }],
    ['wrong type', { firstName: 42, version: 1 }],
  ])('400 for %s, with per-field messages', async (_label, body) => {
    const res = await patch(ravi, body);
    expect(res.status).toBe(400);
    const err = (res.body as ApiErrorBody).error;
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details).toHaveProperty('fields');
  });

  it('404 for a missing contact', async () => {
    const res = await patch(999999, { firstName: 'X', version: 1 });
    expect(res.status).toBe(404);
  });
});
