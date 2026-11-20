import type { Tag } from '@contacts/shared';
import type { Queryable } from '../db/pool';

export async function findTagsByNames(db: Queryable, names: string[]): Promise<Tag[]> {
  if (!names.length) return [];
  const { rows } = await db.query<Tag>(
    'SELECT id, name FROM tags WHERE lower(name) = ANY($1::text[])',
    [names.map((n) => n.toLowerCase())],
  );
  return rows;
}

export async function listTags(db: Queryable): Promise<Tag[]> {
  const { rows } = await db.query<Tag>('SELECT id, name FROM tags ORDER BY lower(name)');
  return rows;
}

// ON CONFLICT makes concurrent creates safe; an existing tag keeps its casing ("vip" -> "VIP")
export async function findOrCreateTag(db: Queryable, name: string): Promise<Tag> {
  const inserted = await db.query<Tag>(
    `INSERT INTO tags (name) VALUES ($1)
     ON CONFLICT (lower(name)) DO NOTHING
     RETURNING id, name`,
    [name],
  );
  if (inserted.rows[0]) return inserted.rows[0];

  const existing = await db.query<Tag>('SELECT id, name FROM tags WHERE lower(name) = lower($1)', [
    name,
  ]);
  return existing.rows[0]!;
}

export async function findTagById(db: Queryable, id: number): Promise<Tag | undefined> {
  const { rows } = await db.query<Tag>('SELECT id, name FROM tags WHERE id = $1', [id]);
  return rows[0];
}

// false if the contact already had it
export async function addTagToContact(
  db: Queryable,
  contactId: number,
  tagId: number,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `INSERT INTO contact_tags (contact_id, tag_id) VALUES ($1, $2)
     ON CONFLICT (contact_id, tag_id) DO NOTHING`,
    [contactId, tagId],
  );
  return rowCount === 1;
}

export async function removeTagFromContact(
  db: Queryable,
  contactId: number,
  tagId: number,
): Promise<boolean> {
  const { rowCount } = await db.query(
    'DELETE FROM contact_tags WHERE contact_id = $1 AND tag_id = $2',
    [contactId, tagId],
  );
  return rowCount === 1;
}

export async function findExistingContactIds(db: Queryable, ids: number[]): Promise<number[]> {
  const { rows } = await db.query<{ id: number }>(
    'SELECT id FROM contacts WHERE id = ANY($1::bigint[])',
    [ids],
  );
  return rows.map((r) => r.id);
}

// ORDER BY id = same lock order for every request, so overlapping bulk tags can't deadlock
export async function bulkAddTag(
  db: Queryable,
  contactIds: number[],
  tagId: number,
): Promise<number[]> {
  const { rows } = await db.query<{ contact_id: number }>(
    `INSERT INTO contact_tags (contact_id, tag_id)
     SELECT c.id, $2 FROM contacts c WHERE c.id = ANY($1::bigint[]) ORDER BY c.id
     ON CONFLICT (contact_id, tag_id) DO NOTHING
     RETURNING contact_id`,
    [contactIds, tagId],
  );
  return rows.map((r) => r.contact_id);
}
