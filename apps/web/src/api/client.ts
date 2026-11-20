import type { ApiErrorBody, ErrorCode, FieldErrors } from '@contacts/shared';

export type ClientErrorCode = ErrorCode | 'NETWORK_ERROR' | 'UNKNOWN_ERROR';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ClientErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get fieldErrors(): FieldErrors {
    const fields = (this.details as { fields?: FieldErrors } | undefined)?.fields;
    return fields ?? {};
  }

  // only network errors and 5xx; a 4xx would just fail again
  get isRetryable(): boolean {
    return this.code === 'NETWORK_ERROR' || this.status >= 500;
  }
}

export type QueryValue = string | number | string[] | undefined | null;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal;
}

export function buildQuery(query: Record<string, QueryValue> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    for (const v of Array.isArray(value) ? value : [value]) params.append(key, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

function isApiErrorBody(body: unknown): body is ApiErrorBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as ApiErrorBody).error?.code === 'string'
  );
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}${buildQuery(opts.query)}`, {
      method: opts.method ?? 'GET',
      headers: opts.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (err) {
    // cancelled by a newer request or navigation
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection.');
  }

  const body: unknown = await res.json().catch(() => undefined);

  if (!res.ok) {
    if (isApiErrorBody(body)) {
      throw new ApiError(res.status, body.error.code, body.error.message, body.error.details);
    }
    // e.g. a 502 from the dev proxy, no JSON body
    throw new ApiError(
      res.status,
      res.status >= 500 ? 'INTERNAL_ERROR' : 'UNKNOWN_ERROR',
      res.status >= 500 ? 'The server had a problem. Please try again.' : 'Unexpected response.',
    );
  }
  return body as T;
}
