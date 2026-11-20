import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Contact } from '@contacts/shared';
import { ContactDetailPage } from './ContactDetailPage';
import { makeContact, mockApi, renderPage, type MockCall } from '../test/utils';

const ROUTE = { route: '/contacts/1', path: '/contacts/:id' };

function backend(contact: Contact, onPatch?: (c: MockCall) => { status?: number; body: unknown }) {
  return mockApi((call) => {
    if (call.path === '/tags') return { body: [] };
    if (call.path === '/contacts/1/activity') return { body: { data: [] } };
    if (call.method === 'PATCH' && onPatch) return onPatch(call);
    if (call.path === '/contacts/1') return { body: contact };
    return undefined;
  });
}

const company = () => screen.getByLabelText('Company') as HTMLInputElement;
const location = () => screen.getByTestId('location').textContent;
const dialog = () => screen.queryByRole('dialog', { name: 'Discard unsaved changes?' });

async function editCompany() {
  await screen.findByRole('heading', { name: 'Ravi Kumar' });
  await userEvent.clear(company());
  await userEvent.type(company(), 'Draft Co');
}

describe('Unsaved changes guard', () => {
  it('lets you leave freely when nothing was edited', async () => {
    backend(makeContact());
    renderPage(<ContactDetailPage />, ROUTE);
    await screen.findByRole('heading', { name: 'Ravi Kumar' });

    await userEvent.click(screen.getByRole('link', { name: 'Go elsewhere' }));
    expect(location()).toBe('/elsewhere');
    expect(dialog()).toBeNull();
  });

  it('asks before leaving with unsaved edits; "Keep editing" stays and keeps the draft', async () => {
    backend(makeContact());
    renderPage(<ContactDetailPage />, ROUTE);
    await editCompany();

    await userEvent.click(screen.getByRole('link', { name: 'Go elsewhere' }));
    expect(await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })).toBeVisible();
    expect(location()).toBe('/contacts/1');

    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(dialog()).toBeNull();
    expect(location()).toBe('/contacts/1');
    expect(company().value).toBe('Draft Co');
  });

  it('"Discard and leave" navigates away', async () => {
    backend(makeContact());
    renderPage(<ContactDetailPage />, ROUTE);
    await editCompany();

    await userEvent.click(screen.getByRole('link', { name: 'Go elsewhere' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Discard and leave' }));
    await waitFor(() => expect(location()).toBe('/elsewhere'));
  });

  it('the dialog manages focus: opens on the safe button, traps Tab, Escape cancels', async () => {
    backend(makeContact());
    renderPage(<ContactDetailPage />, ROUTE);
    await editCompany();

    await userEvent.click(screen.getByRole('link', { name: 'Go elsewhere' }));
    const keep = await screen.findByRole('button', { name: 'Keep editing' });
    const discard = screen.getByRole('button', { name: 'Discard and leave' });
    expect(keep).toHaveFocus();

    await userEvent.tab();
    expect(discard).toHaveFocus();
    await userEvent.tab(); // wraps around instead of leaving the dialog
    expect(keep).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(discard).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(dialog()).toBeNull();
    expect(location()).toBe('/contacts/1');
  });

  it('warns when closing or reloading the tab only while there are unsaved edits', async () => {
    backend(makeContact());
    renderPage(<ContactDetailPage />, ROUTE);
    await screen.findByRole('heading', { name: 'Ravi Kumar' });

    const clean = new Event('beforeunload', { cancelable: true });
    fireEvent(window, clean);
    expect(clean.defaultPrevented).toBe(false);

    await editCompany();
    const dirty = new Event('beforeunload', { cancelable: true });
    fireEvent(window, dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });

  it('does not block navigation after a successful save', async () => {
    const contact = makeContact();
    backend(contact, ({ body }) => ({ body: { ...contact, ...(body as object), version: 2 } }));
    renderPage(<ContactDetailPage />, ROUTE);
    await editCompany();

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Saved.');
    await userEvent.click(screen.getByRole('link', { name: 'Go elsewhere' }));
    expect(location()).toBe('/elsewhere');
  });
});

describe('Conflict panel accessibility', () => {
  it('moves focus to the conflict panel when a save is rejected as stale', async () => {
    const theirs = makeContact({ version: 2, company: 'Saved by B' });
    backend(makeContact(), () => ({
      status: 409,
      body: { error: { code: 'VERSION_CONFLICT', message: 'x', details: { current: theirs } } },
    }));
    renderPage(<ContactDetailPage />, ROUTE);
    await editCompany();

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    const panel = await screen.findByRole('alert', { name: 'Someone else changed this contact' });
    expect(panel).toHaveFocus();
  });
});

describe('Background refresh', () => {
  it('shows newer server data automatically when there are no local edits', async () => {
    let server = makeContact({ company: 'Old Co' });
    mockApi((call) => {
      if (call.path === '/tags') return { body: [] };
      if (call.path === '/contacts/1/activity') return { body: { data: [] } };
      if (call.path === '/contacts/1') return { body: server };
      return undefined;
    });
    renderPage(<ContactDetailPage />, ROUTE);
    await screen.findByRole('heading', { name: 'Ravi Kumar' });
    expect(company().value).toBe('Old Co');

    server = makeContact({ company: 'New Co', version: 2 });
    fireEvent.focus(window);
    window.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(company().value).toBe('New Co'));
    expect(screen.getByText('Version 2')).toBeInTheDocument();
  });
});
