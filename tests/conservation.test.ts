import { describe, expect, it } from "vitest";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { emptyTickFlows, stepSimulation, stepTicks } from "@/domain/simulation/tick.js";
import {
  SaveValidationError,
  parseSave,
  parseSaveString,
  saveToString,
  serialize,
} from "@/application/persistence/save.js";
import { FOOD_SPOILAGE_RATE_PER_TICK } from "@/content/conservation.js";
import { spoilFood } from "@/domain/storage/spoilage.js";
import { stripToAnchor } from "./helpers.js";

/**
 * Food conservation (Step067) — docs/roadmap/Step056-food-preservation-design.md.
 *
 * Locked here: the proportional law, the carried fraction, the phase order
 * (after production, before consumption), the absence of water degradation,
 * the save v19 migration and bit-identical determinism.
 */

const CONFIG = { seed: "conservation-test", width: 16, height: 16 };

function freshState(): GameState {
  return createInitialState(CONFIG);
}

/** Only the Colony Center: one food/tick of trickle, no consumers. */
function anchoredState(): GameState {
  const state = freshState();
  stripToAnchor(state);
  state.population = 0;
  return state;
}

describe("conservation law (Step067)", () => {
  it("is the approved experimental rate, owned by content", () => {
    expect(FOOD_SPOILAGE_RATE_PER_TICK).toBe(0.03);
  });

  it("takes whole units and carries the fraction, so no stock is spared", () => {
    // 60 × 3% = 1.8 → one unit leaves, 0.8 is carried (binary floats, hence
    // the closeness assertion rather than equality)
    const first = spoilFood(60, 0);
    expect(first.spoiled).toBe(1);
    expect(first.carry).toBeCloseTo(0.8, 10);
    // 60 × 3% + 0.8 = 2.6 → two units leave, 0.6 is carried
    const second = spoilFood(60, 0.8);
    expect(second.spoiled).toBe(2);
    expect(second.carry).toBeCloseTo(0.6, 10);

    // Without the carry, 3% of 30 (0.9) would round to nothing forever; with
    // it, the second tick takes the unit the first one could not.
    const thirty = spoilFood(30, 0);
    expect(thirty.spoiled).toBe(0);
    expect(spoilFood(30, thirty.carry).spoiled).toBe(1);
    // the remainder is always a proper fraction: no unit is lost twice
    expect(thirty.carry).toBeGreaterThanOrEqual(0);
    expect(thirty.carry).toBeLessThan(1);
  });

  it("spoils the produced stock, never the pre-production one", () => {
    // 33 food + 1 trickle = 34 → 3% of 34 = 1.02 → one unit leaves.
    // The pre-production variant (3% of 33 = 0.99) would leave the stock at 34.
    // (spoil-before-consume needs an eater to be observable: pinned by the
    // real-tick agreement in `cockpit-forecast` and `food-reserve`.)
    const state = anchoredState();
    state.resources.food = 33;
    const flows = emptyTickFlows();
    stepSimulation(state, flows);
    expect(flows.foodSpoiled).toBe(1);
    expect(state.resources.food).toBe(33);

    // the law spends food only: a colony with no wells keeps its water
    state.resources.water = 40;
    stepTicks(state, 50);
    expect(state.resources.water).toBe(40);
    expect(state.resources.food).toBeLessThan(50); // 50 ticks of trickle, spent by the law
  });

  it("keeps the food ledger closed every tick", () => {
    const state = freshState();
    const flows = emptyTickFlows();
    let stock = state.resources.food;
    for (let i = 0; i < 300; i++) {
      stepSimulation(state, flows);
      expect(state.resources.food).toBe(
        stock + flows.foodProduced - flows.foodConsumed - flows.foodSpoiled - flows.foodWasted,
      );
      expect(state.resources.food).toBeGreaterThanOrEqual(0);
      stock = state.resources.food;
    }
  });

});

describe("conservation persistence (save v19)", () => {
  it("round-trips a non-zero carried fraction and keeps the trajectory", () => {
    const state = freshState();
    stepTicks(state, 7);
    expect(state.foodSpoilCarry).toBeGreaterThan(0);
    const restored = parseSave(serialize(state));
    expect(restored).toEqual(state);
    expect(parseSaveString(saveToString(state))).toEqual(state);

    // a saved/loaded colony evolves exactly like the one that never reloaded
    const control = parseSave(serialize(state));
    stepTicks(state, 50);
    stepTicks(control, 50);
    expect(control).toEqual(state);
  });

  it("migrates v18 without touching the stocks and starts the carry at 0", () => {
    const state = freshState();
    stepTicks(state, 12);
    const document: Record<string, unknown> = { ...serialize(state) };
    delete document.foodSpoilCarry;
    document.formatVersion = 18;
    const migrated = parseSave(document);
    expect(migrated.resources).toEqual(state.resources); // no food destroyed
    expect(migrated.foodSpoilCarry).toBe(0);
    expect(migrated.resources.food).toBe(state.resources.food);
  });

  it("rejects a carried fraction that is not a proper fraction", () => {
    const document: Record<string, unknown> = { ...serialize(freshState()) };
    expect(() => parseSave({ ...document, foodSpoilCarry: 1 })).toThrow(SaveValidationError);
    expect(() => parseSave({ ...document, foodSpoilCarry: -0.1 })).toThrow(SaveValidationError);
    expect(() => parseSave({ ...document, foodSpoilCarry: undefined })).toThrow(SaveValidationError);
  });
});
