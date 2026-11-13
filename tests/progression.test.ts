import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import { hasTech } from "@/domain/progression/progression.js";
import { SAVE_VERSION, parseSave, serialize } from "@/application/persistence/save.js";
import { adjacentFree, freeCell, mustOk, stripToAnchor } from "./helpers.js";

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


describe("progression persistence", () => {
  it("round-trips age + techs, migrates v15, rejects unknown techs, and stays deterministic", () => {
    expect(SAVE_VERSION).toBe(19);
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
