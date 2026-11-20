import { useQuery } from '@tanstack/react-query';
import { tagKeys, tagsApi } from '../api/contacts';

export function useTags() {
  return useQuery({
    queryKey: tagKeys.all,
    queryFn: ({ signal }) => tagsApi.list(signal),
    staleTime: 5 * 60_000,
  });
}
