import { z } from 'zod';

export const ACTIVITY_TYPES = ['CONTACT_UPDATED', 'TAG_ADDED', 'TAG_REMOVED'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface FieldChange {
  from: string | null;
  to: string | null;
}

export type ActivityPayload =
  { changes: Record<string, FieldChange> } | { tagId: number; tagName: string; bulk?: boolean };

export interface Activity {
  id: number;
  contactId: number;
  type: ActivityType;
  payload: ActivityPayload;
  createdAt: string;
}

export const ACTIVITY_LIMIT_DEFAULT = 20;
export const ACTIVITY_LIMIT_MAX = 100;

export const listActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(ACTIVITY_LIMIT_MAX).default(ACTIVITY_LIMIT_DEFAULT),
  cursor: z.string().max(100).optional(),
});

export interface ActivityListResponse {
  data: Activity[];
  nextCursor: string | null; // null on the last page
}
