// ─── Session routes ───────────────────────────────────────────────────────────
// Thin HTTP layer over services/auctionSession.ts: authenticate, check access,
// parse the body, call the service, broadcast on success. No game rules here.

import { Hono, type Context } from 'hono'
import { queryOne } from '../db/database'
import { requireAuth, optionalAuth, type AuthEnv } from '../middleware/auth'
import type { Auction, JwtPayload } from '../types'
import { auctionRoom } from '../ws/rooms'
import { canAccessAuction, canAccessSession, findSession, type SessionRef } from '../services/access'
import * as svc from '../services/auctionSession'
import { parseAmount, parseId } from '../services/bidRules'

const sessions = new Hono<AuthEnv>()

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Ctx = Context<AuthEnv>

/** Turns a service outcome into a JSON response, broadcasting to the room on success. */
function respond<T>(c: Ctx, outcome: svc.Outcome<T>, notifySessionId?: number, status: 200 | 201 = 200) {
  if (!outcome.ok) return c.json({ error: outcome.error }, outcome.status)
  if (notifySessionId != null) auctionRoom.broadcast(notifySessionId)
  return c.json(outcome.value, status)
}

/** Loads the session from the URL and checks the caller may act on it. */
function loadSession(c: Ctx): SessionRef | Response {
  const session = findSession(Number(c.req.param('id')))
  if (!session) return c.json({ error: 'Session not found' }, 404)
  if (!canAccessSession(c.get('auth'), session)) return c.json({ error: 'Forbidden' }, 403)
  return session
}

async function body<T extends object>(c: Ctx): Promise<Partial<T>> {
  return (await c.req.json<Partial<T>>().catch(() => ({}))) ?? {}
}

const ALL_ROLES = ['admin', 'host', 'auctioneer', 'captain'] as const
const CONTROLLERS = ['admin', 'auctioneer'] as const

// ─── Sessions of an auction ───────────────────────────────────────────────────

sessions.get('/auction/:auctionId', requireAuth(...ALL_ROLES), (c) => {
  const auction = queryOne<Auction>('SELECT * FROM auctions WHERE id = ?', [Number(c.req.param('auctionId'))])
  if (!auction) return c.json({ error: 'Auction not found' }, 404)
  if (!canAccessAuction(c.get('auth'), auction)) return c.json({ error: 'Forbidden' }, 403)
  return c.json(svc.listForAuction(auction.id))
})

sessions.post('/auction/:auctionId', requireAuth('admin', 'host', 'auctioneer'), (c) => {
  const auction = queryOne<Auction>('SELECT * FROM auctions WHERE id = ?', [Number(c.req.param('auctionId'))])
  if (!auction) return c.json({ error: 'Auction not found' }, 404)
  if (!canAccessAuction(c.get('auth'), auction)) return c.json({ error: 'Forbidden' }, 403)
  return respond(c, svc.create(auction), undefined, 201)
})

// ─── Reads ────────────────────────────────────────────────────────────────────

// The live room is a public spectator view (the tournament page links to it),
// so anyone may read it. A logged-in caller is still checked against the
// session so a captain of another tournament cannot use their cookie here.
sessions.get('/:id', optionalAuth(), (c) => {
  const session = findSession(Number(c.req.param('id')))
  if (!session) return c.json({ error: 'Session not found' }, 404)
  const auth = c.get('auth') as JwtPayload | undefined
  if (auth && !canAccessSession(auth, session)) return c.json({ error: 'Forbidden' }, 403)
  return respond(c, svc.detail(session.id))
})

sessions.get('/:id/purchases', requireAuth(...ALL_ROLES), (c) => {
  const s = loadSession(c); if (s instanceof Response) return s
  return c.json(svc.purchases(s.id))
})

// Auctioneer pool view — alphabetical so the secret queue order is not revealed.
sessions.get('/:id/pending-players', requireAuth('admin', 'auctioneer', 'captain'), (c) => {
  const s = loadSession(c); if (s instanceof Response) return s
  return c.json(svc.pendingPlayers(s.id))
})

// ─── Lifecycle ────────────────────────────────────────────────────────────────

sessions.post('/:id/sync-pool', requireAuth(...CONTROLLERS), (c) => {
  const s = loadSession(c); if (s instanceof Response) return s
  return respond(c, svc.syncPool(s.id), s.id)
})

sessions.post('/:id/live', requireAuth(...CONTROLLERS), (c) => {
  const s = loadSession(c); if (s instanceof Response) return s
  return respond(c, svc.goLive(s.id), s.id)
})

sessions.post('/:id/pause', requireAuth('admin', 'host', 'auctioneer'), (c) => {
  const s = loadSession(c); if (s instanceof Response) return s
  return respond(c, svc.pause(s.id), s.id)
})

sessions.post('/:id/half-budget', requireAuth(...CONTROLLERS), (c) => {
  const s = loadSession(c); if (s instanceof Response) return s
  return respond(c, svc.toggleHalfBudget(s.id), s.id)
})

