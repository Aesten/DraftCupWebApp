// ─── Access control ───────────────────────────────────────────────────────────
// The single answer to "may this caller touch this resource".
// Roles are scoped as follows:
//   admin      → everything
//   host       → one tournament (the one whose host token they logged in with)
//   auctioneer → one tournament (auctioneer token)
//   captain    → one auction (division) inside a tournament
// Routes decide WHICH roles may call them (requireAuth); these helpers decide
// whether THIS caller may act on THIS row. Both checks are always needed.

import { queryOne } from '../db/database'
import type { JwtPayload, Auction, AuctionSession, Tournament } from '../types'

export type Auth = JwtPayload

/** Tournament the caller is confined to; null means unrestricted (admin). */
export function scopedTournamentId(auth: Auth): number | null {
  switch (auth.role) {
    case 'admin':      return null
    case 'host':       return auth.tournamentId
    case 'auctioneer': return auth.projectId
    case 'captain':
      return queryOne<{ tournament_id: number }>(
        'SELECT tournament_id FROM auctions WHERE id = ?', [auth.auctionId]
      )?.tournament_id ?? -1
  }
}

/** Read-level access to anything belonging to a tournament. */
export function canAccessTournament(auth: Auth, tournamentId: number): boolean {
  const scope = scopedTournamentId(auth)
  return scope === null || scope === tournamentId
}

/** Write-level access: admins and the tournament's own host. */
export function canManageTournament(auth: Auth, tournamentId: number): boolean {
  if (auth.role === 'admin') return true
  return auth.role === 'host' && auth.tournamentId === tournamentId
}

/** Captains are confined to their own auction; other roles to the auction's tournament. */
export function canAccessAuction(auth: Auth, auction: Pick<Auction, 'id' | 'tournament_id'>): boolean {
  if (auth.role === 'captain') return auth.auctionId === auction.id
  return canAccessTournament(auth, auction.tournament_id)
}

export interface SessionRef extends AuctionSession {
  tournament_id: number
}

/** A session joined with its tournament id, so access can be decided in one lookup. */
export function findSession(sessionId: number): SessionRef | null {
  return queryOne<SessionRef>(
    `SELECT s.*, a.tournament_id FROM auction_sessions s
     JOIN auctions a ON a.id = s.auction_id WHERE s.id = ?`,
    [sessionId]
  )
}

export function canAccessSession(auth: Auth, session: SessionRef): boolean {
  return canAccessAuction(auth, { id: session.auction_id, tournament_id: session.tournament_id })
}

export function findTournamentBySlug(slug: string): Tournament | null {
  return queryOne<Tournament>('SELECT * FROM tournaments WHERE slug = ?', [slug])
}

export function tournamentOfAuction(auctionId: number): Tournament | null {
  return queryOne<Tournament>(
    'SELECT t.* FROM tournaments t JOIN auctions a ON a.tournament_id = t.id WHERE a.id = ?',
    [auctionId]
  )
}
