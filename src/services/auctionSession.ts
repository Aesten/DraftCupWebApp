// ─── Auction session service ──────────────────────────────────────────────────
// The live-auction state machine. Every transition of a session, its queue,
// bids and purchases is a function here; routes only authenticate, parse the
// request and call one of these. Nothing in this file knows about HTTP.
//
//   session:  pending → live ⇄ paused → finished
//   queue:    pending → active → sold   (skip: active → pending, at the back)
//
// Every mutating function runs its reads and writes inside ONE synchronous
// SQLite transaction. Bun executes JavaScript on a single thread and bun:sqlite
// is synchronous, so two calls can never interleave inside a transaction: the
// second always observes the first one committed. That is the whole
// concurrency model, and it is what makes the auction server-authoritative.
//
// This module is the reference for any future draft format: a snake draft is
// the same session/queue/purchase skeleton with a different `pick` rule
// instead of `placeBid` + `sell`.

import { queryAll, queryOne, execute, transaction, getDb } from '../db/database'
import { shuffle } from '../lib/shuffle'
import {
  parseAmount, remainingBudget, validateCaptainBid, validateOverrideBid,
  cooldownRemainingMs, nowIso, toUnits,
} from './bidRules'
import type {
  Auction, AuctionSession, Captain, Player, SessionQueueEntry,
  SessionPurchase, SessionBid, SessionChatMessage, Role,
  QueueEntryWithClasses, CaptainWithSpend, PurchaseWithClasses, SessionDetail,
} from '../types'

// ─── Outcomes ─────────────────────────────────────────────────────────────────

export type Outcome<T> =
  | { ok: true;  value: T }
  | { ok: false; error: string; status: 400 | 403 | 404 | 409 }

const ok   = <T>(value: T): Outcome<T> => ({ ok: true, value })
const fail = (error: string, status: 400 | 403 | 404 | 409 = 409): Outcome<never> => ({ ok: false, error, status })

// Row shapes returned to clients are defined once in shared/types.ts.
export type { QueueEntryWithClasses, CaptainWithSpend, PurchaseWithClasses, SessionDetail }

// ─── Internal queries ─────────────────────────────────────────────────────────

// Which bid is the standing one for a player:
//  1. highest amount wins;
//  2. at an equal amount an auctioneer override wins — that is the point of the
//     override: a captain must top the standing bid, the auctioneer only has to
//     match it (to hand the player to someone at the same price);
//  3. otherwise the earlier bid (lower id) wins, so concurrent identical
//     captain bids resolve to exactly one.
// To force a price *below* the standing bid the auctioneer uses the manual sale
// (advance with captain_id + price), which has no amount floor.
// Never order by placed_at: legacy rows have second resolution and tie.
// An auctioneer override sets the price outright — it can be *lower* than the
// previous top bid, and it must win regardless (that is the whole point of the
// override: the auctioneer has final say). So "the top bid" is not simply the
// highest amount ever bid — it is the highest amount bid *since the last
// override* (the override itself counts as the floor for that window). Within
// that window, ties still favor the earliest bid (id ASC), which is the
// original fix for concurrent captains racing to the same increment.
const TOP_BID_SQL = `
  WITH reset AS (
    SELECT COALESCE(MAX(id), 0) AS id FROM session_bids
    WHERE session_id = ? AND queue_entry_id = ? AND is_override = 1
  )
  SELECT * FROM session_bids
  WHERE session_id = ? AND queue_entry_id = ? AND id >= (SELECT id FROM reset)
  ORDER BY amount DESC, id ASC LIMIT 1`

function getSession(id: number): AuctionSession | null {
  return queryOne<AuctionSession>('SELECT * FROM auction_sessions WHERE id = ?', [id])
}

function getAuction(id: number): Auction | null {
  return queryOne<Auction>('SELECT * FROM auctions WHERE id = ?', [id])
}

function getTopBid(sessionId: number, queueEntryId: number): SessionBid | null {
  return queryOne<SessionBid>(TOP_BID_SQL, [sessionId, queueEntryId, sessionId, queueEntryId])
}

