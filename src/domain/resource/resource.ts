/**
 * Canonical resource stock.
 * Flat record extended per-resource when a physical good ships (audit D1) —
 * no generic ResourceEngine. Money is an accounted, uncapped treasury;
 * consumables are clamped >= 0.
 */

export interface ResourceStock {
  food: number;
  water: number;
  money: number;
  wood: number;
  stone: number;
  planks: number;
}

export const INITIAL_TREASURY = 100;

export function createInitialResourceStock(): ResourceStock {
  return {
    // Day-0 food/water are set by the D2 colony composition (state.ts);
    // the pre-D2 baseline is empty (Step028: removed dead 100/0 constants).
    food: 0,
    water: 0,
    money: INITIAL_TREASURY,
    wood: 0,
    stone: 0,
    planks: 0,
  };
}

export function addFood(stock: ResourceStock, amount: number): void {
  stock.food = Math.max(0, stock.food + amount);
}

export function addWater(stock: ResourceStock, amount: number): void {
  stock.water = Math.max(0, stock.water + amount);
}

export function addMoney(stock: ResourceStock, amount: number): void {
  // Money is uncapped but never negative: partial payments clamp at 0.
  stock.money = Math.max(0, stock.money + amount);
}

export function deductFood(stock: ResourceStock, amount: number): number {
  const taken = Math.min(stock.food, amount);
  stock.food -= taken;
  return taken;
}

export function deductWater(stock: ResourceStock, amount: number): number {
  const taken = Math.min(stock.water, amount);
  stock.water -= taken;
  return taken;
}

export function deductMoney(stock: ResourceStock, amount: number): number {
  // Mirrors the consumable deduct contract: clamp at available, never negative.
  const taken = Math.min(stock.money, amount);
  stock.money -= taken;
  return taken;
}

export function addWood(stock: ResourceStock, amount: number): void {
  stock.wood = Math.max(0, stock.wood + amount);
}

export function addStone(stock: ResourceStock, amount: number): void {
  stock.stone = Math.max(0, stock.stone + amount);
}

export function deductWood(stock: ResourceStock, amount: number): number {
  const taken = Math.min(stock.wood, amount);
  stock.wood -= taken;
  return taken;
}

export function addPlanks(stock: ResourceStock, amount: number): void {
  stock.planks = Math.max(0, stock.planks + amount);
}

export function deductPlanks(stock: ResourceStock, amount: number): number {
  const taken = Math.min(stock.planks, amount);
  stock.planks -= taken;
  return taken;
}
