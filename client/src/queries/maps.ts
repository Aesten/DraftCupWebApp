import { queryOptions, useQuery } from '@tanstack/react-query'
import { mapsApi, factionsApi } from '@/api/maps'
import { qk } from './keys'

export const mapsQuery = () => queryOptions({
  queryKey: qk.maps(),
  queryFn:  mapsApi.list,
})

/** Factions never change at runtime. */
export const factionsQuery = () => queryOptions({
  queryKey: qk.factions(),
  queryFn:  factionsApi.list,
  staleTime: Infinity,
})

export const useMaps     = () => useQuery(mapsQuery())
export const useFactions = () => useQuery(factionsQuery())
