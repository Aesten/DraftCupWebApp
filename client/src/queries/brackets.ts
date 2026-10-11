import { queryOptions, useQuery } from '@tanstack/react-query'
import { bracketsApi, type PickBanSession } from '@/api/brackets'
import { ApiError } from '@/api/client'
import { qk } from './keys'

export const bracketsQuery = (slug: string) => queryOptions({
  queryKey: qk.brackets(slug),
  queryFn:  () => bracketsApi.listForTournament(slug),
})

export const bracketQuery = (id: number) => queryOptions({
  queryKey: qk.bracket(id),
  queryFn:  () => bracketsApi.get(id),
})

export const matchupsQuery = (slug: string) => queryOptions({
  queryKey: qk.matchups(slug),
  queryFn:  () => bracketsApi.listMatchups(slug),
})

/** The pick-ban session attached to a match, or `null` when none was started. */
export const pickBanByMatchQuery = (matchId: number) => queryOptions({
  queryKey: qk.pickBanByMatch(matchId),
  queryFn:  (): Promise<PickBanSession | null> =>
    bracketsApi.getPickBanByMatch(matchId)
      .then(d => d.session)
      .catch(e => { if (e instanceof ApiError && e.status === 404) return null; throw e }),
  staleTime: 5_000,
})

export const myPickBanQuery = () => queryOptions({
  queryKey: qk.myPickBan(),
  queryFn:  bracketsApi.getMyPickBan,
  staleTime: 5_000,
})

export const useBrackets  = (slug: string) => useQuery(bracketsQuery(slug))
export const useMatchups  = (slug: string) => useQuery(matchupsQuery(slug))
export const useMyPickBan = ()             => useQuery(myPickBanQuery())
export const useBracket   = (id: number | undefined) =>
  useQuery({ ...bracketQuery(id ?? 0), enabled: id !== undefined })
export const usePickBanByMatch = (matchId: number | undefined) =>
  useQuery({ ...pickBanByMatchQuery(matchId ?? 0), enabled: matchId !== undefined })
