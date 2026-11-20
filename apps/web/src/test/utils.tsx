import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, Link, Outlet, RouterProvider, useLocation } from 'react-router';
import { vi } from 'vitest';
import type { Contact } from '@contacts/shared';
import { createQueryClient } from '../lib/queryClient';

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search}</div>;
}

// Data router like the app, so useBlocker works.
export function renderPage(
  element: ReactElement,
  { route = '/', path = '*' }: { route?: string; path?: string } = {},
) {
  // app defaults, minus retries
  const queryClient = createQueryClient();
  const defaults = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({
    queries: { ...defaults.queries, retry: false },
    mutations: { ...defaults.mutations, retry: false },
  });
  const router = createMemoryRouter(
    [
      {
        element: (
          <>
            <Outlet />
            <LocationProbe />
            <Link to="/elsewhere">Go elsewhere</Link>
          </>
        ),
        children: [
          { path, element },
          { path: '*', element: <div>Elsewhere</div> },
        ],
      },
    ],
    { initialEntries: [route] },
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

export interface MockCall {
  method: string;
  path: string;
  params: URLSearchParams;
  body: unknown;
}

type MockResponse = { status?: number; body: unknown } | undefined;
type Handler = (call: MockCall) => MockResponse | Promise<MockResponse>;

// Fake fetch. Return undefined for a 404; every call is recorded.
export function mockApi(handler: Handler) {
  const calls: MockCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input, 'http://localhost');
      const call: MockCall = {
        method: init?.method ?? 'GET',
        path: url.pathname.replace(/^\/api/, ''),
        params: url.searchParams,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      };
      calls.push(call);
      const res = (await handler(call)) ?? {
        status: 404,
        body: { error: { code: 'NOT_FOUND', message: 'Not found' } },
      };
      return new Response(JSON.stringify(res.body), {
        status: res.status ?? 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  return calls;
}

export function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 1,
    firstName: 'Ravi',
    lastName: 'Kumar',
    email: 'ravi@acme.io',
    phone: '+91 98765 43210',
    company: 'Acme',
    tags: [],
    version: 1,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
