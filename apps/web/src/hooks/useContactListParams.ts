import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import {
  PAGE_SIZE_DEFAULT,
  SORT_FIELDS,
  SORT_ORDERS,
  type SortField,
  type SortOrder,
} from '@contacts/shared';
import type { ContactListParams } from '../api/contacts';

export const PAGE_SIZES = [25, 50, 100] as const;

const isSortField = (v: string | null): v is SortField =>
  (SORT_FIELDS as readonly string[]).includes(v ?? '');
const isSortOrder = (v: string | null): v is SortOrder =>
  (SORT_ORDERS as readonly string[]).includes(v ?? '');

// Filters live in the URL so refresh, back and shared links all work.
export function useContactListParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const params: ContactListParams = useMemo(() => {
    const sort = searchParams.get('sort');
    const order = searchParams.get('order');
    const limit = Number(searchParams.get('limit'));
    return {
      q: searchParams.get('q') ?? undefined,
      tag: searchParams.getAll('tag'),
      company: searchParams.get('company') ?? undefined,
      sort: isSortField(sort) ? sort : 'createdAt',
      order: isSortOrder(order) ? order : 'desc',
      limit: (PAGE_SIZES as readonly number[]).includes(limit) ? limit : PAGE_SIZE_DEFAULT,
      cursor: searchParams.get('cursor') ?? undefined,
    };
  }, [searchParams]);

  // a cursor only fits the filters it came from, so drop it unless paging
  const update = useCallback(
    (changes: Partial<ContactListParams>, opts: { keepCursor?: boolean } = {}) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(changes)) {
            next.delete(key);
            const values = Array.isArray(value) ? value : [value];
            for (const v of values) {
              if (v !== undefined && v !== null && v !== '') next.append(key, String(v));
            }
          }
          if (!opts.keepCursor && !('cursor' in changes)) next.delete('cursor');
          return next;
        },
        // only paging adds history entries
        { replace: !('cursor' in changes) },
      );
    },
    [setSearchParams],
  );

  const reset = useCallback(() => setSearchParams(new URLSearchParams()), [setSearchParams]);

  const hasFilters = Boolean(params.q || params.tag?.length || params.company);

  return { params, update, reset, hasFilters };
}