function getActiveEntry(sessionId: number): SessionQueueEntry | null {
  return queryOne<SessionQueueEntry>(
    "SELECT * FROM session_queue WHERE session_id = ? AND status = 'active'", [sessionId]
  )
}

function getSpent(sessionId: number, captainId: number): number {
  return queryOne<{ spent: number }>(
    'SELECT COALESCE(SUM(price), 0) as spent FROM session_purchases WHERE session_id = ? AND captain_id = ?',
    [sessionId, captainId]
  )?.spent ?? 0
}

function getCaptain(auctionId: number, captainId: number): Captain | null {
  return queryOne<Captain>('SELECT * FROM captains WHERE id = ? AND auction_id = ?', [captainId, auctionId])
}

function playersPerTeam(auctionId: number): number {
  return queryOne<{ players_per_team: number }>(
    `SELECT t.players_per_team FROM tournaments t
     JOIN auctions a ON a.tournament_id = t.id WHERE a.id = ?`,
    [auctionId]
  )?.players_per_team ?? 6
}

function getUpcoming(sessionId: number, limit = 3): QueueEntryWithClasses[] {
  return queryAll<QueueEntryWithClasses>(
    `SELECT sq.*, COALESCE(p.classes, '') as player_classes
     FROM session_queue sq
     LEFT JOIN players p ON p.id = sq.player_id
     WHERE sq.session_id = ? AND sq.status = 'pending'
     ORDER BY sq.queue_position ASC LIMIT ?`,
    [sessionId, limit]
  )
}

/** Moves the active player (if any) back to the FRONT of the queue with his bids wiped. */
function parkActivePlayer(sessionId: number): void {
  const current = getActiveEntry(sessionId)
  if (!current) return
  execute('DELETE FROM session_bids WHERE queue_entry_id = ?', [current.id])
  const minPos = queryOne<{ min: number | null }>(
    'SELECT MIN(queue_position) as min FROM session_queue WHERE session_id = ?', [sessionId]
  )
  execute(
    "UPDATE session_queue SET status = 'pending', queue_position = ? WHERE id = ?",
    [(minPos?.min ?? 0) - 1, current.id]
  )
}

/** Activates the first pending player, if there is one. */
function activateNext(sessionId: number): SessionQueueEntry | null {
  const next = queryOne<SessionQueueEntry>(
    `SELECT * FROM session_queue WHERE session_id = ? AND status = 'pending'
     ORDER BY queue_position ASC LIMIT 1`,
    [sessionId]
  )
  if (next) execute("UPDATE session_queue SET status = 'active' WHERE id = ?", [next.id])
  return next
}

function recordPurchase(sessionId: number, entry: SessionQueueEntry, captainId: number, price: number): void {
  execute("UPDATE session_queue SET status = 'sold' WHERE id = ?", [entry.id])
  execute(
    `INSERT INTO session_purchases (session_id, captain_id, player_id, player_name, price)
     VALUES (?, ?, ?, ?, ?)`,
    [sessionId, captainId, entry.player_id, entry.player_name, price]
  )
  if (entry.player_id) execute('UPDATE players SET is_available = 0 WHERE id = ?', [entry.player_id])
  execute('UPDATE auction_sessions SET sold_count = sold_count + 1 WHERE id = ?', [sessionId])
}

