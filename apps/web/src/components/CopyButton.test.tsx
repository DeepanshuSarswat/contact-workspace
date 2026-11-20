import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CopyButton } from './CopyButton';

describe('CopyButton', () => {
  it('copies the value and confirms it in a live region', async () => {
    const user = userEvent.setup(); // installs a fake clipboard
    render(<CopyButton value="ravi@example.com" label="email" />);

    await user.click(screen.getByRole('button', { name: 'Copy email' }));
    expect(await navigator.clipboard.readText()).toBe('ravi@example.com');
    expect(screen.getByRole('status')).toHaveTextContent('Copied');
  });

  it('says so when the browser refuses (e.g. no clipboard permission)', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'));
    render(<CopyButton value="ravi@example.com" label="email" />);

    await user.click(screen.getByRole('button', { name: 'Copy email' }));
    expect(screen.getByRole('status')).toHaveTextContent('Couldn’t copy');
  });
});
