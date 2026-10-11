import { useCallback } from 'react'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'

/**
 * `const invalidate = useInvalidate()` then `await invalidate(qk.a(), qk.b())`.
 * Marks the given key prefixes stale and waits for the active refetches, so a
 * handler's busy flag clears only once the screen shows the new data.
 */
export function useInvalidate() {
  const qc = useQueryClient()
  return useCallback(
    (...keys: QueryKey[]) => Promise.all(keys.map(queryKey => qc.invalidateQueries({ queryKey }))).then(() => undefined),
    [qc],
  )
}
