import { queryOptions, useQuery } from '@tanstack/react-query'
import { tournamentsApi, type PublicStats } from '@/api/tournaments'
import { qk } from './keys'

export const featuredQuery = () => queryOptions({
  queryKey: qk.featured(),
  queryFn:  tournamentsApi.getFeatured,
  staleTime: 5 * 60_000,
})

export const publicTournamentsQuery = () => queryOptions({
  queryKey: qk.publicList(),
  queryFn:  tournamentsApi.listPublic,
})

export const tournamentsQuery = () => queryOptions({
  queryKey: qk.tournaments(),
  queryFn:  tournamentsApi.list,
})

export const tournamentQuery = (slug: string) => queryOptions({
  queryKey: qk.tournament(slug),
  queryFn:  () => tournamentsApi.get(slug),
})

export const publicTournamentQuery = (slug: string) => queryOptions({
  queryKey: qk.publicTournament(slug),
  queryFn:  () => tournamentsApi.getPublic(slug),
})

/** Uploaded stats for a division; `null` when none have been uploaded. */
export const publicStatsQuery = (slug: string, auctionId: number) => queryOptions({
  queryKey: qk.publicStats(slug, auctionId),
  queryFn:  (): Promise<PublicStats | null> => tournamentsApi.getPublicStats(slug, auctionId),
  staleTime: 5 * 60_000,
})

/** Auction ids that have a stats file; admin/host only. */
export const statsUploadedQuery = () => queryOptions({
  queryKey: qk.statsUploaded(),
  queryFn:  () => tournamentsApi.listStats().catch(() => [] as number[]),
})

export const useFeatured          = ()             => useQuery(featuredQuery())
export const usePublicTournaments = ()             => useQuery(publicTournamentsQuery())
export const useTournaments       = ()             => useQuery(tournamentsQuery())
export const useTournament        = (slug: string) => useQuery(tournamentQuery(slug))
export const usePublicTournament  = (slug: string) => useQuery(publicTournamentQuery(slug))
export const usePublicStats       = (slug: string, auctionId: number | undefined, enabled = true) =>
  useQuery({ ...publicStatsQuery(slug, auctionId ?? 0), enabled: enabled && auctionId !== undefined })
