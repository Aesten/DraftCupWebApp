// ─── Shared types ─────────────────────────────────────────────────────────────
// Row shapes and API payloads used by BOTH the Bun server and the React client.
// The server imports them via `../shared/types`, the client via `@shared/types`.
// Keep this file free of runtime imports so it can be consumed from either side.

// ─── Roles ────────────────────────────────────────────────────────────────────

export type Role = 'admin' | 'host' | 'auctioneer' | 'captain'

// ─── Player Classes ───────────────────────────────────────────────────────────

export type PlayerClass = 'inf' | 'cav' | 'arc'

export const PLAYER_CLASSES: PlayerClass[] = ['inf', 'cav', 'arc']

export const PLAYER_CLASS_LABELS: Record<PlayerClass, string> = {
  inf: 'Infantry',
  cav: 'Cavalry',
  arc: 'Archery',
}

// ─── Status Types ─────────────────────────────────────────────────────────────

export type AuctionStatus    = 'setup' | 'ready' | 'finished'
export type SessionStatus    = 'pending' | 'live' | 'paused' | 'finished'
export type QueueStatus      = 'pending' | 'active' | 'sold'
export type MatchStatus      = 'pending' | 'played'
export type TournamentStatus = 'active' | 'archived'
export type PickBanStatus    = 'waiting' | 'banning' | 'picking' | 'complete'

// ─── DB Row Types ─────────────────────────────────────────────────────────────

export interface Tournament {
  id:                number
  name:              string
  slug:              string
  description:       string | null
  host_token:        string | null
  auctioneer_token:  string | null
  map_pool:          string           // JSON: number[] — tournament-specific rolling pool
  finals_map_pool:   string           // JSON: number[]
  players_per_team:  number
  status:            TournamentStatus
  is_featured:       number           // 0/1
  created_at:        string
}

export interface Player {
  id:            number
  tournament_id: number
  name:          string
  classes:       string   // comma-separated: inf,arc,cav
  is_available:  number   // 0/1
  created_at:    string
}

export interface Auction {
  id:                   number
  tournament_id:        number
  name:                 string
  min_increment:        number
  bid_cooldown_seconds: number
  is_public:            number   // 0/1
  status:               AuctionStatus
  created_at:           string
}

export interface Captain {
  id:           number
  auction_id:   number
  display_name: string
  team_name:    string | null
  token:        string | null
  budget:       number
  class:        PlayerClass | null
}

export interface AuctionSession {
  id:            number
  auction_id:    number
  status:        SessionStatus
  sold_count:    number
  skipped_count: number
  half_budget:   number   // 0/1
  created_at:    string
  started_at:    string | null
  finished_at:   string | null
}

export interface SessionQueueEntry {
  id:             number
  session_id:     number
  player_id:      number | null
  player_name:    string
  queue_position: number
  status:         QueueStatus
}

export interface SessionPurchase {
  id:            number
  session_id:    number
  captain_id:    number
  player_id:     number | null
  player_name:   string
  price:         number
  purchased_at:  string
}

export interface SessionBid {
  id:             number
  session_id:     number
  queue_entry_id: number
  captain_id:     number
  captain_name:   string
  amount:         number
  is_override:    number   // 1 = entered by the auctioneer on a captain's behalf
  placed_at:      string   // ISO 8601 with milliseconds (legacy rows: second resolution)
}

export interface SessionChatMessage {
  id:          number
  session_id:  number
  author_role: string
  author_name: string
  content:     string
  sent_at:     string
}

export interface Faction {
  id:   number
  name: string
}

export interface GameMap {
  id:         number
  name:       string
  game_id:    string | null
  tags:       string | null
  image_path: string | null
  is_active:  number   // 0/1
}

export interface Matchup {
  id:            number
  tournament_id: number
  round:         number
  label:         string | null
  map_id:        number | null
  faction_a_id:  number | null
  faction_b_id:  number | null
  is_public:     number   // 0/1
  created_at:    string
}

export interface Bracket {
  id:            number
  tournament_id: number
  auction_id:    number | null
  name:          string
  slots:         string   // JSON: {captain_id: number|null, group: 'A'|'B', seed: number}[]
  locked:        number   // 0/1
  is_public:     number   // 0/1
  created_at:    string
}

export interface Match {
  id:                number
  bracket_id:        number
  round:             number
  match_order:       number
  match_label:       string | null
  group_label:       string | null  // 'A' | 'B' | null for knockouts
  captain_a_id:      number | null
  captain_b_id:      number | null
  matchup_id:        number | null
  score_a:           number | null
  score_b:           number | null
  winner_captain_id: number | null
  status:            MatchStatus
  is_finals:         number   // 0/1
}

export interface PickBanSession {
  id:            number
  bracket_id:    number
  match_id:      number
  status:        PickBanStatus
  captain_a_id:  number
  captain_b_id:  number
  map_pool:      string   // JSON: number[]
  ban_sequence:  string   // JSON: ('a'|'b')[]
  ban_turn:      number
  bans:          string   // JSON: {side:'a'|'b', map_id:number}[]
  a_joined:      number   // 0/1
  b_joined:      number   // 0/1
  chosen_map_id: number | null
  a_pick:        number | null
  b_pick:        number | null
  revealed:      number   // 0/1
  created_at:    string
  completed_at:  string | null
}

// ─── Live auction API payloads ────────────────────────────────────────────────

export type QueueEntryWithClasses = SessionQueueEntry & { player_classes: string }
/** Captain as shown during a live session: login token stripped, spend totals added. */
export type CaptainWithSpend      = Omit<Captain, 'token'> & { spent: number; remaining: number }
export type PurchaseWithClasses   = SessionPurchase & { player_classes: string }

/** Response of GET /api/sessions/:id — the full state of a live auction. */
export interface SessionDetail {
  session:      AuctionSession
  activePlayer: QueueEntryWithClasses | null
  upcoming:     QueueEntryWithClasses[]
  purchases:    PurchaseWithClasses[]
  captains:     CaptainWithSpend[]
  progress: {
    total: number; sold: number; cycled: number; done: number
    playersPerTeam: number; poolRemaining: number
  }
  auctionName:   string
  minIncrement:  number
  bidCooldown:   number
  /** Time until the current top bid may be sold; relative so clock skew is irrelevant. */
  cooldownRemainingMs: number
  currentBid:    SessionBid | null
  bidHistory:    SessionBid[]
  chatMessages:  SessionChatMessage[]
}
