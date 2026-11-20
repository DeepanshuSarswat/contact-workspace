import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../../src/db/migrate';
import { createTestPool, insertContact, resetDb } from '../helpers/db';

const pool = createTestPool();

beforeEach(() => resetDb(pool));
afterAll(() => pool.end());

async function pgErrorCode(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code;
  }
}

describe('migrations', () => {
  it('are idempotent (re-running applies nothing)', async () => {
    const logs: string[] = [];
    await runMigrations(pool, (m) => logs.push(m));
    expect(logs).toEqual(['database is up to date']);
  });
});

describe('contacts constraints', () => {
  it('rejects a duplicate email (23505 unique_violation)', async () => {
    await insertContact(pool, { email: 'a@example.com' });
    expect(await pgErrorCode(insertContact(pool, { email: 'a@example.com' }))).toBe('23505');
  });

  it('allows many contacts without an email', async () => {
    await insertContact(pool, { email: null });
    await insertContact(pool, { email: null });
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM contacts WHERE email IS NULL',
    );
    expect(rows[0].n).toBe(2);
  });

  it('only accepts lower-cased emails, so uniqueness is case-insensitive', async () => {
    expect(await pgErrorCode(insertContact(pool, { email: 'A@Example.com' }))).toBe('23514');
  });

  it('rejects an empty first name (23514 check_violation)', async () => {
    expect(await pgErrorCode(insertContact(pool, { firstName: '' }))).toBe('23514');
  });

  it('maintains generated search/sort columns', async () => {
    const id = await insertContact(pool, {
      firstName: 'Ravi',
      lastName: 'Kumar',
      phone: '+91 (987) 654-3210',
    });
    const { rows } = await pool.query(
      'SELECT full_name, sort_name, phone_digits FROM contacts WHERE id = $1',
      [id],
    );
    expect(rows[0]).toEqual({
      full_name: 'Ravi Kumar',
      sort_name: 'ravi kumar',
      phone_digits: '919876543210',
    });
  });
});

describe('tags constraints', () => {
  it('treats tag names case-insensitively unique', async () => {
    await pool.query(`INSERT INTO tags (name) VALUES ('VIP')`);
    expect(await pgErrorCode(pool.query(`INSERT INTO tags (name) VALUES ('vip')`))).toBe('23505');
  });

  it('prevents assigning the same tag twice and cascades on contact delete', async () => {
    const contactId = await insertContact(pool);
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO tags (name) VALUES ('Lead') RETURNING id`,
    );
    const tagId = rows[0]!.id;
    await pool.query('INSERT INTO contact_tags (contact_id, tag_id) VALUES ($1, $2)', [
      contactId,
      tagId,
    ]);
    expect(
      await pgErrorCode(
        pool.query('INSERT INTO contact_tags (contact_id, tag_id) VALUES ($1, $2)', [
          contactId,
          tagId,
        ]),
      ),
    ).toBe('23505');

    await pool.query('DELETE FROM contacts WHERE id = $1', [contactId]);
    const left = await pool.query('SELECT 1 FROM contact_tags WHERE contact_id = $1', [contactId]);
    expect(left.rowCount).toBe(0);
  });
});

describe('activity constraints', () => {
  it('rejects unknown activity types', async () => {
    const contactId = await insertContact(pool);
    expect(
      await pgErrorCode(
        pool.query(`INSERT INTO contact_activity (contact_id, type) VALUES ($1, 'DELETED')`, [
          contactId,
        ]),
      ),
    ).toBe('23514');
  });
});
