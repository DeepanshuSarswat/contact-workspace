import type { Contact, SortField, SortOrder, Tag } from '@contacts/shared';
import type { Queryable } from '../db/pool';
import { SqlParams, escapeLike } from '../db/sql';
import type { Direction } from '../lib/cursor';

export interface ContactRow {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export const CONTACT_COLUMNS = `c.id, c.first_name, c.last_name, c.email, c.phone, c.company,
  c.version, c.created_at, c.updated_at`;

export function toContact(row: ContactRow, tags: Tag[] = []): Contact {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    tags,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

// whitelist, these go straight into the SQL
const SORT_COLUMNS: Record<SortField, { column: string; cast: string }> = {
  name: { column: 'c.sort_name', cast: 'text' },
  createdAt: { column: 'c.created_at', cast: 'timestamptz' },
};

// count(*) is slow at scale, so stop at 10k and show "10,000+"
export const COUNT_CAP = 10_000;

export interface ContactFilters {
  q?: string;
  tagIds?: number[];
  company?: string;
}

export interface ListPageParams {
  filters: ContactFilters;
  sort: SortField;
  order: SortOrder;
  limit: number;
  after?: { value: string; id: number; direction: Direction };
}

export interface ListPageRow extends ContactRow {
  // as text so timestamps keep their microseconds in the cursor
  cursor_value: string;
}

const PHONE_LIKE = /^[\d\s+\-().]+$/;
const MIN_PHONE_DIGITS = 3;

function buildFilterWhere(filters: ContactFilters, p: SqlParams): string[] {
  const where: string[] = [];

  if (filters.q) {
    // trigram indexes make these ILIKEs fast
    const pattern = p.add(`%${escapeLike(filters.q)}%`);
    const anyOf = [`c.full_name ILIKE ${pattern}`, `c.email ILIKE ${pattern}`];

    // phone is matched on digits only, so formatting doesn't matter
    const digits = filters.q.replace(/\D/g, '');
    if (PHONE_LIKE.test(filters.q) && digits.length >= MIN_PHONE_DIGITS) {
      anyOf.push(`c.phone_digits LIKE ${p.add(`%${digits}%`)}`);
    }
    where.push(`(${anyOf.join(' OR ')})`);
  }

  // one EXISTS per tag = must have all of them
  for (const tagId of filters.tagIds ?? []) {
    where.push(
      `EXISTS (SELECT 1 FROM contact_tags ct WHERE ct.contact_id = c.id AND ct.tag_id = ${p.add(tagId)})`,
    );
  }

  if (filters.company) {
    where.push(`lower(c.company) = lower(${p.add(filters.company)})`);
  }

  return where;
}

const whereClause = (parts: string[]) => (parts.length ? `WHERE ${parts.join(' AND ')}` : '');

// Keyset pagination (no OFFSET), so deep pages stay fast. id breaks ties.
// Fetches limit + 1 to know if there's another page; "prev" runs reversed and flips back.
export async function findContactPage(db: Queryable, params: ListPageParams) {
  const { column, cast } = SORT_COLUMNS[params.sort];
  const p = new SqlParams();
  const where = buildFilterWhere(params.filters, p);

  const forward = params.after?.direction !== 'prev';
  const ascending = (params.order === 'asc') === forward;
  const dir = ascending ? 'ASC' : 'DESC';

  if (params.after) {
    const op = ascending ? '>' : '<';
    where.push(
      `(${column}, c.id) ${op} (${p.add(params.after.value)}::${cast}, ${p.add(params.after.id)})`,
    );
  }

  const sql = `
    SELECT ${CONTACT_COLUMNS}, ${column}::text AS cursor_value
    FROM contacts c
    ${whereClause(where)}
    ORDER BY ${column} ${dir}, c.id ${dir}
    LIMIT ${p.add(params.limit + 1)}`;

  const { rows } = await db.query<ListPageRow>(sql, p.values);
  const hasMore = rows.length > params.limit;
  const page = rows.slice(0, params.limit);
  if (!forward) page.reverse();
  return { rows: page, hasMore };
}

export async function countContacts(db: Queryable, filters: ContactFilters) {
  const p = new SqlParams();
  const where = buildFilterWhere(filters, p);
  const sql = `
    SELECT count(*)::int AS n FROM (
      SELECT 1 FROM contacts c ${whereClause(where)} LIMIT ${p.add(COUNT_CAP + 1)}
    ) matched`;
  const { rows } = await db.query<{ n: number }>(sql, p.values);
  const n = rows[0]!.n;
  return n > COUNT_CAP ? { count: COUNT_CAP, capped: true } : { count: n, capped: false };
}

// one query for the whole page, avoids N+1
export async function findTagsForContacts(
  db: Queryable,
  contactIds: number[],
): Promise<Map<number, Tag[]>> {
  const map = new Map<number, Tag[]>();
  if (!contactIds.length) return map;
  const { rows } = await db.query<{ contact_id: number; id: number; name: string }>(
    `SELECT ct.contact_id, t.id, t.name
     FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id
     WHERE ct.contact_id = ANY($1::bigint[])
     ORDER BY lower(t.name)`,
    [contactIds],
  );
  for (const r of rows) {
    const list = map.get(r.contact_id) ?? [];
    list.push({ id: r.id, name: r.name });
    map.set(r.contact_id, list);
  }
  return map;
}

export const EDITABLE_COLUMNS = {
  firstName: 'first_name',
  lastName: 'last_name',
  email: 'email',
  phone: 'phone',
  company: 'company',
} as const;

export type EditableField = keyof typeof EDITABLE_COLUMNS;
export type ContactChanges = Partial<Record<EditableField, string | null>>;

// forUpdate locks the row until the transaction ends.
export async function findContactById(
  db: Queryable,
  id: number,
  opts: { forUpdate?: boolean } = {},
): Promise<ContactRow | undefined> {
  const { rows } = await db.query<ContactRow>(
    `SELECT ${CONTACT_COLUMNS} FROM contacts c WHERE c.id = $1 ${opts.forUpdate ? 'FOR UPDATE' : ''}`,
    [id],
  );
  return rows[0];
}

// Returns undefined if the version no longer matches.
export async function updateContactIfVersion(
  db: Queryable,
  id: number,
  expectedVersion: number,
  changes: ContactChanges,
): Promise<ContactRow | undefined> {
  const p = new SqlParams();
  const sets = (Object.keys(changes) as EditableField[]).map(
    (field) => `${EDITABLE_COLUMNS[field]} = ${p.add(changes[field])}`,
  );
  const { rows } = await db.query<ContactRow>(
    `UPDATE contacts c
     SET ${sets.join(', ')}, version = c.version + 1, updated_at = now()
     WHERE c.id = ${p.add(id)} AND c.version = ${p.add(expectedVersion)}
     RETURNING ${CONTACT_COLUMNS}`,
    p.values,
  );
  return rows[0];
}
