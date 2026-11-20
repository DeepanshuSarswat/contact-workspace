import type { BulkTagInput, BulkTagResponse, Contact, Tag } from '@contacts/shared';
import { withTransaction, type Pool } from '../db/pool';
import { notFound } from '../lib/errors';
import { insertActivity, insertActivityForMany } from '../repositories/activityRepository';
import { findContactById, findTagsForContacts, toContact } from '../repositories/contactRepository';
import {
  addTagToContact,
  bulkAddTag,
  findExistingContactIds,
  findOrCreateTag,
  findTagById,
  listTags,
  removeTagFromContact,
} from '../repositories/tagRepository';

// Tags don't bump the contact version, so tagging never conflicts with someone's open edit.
export function createTagService(pool: Pool) {
  async function contactWithTags(id: number): Promise<Contact> {
    const row = await findContactById(pool, id);
    if (!row) throw notFound('Contact');
    const tags = await findTagsForContacts(pool, [id]);
    return toContact(row, tags.get(id));
  }

  async function list(): Promise<Tag[]> {
    return listTags(pool);
  }

  async function addToContact(contactId: number, tagName: string): Promise<Contact> {
    await withTransaction(pool, async (tx) => {
      if (!(await findContactById(tx, contactId))) throw notFound('Contact');
      const tag = await findOrCreateTag(tx, tagName);
      if (await addTagToContact(tx, contactId, tag.id)) {
        await insertActivity(tx, contactId, 'TAG_ADDED', { tagId: tag.id, tagName: tag.name });
      }
    });
    return contactWithTags(contactId);
  }

  async function removeFromContact(contactId: number, tagId: number): Promise<Contact> {
    await withTransaction(pool, async (tx) => {
      if (!(await findContactById(tx, contactId))) throw notFound('Contact');
      const tag = await findTagById(tx, tagId);
      if (!tag) throw notFound('Tag');
      if (await removeTagFromContact(tx, contactId, tagId)) {
        await insertActivity(tx, contactId, 'TAG_REMOVED', { tagId: tag.id, tagName: tag.name });
      }
    });
    return contactWithTags(contactId);
  }

  // unknown ids are reported back rather than failing the request
  async function bulkAssign(input: BulkTagInput): Promise<BulkTagResponse> {
    return withTransaction(pool, async (tx) => {
      const tag = await findOrCreateTag(tx, input.tagName);
      const existing = new Set(await findExistingContactIds(tx, input.contactIds));
      const tagged = await bulkAddTag(tx, [...existing], tag.id);
      await insertActivityForMany(tx, tagged, 'TAG_ADDED', {
        tagId: tag.id,
        tagName: tag.name,
        bulk: true,
      });
      return {
        tag,
        tagged: tagged.length,
        alreadyTagged: existing.size - tagged.length,
        notFound: input.contactIds.filter((id) => !existing.has(id)),
      };
    });
  }

  return { list, addToContact, removeFromContact, bulkAssign };
}

export type TagService = ReturnType<typeof createTagService>;
