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
import {
  SAVE_VERSION,
  MIGRATABLE_SAVE_VERSION,
  parseSave,
  serialize,
} from "@/application/persistence/save.js";
import { adjacentFree, freeCell, mustOk, stripToAnchor } from "./helpers.js";
import { AGE_NAMES } from "@/content/progression.js";

const CONFIG = { seed: "progression-test", width: 16, height: 16 };

function freshState(): GameState {
  return createInitialState(CONFIG);
}

describe("technology research", () => {
  it("researches an age-1 tech: paid, recorded, one-shot", () => {
    const state = freshState();
    state.resources.money = 100;
    mustOk(applyCommand(state, { kind: "researchTech", techId: "cropRotation" }));
    expect(state.researchedTechs).toEqual(["cropRotation"]);
    expect(state.resources.money).toBe(50);
    expect(
      applyCommand(state, { kind: "researchTech", techId: "cropRotation" }),
    ).toEqual({ ok: false, reason: "alreadyResearched" });
    expect(state.researchedTechs.length).toBe(1);
  });

  it("rejects unknown techs, later-age techs and insufficient money", () => {
    const state = freshState();
    expect(applyCommand(state, { kind: "researchTech", techId: "nope" })).toEqual({
      ok: false,
      reason: "unknownTech",
    });
    expect(
      applyCommand(state, { kind: "researchTech", techId: "irrigation" }),
    ).toEqual({ ok: false, reason: "techRequiresLaterAge" });
    state.resources.money = 10;
    expect(applyCommand(state, { kind: "researchTech", techId: "cropRotation" })).toEqual({
      ok: false,
      reason: "insufficientMoney",
    });
  });

  it("age-2 techs unlock after advancing", () => {
    const state = freshState();
    state.age = 2;
    state.resources.money = 200;
    mustOk(applyCommand(state, { kind: "researchTech", techId: "irrigation" }));
    expect(hasTech(state, "irrigation")).toBe(true);
  });

  it("effects: cropRotation +1 food per farm; masonry +1 stone per quarry", () => {
    const state = freshState();
    stripToAnchor(state);
    state.population = 0;
    state.resources.money = 300;
    mustOk(applyCommand(state, { kind: "researchTech", techId: "cropRotation" }));
    mustOk(applyCommand(state, { kind: "researchTech", techId: "masonry" }));
    expect(techLevel(state, "farmFood")).toBe(1);
    expect(techLevel(state, "quarryStone")).toBe(1);
    // full effect verified through a staffed farm: per-farm yield 2 + 1 tech
    const road = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
    const adj = adjacentFree(state, road.x, road.y);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: adj.x, y: adj.y }));
    state.population = 1;
    stepTicks(state, 2); // staffed end of tick 2
    const summaries = getResourceSummaries(state);
    // staffed farm (2 + 1 tech) + Center trickle (1)
    expect(summaries.food.productionPerTick).toBe(4);
    const before = state.resources.food;
    stepTicks(state, 1); // +4 production − 1 consumption = +3
    expect(state.resources.food).toBe(before + 3);
  });

  it("effects: tradeRoutes adds +1 commerce per connected workshop", () => {
    const state = freshState();
    stripToAnchor(state);
    state.population = 0;
    state.resources.money = 300;
    state.resources.water = 2;
    const road = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
    const adj = adjacentFree(state, road.x, road.y);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: adj.x, y: adj.y }));
    state.population = 8; // unlocks the commerce floor (Step021 gate)
    stepTicks(state, 2); // operational, connected, vacant
    mustOk(applyCommand(state, { kind: "researchTech", techId: "tradeRoutes" }));
    const before = state.resources.money;
    stepTicks(state, 1);
    // +8 taxes +3 commerce (2 base + 1 tech) -1 maintenance ? net +10
    expect(state.resources.money).toBe(before + 10);
  });
});

