import { describe, expect, it } from "vitest";
import { cellKey } from "../src/domain/shared/cells.js";
import { createInitialState, type GameState } from "../src/domain/simulation/state.js";
import { applyCommand } from "../src/domain/simulation/commands.js";
import { stepTicks } from "../src/domain/simulation/tick.js";
import {
  evaluateMilestones,
  canAdvanceAge,
  hasTech,
  techLevel,
} from "../src/domain/progression/progression.js";
import { getResourceSummaries } from "../src/application/queries/analysis.js";
import {
  SAVE_VERSION,
  MIGRATABLE_SAVE_VERSION,
  parseSave,
  serialize,
} from "../src/application/persistence/save.js";
import { freeCell, mustOk } from "./helpers.js";

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
    state.resources.money = 300;
    mustOk(applyCommand(state, { kind: "researchTech", techId: "cropRotation" }));
    mustOk(applyCommand(state, { kind: "researchTech", techId: "masonry" }));
    expect(techLevel(state, "farmFood")).toBe(1);
    expect(techLevel(state, "quarryStone")).toBe(1);
    // full effect verified through a staffed farm: per-farm yield 2 + 1 tech
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(0, 0)] }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: 1, y: 0 }));
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
    state.resources.money = 300;
    state.resources.water = 2;
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(0, 0)] }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: 1, y: 0 }));
    stepTicks(state, 2); // operational, connected, vacant
    mustOk(applyCommand(state, { kind: "researchTech", techId: "tradeRoutes" }));
    const before = state.resources.money;
    stepTicks(state, 1);
    // +2 base +1 tech commerce −1 maintenance → net +2
    expect(state.resources.money).toBe(before + 2);
  });
});

describe("milestones + age transition", () => {
  it("age 1 starts with 4 incomplete milestones", () => {
    const state = freshState();
    const milestones = evaluateMilestones(state, 1);
    expect(milestones.length).toBe(4);
    expect(milestones.every((m) => !m.done)).toBe(true);
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
    // age-2 milestones now evaluated
    expect(evaluateMilestones(state, 2).length).toBe(4);
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
