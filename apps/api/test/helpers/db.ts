import { createPool, type Pool } from '../../src/db/pool';

export function createTestPool(): Pool {
  return createPool(process.env.TEST_DATABASE_URL);
}

export async function resetDb(pool: Pool) {
  await pool.query(
    'TRUNCATE contact_activity, contact_tags, contacts, tags RESTART IDENTITY CASCADE',
  );
}

export interface ContactFixture {
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  createdAt?: string;
  tags?: string[];
}

export async function insertContact(pool: Pool, c: ContactFixture = {}): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO contacts (first_name, last_name, email, phone, company, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, coalesce($6::timestamptz, now()), coalesce($6::timestamptz, now()))
     RETURNING id`,
    [
      c.firstName ?? 'Test',
      c.lastName ?? 'User',
      c.email ?? null,
      c.phone ?? null,
      c.company ?? null,
      c.createdAt ?? null,
    ],
  );
  const id = rows[0]!.id;
  for (const tag of c.tags ?? []) await tagContact(pool, id, tag);
  return id;
}

export async function tagContact(pool: Pool, contactId: number, tagName: string) {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO tags (name) VALUES ($1)
     ON CONFLICT (lower(name)) DO UPDATE SET name = tags.name
     RETURNING id`,
    [tagName],
  );
  await pool.query(
    'INSERT INTO contact_tags (contact_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [contactId, rows[0]!.id],
  );
}
