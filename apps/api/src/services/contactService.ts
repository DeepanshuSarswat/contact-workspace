import type {
  ActivityListResponse,
  Contact,
  ContactListResponse,
  FieldChange,
  ListContactsQuery,
  UpdateContactInput,
} from '@contacts/shared';
import { isUniqueViolation } from '../db/errors';
import { withTransaction, type Pool, type Queryable } from '../db/pool';
import {
  decodeActivityCursor,
  decodeCursor,
  encodeActivityCursor,
  encodeCursor,
  type Direction,
} from '../lib/cursor';
import { emailTaken, notFound, versionConflict } from '../lib/errors';
import { insertActivity, listActivityPage } from '../repositories/activityRepository';
import {
  EDITABLE_COLUMNS,
  countContacts,
  findContactById,
  findContactPage,
  findTagsForContacts,
  toContact,
  updateContactIfVersion,
  type ContactChanges,
  type ContactFilters,
  type ContactRow,
  type EditableField,
  type ListPageRow,
} from '../repositories/contactRepository';
import { findTagsByNames } from '../repositories/tagRepository';

const EDITABLE_FIELDS = Object.keys(EDITABLE_COLUMNS) as EditableField[];

const FIELD_VALUE: Record<EditableField, (r: ContactRow) => string | null> = {
  firstName: (r) => r.first_name,
  lastName: (r) => r.last_name,
  email: (r) => r.email,
  phone: (r) => r.phone,
  company: (r) => r.company,
};

async function hydrate(db: Queryable, row: ContactRow): Promise<Contact> {
  const tags = await findTagsForContacts(db, [row.id]);
  return toContact(row, tags.get(row.id));
}

export function createContactService(pool: Pool) {
  async function get(id: number): Promise<Contact> {
    const row = await findContactById(pool, id);
    if (!row) throw notFound('Contact');
    return hydrate(pool, row);
  }

  // lock row, check version, update and log activity in one transaction
  async function update(id: number, input: UpdateContactInput): Promise<Contact> {
    try {
      return await withTransaction(pool, async (tx) => {
        const current = await findContactById(tx, id, { forUpdate: true });
        if (!current) throw notFound('Contact');
        if (current.version !== input.version) throw versionConflict(await hydrate(tx, current));

        const changes: ContactChanges = {};
        const diff: Record<string, FieldChange> = {};
        for (const field of EDITABLE_FIELDS) {
          const next = input[field];
          const prev = FIELD_VALUE[field](current);
          if (next !== undefined && next !== prev) {
            changes[field] = next;
            diff[field] = { from: prev, to: next };
          }
        }

        // nothing changed, so no version bump and no activity
        if (!Object.keys(changes).length) return hydrate(tx, current);

        const updated = await updateContactIfVersion(tx, id, input.version, changes);
        // shouldn't happen while we hold the lock
        if (!updated) throw versionConflict(await hydrate(tx, current));

        await insertActivity(tx, id, 'CONTACT_UPDATED', { changes: diff });
        return hydrate(tx, updated);
      });
    } catch (err) {
      if (isUniqueViolation(err, 'contacts_email_key')) throw emailTaken(input.email ?? '');
      throw err;
    }
  }

  async function list(query: ListContactsQuery): Promise<ContactListResponse> {
    const { sort, order, limit } = query;
    const cursor = query.cursor ? decodeCursor(query.cursor, sort, order) : undefined;

    // an unknown tag means nothing can match, so skip the queries
    let tagIds: number[] | undefined;
    if (query.tag?.length) {
      const wanted = new Set(query.tag.map((t) => t.toLowerCase()));
      const tags = await findTagsByNames(pool, [...wanted]);
      if (tags.length < wanted.size) {
        return {
          data: [],
          pageInfo: { nextCursor: null, prevCursor: null },
          total: { count: 0, capped: false },
        };
      }
      tagIds = tags.map((t) => t.id);
    }

    const filters: ContactFilters = { q: query.q, tagIds, company: query.company };
    const after = cursor && { value: cursor.v, id: cursor.id, direction: cursor.d };

    const [{ rows, hasMore }, total] = await Promise.all([
      findContactPage(pool, { filters, sort, order, limit, after }),
      countContacts(pool, filters),
    ]);

    const tagsByContact = await findTagsForContacts(
      pool,
      rows.map((r) => r.id),
    );

    const make = (row: ListPageRow | undefined, d: Direction) =>
      row ? encodeCursor({ s: sort, o: order, v: row.cursor_value, id: row.id, d }) : null;
    const first = rows[0];
    const last = rows[rows.length - 1];
    const goingBack = cursor?.d === 'prev';

    return {
      data: rows.map((r) => toContact(r, tagsByContact.get(r.id))),
      pageInfo: {
        nextCursor: goingBack ? make(last, 'next') : hasMore ? make(last, 'next') : null,
        prevCursor: goingBack
          ? hasMore
            ? make(first, 'prev')
            : null
          : cursor
            ? make(first, 'prev')
            : null,
      },
      total,
    };
  }

  async function activity(
    id: number,
    limit: number,
    cursor?: string,
  ): Promise<ActivityListResponse> {
    const beforeId = cursor ? decodeActivityCursor(cursor) : null;
    if (!(await findContactById(pool, id))) throw notFound('Contact');
    const rows = await listActivityPage(pool, id, limit + 1, beforeId);
    const data = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    return { data, nextCursor: hasMore ? encodeActivityCursor(data.at(-1)!.id) : null };
  }

  return { list, get, update, activity };
}

export type ContactService = ReturnType<typeof createContactService>;