describe("milestones + age transition", () => {
  it("D2 day-0 satisfies pop8 and buildings; treasury and techs remain", () => {
    const state = freshState();
    const milestones = evaluateMilestones(state, 1);
    expect(milestones.length).toBe(4);
    // the D2 colony (10 pop, 22 buildings) completes pop8 + bld8 on day 0;
    // Specialization (techs) and surplus (treasury) are the player-earned half
    const done = Object.fromEntries(milestones.map((m) => [m.id, m.done]));
    expect(done).toEqual({ pop8: true, bld8: true, tre200: false, tech3: false });
    expect(canAdvanceAge(state)).toBe(false);
  });

  it("advanceAge is gated on the full milestone set", () => {
    const state = freshState();
    expect(applyCommand(state, { kind: "advanceAge" })).toEqual({
      ok: false,
      reason: "milestonesIncomplete",
    });
    // satisfy: pop 8, 8 buildings, treasury 200, 3 techs
    state.resources.money = 1000;
    state.population = 8;
    for (let i = 0; i < 8; i++) {
      const spot = freeCell(state);
      mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: spot.x, y: spot.y }));
    }
    stepTicks(state, 2); // residences operational (the milestone counts active buildings)
    applyCommand(state, { kind: "researchTech", techId: "cropRotation" });
    applyCommand(state, { kind: "researchTech", techId: "masonry" });
    applyCommand(state, { kind: "researchTech", techId: "tradeRoutes" });
    state.resources.money = 250;
    expect(canAdvanceAge(state)).toBe(true);
    mustOk(applyCommand(state, { kind: "advanceAge" }));
    expect(state.age).toBe(2);
    // age-2 milestones now evaluated (5 with Step024 market1)
    expect(evaluateMilestones(state, 2).length).toBe(5);
  });

  it("milestones are derived from canonical facts (no persisted progress)", () => {
    const state = freshState();
    state.population = 8;
    const milestones = evaluateMilestones(state, 1);
    expect(milestones.find((m) => m.id === "pop8")?.done).toBe(true);
    // undoing the fact undoes the milestone (derived, never stored)
    state.population = 2;
    expect(evaluateMilestones(state, 1).find((m) => m.id === "pop8")?.done).toBe(false);
  });
});

describe("market1 milestone (Step024)", () => {
    function marketState(): GameState {
      const state = freshState();
      state.age = 2;
      state.resources.money = 500;
      state.resources.planks = 10;
      return state;
    }

    function placeMarket(state: GameState): string {
      const road = freeCell(state);
      mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
      const adj = adjacentFree(state, road.x, road.y);
      mustOk(applyCommand(state, { kind: "placeBuilding", type: "market", x: adj.x, y: adj.y }));
      stepTicks(state, 2); // operational
      const id = Object.keys(state.buildings).find((k) => state.buildings[k]?.type === "market");
      if (!id) throw new Error("market missing");
      return id;
    }

    function marketStatus(state: GameState) {
      const found = evaluateMilestones(state, 2).find((m) => m.id === "market1");
      if (!found) throw new Error("market1 missing from age-2 set");
      return found;
    }

    it("age-2 set has 5 entries; market1 incomplete with no market", () => {
      const state = marketState();
      // D2 ships no markets
      expect(Object.values(state.buildings).some((b) => b.type === "market")).toBe(false);
      expect(evaluateMilestones(state, 2).length).toBe(5);
      expect(marketStatus(state)).toMatchObject({ threshold: 1, value: 0, done: false });
    });

    it("operational market completes market1", () => {
      const state = marketState();
      placeMarket(state);
      expect(marketStatus(state)).toMatchObject({ value: 1, done: true });
    });

    it("mothballed market un-completes market1 (operational semantics)", () => {
      const state = marketState();
      const id = placeMarket(state);
      expect(marketStatus(state).done).toBe(true);
      mustOk(applyCommand(state, { kind: "setBuildingActive", id, active: false }));
      expect(marketStatus(state)).toMatchObject({ value: 0, done: false });
      mustOk(applyCommand(state, { kind: "setBuildingActive", id, active: true }));
      expect(marketStatus(state).done).toBe(true);
    });

    it("age 2 cannot advance when market1 is the sole unmet prerequisite", () => {
      const state = marketState();
      state.population = 15;
      state.resources.money = 1200; // 5 techs cost 450, leaving 750 >= 600
      for (const tech of ["cropRotation", "masonry", "tradeRoutes", "irrigation", "deepMining"] as const) {
        mustOk(applyCommand(state, { kind: "researchTech", techId: tech }));
      }
      // pop15 / bld14 (D2 ships 22) / tre600 / tech5 all done; market missing
      const done = Object.fromEntries(evaluateMilestones(state, 2).map((m) => [m.id, m.done]));
      expect(done).toEqual({ pop15: true, bld14: true, tre600: true, tech5: true, market1: false });
      expect(canAdvanceAge(state)).toBe(false);
      expect(applyCommand(state, { kind: "advanceAge" })).toEqual({
        ok: false,
        reason: "milestonesIncomplete",
      });
      placeMarket(state);
      expect(canAdvanceAge(state)).toBe(true);
      mustOk(applyCommand(state, { kind: "advanceAge" }));
      expect(state.age).toBe(3);
    });

    it("market1 round-trips through save/load with no migration", () => {
      expect(SAVE_VERSION).toBe(17);
      const state = marketState();
      placeMarket(state);
      const before = evaluateMilestones(state, 2);
      const restored = parseSave(serialize(state));
      expect(restored).toEqual(state);
      expect(evaluateMilestones(restored, 2)).toEqual(before);
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
      // D2 ships 10 res / 2 shops / 22 buildings; top up to thresholds.
      // Milestones read operational+active only — no roads or staffing needed.
      for (let i = 0; i < 10; i++) {
        const cell = freeCell(state);
        mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: cell.x, y: cell.y }));
      }
      const shop = freeCell(state);
      mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: shop.x, y: shop.y }));
      stepTicks(state, 2); // operational
      state.population = 20;
    }

    function age3Status(state: GameState) {
      const found = evaluateMilestones(state, 3);
      if (found.length !== 5) throw new Error("age-3 set must have 5 entries");
      return found;
    }

    it("age-3 set has 5 entries; D2 baseline completes none of the count gates", () => {
      expect(AGE_NAMES[3]).toBe("Age of Prosperity");
      const state = age3State();
      const done = Object.fromEntries(age3Status(state).map((m) => [m.id, m.done]));
      // D2: pop10, money5000 (test grant), 22 buildings, 10 res, 2 shops
      expect(done).toEqual({ pop20: false, tre1500: true, bld30: false, res20: false, shop3: false });
      expect(canAdvanceAge(state)).toBe(false);
    });

    it("age 3 cannot advance when tre1500 is the sole unmet prerequisite", () => {
      const state = age3State();
      completeColony(state);
      state.resources.money = 1000; // everything else done; treasury short
      const done = Object.fromEntries(age3Status(state).map((m) => [m.id, m.done]));
      expect(done).toEqual({ pop20: true, tre1500: false, bld30: true, res20: true, shop3: true });
      expect(canAdvanceAge(state)).toBe(false);
      expect(applyCommand(state, { kind: "advanceAge" })).toEqual({
        ok: false,
        reason: "milestonesIncomplete",
      });
      state.resources.money = 2000;
      expect(canAdvanceAge(state)).toBe(true);
    });

    it("mothballed workshops un-complete shop3 (operational semantics)", () => {
      const state = age3State();
      completeColony(state);
      state.population = 20;
      const status = () => age3Status(state).find((m) => m.id === "shop3")!;
      expect(status().done).toBe(true);
      // Mothball all three shops (D2 ships 2 + 1 built): value drops to 0.
      for (const id of Object.keys(state.buildings).filter(
        (k) => state.buildings[k]?.type === "workshop",
      )) {
        mustOk(applyCommand(state, { kind: "setBuildingActive", id, active: false }));
      }
      expect(status()).toMatchObject({ value: 0, done: false });
    });

    it("age-3 set round-trips through save/load with no migration", () => {
      expect(SAVE_VERSION).toBe(17);
      const state = age3State();
      completeColony(state);
      state.population = 20;
      state.age = 3;
      const before = evaluateMilestones(state, 3);
      const restored = parseSave(serialize(state));
      expect(restored).toEqual(state);
      expect(evaluateMilestones(restored, 3)).toEqual(before);
    });
  });

