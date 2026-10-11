import { useCallback } from 'react'
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'
import { sessionsApi } from '@/api/sessions'
import { bracketsApi } from '@/api/brackets'
import { useWs } from '@/hooks/useWs'
import { qk } from './keys'

/**
 * Live, WebSocket-driven queries.
 *
 * The server broadcasts a bare "something changed" message after every
 * mutation; the client answers by invalidating the query, which refetches
 * the full state. Reconnects resync the same way. In-flight fetches are
 * cancelled by the newer invalidation, so the newest response always wins.
 */

export const sessionQuery = (id: number) => queryOptions({
  queryKey: qk.session(id),
  queryFn:  () => sessionsApi.get(id),
  staleTime: 5_000,
})

export const pendingPlayersQuery = (sessionId: number) => queryOptions({
  queryKey: qk.pendingPlayers(sessionId),
  queryFn:  () => sessionsApi.getPendingPlayers(sessionId),
  staleTime: 0,
})

export const pickBanQuery = (id: number) => queryOptions({
  queryKey: qk.pickBan(id),
  queryFn:  () => bracketsApi.getPickBan(id),
  staleTime: 5_000,
})

/** Full auction session state, kept fresh over the auction WebSocket room. */
export function useSessionDetail(id: number) {
  const qc = useQueryClient()
  const query = useQuery(sessionQuery(id))
  const refresh = useCallback(
    () => qc.invalidateQueries({ queryKey: qk.session(id) }).then(() => undefined),
    [qc, id],
  )
  useWs({
    sessionId: id,
    token:     null,
    onMessage: refresh,
    onOpen:    refresh,
    enabled:   query.data?.session.status !== 'finished',
  })
  return { ...query, refresh }
}

/** Pick-ban session state, kept fresh over the pick-ban WebSocket room. */
export function usePickBanDetail(id: number) {
  const qc = useQueryClient()
  const query = useQuery(pickBanQuery(id))
  const refresh = useCallback(
    () => qc.invalidateQueries({ queryKey: qk.pickBan(id) }).then(() => undefined),
    [qc, id],
  )
  useWs({
    sessionId: id,
    token:     null,
    path:      'pickban',
    onMessage: refresh,
    onOpen:    refresh,
    enabled:   query.data?.session.status !== 'complete',
  })
  return { ...query, refresh }
}

export const usePendingPlayers = (sessionId: number) => useQuery(pendingPlayersQuery(sessionId))
