import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Activity, Contact } from '@contacts/shared';
import { ContactDetailPage } from './ContactDetailPage';
import { makeContact, mockApi, renderPage, type MockCall } from '../test/utils';

const ROUTE = { route: '/contacts/1', path: '/contacts/:id' };

const ACTIVITY: Activity[] = [
  {
    id: 2,
    contactId: 1,
    type: 'TAG_ADDED',
    payload: { tagId: 5, tagName: 'VIP', bulk: true },
    createdAt: '2025-01-03T00:00:00.000Z',
  },
  {
    id: 1,
    contactId: 1,
    type: 'CONTACT_UPDATED',
    payload: { changes: { company: { from: 'Globex', to: 'Acme' } } },
    createdAt: '2025-01-02T00:00:00.000Z',
  },
];

function backend(
  contact: Contact,
  overrides: (c: MockCall) => ReturnType<Parameters<typeof mockApi>[0]> = () => undefined,
) {
  return mockApi((call) => {
    const o = overrides(call);
    if (o) return o;
    if (call.path === '/tags') return { body: [{ id: 5, name: 'VIP' }] };
    if (call.path === '/contacts/1/activity') return { body: { data: ACTIVITY } };
    if (call.path === '/contacts/1' && call.method === 'GET') return { body: contact };
    return undefined;
  });
}

const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const patches = (calls: MockCall[]) => calls.filter((c) => c.method === 'PATCH');

