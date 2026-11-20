import { describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest, buildQuery } from './client';

function mockFetch(impl: () => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );

describe('buildQuery', () => {
  it('repeats array params and skips empty values', () => {
    expect(buildQuery({ q: 'ravi', tag: ['VIP', 'Lead'], company: '', cursor: undefined })).toBe(
      '?q=ravi&tag=VIP&tag=Lead',
    );
    expect(buildQuery({})).toBe('');
  });
});

describe('apiRequest', () => {
  it('returns parsed JSON and sends JSON bodies', async () => {
    const fetch = mockFetch(() => json(200, { id: 1 }));
    await expect(apiRequest('/contacts/1', { method: 'PATCH', body: { a: 1 } })).resolves.toEqual({
      id: 1,
    });
    expect(fetch).toHaveBeenCalledWith(
      '/api/contacts/1',
      expect.objectContaining({
        method: 'PATCH',
        body: '{"a":1}',
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  it('turns the API error body into a typed ApiError', async () => {
    mockFetch(() =>
      json(409, {
        error: {
          code: 'EMAIL_TAKEN',
          message: 'Taken',
          details: { fields: { email: ['Already used'] } },
        },
      }),
    );
    const err = (await apiRequest('/x').catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: 'EMAIL_TAKEN', message: 'Taken' });
    expect(err.fieldErrors).toEqual({ email: ['Already used'] });
    expect(err.isRetryable).toBe(false);
  });

  it('maps a network failure to NETWORK_ERROR (retryable)', async () => {
    mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    const err = (await apiRequest('/x').catch((e) => e)) as ApiError;
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.isRetryable).toBe(true);
  });

  it('handles a non-JSON 5xx (e.g. proxy error when the API is down)', async () => {
    mockFetch(() => Promise.resolve(new Response('Bad Gateway', { status: 502 })));
    const err = (await apiRequest('/x').catch((e) => e)) as ApiError;
    expect(err).toMatchObject({ status: 502, code: 'INTERNAL_ERROR' });
    expect(err.isRetryable).toBe(true);
  });

  it('lets AbortError through so cancelled requests are not shown as errors', async () => {
    mockFetch(() => Promise.reject(new DOMException('aborted', 'AbortError')));
    const err = await apiRequest('/x').catch((e) => e);
    expect(err).toBeInstanceOf(DOMException);
    expect((err as DOMException).name).toBe('AbortError');
  });
});
