/**
 * Technology catalog (docs/game/07-PROGRESSION.md §5-6): a small selection
 * with system effects (never flat +% on everything). Effects are additive
 * per researched tech; the domain reads them via techLevel().
 */

export type TechEffect = "farmFood" | "quarryStone" | "workshopCommerce" | "logisticsRadius";

interface TechDefinition {
  id: string;
  displayName: string;
  cost: number;
  /** Minimum age required to research. */
  age: number;
  effect: TechEffect;
}

export const TECH_DEFINITIONS: Record<string, TechDefinition> = {
  cropRotation: {
    id: "cropRotation",
    displayName: "Crop Rotation",
    cost: 50,
    age: 1,
    effect: "farmFood",
  },
  masonry: {
    id: "masonry",
    displayName: "Masonry",
    cost: 50,
    age: 1,
    effect: "quarryStone",
  },
  tradeRoutes: {
    id: "tradeRoutes",
    displayName: "Trade Routes",
    cost: 50,
    age: 1,
    effect: "workshopCommerce",
  },
  irrigation: {
    id: "irrigation",
    displayName: "Irrigation",
    cost: 150,
    age: 2,
    effect: "farmFood",
  },
  deepMining: {
    id: "deepMining",
    displayName: "Deep Mining",
    cost: 150,
    age: 2,
    effect: "quarryStone",
  },
  wheelbarrow: {
    id: "wheelbarrow",
    displayName: "Wheelbarrow",
    cost: 150,
    age: 2,
    // Step050 L3b: transport technology — widens the logistics free radius.
    effect: "logisticsRadius",
  },
  // Step070 — what money is FOR in the late game. The colony that reaches Age 3
  // holds thousands and has nothing left to buy: buildings need free cells and
  // planks, and the map runs out before the treasury does (measured on the
  // self-play line: 5 424 at tick 1500 with 51 buildings and no purchase left).
  // These two are priced in money alone, so the surplus buys capability instead
  // of sitting there, and both answer the lean season: one gets more out of the
  // land the colony already works, the other moves goods further without a
  // penalty.
  cobbledRoads: {
    id: "cobbledRoads",
    displayName: "Cobbled Roads",
    cost: 800,
    age: 3,
    effect: "logisticsRadius",
  },
  winterWheat: {
    id: "winterWheat",
    displayName: "Winter Wheat",
    cost: 1200,
    age: 3,
    effect: "farmFood",
  },
};