describe('ContactDetailPage', () => {
  it('shows the contact, its tags and readable activity', async () => {
    backend(makeContact({ tags: [{ id: 5, name: 'VIP' }] }));
    renderPage(<ContactDetailPage />, ROUTE);

    expect(await screen.findByRole('heading', { name: 'Ravi Kumar' })).toBeInTheDocument();
    expect(input('Email').value).toBe('ravi@acme.io');
    expect(screen.getByRole('button', { name: 'Remove tag VIP' })).toBeInTheDocument();
    expect(await screen.findByText('Added tag “VIP” (bulk)')).toBeInTheDocument();
    expect(screen.getByText('Company: “Globex” → “Acme”')).toBeInTheDocument();
  });

  it('shows "not found" for a missing contact', async () => {
    mockApi(() => undefined);
    renderPage(<ContactDetailPage />, ROUTE);
    expect(await screen.findByText('Contact not found')).toBeInTheDocument();
  });

  it('saves only the changed fields together with the version it was loaded at', async () => {
    const contact = makeContact({ version: 3 });
    const calls = backend(contact, ({ method, body }) =>
      method === 'PATCH' ? { body: { ...contact, ...(body as object), version: 4 } } : undefined,
    );
    renderPage(<ContactDetailPage />, ROUTE);
    await screen.findByRole('heading', { name: 'Ravi Kumar' });

    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();

    await userEvent.clear(input('Company'));
    await userEvent.type(input('Company'), 'HighLevel');
    await userEvent.click(save);

    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(patches(calls)[0]!.body).toEqual({ company: 'HighLevel', version: 3 });
    expect(screen.getByText('Version 4')).toBeInTheDocument();
  });

  it('validates with the shared rules before sending', async () => {
    const calls = backend(makeContact());
    renderPage(<ContactDetailPage />, ROUTE);
    await screen.findByRole('heading', { name: 'Ravi Kumar' });

    await userEvent.clear(input('Email'));
    await userEvent.type(input('Email'), 'not-an-email');
    await userEvent.clear(input('First name'));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('First name is required')).toBeInTheDocument();
    expect(input('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(patches(calls)).toHaveLength(0);
  });

  it('shows a duplicate email error from the server on the email field', async () => {
    backend(makeContact(), ({ method }) =>
      method === 'PATCH'
        ? {
            status: 409,
            body: {
              error: {
                code: 'EMAIL_TAKEN',
                message: 'Another contact already uses x@y.io',
                details: { fields: { email: ['This email is already used by another contact'] } },
              },
            },
          }
        : undefined,
    );
    renderPage(<ContactDetailPage />, ROUTE);
    await screen.findByRole('heading', { name: 'Ravi Kumar' });

    await userEvent.clear(input('Email'));
    await userEvent.type(input('Email'), 'x@y.io');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText('This email is already used by another contact'),
    ).toBeInTheDocument();
    expect(input('Email').value).toBe('x@y.io');
  });

  it('handles a stale save: shows both versions, and "keep mine" re-saves on the new version', async () => {
    const original = makeContact({ version: 1, company: 'Acme' });
    const theirs = makeContact({
      version: 2,
      company: 'Saved by B',
      updatedAt: '2025-01-05T00:00:00.000Z',
    });
    let attempt = 0;
    const calls = backend(original, ({ method, body }) => {
      if (method !== 'PATCH') return undefined;
      attempt++;
      return attempt === 1
        ? {
            status: 409,
            body: {
              error: {
                code: 'VERSION_CONFLICT',
                message: 'Changed by someone else',
                details: { current: theirs },
              },
            },
          }
        : { body: { ...theirs, ...(body as object), version: 3 } };
    });
    renderPage(<ContactDetailPage />, ROUTE);
    await screen.findByRole('heading', { name: 'Ravi Kumar' });

    await userEvent.clear(input('Company'));
    await userEvent.type(input('Company'), 'Saved by A');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    const panel = await screen.findByRole('alert', { name: 'Someone else changed this contact' });
    const row = within(panel).getByRole('row', { name: /Company/ });
    expect(row).toHaveTextContent('Saved by A');
    expect(row).toHaveTextContent('Saved by B');
    expect(input('Company').value).toBe('Saved by A');

    await userEvent.click(within(panel).getByRole('button', { name: /Keep my changes/ }));
    expect(
      screen.getByText(/Saving will replace their value for that field only/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(patches(calls).map((c) => c.body)).toEqual([
      { company: 'Saved by A', version: 1 },
      { company: 'Saved by A', version: 2 },
    ]);
  });

  it('"keep mine" never reverts fields only the other person changed', async () => {
    // B changed the phone, A the company; keeping A's change must not undo B's
    const original = makeContact({ version: 1, company: 'Acme', phone: '+91 98765 43210' });
    const theirs = makeContact({ version: 2, company: 'Acme', phone: '+91 99999 00000' });
    let attempt = 0;
    const calls = backend(original, ({ method, body }) => {
      if (method !== 'PATCH') return undefined;
      attempt++;
      return attempt === 1
        ? {
            status: 409,
            body: {
              error: { code: 'VERSION_CONFLICT', message: 'x', details: { current: theirs } },
            },
          }
        : { body: { ...theirs, ...(body as object), version: 3 } };
    });
    renderPage(<ContactDetailPage />, ROUTE);
    await screen.findByRole('heading', { name: 'Ravi Kumar' });

    await userEvent.clear(input('Company'));
    await userEvent.type(input('Company'), 'HighLevel');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    const panel = await screen.findByRole('alert', { name: 'Someone else changed this contact' });
    expect(within(panel).queryByRole('row', { name: /Phone/ })).not.toBeInTheDocument();
    expect(panel).toHaveTextContent('They also changed (kept either way): Phone → +91 99999 00000');

    await userEvent.click(within(panel).getByRole('button', { name: /Keep my changes/ }));
    expect(input('Phone').value).toBe('+91 99999 00000');
    expect(input('Company').value).toBe('HighLevel');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(patches(calls).at(-1)!.body).toEqual({ company: 'HighLevel', version: 2 });
  });

  it('on conflict, "use saved version" discards local edits', async () => {
    const theirs = makeContact({ version: 2, company: 'Saved by B' });
    backend(makeContact(), ({ method }) =>
      method === 'PATCH'
        ? {
            status: 409,
            body: {
              error: { code: 'VERSION_CONFLICT', message: 'x', details: { current: theirs } },
            },
          }
        : undefined,
    );
    renderPage(<ContactDetailPage />, ROUTE);
    await screen.findByRole('heading', { name: 'Ravi Kumar' });

    await userEvent.type(input('Company'), ' Ltd');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await userEvent.click(await screen.findByRole('button', { name: /use saved version/ }));

    expect(input('Company').value).toBe('Saved by B');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('keeps the form and shows a message when the server fails', async () => {
    backend(makeContact(), ({ method }) =>
      method === 'PATCH'
        ? { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'Database down.' } } }
        : undefined,
    );
    renderPage(<ContactDetailPage />, ROUTE);
    await screen.findByRole('heading', { name: 'Ravi Kumar' });

    await userEvent.type(input('Company'), ' Ltd');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText(/Couldn’t save: Database down\./)).toBeInTheDocument();
    expect(input('Company').value).toBe('Acme Ltd');
  });

  it('adds and removes tags', async () => {
    let contact = makeContact({ tags: [{ id: 5, name: 'VIP' }] });
    const calls = backend(contact, ({ method, path, body }) => {
      if (method === 'GET' && path === '/contacts/1') return { body: contact };
      if (method === 'POST' && path === '/contacts/1/tags') {
        contact = {
          ...contact,
          tags: [...contact.tags, { id: 6, name: (body as { name: string }).name }],
        };
        return { body: contact };
      }
      if (method === 'DELETE' && path === '/contacts/1/tags/5') {
        contact = { ...contact, tags: contact.tags.filter((t) => t.id !== 5) };
        return { body: contact };
      }
      return undefined;
    });
    renderPage(<ContactDetailPage />, ROUTE);
    await screen.findByRole('heading', { name: 'Ravi Kumar' });

    await userEvent.type(screen.getByLabelText('New tag'), 'Partner');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('button', { name: 'Remove tag Partner' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove tag VIP' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Remove tag VIP' })).not.toBeInTheDocument(),
    );
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ name: 'Partner' });
  });
});

