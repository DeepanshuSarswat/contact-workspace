import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { contactKeys, contactsApi } from '../api/contacts';

export function useContact(id: number) {
  return useQuery({
    queryKey: contactKeys.detail(id),
    queryFn: ({ signal }) => contactsApi.get(id, signal),
    // refetch on focus so we can warn about someone else's change before Save
    staleTime: 0,
  });
}

export const ACTIVITY_FIRST_PAGE = 5;
export const ACTIVITY_MORE_PAGE = 10;

// After invalidation, later pages are rebuilt from the fresh cursors, so no gaps or duplicates.
export function useContactActivity(id: number) {
  return useInfiniteQuery({
    queryKey: contactKeys.activity(id),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      contactsApi.activity(
        id,
        pageParam ? ACTIVITY_MORE_PAGE : ACTIVITY_FIRST_PAGE,
        pageParam,
        signal,
      ),
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 0,
  });
}