/** The buyer must be able to afford the price right now. */
function checkAffordable(session: AuctionSession, captainId: number, price: number): Outcome<Captain> {
  const captain = getCaptain(session.auction_id, captainId)
  if (!captain) return fail('Captain not found in this auction', 404)
  const remaining = remainingBudget(captain.budget, getSpent(session.id, captainId), session.half_budget === 1)
  if (toUnits(price) > toUnits(remaining)) {
    return fail(`Price of ${price.toFixed(1)} exceeds ${captain.display_name}'s remaining budget of ${remaining.toFixed(1)}`)
  }
  return ok(captain)
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export function listForAuction(auctionId: number): AuctionSession[] {
  return queryAll<AuctionSession>(
    'SELECT * FROM auction_sessions WHERE auction_id = ? ORDER BY created_at DESC', [auctionId]
  )
}

export function detail(sessionId: number): Outcome<SessionDetail> {
  const session = getSession(sessionId)
  if (!session) return fail('Session not found', 404)
  const auction = getAuction(session.auction_id)

  const activePlayer = queryOne<QueueEntryWithClasses>(
    `SELECT sq.*, COALESCE(p.classes, '') as player_classes
     FROM session_queue sq
     LEFT JOIN players p ON p.id = sq.player_id
     WHERE sq.session_id = ? AND sq.status = 'active'`,
    [sessionId]
  )

  // Never ship login tokens to the live room: everyone in it sees this payload.
  const captains = queryAll<CaptainWithSpend>(
    `SELECT c.id, c.auction_id, c.display_name, c.team_name, c.budget, c.class,
       COALESCE(SUM(sp.price), 0) as spent,
       c.budget - COALESCE(SUM(sp.price), 0) as remaining
     FROM captains c
     LEFT JOIN session_purchases sp ON sp.captain_id = c.id AND sp.session_id = ?
     WHERE c.auction_id = ?
     GROUP BY c.id`,
    [sessionId, session.auction_id]
  )

  const purchases = queryAll<PurchaseWithClasses>(
    `SELECT sp.*, COALESCE(p.classes, '') as player_classes
     FROM session_purchases sp
     LEFT JOIN players p ON p.id = sp.player_id
     WHERE sp.session_id = ? ORDER BY sp.purchased_at ASC, sp.id ASC`,
    [sessionId]
  )

  const total = queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM session_queue WHERE session_id = ?', [sessionId]
  )?.count ?? 0
  const poolRemaining = queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM session_queue WHERE session_id = ? AND status IN ('pending', 'active')",
    [sessionId]
  )?.count ?? 0

  const topBid = activePlayer ? getTopBid(sessionId, activePlayer.id) : null
  const bidHistory = activePlayer
    ? queryAll<SessionBid>(
        'SELECT * FROM session_bids WHERE session_id = ? AND queue_entry_id = ? ORDER BY id ASC',
        [sessionId, activePlayer.id]
      )
    : []
  const cooldown = auction?.bid_cooldown_seconds ?? 3

  const chatMessages = queryAll<SessionChatMessage>(
    `SELECT * FROM (SELECT * FROM session_chat WHERE session_id = ? ORDER BY id DESC LIMIT 100) ORDER BY id ASC`,
    [sessionId]
  )

  return ok({
    session,
    activePlayer: activePlayer ?? null,
    upcoming:     getUpcoming(sessionId),
    purchases,
    captains,
    progress: {
      total,
      sold:           session.sold_count,
      cycled:         session.skipped_count,
      done:           session.sold_count + session.skipped_count,
      playersPerTeam: playersPerTeam(session.auction_id),
      poolRemaining,
    },
    auctionName:  auction?.name ?? '',
    minIncrement: auction?.min_increment ?? 0.1,
    bidCooldown:  cooldown,
    // Relative, so clients count down without caring about clock skew.
    // An override has no cooldown — the auctioneer can sell it at once.
    cooldownRemainingMs: topBid && !topBid.is_override ? cooldownRemainingMs(topBid.placed_at, cooldown) : 0,
    currentBid:   topBid,
    bidHistory,
    chatMessages,
  })
}

export function pendingPlayers(sessionId: number): QueueEntryWithClasses[] {
  return queryAll<QueueEntryWithClasses>(
    `SELECT sq.*, COALESCE(p.classes, '') as player_classes
     FROM session_queue sq
     LEFT JOIN players p ON p.id = sq.player_id
     WHERE sq.session_id = ? AND sq.status = 'pending'
     ORDER BY sq.player_name ASC`,
    [sessionId]
  )
}

export function purchases(sessionId: number) {
  return queryAll(
    `SELECT sp.*, c.display_name as captain_name, c.team_name
     FROM session_purchases sp
     JOIN captains c ON c.id = sp.captain_id
     WHERE sp.session_id = ?
     ORDER BY sp.purchased_at ASC, sp.id ASC`,
    [sessionId]
  )
}

// ─── Session lifecycle ────────────────────────────────────────────────────────

