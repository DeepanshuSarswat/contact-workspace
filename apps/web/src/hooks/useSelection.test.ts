import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSelection } from './useSelection';

type Item = { id: number; name: string };
const label = (i: Item) => i.name;
const a = { id: 1, name: 'A' };
const b = { id: 2, name: 'B' };
const c = { id: 3, name: 'C' };

describe('useSelection', () => {
  it('toggles single items', () => {
    const { result } = renderHook(() => useSelection<Item>(label));
    act(() => result.current.toggle(a));
    act(() => result.current.toggle(b));
    expect(result.current.ids).toEqual([1, 2]);
    act(() => result.current.toggle(a));
    expect(result.current.ids).toEqual([2]);
  });

  it('selects and unselects a whole page, keeping selections from other pages', () => {
    const { result } = renderHook(() => useSelection<Item>(label));
    act(() => result.current.toggle(c));
    act(() => result.current.setMany([a, b], true));
    expect(result.current.ids).toEqual([3, 1, 2]);
    act(() => result.current.setMany([a, b], false));
    expect(result.current.ids).toEqual([3]);
    expect(result.current.selected.get(3)).toBe('C');
  });

  it('clears everything', () => {
    const { result } = renderHook(() => useSelection<Item>(label));
    act(() => result.current.setMany([a, b, c], true));
    act(() => result.current.clear());
    expect(result.current.ids).toEqual([]);
  });
});
