// Integration tests for the live-auction routes.
// Runs the real Hono router in-process against a throwaway SQLite file with
// forged JWT cookies, so every rule the server must enforce is exercised
// end to end: bid validation, concurrency, budgets, cooldown, sale integrity.
import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import { tmpdir } from 'os'
import { join } from 'path'
import { initDb, execute, queryAll, queryOne } from '../db/database'
import { JWT_SECRET } from '../middleware/auth'
import sessions from './sessions'

const DB_PATH = join(tmpdir(), `bdc-sessions-test-${process.pid}-${Date.now()}.db`)

const app = new Hono()
app.route('/api/sessions', sessions)

const CAPTAIN_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
let tournamentId = 0
let auctionId    = 0
let sessionId    = 0
let otherAuctionId = 0
const captainIds: Record<string, number> = {}
const cookies: Record<string, string> = {}
let auctioneerCookie = ''
let foreignAuctioneerCookie = ''
let otherCaptainCookie = ''
let queuePos = 0

async function jwt(payload: object) {
  return 'auth_token=' + await sign({ ...payload, exp: Math.floor(Date.now() / 1000) + 3600 }, JWT_SECRET, 'HS256')
}

beforeAll(async () => {
  initDb(DB_PATH)
  execute("INSERT INTO tournaments (name, slug) VALUES ('Test Cup', 'test-cup')")
  tournamentId = queryOne<{ id: number }>("SELECT id FROM tournaments WHERE slug = 'test-cup'")!.id
  execute("INSERT INTO auctions (tournament_id, name, status, min_increment, bid_cooldown_seconds) VALUES (?, 'Div A', 'ready', 0.1, 0)", [tournamentId])
  auctionId = queryOne<{ id: number }>("SELECT id FROM auctions WHERE name = 'Div A'")!.id
  execute("INSERT INTO auctions (tournament_id, name, status, min_increment, bid_cooldown_seconds) VALUES (?, 'Div B', 'ready', 0.1, 0)", [tournamentId])
  otherAuctionId = queryOne<{ id: number }>("SELECT id FROM auctions WHERE name = 'Div B'")!.id

  for (const n of CAPTAIN_NAMES) {
    execute("INSERT INTO captains (auction_id, display_name, budget) VALUES (?, ?, 20)", [auctionId, n])
    captainIds[n] = queryOne<{ id: number }>("SELECT id FROM captains WHERE auction_id = ? AND display_name = ?", [auctionId, n])!.id
    cookies[n] = await jwt({ role: 'captain', captainId: captainIds[n], auctionId })
  }
  execute("INSERT INTO captains (auction_id, display_name, budget) VALUES (?, 'Z', 20)", [otherAuctionId])
  const z = queryOne<{ id: number }>("SELECT id FROM captains WHERE display_name = 'Z'")!.id
  otherCaptainCookie = await jwt({ role: 'captain', captainId: z, auctionId: otherAuctionId })
  auctioneerCookie   = await jwt({ role: 'auctioneer', projectId: tournamentId })
  execute("INSERT INTO tournaments (name, slug) VALUES ('Other Cup', 'other-cup')")
  const otherTournamentId = queryOne<{ id: number }>("SELECT id FROM tournaments WHERE slug = 'other-cup'")!.id
  foreignAuctioneerCookie = await jwt({ role: 'auctioneer', projectId: otherTournamentId })

  execute("INSERT INTO auction_sessions (auction_id, status, half_budget) VALUES (?, 'live', 0)", [auctionId])
  sessionId = queryOne<{ id: number }>("SELECT id FROM auction_sessions WHERE auction_id = ?", [auctionId])!.id
})

// Each test starts from: session live, full budget, no purchases, one fresh active player.
let activeEntryId = 0
beforeEach(() => {
  execute("UPDATE auction_sessions SET status = 'live', half_budget = 0, sold_count = 0, skipped_count = 0 WHERE id = ?", [sessionId])
  execute("UPDATE auctions SET bid_cooldown_seconds = 0 WHERE id = ?", [auctionId])
  execute("DELETE FROM session_purchases WHERE session_id = ?", [sessionId])
  execute("DELETE FROM session_bids WHERE session_id = ?", [sessionId])
  execute("DELETE FROM session_queue WHERE session_id = ?", [sessionId])
  activeEntryId = addPlayer('Active', 'active')
})

