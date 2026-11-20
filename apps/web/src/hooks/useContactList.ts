import { useCallback } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { contactKeys, contactsApi, type ContactListParams } from '../api/contacts';

export function useContactList(params: ContactListParams) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: contactKeys.list(params),
    queryFn: ({ signal }) => contactsApi.list(params, signal),
    placeholderData: keepPreviousData,
  });

  // placeholder data is the previous result set, its cursor doesn't apply
  const nextCursor = query.isPlaceholderData ? null : query.data?.pageInfo.nextCursor;

  const prefetchNext = useCallback(() => {
    if (!nextCursor) return;
    const next = { ...params, cursor: nextCursor };
    void queryClient.prefetchQuery({
      queryKey: contactKeys.list(next),
      queryFn: ({ signal }) => contactsApi.list(next, signal),
    });
  }, [nextCursor, params, queryClient]);

  // don't spread query: it breaks tracked props and re-renders on every field
  return { query, prefetchNext };
}
