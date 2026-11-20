import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { OfflineBanner } from './OfflineBanner';

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

afterEach(() => setOnline(true));

describe('OfflineBanner', () => {
  it('appears while offline and disappears when the connection returns', () => {
    render(<OfflineBanner />);
    expect(screen.queryByRole('status')).toBeNull();

    act(() => setOnline(false));
    expect(screen.getByRole('status')).toHaveTextContent('You’re offline');

    act(() => setOnline(true));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
