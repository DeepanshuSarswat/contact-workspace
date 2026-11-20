import { describe, expect, it } from 'vitest';
import {
  bulkTagSchema,
  listContactsQuerySchema,
  tagNameSchema,
  updateContactSchema,
} from './index';

describe('updateContactSchema', () => {
  it('normalises email to lower case and empty strings to null', () => {
    const r = updateContactSchema.parse({ email: '  Ravi@Example.COM ', phone: '', version: 1 });
    expect(r.email).toBe('ravi@example.com');
    expect(r.phone).toBeNull();
  });

  it('requires version', () => {
    expect(updateContactSchema.safeParse({ firstName: 'A' }).success).toBe(false);
  });

  it('rejects a body with only version', () => {
    expect(updateContactSchema.safeParse({ version: 1 }).success).toBe(false);
  });

  it('rejects unknown fields (no mass assignment of id/createdAt)', () => {
    expect(updateContactSchema.safeParse({ firstName: 'A', id: 9, version: 1 }).success).toBe(
      false,
    );
  });

  it('rejects invalid email and phone', () => {
    expect(updateContactSchema.safeParse({ email: 'nope', version: 1 }).success).toBe(false);
    expect(updateContactSchema.safeParse({ phone: '12ab', version: 1 }).success).toBe(false);
    expect(updateContactSchema.safeParse({ phone: '123', version: 1 }).success).toBe(false);
  });

  it('rejects blank first name', () => {
    expect(updateContactSchema.safeParse({ firstName: '   ', version: 1 }).success).toBe(false);
  });
});

describe('listContactsQuerySchema', () => {
  it('applies defaults', () => {
    expect(listContactsQuerySchema.parse({})).toEqual({
      sort: 'createdAt',
      order: 'desc',
      limit: 25,
    });
  });

  it('accepts a single tag or repeated tags', () => {
    expect(listContactsQuerySchema.parse({ tag: 'VIP' }).tag).toEqual(['VIP']);
    expect(listContactsQuerySchema.parse({ tag: ['VIP', 'Lead'] }).tag).toEqual(['VIP', 'Lead']);
  });

  it('coerces limit and enforces bounds', () => {
    expect(listContactsQuerySchema.parse({ limit: '50' }).limit).toBe(50);
    expect(listContactsQuerySchema.safeParse({ limit: '1000' }).success).toBe(false);
    expect(listContactsQuerySchema.safeParse({ sort: 'email' }).success).toBe(false);
  });
});

describe('tags', () => {
  it('validates tag names', () => {
    expect(tagNameSchema.parse('  VIP ')).toBe('VIP');
    expect(tagNameSchema.safeParse('<script>').success).toBe(false);
    expect(tagNameSchema.safeParse('').success).toBe(false);
  });

  it('dedupes bulk contact ids and caps the batch', () => {
    expect(bulkTagSchema.parse({ contactIds: [1, 2, 2], tagName: 'VIP' }).contactIds).toEqual([
      1, 2,
    ]);
    const tooMany = Array.from({ length: 1001 }, (_, i) => i + 1);
    expect(bulkTagSchema.safeParse({ contactIds: tooMany, tagName: 'VIP' }).success).toBe(false);
  });
});
