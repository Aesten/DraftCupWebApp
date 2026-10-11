import { queryOptions, useQuery } from '@tanstack/react-query'
import { playersApi } from '@/api/players'
import { qk } from './keys'

export const playersQuery = (slug: string) => queryOptions({
  queryKey: qk.players(slug),
  queryFn:  () => playersApi.listForTournament(slug),
})

export const usePlayers = (slug: string) => useQuery(playersQuery(slug))