export function create(auction: Auction): Outcome<{ session: AuctionSession; upcoming: QueueEntryWithClasses[] }> {
  if (auction.status === 'setup') return fail('Auction must be marked ready before starting a session')

  return transaction(() => {
    const active = queryOne<{ id: number }>(
      `SELECT s.id FROM auction_sessions s
       JOIN auctions a ON a.id = s.auction_id
       WHERE a.tournament_id = ? AND s.status IN ('pending', 'live', 'paused') LIMIT 1`,
      [auction.tournament_id]
    )
    if (active) return fail('Another auction session is already active for this tournament')

    const available = queryAll<Player>(
      'SELECT * FROM players WHERE tournament_id = ? AND is_available = 1', [auction.tournament_id]
    )
    if (available.length === 0) return fail('No available players in the pool')

    execute('INSERT INTO auction_sessions (auction_id) VALUES (?)', [auction.id])
    const session = queryOne<AuctionSession>('SELECT * FROM auction_sessions WHERE id = last_insert_rowid()')!
    const insert = getDb().prepare(
      'INSERT INTO session_queue (session_id, player_id, player_name, queue_position) VALUES (?, ?, ?, ?)'
    )
    shuffle(available).forEach((p, i) => insert.run(session.id, p.id, p.name, i))
    return ok({ session, upcoming: getUpcoming(session.id) })
  })
}

/** Rebuilds the pending queue from the current player pool (only before going live). */
export function syncPool(sessionId: number): Outcome<{ count: number }> {
  return transaction(() => {
    const session = getSession(sessionId)
    if (!session) return fail('Session not found', 404)
    if (session.status !== 'pending') return fail('Can only sync pool on a pending session')
    const auction = getAuction(session.auction_id)
    if (!auction) return fail('Auction not found', 404)

    const available = shuffle(queryAll<Player>(
      'SELECT * FROM players WHERE tournament_id = ? AND is_available = 1', [auction.tournament_id]
    ))
    execute("DELETE FROM session_queue WHERE session_id = ? AND status = 'pending'", [sessionId])
    const insert = getDb().prepare(
      'INSERT INTO session_queue (session_id, player_id, player_name, queue_position) VALUES (?, ?, ?, ?)'
    )
    available.forEach((p, i) => insert.run(sessionId, p.id, p.name, i))
    return ok({ count: available.length })
  })
}

export function goLive(sessionId: number): Outcome<{ status: 'live' }> {
  return transaction(() => {
    const session = getSession(sessionId)
    if (!session) return fail('Session not found', 404)
    if (!['pending', 'paused'].includes(session.status)) return fail(`Cannot go live from status: ${session.status}`)

    const conflicting = queryOne<{ id: number }>(
      `SELECT s.id FROM auction_sessions s
       JOIN auctions a ON a.id = s.auction_id
       WHERE a.tournament_id = (SELECT tournament_id FROM auctions WHERE id = ?)
         AND s.status = 'live' AND s.id != ? LIMIT 1`,
      [session.auction_id, sessionId]
    )
    if (conflicting) return fail('Another auction session is already live for this tournament')

    execute(
      "UPDATE auction_sessions SET status = 'live', started_at = COALESCE(started_at, ?) WHERE id = ?",
      [nowIso(), sessionId]
    )
    return ok({ status: 'live' as const })
  })
}

export function pause(sessionId: number): Outcome<{ status: 'paused' }> {
  return transaction(() => {
    const session = getSession(sessionId)
    if (!session) return fail('Session not found', 404)
    if (session.status !== 'live') return fail('Session is not live')
    execute("UPDATE auction_sessions SET status = 'paused' WHERE id = ?", [sessionId])
    return ok({ status: 'paused' as const })
  })
}

export function toggleHalfBudget(sessionId: number): Outcome<{ half_budget: 0 | 1 }> {
  return transaction(() => {
    const session = getSession(sessionId)
    if (!session) return fail('Session not found', 404)
    const next = session.half_budget ? 0 : 1
    execute('UPDATE auction_sessions SET half_budget = ? WHERE id = ?', [next, sessionId])
    return ok({ half_budget: next as 0 | 1 })
  })
}

