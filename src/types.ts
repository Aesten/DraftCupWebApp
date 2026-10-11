// Row shapes and API payloads live in ../shared/types so the client uses the
// same definitions. This module adds the server-only pieces: JWT payloads and
// a couple of helpers.

export * from '../shared/types'
import type { Captain } from '../shared/types'

// ─── JWT Payload Types ────────────────────────────────────────────────────────

export interface AdminJwtPayload {
  role: 'admin'
}

export interface HostJwtPayload {
  role:         'host'
  tournamentId: number
}

export interface AuctioneerJwtPayload {
  role:      'auctioneer'
  projectId: number
}

export interface CaptainJwtPayload {
  role:      'captain'
  captainId: number
  auctionId: number
}

export type JwtPayload =
  | AdminJwtPayload
  | HostJwtPayload
  | AuctioneerJwtPayload
  | CaptainJwtPayload

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function resolveTeamName(captain: Pick<Captain, 'display_name' | 'team_name'>): string {
  return captain.team_name ?? `${captain.display_name}'s team`
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