function addPlayer(name: string, status: 'pending' | 'active' = 'pending'): number {
  execute("INSERT INTO session_queue (session_id, player_id, player_name, queue_position, status) VALUES (?, NULL, ?, ?, ?)",
    [sessionId, name, queuePos++, status])
  return queryOne<{ id: number }>("SELECT id FROM session_queue WHERE session_id = ? ORDER BY id DESC LIMIT 1", [sessionId])!.id
}

async function post(path: string, cookie: string, body?: unknown, rawBody?: string) {
  const res = await app.request(`/api/sessions/${sessionId}${path}`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
  })
  return { status: res.status, body: await res.json() as any }
}

const bid   = (who: string, amount: unknown) => post('/bid', cookies[who], { amount })
const sell  = (extra: object = {}) => post('/advance', auctioneerCookie, { action: 'sold', ...extra })
const skip  = () => post('/advance', auctioneerCookie, { action: 'skipped' })
const detail = async () => (await app.request(`/api/sessions/${sessionId}`, { headers: { cookie: auctioneerCookie } })).json() as Promise<any>
const bidsOnActive = () => queryAll<{ captain_name: string; amount: number }>(
  "SELECT captain_name, amount FROM session_bids WHERE queue_entry_id = ? ORDER BY id", [activeEntryId])

