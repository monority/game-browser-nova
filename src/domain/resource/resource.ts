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
}

export const INITIAL_TREASURY = 100;
export const INITIAL_FOOD = 100;
export const INITIAL_WATER = 0;

export function createInitialResourceStock(): ResourceStock {
  return {
    food: INITIAL_FOOD,
    water: INITIAL_WATER,
    money: INITIAL_TREASURY,
    wood: 0,
    stone: 0,
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

export function deductStone(stock: ResourceStock, amount: number): number {
  const taken = Math.min(stock.stone, amount);
  stock.stone -= taken;
  return taken;
}