sessions.post('/:id/finish', requireAuth(...CONTROLLERS), (c) => {
  const s = loadSession(c); if (s instanceof Response) return s
  return respond(c, svc.finish(s.id), s.id)
})

// ─── Queue control ────────────────────────────────────────────────────────────

sessions.post('/:id/start', requireAuth(...CONTROLLERS), (c) => {
  const s = loadSession(c); if (s instanceof Response) return s
  return respond(c, svc.startFirstPlayer(s.id), s.id)
})

sessions.post('/:id/set-active', requireAuth(...CONTROLLERS), async (c) => {
  const s = loadSession(c); if (s instanceof Response) return s
  const b = await body<{ queue_entry_id: unknown }>(c)
  const entryId = parseId(b.queue_entry_id)
  if (entryId == null) return c.json({ error: 'queue_entry_id is required' }, 400)
  return respond(c, svc.setActive(s.id, entryId), s.id)
})

// Sold or skipped. A sale uses the top bid unless captain_id + price override it.
sessions.post('/:id/advance', requireAuth(...CONTROLLERS), async (c) => {
  const s = loadSession(c); if (s instanceof Response) return s
  const b = await body<{ action: unknown; captain_id: unknown; price: unknown; expected_bid_id: unknown }>(c)

  if (b.action === 'skipped') return respond(c, svc.skip(s.id), s.id)
  if (b.action !== 'sold') return c.json({ error: 'action must be "sold" or "skipped"' }, 400)

  const hasOverride = b.captain_id != null || b.price != null
  const captainId = hasOverride ? parseId(b.captain_id) : null
  const price     = hasOverride ? parseAmount(b.price) : null
  if (hasOverride && (captainId == null || price == null)) {
    return c.json({ error: 'Manual sale needs a valid captain_id and a non-negative price' }, 400)
  }
  const expectedBidId = b.expected_bid_id == null ? null : parseId(b.expected_bid_id)
  if (b.expected_bid_id != null && expectedBidId == null) {
    return c.json({ error: 'expected_bid_id must be a bid id' }, 400)
  }

  return respond(c, svc.sell(s.id, {
    expectedBidId,
    override: captainId != null && price != null ? { captainId, price } : null,
  }), s.id)
})

sessions.post('/:id/assign', requireAuth(...CONTROLLERS), async (c) => {
  const s = loadSession(c); if (s instanceof Response) return s
  const b = await body<{ queue_entry_id: unknown; captain_id: unknown; price: unknown }>(c)
  const entryId   = parseId(b.queue_entry_id)
  const captainId = parseId(b.captain_id)
  const price     = parseAmount(b.price)
  if (entryId == null || captainId == null || price == null) {
    return c.json({ error: 'queue_entry_id, captain_id and a non-negative price are required' }, 400)
  }
  return respond(c, svc.assign(s.id, entryId, captainId, price), s.id)
})

sessions.post('/:id/refund', requireAuth(...CONTROLLERS), async (c) => {
  const s = loadSession(c); if (s instanceof Response) return s
  const b = await body<{ purchase_id: unknown }>(c)
  const purchaseId = parseId(b.purchase_id)
  if (purchaseId == null) return c.json({ error: 'purchase_id is required' }, 400)
  return respond(c, svc.refund(s.id, purchaseId), s.id)
})

// ─── Bidding ──────────────────────────────────────────────────────────────────

sessions.post('/:id/bid', requireAuth('admin', 'auctioneer', 'captain'), async (c) => {
  const s = loadSession(c); if (s instanceof Response) return s
  const auth = c.get('auth')
  const b = await body<{ captain_id: unknown; amount: unknown }>(c)

  const amount = parseAmount(b.amount)
  if (amount == null) return c.json({ error: 'amount must be a non-negative number with at most 3 decimals' }, 400)

  let bidder: svc.Bidder
  if (auth.role === 'captain') {
    bidder = { kind: 'captain', captainId: auth.captainId }
  } else {
    const captainId = parseId(b.captain_id)
    if (captainId == null) return c.json({ error: 'captain_id required' }, 400)
    bidder = { kind: 'override', captainId }
  }
  return respond(c, svc.placeBid(s.id, bidder, amount), s.id)
})

sessions.delete('/:id/bids/:bidId', requireAuth('admin', 'host', 'auctioneer'), (c) => {
  const s = loadSession(c); if (s instanceof Response) return s
  const bidId = parseId(Number(c.req.param('bidId')))
  if (bidId == null) return c.json({ error: 'Invalid bid id' }, 400)
  return respond(c, svc.revokeBid(s.id, bidId), s.id)
})

// ─── Chat ─────────────────────────────────────────────────────────────────────

sessions.post('/:id/chat', requireAuth(...ALL_ROLES), async (c) => {
  const s = loadSession(c); if (s instanceof Response) return s
  const auth = c.get('auth')
  const b = await body<{ content: unknown }>(c)
  const content = typeof b.content === 'string' ? b.content : ''
  const captainId = auth.role === 'captain' ? auth.captainId : null
  return respond(c, svc.postChat(s.id, auth.role, captainId, content), s.id)
})

export default sessions
