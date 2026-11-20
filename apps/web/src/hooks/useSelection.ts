import { useCallback, useMemo, useState } from 'react';

// Selection survives paging and filtering, so you can select across searches.
export function useSelection<T extends { id: number }>(labelOf: (item: T) => string) {
  const [selected, setSelected] = useState<ReadonlyMap<number, string>>(new Map());

  const toggle = useCallback(
    (item: T) =>
      setSelected((prev) => {
        const next = new Map(prev);
        if (next.has(item.id)) next.delete(item.id);
        else next.set(item.id, labelOf(item));
        return next;
      }),
    [labelOf],
  );

  const setMany = useCallback(
    (items: T[], select: boolean) =>
      setSelected((prev) => {
        const next = new Map(prev);
        for (const item of items) {
          if (select) next.set(item.id, labelOf(item));
          else next.delete(item.id);
        }
        return next;
      }),
    [labelOf],
  );

  const clear = useCallback(() => setSelected(new Map()), []);
  const ids = useMemo(() => [...selected.keys()], [selected]);

  return { selected, ids, toggle, setMany, clear };
}
