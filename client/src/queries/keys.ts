/**
 * Query key factory.
 *
 * Keys are hierarchical so one invalidation can cover a subtree:
 *   qk.tournament(slug)        → the tournament row and everything under it
 *   qk.auction(id)             → the auction row, its captains, results, sessions
 *   ['pickban']                → every pick-ban query
 */
export const qk = {
  // Public / global
  featured:         ()                     => ['featured'] as const,
  publicList:       ()                     => ['tournaments', 'public'] as const,
  tournaments:      ()                     => ['tournaments', 'all'] as const,
  maps:             ()                     => ['maps'] as const,
  factions:         ()                     => ['factions'] as const,
  statsUploaded:    ()                     => ['stats', 'uploaded'] as const,

  // Per tournament (by slug)
  tournament:       (slug: string)         => ['tournament', slug] as const,
  publicTournament: (slug: string)         => ['tournament', slug, 'public'] as const,
  publicStats:      (slug: string, auctionId: number) => ['tournament', slug, 'stats', auctionId] as const,
  players:          (slug: string)         => ['tournament', slug, 'players'] as const,
  matchups:         (slug: string)         => ['tournament', slug, 'matchups'] as const,
  auctions:         (slug: string)         => ['tournament', slug, 'auctions'] as const,
  brackets:         (slug: string)         => ['tournament', slug, 'brackets'] as const,

  // Per auction (division)
  auction:          (id: number)           => ['auction', id] as const,
  captains:         (id: number)           => ['auction', id, 'captains'] as const,
  results:          (id: number)           => ['auction', id, 'results'] as const,
  publicResults:    (id: number)           => ['auction', id, 'results', 'public'] as const,
  availablePlayers: (id: number)           => ['auction', id, 'available-players'] as const,
  sessions:         (auctionId: number)    => ['auction', auctionId, 'sessions'] as const,

  // Live auction session
  session:          (id: number)           => ['session', id] as const,
  pendingPlayers:   (id: number)           => ['session', id, 'pending'] as const,

  // Brackets / pick-ban
  bracket:          (id: number)           => ['bracket', id] as const,
  pickBanAll:       ()                     => ['pickban'] as const,
  pickBan:          (id: number)           => ['pickban', id] as const,
  pickBanByMatch:   (matchId: number)      => ['pickban', 'match', matchId] as const,
  myPickBan:        ()                     => ['pickban', 'mine'] as const,
}

export type QueryKey = ReturnType<typeof qk[keyof typeof qk]>
