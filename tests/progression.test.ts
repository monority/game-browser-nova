import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import {
  evaluateMilestones,
  canAdvanceAge,
  hasTech,
  techLevel,
} from "@/domain/progression/progression.js";
import { getResourceSummaries } from "@/application/queries/analysis.js";
import { SAVE_VERSION, parseSave, serialize } from "@/application/persistence/save.js";
import { adjacentFree, freeCell, mustOk, stripToAnchor } from "./helpers.js";
import { AGE_NAMES } from "@/content/progression.js";

const CONFIG = { seed: "progression-test", width: 16, height: 16 };

function freshState(): GameState {
  return createInitialState(CONFIG);
}

function staffedBuilding(state: GameState, type: "farm" | "workshop"): void {
  const road = freeCell(state);
  mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
  const adj = adjacentFree(state, road.x, road.y);
  mustOk(applyCommand(state, { kind: "placeBuilding", type, x: adj.x, y: adj.y }));
}

describe("technology research", () => {
  it("pays once, records, and refuses unknown, later-age and unaffordable techs", () => {
    const state = freshState();
    state.resources.money = 100;
    mustOk(applyCommand(state, { kind: "researchTech", techId: "cropRotation" }));
    expect(state.researchedTechs).toEqual(["cropRotation"]);
    expect(state.resources.money).toBe(50);
    expect(
      applyCommand(state, { kind: "researchTech", techId: "cropRotation" }),
    ).toEqual({ ok: false, reason: "alreadyResearched" });
    expect(state.researchedTechs).toHaveLength(1);

    expect(applyCommand(state, { kind: "researchTech", techId: "nope" })).toEqual({
      ok: false,
      reason: "unknownTech",
    });
    expect(
      applyCommand(state, { kind: "researchTech", techId: "irrigation" }),
    ).toEqual({ ok: false, reason: "techRequiresLaterAge" });
    state.resources.money = 10;
    expect(applyCommand(state, { kind: "researchTech", techId: "masonry" })).toEqual({
      ok: false,
      reason: "insufficientMoney",
    });

    // age-2 techs unlock after advancing
    state.age = 2;
    state.resources.money = 200;
    mustOk(applyCommand(state, { kind: "researchTech", techId: "irrigation" }));
    expect(hasTech(state, "irrigation")).toBe(true);
  });

  it("cropRotation feeds +1 food per farm end to end", () => {
    const state = freshState();
    stripToAnchor(state);
    state.population = 0;
    state.resources.money = 300;
    mustOk(applyCommand(state, { kind: "researchTech", techId: "cropRotation" }));
    mustOk(applyCommand(state, { kind: "researchTech", techId: "masonry" }));
    expect(techLevel(state, "farmFood")).toBe(1);
    expect(techLevel(state, "quarryStone")).toBe(1);
    staffedBuilding(state, "farm");
    state.population = 1;
    stepTicks(state, 2); // staffed end of tick 2
    // staffed farm (2 + 1 tech) + Center trickle (1)
    expect(getResourceSummaries(state).food.productionPerTick).toBe(4);
    const before = state.resources.food;
    stepTicks(state, 1); // +4 production − 1 consumption
    expect(state.resources.food).toBe(before + 3);
  });

  it("tradeRoutes adds +1 commerce per connected workshop", () => {
    const state = freshState();
    stripToAnchor(state);
    state.population = 0;
    state.resources.money = 300;
    state.resources.water = 2;
    staffedBuilding(state, "workshop");
    state.population = 8; // unlocks the commerce floor (Step021 gate)
    stepTicks(state, 2); // operational, connected, vacant
    mustOk(applyCommand(state, { kind: "researchTech", techId: "tradeRoutes" }));
    const before = state.resources.money;
    stepTicks(state, 1);
    // +8 taxes +3 commerce (2 base + 1 tech) −1 maintenance → net +10
    expect(state.resources.money).toBe(before + 10);
  });
});

