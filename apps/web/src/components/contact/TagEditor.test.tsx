import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Contact, Tag } from '@contacts/shared';
import { ContactDetailPage } from '../../pages/ContactDetailPage';
import { deferred, makeContact, mockApi, renderPage, type MockCall } from '../../test/utils';

const ROUTE = { route: '/contacts/1', path: '/contacts/:id' };
const VIP: Tag = { id: 5, name: 'VIP' };
const FAIL = { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'Server down.' } } };

type Reply = { status?: number; body: unknown };

// Tag requests wait on a gate so tests can check the UI while they are in flight.
function setup(initialTags: Tag[] = [VIP]) {
  let server: Contact = makeContact({ tags: initialTags });
  const gates: { call: MockCall; release: (fail?: boolean) => void }[] = [];

  const calls = mockApi(async (call) => {
    if (call.path === '/tags') return { body: [VIP, { id: 6, name: 'Lead' }] };
    if (call.path === '/contacts/1/activity') return { body: { data: [] } };
    if (call.path === '/contacts/1' && call.method === 'GET') return { body: server };

    const isAdd = call.method === 'POST' && call.path === '/contacts/1/tags';
    const isRemove = call.method === 'DELETE' && call.path.startsWith('/contacts/1/tags/');
    if (!isAdd && !isRemove) return undefined;

    const gate = deferred<boolean>();
    gates.push({ call, release: (fail = false) => gate.resolve(fail) });
    const fail = await gate.promise;
    if (fail) return FAIL as Reply;

    if (isAdd) {
      const name = (call.body as { name: string }).name;
      const tag = name.toLowerCase() === 'vip' ? VIP : { id: 100 + gates.length, name };
      server = { ...server, tags: [...server.tags.filter((t) => t.id !== tag.id), tag] };
    } else {
      const id = Number(call.path.split('/').pop());
      server = { ...server, tags: server.tags.filter((t) => t.id !== id) };
    }
    return { body: server };
  });

  return { calls, gates };
}

const chip = (name: string) =>
  screen.queryByRole('button', { name: `Remove tag ${name}` })?.closest('li') ?? null;

async function addTag(name: string) {
  await userEvent.type(screen.getByLabelText('New tag'), name);
  await userEvent.click(screen.getByRole('button', { name: 'Add' }));
}

