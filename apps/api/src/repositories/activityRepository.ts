import type { Activity, ActivityPayload, ActivityType } from '@contacts/shared';
import type { Queryable } from '../db/pool';

// Called with the transaction's client so the entry commits with the change.
export async function insertActivity(
  db: Queryable,
  contactId: number,
  type: ActivityType,
  payload: ActivityPayload,
): Promise<void> {
  await db.query('INSERT INTO contact_activity (contact_id, type, payload) VALUES ($1, $2, $3)', [
    contactId,
    type,
    JSON.stringify(payload),
  ]);
}

export async function insertActivityForMany(
  db: Queryable,
  contactIds: number[],
  type: ActivityType,
  payload: ActivityPayload,
): Promise<void> {
  if (!contactIds.length) return;
  await db.query(
    `INSERT INTO contact_activity (contact_id, type, payload)
     SELECT unnest($1::bigint[]), $2, $3::jsonb`,
    [contactIds, type, JSON.stringify(payload)],
  );
}

interface ActivityRow {
  id: number;
  contact_id: number;
  type: ActivityType;
  payload: ActivityPayload;
  created_at: Date;
}

// created_at is looked up in SQL; a JS Date would lose microseconds and skip/repeat rows
export async function listActivityPage(
  db: Queryable,
  contactId: number,
  limit: number,
  beforeId: number | null,
): Promise<Activity[]> {
  const { rows } = await db.query<ActivityRow>(
    `SELECT id, contact_id, type, payload, created_at
     FROM contact_activity
     WHERE contact_id = $1
       AND ($3::bigint IS NULL OR (created_at, id) < (
             SELECT created_at, id FROM contact_activity WHERE id = $3 AND contact_id = $1))
     ORDER BY created_at DESC, id DESC
     LIMIT $2`,
    [contactId, limit, beforeId],
  );
  return rows.map((r) => ({
    id: r.id,
    contactId: r.contact_id,
    type: r.type,
    payload: r.payload,
    createdAt: r.created_at.toISOString(),
  }));
}
