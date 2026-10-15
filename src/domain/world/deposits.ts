import { cellKey, orthogonalNeighbors, sortedCellKeys } from "@/domain/shared/cells.js";

/**
 * Shape-generic finite deposit bookkeeping (Step005 generalization).
 * Deposits are cell-keyed, finite, and never disappear: exhaustion sets
 * `remaining: 0` and the entry stays. Wood regenerates up to `capacity`
 * via parks (Step018); stone never regenerates. Resource identity lives
 * in the concrete state fields (woodDeposits / stoneDeposits), not in
 * a generic framework.
 */

export interface Deposit {
  remaining: number;
  /** Ceiling for regrowth: the cell's initial seeded amount. */
  capacity: number;
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
    deposits[key] = {
      remaining: (existing?.remaining ?? 0) + seed.amount,
      capacity: (existing?.capacity ?? 0) + seed.amount,
    };
  }
  return deposits;
}

/** Seeded capacity per cell (summed like normalizeDeposits): used by save migration. */
export function depositCapacities(seeds: readonly DepositSeed[]): Record<string, number> {
  const capacities: Record<string, number> = {};
  for (const seed of seeds) {
    const key = cellKey(seed.x, seed.y);
    capacities[key] = (capacities[key] ?? 0) + seed.amount;
  }
  return capacities;
}

/**
 * Regrow up to `amount` across deposits adjacent to (x, y), lowest
 * canonical key first (mirrors extraction order). Cells already at
 * capacity are skipped. Returns what was regrown.
 */
export function regrowAdjacent(deposits: Deposits, x: number, y: number, amount: number): number {
  const adjacentKeys = sortedCellKeys(
    orthogonalNeighbors(x, y)
      .map(({ x: nx, y: ny }) => cellKey(nx, ny))
      .filter((key) => {
        const deposit = deposits[key];
        return deposit !== undefined && deposit.remaining < deposit.capacity;
      }),
  );

  let grown = 0;
  for (const key of adjacentKeys) {
    if (grown >= amount) break;
    const deposit = deposits[key];
    if (!deposit) continue;
    const room = Math.min(deposit.capacity - deposit.remaining, amount - grown);
    deposit.remaining += room;
    grown += room;
  }
  return grown;
}

export function hasDepositAt(deposits: Deposits, x: number, y: number): boolean {
  const deposit = deposits[cellKey(x, y)];
  return deposit !== undefined && deposit.remaining > 0;
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
