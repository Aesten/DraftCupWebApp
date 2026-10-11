// Money helpers shared by server and client: amounts are compared in integer
// thousandths so 0.1 + 0.2 style float drift never changes a decision.

export const UNIT = 1000

export function toUnits(amount: number): number {
  return Math.round(amount * UNIT)
}

export function fromUnits(units: number): number {
  return units / UNIT
}
