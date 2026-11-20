import { z } from 'zod';

export const TAG_NAME_MAX = 50;
export const BULK_TAG_MAX_CONTACTS = 1000;

export const tagNameSchema = z
  .string()
  .trim()
  .min(1, 'Tag name is required')
  .max(TAG_NAME_MAX, `Tag name must be at most ${TAG_NAME_MAX} characters`)
  .regex(/^[\p{L}\p{N} _-]+$/u, 'Tag name may only contain letters, numbers, spaces, - and _');

export const addTagSchema = z.object({ name: tagNameSchema }).strict();
export type AddTagInput = z.infer<typeof addTagSchema>;

export const bulkTagSchema = z
  .object({
    contactIds: z
      .array(z.number().int().positive())
      .min(1, 'Select at least one contact')
      .max(BULK_TAG_MAX_CONTACTS, `At most ${BULK_TAG_MAX_CONTACTS} contacts per request`)
      .transform((ids) => [...new Set(ids)]),
    tagName: tagNameSchema,
  })
  .strict();
export type BulkTagInput = z.infer<typeof bulkTagSchema>;

export interface Tag {
  id: number;
  name: string;
}

export interface BulkTagResponse {
  tag: Tag;
  tagged: number;
  alreadyTagged: number;
  notFound: number[];
}