describe('ContactDetailPage: long activity history', () => {
  const entry = (n: number): Activity => ({
    id: n,
    contactId: 1,
    type: 'TAG_ADDED',
    payload: { tagId: n, tagName: `tag${n}` },
    createdAt: '2025-02-01T00:00:00.000Z',
  });

  // 12 entries, newest first, with cursor paging
  function pagedBackend() {
    const history = { entries: Array.from({ length: 12 }, (_, i) => entry(12 - i)) };
    const calls = mockApi((call) => {
      if (call.path === '/tags') return { body: [] };
      if (call.path === '/contacts/1') return { body: makeContact() };
      if (call.method === 'POST' && call.path === '/contacts/1/tags') {
        const n = history.entries.length + 1;
        history.entries.unshift(entry(n));
        return { body: makeContact({ tags: [{ id: n, name: `tag${n}` }] }) };
      }
      if (call.path !== '/contacts/1/activity') return undefined;
      const limit = Number(call.params.get('limit'));
      const cursor = call.params.get('cursor');
      const after = cursor ? Number(cursor) : null;
      const start = after === null ? 0 : history.entries.findIndex((a) => a.id === after) + 1;
      const data = history.entries.slice(start, start + limit);
      const more = start + limit < history.entries.length;
      return { body: { data, nextCursor: more ? String(data.at(-1)!.id) : null } };
    });
    return { calls, history };
  }

  const feed = () => screen.getByRole('region', { name: 'Recent activity' });
  const names = () =>
    within(feed())
      .getAllByRole('listitem')
      .map((li) => li.textContent?.match(/tag\d+/)?.[0]);

  it('shows the newest 5, loads older pages from the server, and collapses again', async () => {
    const { calls } = pagedBackend();
    renderPage(<ContactDetailPage />, ROUTE);
    await waitFor(() => expect(names()).toEqual(['tag12', 'tag11', 'tag10', 'tag9', 'tag8']));
    expect(within(feed()).queryByRole('button', { name: 'Show less' })).toBeNull();

    await userEvent.click(within(feed()).getByRole('button', { name: 'Show older activity' }));
    await waitFor(() => expect(names()).toHaveLength(12));
    const activityCalls = calls.filter((c) => c.path === '/contacts/1/activity');
    expect(activityCalls.at(-1)!.params.get('cursor')).toBe('8');
    expect(within(feed()).queryByRole('button', { name: 'Show older activity' })).toBeNull();

    await userEvent.click(within(feed()).getByRole('button', { name: 'Show less' }));
    expect(names()).toHaveLength(5);
  });

  it('a new change appears at the top of the feed straight away', async () => {
    pagedBackend();
    renderPage(<ContactDetailPage />, ROUTE);
    await waitFor(() => expect(names()[0]).toBe('tag12'));

    await userEvent.type(screen.getByRole('combobox', { name: 'New tag' }), 'tag13');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(names()).toEqual(['tag13', 'tag12', 'tag11', 'tag10', 'tag9']));
  });

  it('shows no buttons when everything fits on the first page', async () => {
    backend(makeContact());
    renderPage(<ContactDetailPage />, ROUTE);
    await within(await screen.findByRole('region', { name: 'Recent activity' })).findByText(
      /Added tag “VIP”/,
    );
    expect(within(feed()).queryByRole('button')).toBeNull();
  });
});

describe('ContactDetailPage: header', () => {
  it('titles the tab with the contact name and links email/phone (tel: digits only)', async () => {
    backend(makeContact());
    renderPage(<ContactDetailPage />, ROUTE);
    await screen.findByRole('heading', { name: 'Ravi Kumar' });

    expect(document.title).toBe('Ravi Kumar · Contacts Workspace');
    expect(screen.getByRole('link', { name: 'ravi@acme.io' })).toHaveAttribute(
      'href',
      'mailto:ravi@acme.io',
    );
    expect(screen.getByRole('link', { name: '+91 98765 43210' })).toHaveAttribute(
      'href',
      'tel:+919876543210',
    );
    expect(screen.getByRole('button', { name: 'Copy email' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy phone number' })).toBeInTheDocument();
  });

  it('shows no email/phone links when they are empty', async () => {
    backend(makeContact({ email: null, phone: null }));
    renderPage(<ContactDetailPage />, ROUTE);
    await screen.findByRole('heading', { name: 'Ravi Kumar' });
    expect(screen.queryByRole('button', { name: /^Copy/ })).toBeNull();
  });
});