describe("milestones + age transition", () => {
  it("D2 satisfies the two fact milestones; the gate needs the player-earned half", () => {
    const state = freshState();
    const milestones = evaluateMilestones(state, 1);
    expect(milestones).toHaveLength(4);
    expect(Object.fromEntries(milestones.map((m) => [m.id, m.done]))).toEqual({
      pop8: true, bld8: true, tre200: false, tech3: false,
    });
    expect(canAdvanceAge(state)).toBe(false);
    expect(applyCommand(state, { kind: "advanceAge" })).toEqual({
      ok: false,
      reason: "milestonesIncomplete",
    });

    state.resources.money = 1000;
    state.population = 8;
    for (let i = 0; i < 8; i++) {
      const spot = freeCell(state);
      mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: spot.x, y: spot.y }));
    }
    stepTicks(state, 2); // residences operational (the milestone counts active buildings)
    for (const techId of ["cropRotation", "masonry", "tradeRoutes"]) {
      applyCommand(state, { kind: "researchTech", techId });
    }
    state.resources.money = 250;
    expect(canAdvanceAge(state)).toBe(true);
    mustOk(applyCommand(state, { kind: "advanceAge" }));
    expect(state.age).toBe(2);
    // age-2 keeps the four Step021 dimensions (the Step024 market1 milestone
    // left with the market in Step065)
    expect(evaluateMilestones(state, 2)).toHaveLength(4);
  });

  it("milestones are derived from canonical facts, never persisted progress", () => {
    const state = freshState();
    state.population = 8;
    expect(evaluateMilestones(state, 1).find((m) => m.id === "pop8")?.done).toBe(true);
    state.population = 2;
    expect(evaluateMilestones(state, 1).find((m) => m.id === "pop8")?.done).toBe(false);
  });
});

describe("age-3 prosperity set (Step035)", () => {
  function age3State(): GameState {
    const state = freshState();
    state.age = 3;
    state.resources.money = 5000;
    state.resources.planks = 20;
    return state;
  }

  function completeColony(state: GameState): void {
    // D2 ships 10 res / 2 shops / 22 buildings; top up to thresholds. Milestones
    // read operational+active only — no roads or staffing needed.
    for (let i = 0; i < 10; i++) {
      const cell = freeCell(state);
      mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: cell.x, y: cell.y }));
    }
    const shop = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: shop.x, y: shop.y }));
    stepTicks(state, 2);
    state.population = 20;
  }

  function statusOf(state: GameState) {
    const found = evaluateMilestones(state, 3);
    if (found.length !== 5) throw new Error("age-3 set must have 5 entries");
    return Object.fromEntries(found.map((m) => [m.id, m.done]));
  }

  it("has 5 entries, gates on the treasury and un-completes when shops are mothballed", () => {
    expect(AGE_NAMES[3]).toBe("Age of Prosperity");
    const baseline = age3State(); // D2: pop10, 22 buildings, 10 res, 2 shops
    expect(statusOf(baseline)).toEqual({
      pop20: false, tre1500: true, bld30: false, res20: false, shop3: false,
    });
    expect(canAdvanceAge(baseline)).toBe(false);

    const short = age3State();
    completeColony(short);
    short.resources.money = 1000; // everything else done; treasury short
    expect(statusOf(short)).toEqual({
      pop20: true, tre1500: false, bld30: true, res20: true, shop3: true,
    });
    expect(canAdvanceAge(short)).toBe(false);
    expect(applyCommand(short, { kind: "advanceAge" })).toEqual({
      ok: false,
      reason: "milestonesIncomplete",
    });
    short.resources.money = 2000;
    expect(canAdvanceAge(short)).toBe(true);

    const shopsOff = age3State();
    completeColony(shopsOff);
    const shop3 = () => evaluateMilestones(shopsOff, 3).find((m) => m.id === "shop3");
    expect(shop3()?.done).toBe(true);
    for (const id of Object.keys(shopsOff.buildings).filter(
      (k) => shopsOff.buildings[k]?.type === "workshop",
    )) {
      mustOk(applyCommand(shopsOff, { kind: "setBuildingActive", id, active: false }));
    }
    expect(shop3()).toMatchObject({ value: 0, done: false });
  });
});

describe("progression persistence", () => {
  it("round-trips age + techs, migrates v15, rejects unknown techs, and stays deterministic", () => {
    expect(SAVE_VERSION).toBe(18);
    const state = freshState();
    state.age = 2;
    state.researchedTechs = ["cropRotation", "masonry"];
    const restored = parseSave(serialize(state));
    expect(restored).toEqual(state);

    const v15state = freshState();
    v15state.resources.money = 77;
    const doc = serialize(v15state) as unknown as Record<string, unknown>;
    const v15 = { ...doc, formatVersion: 15 } as Record<string, unknown>;
    delete v15.age;
    delete v15.researchedTechs;
    const migrated = parseSave(v15);
    expect(migrated.age).toBe(1);
    expect(migrated.researchedTechs).toEqual([]);
    expect(migrated.resources.money).toBe(77);
    expect(migrated.pollution).toBe(0);

    const corrupt = { ...(serialize(freshState()) as unknown as Record<string, unknown>), researchedTechs: ["teleportation"] };
    expect(() => parseSave(corrupt)).toThrow(/unknown tech/);

    const a = freshState();
    const b = freshState();
    for (const s of [a, b]) {
      s.resources.money = 300;
      applyCommand(s, { kind: "researchTech", techId: "cropRotation" });
      applyCommand(s, { kind: "researchTech", techId: "masonry" });
      stepTicks(s, 5);
    }
    expect(b).toEqual(a);
  });
});
