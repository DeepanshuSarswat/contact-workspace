import { contactFormSchema, type Contact, type FieldErrors } from '@contacts/shared';

export const FIELDS = ['firstName', 'lastName', 'email', 'phone', 'company'] as const;
export type Field = (typeof FIELDS)[number];
export type FormValues = Record<Field, string>;

export const LABELS: Record<Field, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  phone: 'Phone',
  company: 'Company',
};

export function toFormValues(c: Contact): FormValues {
  return {
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email ?? '',
    phone: c.phone ?? '',
    company: c.company ?? '',
  };
}

export function editedFields(values: FormValues, base: Contact): Field[] {
  const original = toFormValues(base);
  return FIELDS.filter((f) => values[f] !== original[f]);
}

export function isDirty(values: FormValues, base: Contact): boolean {
  return editedFields(values, base).length > 0;
}

export function changedByOthers(base: Contact, latest: Contact): Field[] {
  const before = toFormValues(base);
  const after = toFormValues(latest);
  return FIELDS.filter((f) => before[f] !== after[f]);
}

// Three-way merge for "keep my changes": my edited fields + everything else from latest.
export function rebaseOnto(values: FormValues, base: Contact, latest: Contact): FormValues {
  const mine = new Set(editedFields(values, base));
  const theirs = toFormValues(latest);
  const merged = { ...theirs };
  for (const f of mine) merged[f] = values[f];
  return merged;
}

type FormOutput = ReturnType<typeof contactFormSchema.parse>;
export type ContactChanges = Partial<FormOutput>;

export type ValidationResult =
  { ok: true; changes: ContactChanges } | { ok: false; errors: FieldErrors };

// Same schema as the API. Only changed fields are sent, so the activity log stays exact.
export function validateChanges(values: FormValues, base: Contact): ValidationResult {
  const parsed = contactFormSchema.safeParse(values);
  if (!parsed.success) {
    const errors: FieldErrors = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '_');
      (errors[key] ??= []).push(issue.message);
    }
    return { ok: false, errors };
  }
  const changes: Record<string, string | null> = {};
  for (const f of FIELDS) {
    const next = parsed.data[f] ?? null;
    if (next !== base[f]) changes[f] = next;
  }
  return { ok: true, changes: changes as ContactChanges };
}
