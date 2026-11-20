import type { z } from 'zod';

export const ERROR_CODES = [
  'VALIDATION_ERROR', // 400
  'BAD_REQUEST', // 400
  'NOT_FOUND', // 404
  'VERSION_CONFLICT', // 409, details.current is the latest contact
  'EMAIL_TAKEN', // 409
  'INTERNAL_ERROR', // 500
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export type FieldErrors = Record<string, string[]>;

export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
