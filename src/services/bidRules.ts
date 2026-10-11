// ─── Bidding rules ────────────────────────────────────────────────────────────
// Pure, side-effect-free rules for the live auction. Everything the server
// enforces about a bid or a sale is defined here, once, and unit-tested.
// Routes call these; the client only mirrors them for a nicer UX.
//
// Money is compared in integer "units" (thousandths) so that 0.1 + 0.2 style
// float drift can never accept or reject a bid by accident.

import { UNIT, toUnits, fromUnits } from '../../shared/money'
export { UNIT, toUnits, fromUnits }

/** Accepts a JSON value as a money amount: finite, non-negative, at most 3 decimals. */
export function parseAmount(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return null
  if (Math.abs(raw * UNIT - Math.round(raw * UNIT)) > 1e-6) return null
  return raw
}

/** Accepts a JSON value as a positive integer id. */
export function parseId(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 0) return null
  return raw
}

/** Budget a captain may spend this session. Half-budget mode floors budget/2 to one decimal. */
export function effectiveBudget(budget: number, halfBudget: boolean): number {
  return halfBudget ? Math.floor(budget / 2 * 10) / 10 : budget
}

export function remainingBudget(budget: number, spent: number, halfBudget: boolean): number {
  return Math.max(0, fromUnits(toUnits(effectiveBudget(budget, halfBudget)) - toUnits(spent)))
}

export interface CaptainBidInput {
  amount:       number
  minIncrement: number
  topAmount:    number | null   // current highest bid on this player, if any
  remaining:    number          // captain's remaining effective budget
}

/** Returns an error message if the bid is not allowed, null if it is. */
export function validateCaptainBid(b: CaptainBidInput): string | null {
  const amount = toUnits(b.amount)
  const inc    = toUnits(b.minIncrement)
  if (inc <= 0) return 'Auction has no valid minimum increment'
  if (amount <= 0) return 'Bid must be positive'
  if (amount % inc !== 0) return `Bids must be in steps of ${b.minIncrement.toFixed(1)}`

  const floor = b.topAmount == null ? inc : toUnits(b.topAmount) + inc
  if (amount < floor) {
    return b.topAmount == null
      ? `Minimum bid is ${fromUnits(floor).toFixed(1)}`
      : `Bid must be at least ${fromUnits(floor).toFixed(1)} (current: ${b.topAmount.toFixed(1)})`
  }

  if (amount > toUnits(b.remaining)) {
    return `Bid of ${b.amount.toFixed(1)} exceeds your remaining budget of ${b.remaining.toFixed(1)}`
  }
  return null
}

/**
 * Auctioneer override bid — a bid the auctioneer enters on a captain's behalf.
 *
 * The auctioneer has authority here: an override may match or undercut the
 * current top bid. That is the whole point of the mechanism — if it had to top
 * the standing bid, the captain could just place that bid himself. It also
 * becomes the standing bid regardless of amount (see TOP_BID_SQL) and skips the
 * pre-sale cooldown. The budget is not checked here; the sale re-checks it.
 *
 * The only rules kept are the ones that define a valid bid amount at all:
 * non-negative, and a whole number of increments (0, 0.1, 0.2, …).
 */
export function validateOverrideBid(amount: number, minIncrement: number): string | null {
  const inc   = toUnits(minIncrement)
  const units = toUnits(amount)
  if (inc <= 0) return 'Auction has no valid minimum increment'
  if (units < 0) return 'Bid cannot be negative'
  if (units % inc !== 0) return `Bids must be in steps of ${minIncrement.toFixed(1)}`
  return null
}

/** Milliseconds still to wait before the top bid may be sold. 0 when the cooldown has elapsed. */
export function cooldownRemainingMs(placedAt: string, cooldownSeconds: number, now: number = Date.now()): number {
  if (cooldownSeconds <= 0) return 0
  const placed = Date.parse(placedAt)
  if (!Number.isFinite(placed)) return 0   // legacy second-resolution timestamps: don't block
  return Math.max(0, placed + cooldownSeconds * 1000 - now)
}

/** Timestamp to store on a bid: ISO 8601 with milliseconds, so ordering and cooldowns are exact. */
export function nowIso(): string {
  return new Date().toISOString()
}