/** Finishing requires every team to have a full roster. */
export function finish(sessionId: number): Outcome<{ ok: true }> {
  return transaction(() => {
    const session = getSession(sessionId)
    if (!session) return fail('Session not found', 404)
    if (session.status === 'finished') return fail('Session already finished')

    const perTeam  = playersPerTeam(session.auction_id)
    const captains = queryAll<{ id: number }>('SELECT id FROM captains WHERE auction_id = ?', [session.auction_id])
    const counts   = new Map(queryAll<{ captain_id: number; cnt: number }>(
      'SELECT captain_id, COUNT(*) as cnt FROM session_purchases WHERE session_id = ? GROUP BY captain_id',
      [sessionId]
    ).map(r => [r.captain_id, r.cnt]))
    const incomplete = captains.filter(c => (counts.get(c.id) ?? 0) < perTeam)
    if (incomplete.length > 0) {
      return fail(`${incomplete.length} team(s) don't have a full roster (${perTeam} players each)`)
    }

    execute("UPDATE auction_sessions SET status = 'finished', finished_at = ? WHERE id = ?", [nowIso(), sessionId])
    execute("UPDATE auctions SET status = 'finished' WHERE id = ?", [session.auction_id])
    return ok({ ok: true as const })
  })
}

// ─── Queue control ────────────────────────────────────────────────────────────

export function startFirstPlayer(sessionId: number): Outcome<{ activePlayer: SessionQueueEntry; upcoming: QueueEntryWithClasses[] }> {
  return transaction(() => {
    const session = getSession(sessionId)
    if (!session) return fail('Session not found', 404)
    if (session.status !== 'live') return fail('Session is not live')
    if (getActiveEntry(sessionId)) return fail('A player is already active')
    const first = activateNext(sessionId)
    if (!first) return fail('No players in queue')
    return ok({ activePlayer: { ...first, status: 'active' as const }, upcoming: getUpcoming(sessionId) })
  })
}

/** Auctioneer brings a specific pending player up; the current one is parked at the front. */
export function setActive(sessionId: number, queueEntryId: number): Outcome<{ ok: true }> {
  return transaction(() => {
    const session = getSession(sessionId)
    if (!session) return fail('Session not found', 404)
    if (session.status !== 'live') return fail('Session is not live')
    const entry = queryOne<SessionQueueEntry>(
      "SELECT * FROM session_queue WHERE id = ? AND session_id = ? AND status = 'pending'",
      [queueEntryId, sessionId]
    )
    if (!entry) return fail('Queue entry not found or not pending', 404)
    parkActivePlayer(sessionId)
    execute("UPDATE session_queue SET status = 'active' WHERE id = ?", [entry.id])
    return ok({ ok: true as const })
  })
}

export interface AdvanceResult {
  session:      AuctionSession
  activePlayer: SessionQueueEntry | null
  upcoming:     QueueEntryWithClasses[]
}

export interface SellOptions {
  /** Bid id the auctioneer saw when confirming; refuse if a newer bid is on top. */
  expectedBidId?: number | null
  /** Manual sale: sell to this captain at this price regardless of bids. */
  override?: { captainId: number; price: number } | null
}

/** Sells the active player, then activates the next one. */
export function sell(sessionId: number, opts: SellOptions = {}): Outcome<AdvanceResult> {
  return transaction(() => {
    const session = getSession(sessionId)
    if (!session) return fail('Session not found', 404)
    if (session.status !== 'live') return fail('Session is not live')
    const activeEntry = getActiveEntry(sessionId)
    if (!activeEntry) return fail('No player is currently active')

    let captainId: number
    let price: number
    if (opts.override) {
      captainId = opts.override.captainId
      price     = opts.override.price
    } else {
      const topBid = getTopBid(sessionId, activeEntry.id)
      if (!topBid) return fail('No bid placed — provide captain_id and price for manual sale')
      if (opts.expectedBidId != null && opts.expectedBidId !== topBid.id) {
        return fail(`A newer bid arrived (${topBid.captain_name} ${topBid.amount.toFixed(1)}) — check and confirm again`)
      }
      // An override is the auctioneer's own action — no cooldown before selling it.
      const cooldown = getAuction(session.auction_id)?.bid_cooldown_seconds ?? 0
      const wait = topBid.is_override ? 0 : cooldownRemainingMs(topBid.placed_at, cooldown)
      if (wait > 0) return fail(`Bidding is still open for ${(wait / 1000).toFixed(1)}s`)
      captainId = topBid.captain_id
      price     = topBid.amount
    }

    const affordable = checkAffordable(session, captainId, price)
    if (!affordable.ok) return affordable

    recordPurchase(sessionId, activeEntry, captainId, price)
    const next = activateNext(sessionId)
    // No auto-finish — the auctioneer confirms the end explicitly via finish().
    return ok({ session: getSession(sessionId)!, activePlayer: next, upcoming: getUpcoming(sessionId) })
  })
}