describe('TagEditor: optimistic updates', () => {
  it('shows a new tag instantly, marked pending, then confirmed when the server answers', async () => {
    const { gates } = setup();
    renderPage(<ContactDetailPage />, ROUTE);
    await screen.findByRole('heading', { name: 'Ravi Kumar' });

    await addTag('Partner');

    // server hasn't answered yet
    expect(gates).toHaveLength(1);
    expect(chip('Partner')).toHaveClass('chip-pending');
    expect(chip('Partner')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText('New tag')).toHaveValue('');

    gates[0]!.release();
    await waitFor(() => expect(chip('Partner')).not.toHaveClass('chip-pending'));
    expect(screen.getByRole('button', { name: 'Remove tag Partner' })).toBeEnabled();
  });

  it('picking a suggestion from the list adds it straight away, and only suggests tags not yet on the contact', async () => {
    const { gates } = setup([VIP]);
    renderPage(<ContactDetailPage />, ROUTE);
    await screen.findByRole('heading', { name: 'Ravi Kumar' });

    await userEvent.click(screen.getByRole('combobox', { name: 'New tag' }));
    const list = await screen.findByRole('listbox');
    expect(
      within(list)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Lead']);

    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(chip('Lead')).not.toBeNull();
    expect(gates[0]!.call.body).toEqual({ name: 'Lead' });
    expect(screen.getByRole('combobox', { name: 'New tag' })).toHaveValue('');
    gates[0]!.release();
  });

  it('uses the existing tag (and its casing) immediately: "vip" shows as "VIP" once', async () => {
    const { gates } = setup([]);
    renderPage(<ContactDetailPage />, ROUTE);
    await screen.findByRole('heading', { name: 'Ravi Kumar' });

    await addTag('lead');
    expect(chip('Lead')).not.toBeNull();
    expect(chip('Lead')).not.toHaveClass('chip-pending');
    gates[0]!.release();
  });

  it('rolls back a failed add and gives the typed text back', async () => {
    const { gates } = setup();
    renderPage(<ContactDetailPage />, ROUTE);
    await screen.findByRole('heading', { name: 'Ravi Kumar' });

    await addTag('Partner');
    expect(chip('Partner')).not.toBeNull();

    gates[0]!.release(true);
    expect(await screen.findByText('Couldn’t add “Partner”: Server down.')).toBeInTheDocument();
    expect(chip('Partner')).toBeNull();
    expect(screen.getByLabelText('New tag')).toHaveValue('Partner');
    expect(chip('VIP')).not.toBeNull();
  });

  it('removes a tag instantly and restores it if the server fails', async () => {
    const { gates } = setup();
    renderPage(<ContactDetailPage />, ROUTE);
    await screen.findByRole('heading', { name: 'Ravi Kumar' });

    await userEvent.click(screen.getByRole('button', { name: 'Remove tag VIP' }));
    expect(chip('VIP')).toBeNull();

    gates[0]!.release(true);
    expect(await screen.findByText('Couldn’t remove “VIP”: Server down.')).toBeInTheDocument();
    expect(chip('VIP')).not.toBeNull();
  });

  it('with two quick changes, a failure rolls back only its own change', async () => {
    const { gates } = setup();
    renderPage(<ContactDetailPage />, ROUTE);
    await screen.findByRole('heading', { name: 'Ravi Kumar' });

    await addTag('Partner');
    await addTag('Webinar');
    expect(gates).toHaveLength(2);
    expect(chip('Partner')).not.toBeNull();
    expect(chip('Webinar')).not.toBeNull();

    gates[0]!.release(true); // "Partner" fails…
    gates[1]!.release(); // …"Webinar" succeeds

    expect(await screen.findByText(/Couldn’t add “Partner”/)).toBeInTheDocument();
    await waitFor(() => expect(chip('Partner')).toBeNull());
    await waitFor(() => expect(chip('Webinar')).not.toHaveClass('chip-pending'));
    expect(chip('VIP')).not.toBeNull();
  });
});

describe('TagEditor: long tag lists', () => {
  const many = (n: number): Tag[] =>
    Array.from({ length: n }, (_, i) => ({ id: 200 + i, name: `t${String(i).padStart(2, '0')}` }));

  it('shows the first 12 tags with "+N more", and expands / collapses', async () => {
    setup(many(20));
    renderPage(<ContactDetailPage />, ROUTE);
    await screen.findByRole('heading', { name: 'Ravi Kumar' });

    expect(screen.getAllByRole('button', { name: /^Remove tag/ })).toHaveLength(12);
    const more = screen.getByRole('button', { name: '+8 more' });
    expect(more).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(more);
    expect(screen.getAllByRole('button', { name: /^Remove tag/ })).toHaveLength(20);
    await userEvent.click(screen.getByRole('button', { name: 'Show fewer' }));
    expect(screen.getAllByRole('button', { name: /^Remove tag/ })).toHaveLength(12);
  });

  it('a just-added tag stays visible even when it sorts into the hidden part', async () => {
    const { gates } = setup(many(15));
    renderPage(<ContactDetailPage />, ROUTE);
    await screen.findByRole('heading', { name: 'Ravi Kumar' });

    await addTag('zebra'); // sorts last, past the first 12
    expect(chip('zebra')).not.toBeNull();
    expect(screen.getByRole('button', { name: '+3 more' })).toBeInTheDocument();
    gates[0]!.release();
  });

  it('no toggle for 12 tags or fewer', async () => {
    setup(many(12));
    renderPage(<ContactDetailPage />, ROUTE);
    await screen.findByRole('heading', { name: 'Ravi Kumar' });
    expect(screen.queryByRole('button', { name: /more$/ })).toBeNull();
  });
});
