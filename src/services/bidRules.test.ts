import { describe, expect, test } from 'bun:test'
import {
  parseAmount, parseId, effectiveBudget, remainingBudget,
  validateCaptainBid, validateOverrideBid, cooldownRemainingMs, toUnits,
} from './bidRules'

describe('parseAmount', () => {
  test('accepts finite non-negative numbers with up to 3 decimals', () => {
    expect(parseAmount(0)).toBe(0)
    expect(parseAmount(5.1)).toBe(5.1)
    expect(parseAmount(0.125)).toBe(0.125)
  })
  test('rejects strings, NaN, Infinity, negatives and sub-unit fractions', () => {
    expect(parseAmount('5')).toBeNull()
    expect(parseAmount(NaN)).toBeNull()
    expect(parseAmount(Infinity)).toBeNull()
    expect(parseAmount(-0.1)).toBeNull()
    expect(parseAmount(0.0001)).toBeNull()
    expect(parseAmount(undefined)).toBeNull()
    expect(parseAmount(null)).toBeNull()
  })
})

describe('parseId', () => {
  test('accepts positive integers only', () => {
    expect(parseId(3)).toBe(3)
    expect(parseId(0)).toBeNull()
    expect(parseId(1.5)).toBeNull()
    expect(parseId('3')).toBeNull()
  })
})

describe('budgets', () => {
  test('half budget floors to one decimal', () => {
    expect(effectiveBudget(20, true)).toBe(10)
    expect(effectiveBudget(20.3, true)).toBe(10.1)
    expect(effectiveBudget(20.3, false)).toBe(20.3)
  })
  test('remaining budget is exact in tenths and never negative', () => {
    expect(remainingBudget(20, 0.1 + 0.2, false)).toBe(19.7)
    expect(remainingBudget(20, 25, false)).toBe(0)
  })
})

describe('validateCaptainBid', () => {
  const base = { minIncrement: 0.1, topAmount: 4.9, remaining: 20 }
  test('same amount as the top bid is refused', () => {
    expect(validateCaptainBid({ ...base, amount: 4.9 })).toMatch(/at least 5\.0/)
  })
  test('top + increment is accepted, float drift notwithstanding', () => {
    expect(validateCaptainBid({ ...base, topAmount: 0.1 + 0.2, amount: 0.4 })).toBeNull()
    expect(validateCaptainBid({ ...base, amount: 5.0 })).toBeNull()
  })
  test('bids must sit on the increment grid', () => {
    expect(validateCaptainBid({ ...base, amount: 5.05 })).toMatch(/steps of 0\.1/)
  })
  test('first bid must be at least the increment and positive', () => {
    expect(validateCaptainBid({ ...base, topAmount: null, amount: 0 })).toMatch(/positive/)
    expect(validateCaptainBid({ ...base, topAmount: null, amount: 0.1 })).toBeNull()
  })
  test('budget is a hard cap', () => {
    expect(validateCaptainBid({ ...base, remaining: 5.0, amount: 5.0 })).toBeNull()
    expect(validateCaptainBid({ ...base, remaining: 5.0, amount: 5.1 })).toMatch(/exceeds your remaining budget/)
  })
})

describe('validateOverrideBid', () => {
  test('accepts any non-negative whole number of increments — even at or below the top', () => {
    expect(validateOverrideBid(0, 0.1)).toBeNull()
    expect(validateOverrideBid(5.0, 0.1)).toBeNull()   // a captain could not match the top; the auctioneer can
    expect(validateOverrideBid(2.0, 0.1)).toBeNull()   // ...or undercut it
    expect(validateOverrideBid(50.0, 0.1)).toBeNull()  // no budget check here
  })
  test('still rejects negatives and off-increment amounts', () => {
    expect(validateOverrideBid(-0.1, 0.1)).toMatch(/negative/)
    expect(validateOverrideBid(5.15, 0.1)).toMatch(/steps/)
  })
})

describe('cooldownRemainingMs', () => {
  test('counts down from the bid timestamp', () => {
    const placed = new Date(1_000_000).toISOString()
    expect(cooldownRemainingMs(placed, 3, 1_000_000)).toBe(3000)
    expect(cooldownRemainingMs(placed, 3, 1_002_500)).toBe(500)
    expect(cooldownRemainingMs(placed, 3, 1_003_000)).toBe(0)
    expect(cooldownRemainingMs(placed, 0, 1_000_000)).toBe(0)
  })
  test('legacy second-resolution timestamps never block a sale', () => {
    expect(cooldownRemainingMs('not a date', 3, Date.now())).toBe(0)
  })
})

test('toUnits is exact for tenths', () => {
  expect(toUnits(0.1 + 0.2)).toBe(300)
  expect(toUnits(19.7)).toBe(19700)
})