/** Sends the active player to the back of the queue with his bids wiped, then activates the next one. */
export function skip(sessionId: number): Outcome<AdvanceResult> {
  return transaction(() => {
    const session = getSession(sessionId)
    if (!session) return fail('Session not found', 404)
    if (session.status !== 'live') return fail('Session is not live')
    const activeEntry = getActiveEntry(sessionId)
    if (!activeEntry) return fail('No player is currently active')

    execute('DELETE FROM session_bids WHERE queue_entry_id = ?', [activeEntry.id])
    const maxPos = queryOne<{ max: number | null }>(
      'SELECT MAX(queue_position) as max FROM session_queue WHERE session_id = ?', [sessionId]
    )
    execute(
      "UPDATE session_queue SET status = 'pending', queue_position = ? WHERE id = ?",
      [(maxPos?.max ?? 0) + 1, activeEntry.id]
    )
    execute('UPDATE auction_sessions SET skipped_count = skipped_count + 1 WHERE id = ?', [sessionId])

    const next = activateNext(sessionId)
    return ok({ session: getSession(sessionId)!, activePlayer: next, upcoming: getUpcoming(sessionId) })
  })
}

/** Auctioneer hands a pending (not active) player straight to a captain. */
export function assign(sessionId: number, queueEntryId: number, captainId: number, price: number): Outcome<{ ok: true }> {
  return transaction(() => {
    const session = getSession(sessionId)
    if (!session) return fail('Session not found', 404)
    if (session.status !== 'live') return fail('Session is not live')
    const entry = queryOne<SessionQueueEntry>(
      "SELECT * FROM session_queue WHERE id = ? AND session_id = ? AND status = 'pending'",
      [queueEntryId, sessionId]
    )
    if (!entry) return fail('Queue entry not found or not pending', 404)

    const affordable = checkAffordable(session, captainId, price)
    if (!affordable.ok) return affordable

    recordPurchase(sessionId, entry, captainId, price)

    const pending = queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM session_queue WHERE session_id = ? AND status = 'pending'", [sessionId]
    )
    if (pending?.count === 0 && !getActiveEntry(sessionId)) {
      execute("UPDATE auction_sessions SET status = 'finished', finished_at = ? WHERE id = ?", [nowIso(), sessionId])
      execute("UPDATE auctions SET status = 'finished' WHERE id = ?", [session.auction_id])
    }
    return ok({ ok: true as const })
  })
}

/** Undoes a purchase: the player becomes active again, the current one is parked at the front. */
export function refund(sessionId: number, purchaseId: number): Outcome<{ ok: true }> {
  return transaction(() => {
    const session = getSession(sessionId)
    if (!session) return fail('Session not found', 404)
    if (session.status !== 'live') return fail('Session is not live')
    const purchase = queryOne<SessionPurchase>(
      'SELECT * FROM session_purchases WHERE id = ? AND session_id = ?', [purchaseId, sessionId]
    )
    if (!purchase) return fail('Purchase not found', 404)

    const soldEntry = purchase.player_id != null
      ? queryOne<SessionQueueEntry>(
          "SELECT * FROM session_queue WHERE session_id = ? AND player_id = ? AND status = 'sold'",
          [sessionId, purchase.player_id])
      : queryOne<SessionQueueEntry>(
          "SELECT * FROM session_queue WHERE session_id = ? AND player_name = ? AND status = 'sold'",
          [sessionId, purchase.player_name])
    if (!soldEntry) return fail('Queue entry for this player not found', 404)

    parkActivePlayer(sessionId)
    execute('DELETE FROM session_bids WHERE queue_entry_id = ?', [soldEntry.id])
    execute("UPDATE session_queue SET status = 'active' WHERE id = ?", [soldEntry.id])
    execute('DELETE FROM session_purchases WHERE id = ?', [purchaseId])
    if (purchase.player_id) execute('UPDATE players SET is_available = 1 WHERE id = ?', [purchase.player_id])
    execute('UPDATE auction_sessions SET sold_count = MAX(0, sold_count - 1) WHERE id = ?', [sessionId])
    return ok({ ok: true as const })
  })
}

