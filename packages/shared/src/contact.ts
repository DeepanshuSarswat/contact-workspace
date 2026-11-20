import { z } from 'zod';
import { tagNameSchema, type Tag } from './tag';

// Blank input means "no value".
const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

export const NAME_MAX = 100;
export const COMPANY_MAX = 200;
export const EMAIL_MAX = 254;

export const firstNameSchema = z
  .string()
  .trim()
  .min(1, 'First name is required')
  .max(NAME_MAX, `First name must be at most ${NAME_MAX} characters`);

export const lastNameSchema = z
  .string()
  .trim()
  .max(NAME_MAX, `Last name must be at most ${NAME_MAX} characters`);

// Lower-cased so the unique index is case-insensitive.
export const emailSchema = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .toLowerCase()
    .max(EMAIL_MAX, 'Email is too long')
    .pipe(z.email('Enter a valid email address'))
    .nullable(),
);

export const phoneSchema = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .regex(/^\+?[\d\s\-().]+$/, 'Phone may only contain digits, spaces, +, -, ( ) and .')
    .refine((v) => {
      const digits = v.replace(/\D/g, '').length;
      return digits >= 7 && digits <= 15;
    }, 'Phone must contain 7 to 15 digits')
    .nullable(),
);

export const companySchema = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .max(COMPANY_MAX, `Company must be at most ${COMPANY_MAX} characters`)
    .nullable(),
);

// `version` is the one the client loaded; a stale one gets VERSION_CONFLICT.
export const updateContactSchema = z
  .object({
    firstName: firstNameSchema.optional(),
    lastName: lastNameSchema.optional(),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    company: companySchema.optional(),
    version: z.number().int().positive(),
  })
  .strict()
  .refine(
    ({ version: _v, ...fields }) => Object.values(fields).some((v) => v !== undefined),
    'Provide at least one field to update',
  );

export type UpdateContactInput = z.infer<typeof updateContactSchema>;

export const contactFormSchema = z.object({
  firstName: firstNameSchema,
  lastName: lastNameSchema,
  email: emailSchema,
  phone: phoneSchema,
  company: companySchema,
});

export type ContactFormValues = z.input<typeof contactFormSchema>;

export const SORT_FIELDS = ['name', 'createdAt'] as const;
export const SORT_ORDERS = ['asc', 'desc'] as const;
export const PAGE_SIZE_DEFAULT = 25;
export const PAGE_SIZE_MAX = 100;
export const MAX_TAG_FILTERS = 10;

export type SortField = (typeof SORT_FIELDS)[number];
export type SortOrder = (typeof SORT_ORDERS)[number];

const toArray = (v: unknown) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]);
const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

export const listContactsQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  // ?tag=VIP&tag=Lead -> contact must have both
  tag: z.preprocess(
    toArray,
    z
      .array(tagNameSchema)
      .max(MAX_TAG_FILTERS, `At most ${MAX_TAG_FILTERS} tag filters`)
      .optional(),
  ),
  company: z.preprocess(emptyToUndefined, z.string().trim().max(COMPANY_MAX).optional()),
  sort: z.enum(SORT_FIELDS).default('createdAt'),
  order: z.enum(SORT_ORDERS).default('desc'),
  limit: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
  cursor: z.preprocess(emptyToUndefined, z.string().max(500).optional()),
});

export type ListContactsQuery = z.infer<typeof listContactsQuerySchema>;

export interface Contact {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  tags: Tag[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PageInfo {
  nextCursor: string | null;
  prevCursor: string | null;
}

export interface ContactListResponse {
  data: Contact[];
  pageInfo: PageInfo;
  // counting stops at a cap; capped = "at least count"
  total: { count: number; capped: boolean };
}
