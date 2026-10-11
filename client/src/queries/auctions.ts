import { queryOptions, useQuery } from '@tanstack/react-query'
import { auctionsApi } from '@/api/auctions'
import { sessionsApi } from '@/api/sessions'
import { qk } from './keys'

export const auctionsQuery = (slug: string) => queryOptions({
  queryKey: qk.auctions(slug),
  queryFn:  () => auctionsApi.listForTournament(slug),
})

export const auctionQuery = (id: number) => queryOptions({
  queryKey: qk.auction(id),
  queryFn:  () => auctionsApi.get(id),
})

export const captainsQuery = (auctionId: number) => queryOptions({
  queryKey: qk.captains(auctionId),
  queryFn:  () => auctionsApi.listCaptains(auctionId),
})

export const resultsQuery = (auctionId: number) => queryOptions({
  queryKey: qk.results(auctionId),
  queryFn:  () => auctionsApi.getResults(auctionId).then(r => r.teams),
})

export const publicResultsQuery = (auctionId: number) => queryOptions({
  queryKey: qk.publicResults(auctionId),
  queryFn:  () => auctionsApi.getPublicResults(auctionId),
})

export const availablePlayersQuery = (auctionId: number) => queryOptions({
  queryKey: qk.availablePlayers(auctionId),
  queryFn:  () => auctionsApi.getAvailablePlayers(auctionId),
})

/** All auction sessions ever created for a division (pending, live, paused, finished). */
export const sessionsQuery = (auctionId: number) => queryOptions({
  queryKey: qk.sessions(auctionId),
  queryFn:  () => sessionsApi.listForAuction(auctionId),
  staleTime: 5_000,
})

export const useAuctions         = (slug: string)  => useQuery(auctionsQuery(slug))
export const useCaptains         = (id: number)    => useQuery(captainsQuery(id))
export const useResults          = (id: number)    => useQuery(resultsQuery(id))
export const usePublicResults    = (id: number)    => useQuery({ ...publicResultsQuery(id), enabled: id > 0 })
export const useAvailablePlayers = (id: number, enabled = true) => useQuery({ ...availablePlayersQuery(id), enabled })
export const useSessions         = (auctionId: number | undefined) =>
  useQuery({ ...sessionsQuery(auctionId ?? 0), enabled: auctionId !== undefined })
/** The auction detail endpoint is not readable by captains; pass `enabled: false` for them. */
export const useAuction          = (id: number, enabled = true) => useQuery({ ...auctionQuery(id), enabled })