// ─── Bidding ──────────────────────────────────────────────────────────────────

export type Bidder =
  | { kind: 'captain';  captainId: number }   // the captain bids for themself: full rules
  | { kind: 'override'; captainId: number }   // auctioneer bids on a captain's behalf: no budget check

export function placeBid(sessionId: number, bidder: Bidder, amount: number): Outcome<{ bid: SessionBid }> {
  return transaction(() => {
    const session = getSession(sessionId)
    if (!session) return fail('Session not found', 404)
    if (session.status !== 'live') return fail('Session is not live')
    const activeEntry = getActiveEntry(sessionId)
    if (!activeEntry) return fail('No player is currently up for auction')

    const captain = getCaptain(session.auction_id, bidder.captainId)
    if (!captain) return fail('Captain not found', 404)
    const minIncrement = getAuction(session.auction_id)?.min_increment ?? 0.1
    const topBid = getTopBid(sessionId, activeEntry.id)

    const error = bidder.kind === 'captain'
      ? validateCaptainBid({
          amount,
          minIncrement,
          topAmount: topBid?.amount ?? null,
          remaining: remainingBudget(captain.budget, getSpent(sessionId, captain.id), session.half_budget === 1),
        })
      : validateOverrideBid(amount, minIncrement)
    if (error) return fail(error, 400)

    execute(
      `INSERT INTO session_bids (session_id, queue_entry_id, captain_id, captain_name, amount, is_override, placed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, activeEntry.id, captain.id, captain.display_name, amount, bidder.kind === 'override' ? 1 : 0, nowIso()]
    )
    return ok({ bid: queryOne<SessionBid>('SELECT * FROM session_bids WHERE id = last_insert_rowid()')! })
  })
}

export function revokeBid(sessionId: number, bidId: number): Outcome<{ ok: true }> {
  return transaction(() => {
    const session = getSession(sessionId)
    if (!session) return fail('Session not found', 404)
    if (session.status === 'finished') return fail('Session is finished')
    const bid = queryOne<SessionBid>('SELECT * FROM session_bids WHERE id = ? AND session_id = ?', [bidId, sessionId])
    if (!bid) return fail('Bid not found', 404)
    execute('DELETE FROM session_bids WHERE id = ?', [bidId])
    return ok({ ok: true as const })
  })
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

const AUTHOR_LABEL: Record<Role, string> = { admin: 'Admin', host: 'Host', auctioneer: 'Auctioneer', captain: 'Captain' }

export function postChat(sessionId: number, role: Role, captainId: number | null, content: string): Outcome<{ ok: true }> {
  const text = content.trim().slice(0, 500)
  if (!text) return fail('Message cannot be empty', 400)
  const session = getSession(sessionId)
  if (!session) return fail('Session not found', 404)

  let author = AUTHOR_LABEL[role]
  if (role === 'captain' && captainId != null) {
    author = queryOne<{ display_name: string }>('SELECT display_name FROM captains WHERE id = ?', [captainId])?.display_name ?? author
  }
  execute(
    'INSERT INTO session_chat (session_id, author_role, author_name, content) VALUES (?, ?, ?, ?)',
    [sessionId, role, author, text]
  )
  return ok({ ok: true as const })
}

// Re-exported so routes validate request bodies with the same rules the service uses.
export { parseAmount }