describe("progression persistence", () => {
  it("exposes SAVE_VERSION 17 with the v13 migratable chain", () => {
    expect(SAVE_VERSION).toBe(17);
    expect(MIGRATABLE_SAVE_VERSION).toBe(13);
  });

  it("round-trips age + researched techs", () => {
    const state = freshState();
    state.age = 2;
    state.researchedTechs = ["cropRotation", "masonry"];
    const migrated = parseSave(serialize(state));
    expect(migrated).toEqual(state);
    expect(migrated.age).toBe(2);
    expect(migrated.researchedTechs).toEqual(["cropRotation", "masonry"]);
  });

  it("migrates a v15 save: age 1, no techs, everything else preserved", () => {
    const state = freshState();
    state.resources.money = 77;
    const doc = serialize(state) as unknown as Record<string, unknown>;
    const v15 = { ...doc, formatVersion: 15 } as Record<string, unknown>;
    delete (v15 as Record<string, unknown>).age;
    delete (v15 as Record<string, unknown>).researchedTechs;
    const migrated = parseSave(v15);
    expect(migrated.age).toBe(1);
    expect(migrated.researchedTechs).toEqual([]);
    expect(migrated.resources.money).toBe(77);
    expect(migrated.pollution).toBe(0);
  });

  it("rejects a v16 save with an unknown tech id", () => {
    const doc = serialize(freshState()) as unknown as Record<string, unknown>;
    const v16 = { ...doc, researchedTechs: ["teleportation"] };
    expect(() => parseSave(v16)).toThrow(/unknown tech/);
  });

  it("progression is deterministic", () => {
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
