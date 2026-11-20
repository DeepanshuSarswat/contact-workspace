import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Banner, SUCCESS_HIDE_MS } from './Banner';

afterEach(() => vi.useRealTimers());

describe('Banner', () => {
  it('hides a success message by itself after a few seconds', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <Banner kind="success" onDismiss={onDismiss}>
        Saved.
      </Banner>,
    );

    act(() => vi.advanceTimersByTime(SUCCESS_HIDE_MS - 1));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('keeps warnings and errors until the user acts', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <>
        <Banner kind="warning" onDismiss={onDismiss}>
          Careful
        </Banner>
        <Banner kind="error" onDismiss={onDismiss}>
          Failed
        </Banner>
      </>,
    );
    act(() => vi.advanceTimersByTime(60_000));
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
  });

  it('can be closed with the × button', () => {
    const onDismiss = vi.fn();
    render(
      <Banner kind="success" onDismiss={onDismiss}>
        Saved.
      </Banner>,
    );
    act(() => screen.getByRole('button', { name: 'Dismiss message' }).click());
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
