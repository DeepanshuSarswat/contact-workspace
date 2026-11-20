import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) =>
          failureCount < 2 && (!(error instanceof ApiError) || error.isRetryable),
      },
      mutations: {
        // never retry writes automatically
        retry: false,
      },
    },
  });
}
