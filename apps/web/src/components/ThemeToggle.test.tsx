import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from './ThemeToggle';

function mockSystemTheme(initiallyDark: boolean) {
  let dark = initiallyDark;
  const listeners = new Set<() => void>();
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    get matches() {
      return dark;
    },
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  }));
  return {
    set(next: boolean) {
      dark = next;
      listeners.forEach((cb) => cb());
    },
  };
}

const theme = () => document.documentElement.dataset.theme;
const button = (name: string) => screen.getByRole('button', { name: `${name} theme` });

beforeEach(() => localStorage.clear());
afterEach(() => {
  delete document.documentElement.dataset.theme;
});

describe('ThemeToggle', () => {
  it('defaults to System and follows the OS setting, including live changes', () => {
    const os = mockSystemTheme(true);
    render(<ThemeToggle />);

    expect(button('System')).toHaveAttribute('aria-pressed', 'true');
    expect(theme()).toBe('dark');

    act(() => os.set(false));
    expect(theme()).toBe('light');
  });

  it('forces Light or Dark regardless of the OS, and remembers the choice', async () => {
    const os = mockSystemTheme(true);
    render(<ThemeToggle />);

    await userEvent.click(button('Light'));
    expect(theme()).toBe('light');
    expect(button('Light')).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('theme')).toBe('light');

    act(() => os.set(true)); // OS changes are ignored while a theme is forced
    expect(theme()).toBe('light');

    await userEvent.click(button('Dark'));
    expect(theme()).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('restores the saved choice on the next visit', () => {
    mockSystemTheme(false);
    localStorage.setItem('theme', 'dark');
    render(<ThemeToggle />);
    expect(button('Dark')).toHaveAttribute('aria-pressed', 'true');
    expect(theme()).toBe('dark');
  });

  it('going back to System forgets the forced choice', async () => {
    mockSystemTheme(false);
    localStorage.setItem('theme', 'dark');
    render(<ThemeToggle />);

    await userEvent.click(button('System'));
    expect(theme()).toBe('light');
    expect(localStorage.getItem('theme')).toBeNull();
  });
});