describe('bid validation', () => {
  test('rejects malformed bodies instead of crashing', async () => {
    expect((await bid('A', '5')).status).toBe(400)
    expect((await bid('A', NaN)).status).toBe(400)         // JSON.stringify(NaN) -> null
    expect((await bid('A', -1)).status).toBe(400)
    expect((await bid('A', undefined)).status).toBe(400)
    expect((await post('/bid', cookies.A, undefined, '{not json')).status).toBe(400)
    expect(bidsOnActive()).toHaveLength(0)
  })

  test('captain bids must sit on the increment grid', async () => {
    const r = await bid('A', 5.05)
    expect(r.status).toBe(400)
    expect(r.body.error).toMatch(/steps of 0\.1/)
  })

  test('a captain from another division cannot bid', async () => {
    expect((await post('/bid', otherCaptainCookie, { amount: 1 })).status).toBe(403)
  })

  test('no bids while the session is paused', async () => {
    execute("UPDATE auction_sessions SET status = 'paused' WHERE id = ?", [sessionId])
    expect((await bid('A', 1)).status).toBe(409)
  })

  test('same value as the current top bid is refused, even in the same second', async () => {
    expect((await bid('A', 5.0)).status).toBe(200)
    expect((await bid('B', 5.1)).status).toBe(200)
    const c = await bid('C', 5.1)
    expect(c.status).toBe(400)
    expect(c.body.error).toMatch(/at least 5\.2/)
    expect(bidsOnActive().map(b => b.amount)).toEqual([5.0, 5.1])
  })

  test('eight captains firing the same amount concurrently: exactly one is accepted', async () => {
    const results = await Promise.all(CAPTAIN_NAMES.map(n => bid(n, 5.0)))
    expect(results.filter(r => r.status === 200)).toHaveLength(1)
    expect(results.filter(r => r.status === 400)).toHaveLength(7)
    expect(bidsOnActive()).toHaveLength(1)
  })

  test('half budget caps bids at floor(budget/2) and budget is exact in tenths', async () => {
    execute("UPDATE auction_sessions SET half_budget = 1 WHERE id = ?", [sessionId])
    expect((await bid('A', 10.1)).status).toBe(400)
    expect((await bid('A', 10.0)).status).toBe(200)
  })

  test('auctioneer override may match the top bid and then wins it', async () => {
    await bid('A', 5.0)
    // A captain would have to bid 5.1; the auctioneer only has to match 5.0.
    const r = await post('/bid', auctioneerCookie, { amount: 5.0, captain_id: captainIds.B })
    expect(r.status).toBe(200)
    const d = await detail()
    expect(d.currentBid.captain_name).toBe('B')
    expect(d.currentBid.is_override).toBe(1)
    // Off-increment is still rejected.
    expect((await post('/bid', auctioneerCookie, { amount: 5.15, captain_id: captainIds.C })).status).toBe(400)
  })

  test('an override below the standing bid still takes it — that is the point of the override', async () => {
    await bid('A', 5.0)
    expect((await post('/bid', auctioneerCookie, { amount: 2.0, captain_id: captainIds.B })).status).toBe(200)
    const d = await detail()
    expect(d.currentBid.captain_name).toBe('B')
    expect(d.currentBid.amount).toBe(2.0)
    expect(d.currentBid.is_override).toBe(1)
  })

  test('after an override lowers the price, a captain only needs to beat the override, not the old top', async () => {
    await bid('A', 5.0)
    await post('/bid', auctioneerCookie, { amount: 2.0, captain_id: captainIds.B })
    // Would be rejected as "must beat 5.0" under the old top-bid logic.
    expect((await bid('C', 2.1)).status).toBe(200)
    expect((await detail()).currentBid.captain_name).toBe('C')
  })

  test('a captain can still outbid an override by topping it normally', async () => {
    await post('/bid', auctioneerCookie, { amount: 3.0, captain_id: captainIds.B })
    expect((await bid('A', 3.1)).status).toBe(200)
    expect((await detail()).currentBid.captain_name).toBe('A')
  })

  test('an override can be sold at once — no cooldown on the auctioneer\'s own action', async () => {
    execute('UPDATE auctions SET bid_cooldown_seconds = 30 WHERE id = ?', [auctionId])
    await post('/bid', auctioneerCookie, { amount: 4.0, captain_id: captainIds.B })
    expect((await detail()).cooldownRemainingMs).toBe(0)
    const r = await sell()
    expect(r.status).toBe(200)
    const p = queryOne<{ captain_id: number; price: number }>('SELECT captain_id, price FROM session_purchases WHERE session_id = ?', [sessionId])
    expect(p).toEqual({ captain_id: captainIds.B, price: 4.0 })
  })

  test('bids carry millisecond timestamps and history is in placement order', async () => {
    await bid('A', 1.0); await bid('B', 1.1); await bid('C', 1.2)
    const d = await detail()
    expect(d.bidHistory.map((b: any) => b.captain_name)).toEqual(['A', 'B', 'C'])
    expect(d.bidHistory[0].placed_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })
})

describe('sale integrity', () => {
  test('sells to the top bid and marks the player', async () => {
    await bid('A', 3.0); await bid('B', 3.5)
    const r = await sell()
    expect(r.status).toBe(200)
    const p = queryOne<{ captain_id: number; price: number }>("SELECT captain_id, price FROM session_purchases WHERE session_id = ?", [sessionId])
    expect(p).toEqual({ captain_id: captainIds.B, price: 3.5 })
  })

  test('refuses a sale when a newer bid arrived than the one the auctioneer confirmed', async () => {
    const first = await bid('A', 3.0)
    await bid('B', 3.5)
    const r = await sell({ expected_bid_id: first.body.bid.id })
    expect(r.status).toBe(409)
    expect(r.body.error).toMatch(/newer bid/)
    expect(queryAll("SELECT * FROM session_purchases WHERE session_id = ?", [sessionId])).toHaveLength(0)
  })

  test('enforces the bid cooldown on the server', async () => {
    execute("UPDATE auctions SET bid_cooldown_seconds = 1 WHERE id = ?", [auctionId])
    await bid('A', 3.0)
    const early = await sell()
    expect(early.status).toBe(409)
    expect(early.body.error).toMatch(/still open/)
    expect((await detail()).cooldownRemainingMs).toBeGreaterThan(0)
    await Bun.sleep(1050)
    expect((await sell()).status).toBe(200)
  })

  test('refuses a sale the buyer can no longer afford', async () => {
    // A bids 15 with full budget, then half-budget is switched on (cap 10).
    await bid('A', 15.0)
    execute("UPDATE auction_sessions SET half_budget = 1 WHERE id = ?", [sessionId])
    const r = await sell()
    expect(r.status).toBe(409)
    expect(r.body.error).toMatch(/exceeds A's remaining budget/)
  })

  test('manual sale validates its inputs and the budget', async () => {
    expect((await sell({ captain_id: captainIds.A, price: -1 })).status).toBe(400)
    expect((await sell({ captain_id: 'A', price: 1 })).status).toBe(400)
    expect((await sell({ captain_id: captainIds.A, price: 25 })).status).toBe(409)
    expect((await sell({ captain_id: captainIds.A, price: 2.5 })).status).toBe(200)
  })

  test('skipping a player wipes his bids so they cannot resurface', async () => {
    addPlayer('Next')
    await bid('A', 3.0); await bid('B', 3.5)
    expect((await skip()).status).toBe(200)
    expect(queryAll("SELECT * FROM session_bids WHERE queue_entry_id = ?", [activeEntryId])).toHaveLength(0)
    const next = await detail()
    expect(next.activePlayer.player_name).toBe('Next')
    expect(next.currentBid).toBeNull()
  })

  test('refund returns the money, re-activates the player and parks the current one with bids wiped', async () => {
    addPlayer('Next')
    await bid('A', 4.0)
    expect((await sell()).status).toBe(200)                 // A buys "Active" for 4.0, "Next" becomes active
    const purchase = queryOne<{ id: number }>("SELECT id FROM session_purchases WHERE session_id = ?", [sessionId])!
    await bid('B', 1.0)                                      // a bid on "Next"
    expect((await post('/refund', auctioneerCookie, { purchase_id: purchase.id })).status).toBe(200)
    const d = await detail()
    expect(d.activePlayer.player_name).toBe('Active')
    expect(d.currentBid).toBeNull()
    expect(d.captains.find((c: any) => c.display_name === 'A').spent).toBe(0)
    expect(queryAll("SELECT * FROM session_bids WHERE session_id = ?", [sessionId])).toHaveLength(0)
    expect(queryOne<{ status: string }>("SELECT status FROM session_queue WHERE player_name = 'Next' AND session_id = ?", [sessionId])!.status).toBe('pending')
  })

  test('set-active swaps players and wipes bids on the parked one', async () => {
    const chosen = addPlayer('Chosen')
    await bid('A', 2.0)
    expect((await post('/set-active', auctioneerCookie, { queue_entry_id: chosen })).status).toBe(200)
    const d = await detail()
    expect(d.activePlayer.player_name).toBe('Chosen')
    expect(d.currentBid).toBeNull()
    expect(queryAll("SELECT * FROM session_bids WHERE queue_entry_id = ?", [activeEntryId])).toHaveLength(0)
    expect((await post('/set-active', auctioneerCookie, { queue_entry_id: 'x' })).status).toBe(400)
  })

  test('finish refuses until every roster is full', async () => {
    const r = await post('/finish', auctioneerCookie)
    expect(r.status).toBe(409)
    expect(r.body.error).toMatch(/full roster/)
    expect(queryOne<{ status: string }>("SELECT status FROM auction_sessions WHERE id = ?", [sessionId])!.status).toBe('live')
  })

  test('the live room is readable by anonymous spectators and never leaks captain tokens', async () => {
    execute("UPDATE captains SET token = 'DRAFT-SECRET' WHERE id = ?", [captainIds.A])
    const res = await app.request(`/api/sessions/${sessionId}`)
    expect(res.status).toBe(200)
    const d = await res.json() as any
    expect(JSON.stringify(d)).not.toContain('DRAFT-SECRET')
    expect(d.captains.find((c: any) => c.display_name === 'A').token).toBeUndefined()
    // a logged-in caller from another division is still refused
    expect((await app.request(`/api/sessions/${sessionId}`, { headers: { cookie: otherCaptainCookie } })).status).toBe(403)
  })

  test('an auctioneer of another tournament cannot touch this session', async () => {
    expect((await post('/advance', foreignAuctioneerCookie, { action: 'skipped' })).status).toBe(403)
    expect((await post('/half-budget', foreignAuctioneerCookie)).status).toBe(403)
    expect((await app.request(`/api/sessions/${sessionId}`, { headers: { cookie: foreignAuctioneerCookie } })).status).toBe(403)
  })

  test('a bid that lands after the sale attaches to the next player, never the sold one', async () => {
    addPlayer('Next')
    await bid('A', 3.0)
    // Sale and a late bid race: whichever order they run in, the sold entry keeps only A's bid.
    await Promise.all([sell(), bid('B', 3.1)])
    const soldBids = queryAll<{ captain_name: string }>("SELECT captain_name FROM session_bids WHERE queue_entry_id = ?", [activeEntryId])
    expect(soldBids.map(b => b.captain_name)).toEqual(['A'])
  })
})
