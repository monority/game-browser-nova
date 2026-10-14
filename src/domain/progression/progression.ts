import type { GameState } from "../simulation/state.js";
import { isActive } from "../building/building.js";
import { TECH_DEFINITIONS, type TechEffect } from "../../content/techs.js";
import {
  AGE_MILESTONES,
  STARTING_AGE,
  type MilestoneDefinition,
  type MilestoneDimension,
} from "../../content/progression.js";

/**
 * Progression domain (docs/game/07-PROGRESSION.md): technologies with
 * system effects, milestones evaluated from canonical facts, age
 * transition gated on the full milestone set (player-triggered).
 */

export function hasTech(state: GameState, techId: string): boolean {
  return state.researchedTechs.includes(techId);
}

/** Number of researched techs carrying the given effect (additive stacking). */
export function techLevel(state: GameState, effect: TechEffect): number {
  let level = 0;
  for (const id of state.researchedTechs) {
    if (TECH_DEFINITIONS[id]?.effect === effect) level += 1;
  }
  return level;
}

function milestoneValue(state: GameState, definition: MilestoneDefinition): number {
  const dimension: MilestoneDimension = definition.dimension;
  switch (dimension) {
    case "population":
      return state.population;
    case "buildings": {
      let count = 0;
      for (const building of Object.values(state.buildings)) {
        if (!isActive(building)) continue;
        // Step024: optional type filter reuses the buildings dimension
        // (mothballed buildings un-complete, like upkeep and commerce).
        if (definition.buildingType !== undefined && building.type !== definition.buildingType) continue;
        count += 1;
      }
      return count;
    }
    case "treasury":
      return state.resources.money;
    case "techs":
      return state.researchedTechs.length;
  }
}

export interface MilestoneStatus {
  id: string;
  label: string;
  threshold: number;
  value: number;
  done: boolean;
}

export function evaluateMilestones(state: GameState, age: number): MilestoneStatus[] {
  const definitions = AGE_MILESTONES[age] ?? [];
  return definitions.map((definition) => {
    const value = milestoneValue(state, definition);
    return {
      id: definition.id,
      label: definition.label,
      threshold: definition.threshold,
      value,
      done: value >= definition.threshold,
    };
  });
}

export function canAdvanceAge(state: GameState): boolean {
  const milestones = evaluateMilestones(state, state.age);
  return (
    milestones.length > 0 && milestones.every((m) => m.done)
  );
}

export const PROGRESSION_STARTING_AGE = STARTING_AGE;
