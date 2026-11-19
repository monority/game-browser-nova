/**
 * Technology catalog (docs/game/07-PROGRESSION.md §5-6): a small selection
 * with system effects (never flat +% on everything). Effects are additive
 * per researched tech; the domain reads them via techLevel().
 */

export type TechEffect =
  | "farmFood"
  | "wellWater"
  | "quarryStone"
  | "workshopCommerce"
  | "logisticsRadius";

interface TechDefinition {
  id: string;
  displayName: string;
  cost: number;
  /** Minimum age required to research. */
  age: number;
  effect: TechEffect;
  /**
   * false = prototype kept in the file but OUT of the shipped catalogue: the
   * player is never offered it and `applyResearchTech` refuses to sell it.
   * The effect still applies to a save that already carries the tech (levels
   * are read from `researchedTechs`, not from this flag), so an unshipped
   * lever stays measurable without re-opening the shipped list.
   * Default: shipped.
   */
  shipped?: boolean;
}

export const TECH_DEFINITIONS: Record<string, TechDefinition> = {
  cropRotation: {
    id: "cropRotation",
    displayName: "Crop Rotation",
    cost: 50,
    age: 1,
    effect: "farmFood",
  },
  /**
   * Option C of docs/rebalance/v0.1/GAME-DESIGN-INDUSTRY-BEFORE-13.md §4: the
   * well was the ONLY survival post with no productivity lever while the farm
   * had three. One extra water per staffed well turns the survival staffing
   * need from ceil(N/2) wells into ceil(N/3).
   *
   * OUT OF THE SHIPPED CATALOGUE — D1, decided 2026-11-19
   * (docs/rebalance/v0.1/decisions/D1-option-c.md): the definition stays in
   * this file so the measurements it produced remain reproducible, but the
   * player is never offered it and `applyResearchTech` refuses to sell it
   * until the well build policy (D2) and the money sinks (D4) are settled.
   * Bringing it back is one flag, and the price (+1/tick for 50) is still the
   * open question it was when it was measured.
   */
  wellShafts: {
    id: "wellShafts",
    displayName: "Well Shafts",
    cost: 50,
    age: 1,
    effect: "wellWater",
    shipped: false,
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
