/**
 * React Query client configuration
 */

import { QueryClient } from '@tanstack/react-query';

/**
 * Default query client configuration
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't refetch on window focus for mobile
      refetchOnWindowFocus: false,
      // Retry failed requests once
      retry: 1,
      // Stale time of 5 minutes for most queries
      staleTime: 5 * 60 * 1000,
    },
    mutations: {
      // Don't retry mutations by default
      retry: false,
    },
  },
});
