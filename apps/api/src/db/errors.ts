export const PG_UNIQUE_VIOLATION = '23505';

interface PgError {
  code: string;
  constraint?: string;
}

function isPgError(err: unknown): err is PgError {
  return typeof err === 'object' && err !== null && typeof (err as PgError).code === 'string';
}

export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  return (
    isPgError(err) &&
    err.code === PG_UNIQUE_VIOLATION &&
    (constraint === undefined || err.constraint === constraint)
  );
}
