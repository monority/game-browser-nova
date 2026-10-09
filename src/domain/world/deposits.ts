import { cellKey, orthogonalNeighbors, sortedCellKeys } from "../shared/cells.js";

/**
 * Shape-generic finite deposit bookkeeping (Step005 generalization).
 * Deposits are cell-keyed, finite, and never disappear: exhaustion sets
 * `remaining: 0` and the entry stays. No regeneration. Resource identity
 * lives in the concrete state fields (woodDeposits / stoneDeposits), not
 * in a generic framework.
 */

export interface Deposit {
  remaining: number;
}

export type Deposits = Record<string, Deposit>;

export interface DepositSeed {
  x: number;
  y: number;
  amount: number;
}

export function normalizeDeposits(seeds: readonly DepositSeed[]): Deposits {
  const deposits: Deposits = {};
  for (const seed of seeds) {
    if (!Number.isFinite(seed.amount) || seed.amount < 0) {
      throw new Error(`invalid deposit amount at ${seed.x},${seed.y}: ${seed.amount}`);
    }
    const key = cellKey(seed.x, seed.y);
    const existing = deposits[key];
    deposits[key] = { remaining: (existing?.remaining ?? 0) + seed.amount };
  }
  return deposits;
}

export function hasDepositAt(deposits: Deposits, x: number, y: number): boolean {
  const deposit = deposits[cellKey(x, y)];
  return deposit !== undefined && deposit.remaining > 0;
}

/** Total remaining across deposits orthogonally adjacent to (x, y). */
export function adjacentRemaining(deposits: Deposits, x: number, y: number): number {
  let total = 0;
  for (const { x: nx, y: ny } of orthogonalNeighbors(x, y)) {
    const deposit = deposits[cellKey(nx, ny)];
    if (deposit) total += deposit.remaining;
  }
  return total;
}

/**
 * Drain up to `amount` from deposits adjacent to (x, y), lowest canonical
 * key first (documented multi-deposit order). Returns what was extracted.
 */
export function extractAdjacent(deposits: Deposits, x: number, y: number, amount: number): number {
  const adjacentKeys = sortedCellKeys(
    orthogonalNeighbors(x, y)
      .map(({ x: nx, y: ny }) => cellKey(nx, ny))
      .filter((key) => (deposits[key]?.remaining ?? 0) > 0),
  );

  let taken = 0;
  for (const key of adjacentKeys) {
    if (taken >= amount) break;
    const deposit = deposits[key];
    if (!deposit) continue;
    const drain = Math.min(deposit.remaining, amount - taken);
    deposit.remaining -= drain;
    taken += drain;
  }
  return taken;
}
