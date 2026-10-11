import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/client'

/**
 * One cache for the whole client.
 *
 * Every screen reads server data through hooks in `src/queries/`, keyed by the
 * factory in `queries/keys.ts`. Mutations call the API then invalidate the keys
 * they touched; the cache refetches in the background and every mounted
 * component that reads those keys updates. Nothing is copied into component
 * state and nothing is threaded through callbacks.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is shared between several people editing the same tournament, so
      // it goes stale quickly: refetch on focus/mount after 30s, but show the
      // cached copy immediately.
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // A 4xx is the server's final answer; only retry network/5xx failures.
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
})
