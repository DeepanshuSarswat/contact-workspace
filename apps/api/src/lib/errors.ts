import type { ErrorCode } from '@contacts/shared';

// Expected errors with a status. Anything else is treated as a bug and returns a 500.
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const validationError = (details: unknown) =>
  new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', details);

export const notFound = (what: string) => new AppError(404, 'NOT_FOUND', `${what} not found`);

export const versionConflict = (current: unknown) =>
  new AppError(
    409,
    'VERSION_CONFLICT',
    'This contact was changed by someone else. Review the latest version and try again.',
    { current },
  );

export const emailTaken = (email: string) =>
  new AppError(409, 'EMAIL_TAKEN', `Another contact already uses ${email}`, {
    fields: { email: ['This email is already used by another contact'] },
  });
