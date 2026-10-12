/**
 * Technology catalog (docs/game/07-PROGRESSION.md §5-6): a small selection
 * with system effects (never flat +% on everything). Effects are additive
 * per researched tech; the domain reads them via techLevel().
 */

export type TechEffect = "farmFood" | "quarryStone" | "workshopCommerce";

export interface TechDefinition {
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
};
