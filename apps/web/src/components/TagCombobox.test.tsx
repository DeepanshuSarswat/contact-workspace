import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Tag } from '@contacts/shared';
import { TagCombobox } from './TagCombobox';

const TAGS: Tag[] = [
  { id: 1, name: 'Churned' },
  { id: 2, name: 'Customer' },
  { id: 3, name: 'Lead' },
  { id: 4, name: 'VIP' },
  { id: 5, name: 'Newsletter' },
];

function setup(onSelect = vi.fn()) {
  function Harness() {
    const [value, setValue] = useState('');
    return (
      <TagCombobox
        options={TAGS}
        value={value}
        onChange={setValue}
        onSelect={(name) => {
          onSelect(name);
          setValue('');
        }}
        ariaLabel="New tag"
      />
    );
  }
  render(<Harness />);
  return { input: screen.getByRole('combobox', { name: 'New tag' }), onSelect };
}

const options = () => within(screen.getByRole('listbox')).getAllByRole('option');
const labels = () => options().map((o) => o.textContent);

describe('TagCombobox', () => {
  it('opens the suggestion list on focus and exposes it to assistive tech', async () => {
    const { input } = setup();
    expect(input).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(input);
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', screen.getByRole('listbox').id);
    expect(labels()).toEqual(['Churned', 'Customer', 'Lead', 'Newsletter', 'VIP']);
  });

  it('filters case-insensitively, puts "starts with" first and highlights the match', async () => {
    const { input } = setup();
    await userEvent.type(input, 'le');
    expect(labels()).toEqual(['Lead', 'Newsletter', 'Create “le”']);
    expect(options()[0]!.querySelector('mark')).toHaveTextContent('Le');
  });

  it('offers "Create" only when no tag matches exactly (any case)', async () => {
    const { input } = setup();
    await userEvent.type(input, 'vip');
    expect(labels()).toEqual(['VIP']);

    await userEvent.type(input, '2');
    expect(labels()).toEqual(['Create “vip2”']);
  });

  it('keyboard: arrows move (wrapping), Enter picks, aria-activedescendant follows', async () => {
    const { input, onSelect } = setup();
    await userEvent.type(input, 'c');

    await userEvent.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', options()[0]!.id);
    expect(options()[0]).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}'); // wraps back to the top
    expect(input).toHaveAttribute('aria-activedescendant', options()[0]!.id);

    await userEvent.keyboard('{ArrowUp}'); // wraps to the last option
    expect(options().at(-1)).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{ArrowUp}{Enter}');
    expect(onSelect).toHaveBeenCalledWith('Customer');
  });

  it('picks the "Create" option with the typed (trimmed) name', async () => {
    const { input, onSelect } = setup();
    await userEvent.type(input, '  Q4 Webinar ');
    await userEvent.click(screen.getByRole('option', { name: /Create/ }));
    expect(onSelect).toHaveBeenCalledWith('Q4 Webinar');
  });

  it('a mouse click picks a suggestion and closes the list', async () => {
    const { input, onSelect } = setup();
    await userEvent.click(input);
    await userEvent.click(screen.getByRole('option', { name: 'Lead' }));
    expect(onSelect).toHaveBeenCalledWith('Lead');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveFocus();
  });

  it('Escape closes the list without picking anything', async () => {
    const { input, onSelect } = setup();
    await userEvent.type(input, 'l');
    await userEvent.keyboard('{ArrowDown}{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('Enter with nothing highlighted is left to the surrounding form', async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const onSelect = vi.fn();
    render(
      <form onSubmit={onSubmit}>
        <TagCombobox
          options={TAGS}
          value="Lead"
          onChange={() => {}}
          onSelect={onSelect}
          ariaLabel="New tag"
        />
      </form>,
    );
    await userEvent.type(screen.getByRole('combobox'), '{Enter}');
    expect(onSubmit).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('TagCombobox: allowCreate={false} (bulk bar)', () => {
  it('suggests only existing tags and shows no list for a new name', async () => {
    function Harness() {
      const [value, setValue] = useState('');
      return (
        <TagCombobox
          options={TAGS}
          allowCreate={false}
          value={value}
          onChange={setValue}
          onSelect={setValue}
          ariaLabel="Bulk tag"
        />
      );
    }
    render(<Harness />);
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'le');
    expect(labels()).toEqual(['Lead', 'Newsletter']);

    await userEvent.clear(input);
    await userEvent.type(input, 'gggg');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('TagCombobox: tags that exist but are not suggested', () => {
  it('does not offer "Create" for an existing tag that is hidden from the suggestions', async () => {
    const VIP = { id: 4, name: 'VIP' };
    const VIP2 = { id: 9, name: 'vip2' };
    function Harness() {
      const [value, setValue] = useState('');
      // VIP exists but is already on the contact, so not suggested
      return (
        <TagCombobox
          options={[VIP2]}
          existing={[VIP, VIP2]}
          value={value}
          onChange={setValue}
          onSelect={() => {}}
          ariaLabel="New tag"
        />
      );
    }
    render(<Harness />);
    await userEvent.type(screen.getByRole('combobox'), 'vip');
    expect(labels()).toEqual(['vip2']);
  });
});
