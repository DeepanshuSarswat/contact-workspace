import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ContactListResponse, Tag } from '@contacts/shared';
import { ContactsPage } from './ContactsPage';
import { makeContact, mockApi, renderPage, type MockCall } from '../test/utils';

const TAGS: Tag[] = [
  { id: 1, name: 'Lead' },
  { id: 2, name: 'VIP' },
];

const ravi = makeContact({ id: 1, tags: [{ id: 2, name: 'VIP' }] });
const priya = makeContact({ id: 2, firstName: 'Priya', lastName: 'Sharma', email: null });

function page(
  data = [ravi, priya],
  pageInfo: ContactListResponse['pageInfo'] = { nextCursor: null, prevCursor: null },
): ContactListResponse {
  return { data, pageInfo, total: { count: data.length, capped: false } };
}

const listCalls = (calls: MockCall[]) =>
  calls.filter((c) => c.method === 'GET' && c.path === '/contacts');
const location = () => screen.getByTestId('location').textContent;

describe('ContactsPage', () => {
  it('shows a loading state, then contacts with their tags and the total', async () => {
    mockApi(({ path }) =>
      path === '/tags' ? { body: TAGS } : path === '/contacts' ? { body: page() } : undefined,
    );
    renderPage(<ContactsPage />, { route: '/contacts' });

    expect(screen.getByText('Loading contacts…')).toBeInTheDocument();
    const table = await screen.findByRole('table');
    expect(within(table).getByRole('link', { name: 'Ravi Kumar' })).toHaveAttribute(
      'href',
      '/contacts/1',
    );
    expect(within(table).getByText('VIP')).toBeInTheDocument();
    expect(screen.getByText('Showing 2 of 2')).toBeInTheDocument();
  });

  it('searches after the user stops typing and keeps the search in the URL', async () => {
    const calls = mockApi(({ path, params }) =>
      path === '/tags'
        ? { body: TAGS }
        : { body: params.get('q') === 'ravi' ? page([ravi]) : page() },
    );
    renderPage(<ContactsPage />, { route: '/contacts' });
    await screen.findByRole('table');

    await userEvent.type(screen.getByRole('searchbox'), 'ravi');

    await waitFor(() => expect(location()).toBe('/contacts?q=ravi'));
    await waitFor(() => expect(screen.queryByText('Priya Sharma')).not.toBeInTheDocument());
    expect(listCalls(calls).map((c) => c.params.get('q'))).toEqual([null, 'ravi']);
  });

  it('filters by tag and sorts, sending the right query and resetting the cursor', async () => {
    const calls = mockApi(({ path }) => (path === '/tags' ? { body: TAGS } : { body: page() }));
    renderPage(<ContactsPage />, { route: '/contacts?cursor=abc' });
    await screen.findByRole('table');

    await userEvent.click(screen.getByRole('button', { name: 'VIP' }));
    await waitFor(() => expect(location()).toBe('/contacts?tag=VIP'));
    expect(screen.getByRole('button', { name: 'VIP' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.selectOptions(screen.getByLabelText('Sort contacts'), 'name:asc');
    await waitFor(() => expect(location()).toBe('/contacts?tag=VIP&sort=name&order=asc'));

    const last = listCalls(calls).at(-1)!;
    expect(last.params.getAll('tag')).toEqual(['VIP']);
    expect(last.params.get('sort')).toBe('name');
    expect(last.params.get('cursor')).toBeNull();
  });

  it('pages forward with the cursor from the server', async () => {
    const calls = mockApi(({ path, params }) => {
      if (path === '/tags') return { body: TAGS };
      return params.get('cursor') === 'next-1'
        ? { body: page([priya], { nextCursor: null, prevCursor: 'prev-2' }) }
        : { body: page([ravi], { nextCursor: 'next-1', prevCursor: null }) };
    });
    renderPage(<ContactsPage />, { route: '/contacts' });
    await screen.findByText('Ravi Kumar');
    expect(screen.getByRole('button', { name: '‹ Previous' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Next ›' }));

    await screen.findByText('Priya Sharma');
    expect(listCalls(calls).at(-1)!.params.get('cursor')).toBe('next-1');
    expect(screen.getByRole('button', { name: 'Next ›' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '‹ Previous' })).toBeEnabled();
  });

  describe('next-page prefetch (on intent only)', () => {
    const pagedBackend = () =>
      mockApi(({ path, params }) => {
        if (path === '/tags') return { body: TAGS };
        return params.get('cursor')
          ? { body: page([priya], { nextCursor: null, prevCursor: 'prev-2' }) }
          : {
              body: page([ravi], {
                nextCursor: `next-${params.get('q') ?? 'all'}`,
                prevCursor: null,
              }),
            };
      });
    const cursors = (calls: MockCall[]) => listCalls(calls).map((c) => c.params.get('cursor'));

    it('does not prefetch while loading or searching', async () => {
      const calls = pagedBackend();
      renderPage(<ContactsPage />, { route: '/contacts' });
      await screen.findByText('Ravi Kumar');

      await userEvent.type(screen.getByRole('searchbox'), 'sha');
      await waitFor(() => expect(location()).toBe('/contacts?q=sha'));
      await screen.findByText('Ravi Kumar');

      // no page 2 fetched until the user shows intent
      expect(cursors(calls).every((c) => c === null)).toBe(true);
    });

    it('prefetches page 2 when the pointer reaches Next, so the click needs no request', async () => {
      const calls = pagedBackend();
      renderPage(<ContactsPage />, { route: '/contacts' });
      await screen.findByText('Ravi Kumar');
      const next = screen.getByRole('button', { name: 'Next ›' });

      await userEvent.hover(next);
      await waitFor(() => expect(cursors(calls)).toEqual([null, 'next-all']));

      await userEvent.click(next);
      await screen.findByText('Priya Sharma');
      expect(listCalls(calls)).toHaveLength(2);
    });

    it('also prefetches when keyboard focus reaches Next', async () => {
      const calls = pagedBackend();
      renderPage(<ContactsPage />, { route: '/contacts' });
      await screen.findByText('Ravi Kumar');

      act(() => screen.getByRole('button', { name: 'Next ›' }).focus());
      await waitFor(() => expect(cursors(calls)).toEqual([null, 'next-all']));
    });

    it('hovering Next repeatedly fetches page 2 only once', async () => {
      const calls = pagedBackend();
      renderPage(<ContactsPage />, { route: '/contacts' });
      await screen.findByText('Ravi Kumar');
      const next = screen.getByRole('button', { name: 'Next ›' });

      await userEvent.hover(next);
      await waitFor(() => expect(cursors(calls)).toEqual([null, 'next-all']));
      await userEvent.unhover(next);
      await userEvent.hover(next);
      await userEvent.unhover(next);
      await userEvent.hover(next);
      expect(cursors(calls)).toEqual([null, 'next-all']);
    });
  });

  it('resets the company box when filters are cleared from outside it', async () => {
    mockApi(({ path }) => (path === '/tags' ? { body: TAGS } : { body: page() }));
    renderPage(<ContactsPage />, { route: '/contacts?company=acme' });
    const box = (await screen.findByLabelText('Filter by company')) as HTMLInputElement;
    expect(box.value).toBe('acme');

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(location()).toBe('/contacts'));
    expect((screen.getByLabelText('Filter by company') as HTMLInputElement).value).toBe('');
  });

  it('shows an empty state with a way to clear filters', async () => {
    mockApi(({ path }) => (path === '/tags' ? { body: TAGS } : { body: page([]) }));
    renderPage(<ContactsPage />, { route: '/contacts?q=nobody' });

    expect(await screen.findByText('No contacts match these filters.')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!);
    await waitFor(() => expect(location()).toBe('/contacts'));
  });

  it('shows a backend failure with a working retry', async () => {
    let fail = true;
    mockApi(({ path }) => {
      if (path === '/tags') return { body: TAGS };
      return fail
        ? { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'Server exploded' } } }
        : { body: page() };
    });
    renderPage(<ContactsPage />, { route: '/contacts' });

    expect(await screen.findByText('Server exploded')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('explains an invalid URL (e.g. a tampered cursor) and offers a reset', async () => {
    mockApi(({ path, params }) => {
      if (path === '/tags') return { body: TAGS };
      return params.get('cursor')
        ? { status: 400, body: { error: { code: 'BAD_REQUEST', message: 'Invalid cursor' } } }
        : { body: page() };
    });
    renderPage(<ContactsPage />, { route: '/contacts?cursor=garbage' });

    expect(await screen.findByText('Invalid cursor')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Go to first page' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('bulk-tags the selected contacts and reports the result', async () => {
    const calls = mockApi(({ path, method }) => {
      if (path === '/tags') return { body: TAGS };
      if (path === '/contacts/bulk-tags' && method === 'POST') {
        return {
          body: { tag: { id: 1, name: 'Lead' }, tagged: 1, alreadyTagged: 1, notFound: [] },
        };
      }
      return { body: page() };
    });
    renderPage(<ContactsPage />, { route: '/contacts' });
    await screen.findByRole('table');

    await userEvent.click(screen.getByLabelText('Select all contacts on this page'));
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Tag to add to selected contacts'), 'Lead');
    await userEvent.click(screen.getByRole('button', { name: 'Add tag' }));

    expect(
      await screen.findByText('Tagged 1 contact with “Lead”. 1 already had it.'),
    ).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/contacts/bulk-tags')!.body).toEqual({
      contactIds: [1, 2],
      tagName: 'Lead',
    });
    expect(screen.queryByText('2 selected')).not.toBeInTheDocument();
  });

  it('validates the bulk tag name before sending anything', async () => {
    const calls = mockApi(({ path }) => (path === '/tags' ? { body: TAGS } : { body: page() }));
    renderPage(<ContactsPage />, { route: '/contacts' });
    await screen.findByRole('table');

    await userEvent.click(screen.getByLabelText('Select Ravi Kumar'));
    await userEvent.type(screen.getByLabelText('Tag to add to selected contacts'), '<b>');
    await userEvent.click(screen.getByRole('button', { name: 'Add tag' }));

    expect(await screen.findByText(/may only contain letters/)).toBeInTheDocument();
    expect(calls.some((c) => c.path === '/contacts/bulk-tags')).toBe(false);
  });
});

describe('ContactsPage: many tags', () => {
  const many = (n: number): Tag[] =>
    Array.from({ length: n }, (_, i) => ({ id: 100 + i, name: `t${String(i).padStart(2, '0')}` }));

  it('a row shows 3 tags and a "+N" button that opens a popover with all of them', async () => {
    const busy = makeContact({ id: 3, firstName: 'Mckenna', lastName: 'Huels', tags: many(7) });
    const calls = mockApi(({ path }) =>
      path === '/tags' ? { body: TAGS } : { body: page([busy]) },
    );
    renderPage(<ContactsPage />, { route: '/contacts' });

    const row = (await screen.findByRole('link', { name: 'Mckenna Huels' })).closest('tr')!;
    const cell = row.querySelector('.col-tags') as HTMLElement;
    expect(within(cell).getByText('t00')).toBeInTheDocument();
    expect(within(cell).queryByText('t03')).toBeNull();

    const more = within(cell).getByRole('button', { name: 'Show all 7 tags (4 more)' });
    expect(more).toHaveTextContent('+4');
    expect(more).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(more);
    const popover = screen.getByRole('group', { name: 'All 7 tags' });
    expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(more).toHaveAttribute('aria-controls', popover.id);
    expect(
      within(popover)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(many(7).map((t) => t.name));
    expect(within(row).getByRole('checkbox')).not.toBeChecked();
    expect(location()).toBe('/contacts');
    expect(calls.filter((c) => c.path.startsWith('/contacts/'))).toHaveLength(0);

    await userEvent.click(more);
    expect(screen.queryByRole('group', { name: 'All 7 tags' })).toBeNull();
  });

  it('the tag popover closes on Escape (focus back on the chip) and on an outside click', async () => {
    const busy = makeContact({ id: 3, firstName: 'Mckenna', lastName: 'Huels', tags: many(5) });
    mockApi(({ path }) => (path === '/tags' ? { body: TAGS } : { body: page([busy]) }));
    renderPage(<ContactsPage />, { route: '/contacts' });
    const more = await screen.findByRole('button', { name: /Show all 5 tags/ });

    more.focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('group', { name: 'All 5 tags' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: 'All 5 tags' })).toBeNull();
    expect(more).toHaveFocus();

    await userEvent.click(more);
    await userEvent.click(screen.getByRole('heading', { name: 'Contacts' }));
    expect(screen.queryByRole('group', { name: 'All 5 tags' })).toBeNull();
  });

  it('the tag filter shows 12 tags + "+N more", and always shows selected tags', async () => {
    mockApi(({ path }) => (path === '/tags' ? { body: many(20) } : { body: page() }));
    renderPage(<ContactsPage />, { route: '/contacts?tag=t15' });
    const filter = await screen.findByRole('group', { name: /Filter by tags/ });
    await within(filter).findByRole('button', { name: 't00' });

    const tagButtons = () =>
      within(filter)
        .getAllByRole('button')
        .filter((b) => b.hasAttribute('aria-pressed'));
    // t00..t11 plus the selected t15
    expect(tagButtons()).toHaveLength(13);
    expect(within(filter).getByRole('button', { name: 't15' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await userEvent.click(within(filter).getByRole('button', { name: '+7 more' }));
    expect(tagButtons()).toHaveLength(20);
    await userEvent.click(within(filter).getByRole('button', { name: 'Show fewer' }));
    expect(tagButtons()).toHaveLength(13);
  });
});

describe('ContactsPage: accessibility and navigation', () => {
  it('sets the tab title and announces the result count to screen readers', async () => {
    mockApi(({ path }) => (path === '/tags' ? { body: TAGS } : { body: page() }));
    renderPage(<ContactsPage />, { route: '/contacts' });
    await screen.findByRole('table');
    expect(document.title).toBe('Contacts · Contacts Workspace');
    await waitFor(() =>
      expect(screen.getByText('2 contacts found.')).toHaveAttribute('role', 'status'),
    );
  });

  it('sorts by clicking column headers, with aria-sort on the sorted column', async () => {
    const calls = mockApi(({ path }) => (path === '/tags' ? { body: TAGS } : { body: page() }));
    renderPage(<ContactsPage />, { route: '/contacts' });
    await screen.findByRole('table');

    const header = (name: string) => screen.getByRole('columnheader', { name });
    expect(header('Created')).toHaveAttribute('aria-sort', 'descending');
    expect(header('Name')).not.toHaveAttribute('aria-sort');

    await userEvent.click(screen.getByRole('button', { name: 'Name' }));
    await waitFor(() => expect(location()).toBe('/contacts?sort=name&order=asc'));
    expect(header('Name')).toHaveAttribute('aria-sort', 'ascending');
    expect(header('Created')).not.toHaveAttribute('aria-sort');
    expect(screen.getByLabelText('Sort contacts')).toHaveValue('name:asc');

    await userEvent.click(screen.getByRole('button', { name: 'Name' }));
    await waitFor(() => expect(location()).toBe('/contacts?sort=name&order=desc'));
    expect(listCalls(calls).at(-1)!.params.get('order')).toBe('desc');
  });
});
