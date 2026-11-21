import { describe, expect, it } from "vitest";
import { type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { forestProjection } from "@/domain/resource/forest.js";
import { depositLine, forestSummaryLine, woodLine } from "@/application/queries/forest.js";
import { getAlerts } from "@/application/queries/analysis.js";
import { mustOk, stockedState, stripToAnchor } from "./helpers.js";

/**
 * The wood system (2026-11-21): the projection must state what the tick will
 * actually do — extraction capped by reach, regrowth capped by room, and a
 * countdown that walks the real order instead of dividing the stock by a rate
 * that changes as cells empty.
 *
 * Fixtures place real buildings through the command layer; only `staffed` is
 * set by hand, because the assignment law is not under test here (jobs.test.ts
 * owns it) and running the tick would extract before the reading is taken.
 */

const CONFIG = {
  seed: "forest-test",
  width: 20,
  height: 20,
  woodDeposits: [{ x: 3, y: 3, amount: 10 }],
  stoneDeposits: [],
};

function baseState(config = CONFIG): GameState {
  const state = stockedState(config);
  stripToAnchor(state);
  state.population = 0;
  return state;
}

function place(state: GameState, type: "lumberCamp" | "park", x: number, y: number): string {
  mustOk(applyCommand(state, { kind: "placeBuilding", type, x, y }));
  const id = Object.keys(state.buildings).find((key) => {
    const building = state.buildings[key];
    return building?.type === type && building.x === x && building.y === y;
  });
  if (!id) throw new Error(`missing ${type} at ${x},${y}`);
  // The two-tick construction is tested where it belongs (buildings.test.ts);
  // this fixture reads the completed building.
  state.buildings[id]!.status = "operational";
  return id;
}

function staff(state: GameState, id: string): void {
  const building = state.buildings[id];
  if (!building) throw new Error("missing building");
  building.staffed = true;
}

describe("wood projection", () => {
  it("reads what a camp takes, and how long the ground lasts", () => {
    const state = baseState();
    staff(state, place(state, "lumberCamp", 4, 3));

    const forest = forestProjection(state);
    expect(forest.remaining).toBe(10);
    expect(forest.capacity).toBe(10);
    expect(forest.extractionPerTick).toBe(2);
    expect(forest.regrowthPerTick).toBe(0);
    expect(forest.netPerTick).toBe(-2);
    // 10 wood at 2/tick, nothing put back.
    expect(forest.ticksToEmpty).toBe(5);
    expect(forest.starvedCamps).toBe(0);
  });

  it("counts the ground down with an information line, not a warning", () => {
    const state = baseState();
    staff(state, place(state, "lumberCamp", 4, 3));

    const woodAlerts = getAlerts(state).filter((a) => a.message.startsWith("Wood:"));
    expect(woodAlerts).toEqual([
      { severity: "info", message: "Wood: -2/tick · 10 in the ground → 5 ticks" },
    ]);
  });

  it("a park with no deposit in reach grows nothing, and the line says so", () => {
    const state = baseState();
    staff(state, place(state, "lumberCamp", 4, 3));
    const parkId = place(state, "park", 12, 12);

    const forest = forestProjection(state);
    expect(forest.regrowthPerTick).toBe(0);
    expect(forest.idleParks).toBe(1);
    expect(woodLine(state, state.buildings[parkId]!)).toBe(
      "Regrowth: no wood deposit adjacent (grows nothing)",
    );
  });

  it("one park halves the drain and settles the ground at its last unit", () => {
    const state = baseState();
    staff(state, place(state, "lumberCamp", 4, 3));
    place(state, "park", 3, 4);

    const forest = forestProjection(state);
    expect(forest.extractionPerTick).toBe(2);
    expect(forest.regrowthPerTick).toBe(1);
    expect(forest.netPerTick).toBe(-1);
    // The ground falls to exactly one unit and stays there: extract 1, regrow 1.
    // A countdown of stock/|net| would have promised 10 ticks and been wrong.
    expect(forest.ticksToEmpty).toBeNull();
  });

  it("two parks make the ground hold: no countdown, no alert", () => {
    const state = baseState();
    staff(state, place(state, "lumberCamp", 4, 3));
    place(state, "park", 3, 4);
    place(state, "park", 2, 3);

    const forest = forestProjection(state);
    expect(forest.regrowthPerTick).toBe(2);
    expect(forest.netPerTick).toBe(0);
    expect(forest.ticksToEmpty).toBeNull();

    const woodAlerts = getAlerts(state).filter((a) => a.message.startsWith("Wood:"));
    expect(woodAlerts).toEqual([]);
  });

  it("a park regrows into the room the camp opens, not the room it sees at rest", () => {
    const state = baseState();
    staff(state, place(state, "lumberCamp", 4, 3));
    place(state, "park", 3, 4);

    const forest = forestProjection(state);
    expect(forest.remaining).toBe(forest.capacity);
    // At rest the ground is full and there is no room; the tick takes 2 first,
    // so the park does find room. The hover reports the standing state.
    expect(forest.parks[0]?.room).toBe(2);
    expect(forest.parks[0]?.regrowsPerTick).toBe(1);
    expect(depositLine(state, 3, 3)).toBe("Wood deposit · 10/10 · 1 park(s) tending · at capacity");
  });

  it("an exhausted deposit still reads as a deposit, and the dry camp raises a warning", () => {
    const state = baseState();
    const campId = place(state, "lumberCamp", 4, 3);
    staff(state, campId);
    const deposit = state.woodDeposits["3,3"];
    if (!deposit) throw new Error("missing deposit");
    deposit.remaining = 0;

    const forest = forestProjection(state);
    expect(forest.starvedCamps).toBe(1);
    expect(forest.ticksToEmpty).toBeNull();
    expect(woodLine(state, state.buildings[campId]!)).toBe(
      "Wood in reach: none · 0/tick (holds a worker, produces nothing)",
    );
    expect(depositLine(state, 3, 3)).toBe("Wood deposit · 0/10");

    const alerts = getAlerts(state);
    expect(alerts).toContainEqual({
      severity: "warning",
      message: "Wood: 1 camp(s) with no deposit in reach",
    });
  });
});

describe("the anchor's trickle", () => {
  it("is dead when no deposit is orthogonal to the Colony Center", () => {
    const state = baseState();
    const center = Object.values(state.buildings).find((b) => b.type === "colonyCenter");
    if (!center) throw new Error("missing anchor");

    const forest = forestProjection(state);
    expect(forest.centerBlocked).toBe(true);
    expect(forest.sites.find((s) => s.kind === "colonyCenter")?.perTick).toBe(0);
    expect(woodLine(state, center)).toBe("Wood trickle: no deposit in reach (0/1 per tick)");
  });

  it("produces when the anchor does touch a deposit", () => {
    const state = baseState();
    const center = Object.values(state.buildings).find((b) => b.type === "colonyCenter");
    if (!center) throw new Error("missing anchor");
    // The generated world decides where the anchor sits; put the deposit where
    // the law looks for it rather than guessing a coordinate.
    state.woodDeposits = { [`${center.x},${center.y + 1}`]: { remaining: 4, capacity: 4 } };

    const forest = forestProjection(state);
    expect(forest.centerBlocked).toBe(false);
    expect(forest.extractionPerTick).toBe(1);
    expect(forest.ticksToEmpty).toBe(4);
    expect(woodLine(state, center)).toBe("Wood trickle: 4 in reach · +1/tick");
  });
});

describe("forest summary", () => {
  it("states stock, both flows and the horizon in one line", () => {
    const state = baseState();
    staff(state, place(state, "lumberCamp", 4, 3));
    place(state, "park", 3, 4);
    expect(forestSummaryLine(state)).toBe(
      "Wood: 10/10 in the ground · 2/tick out · 1/tick regrown · sustainable",
    );
  });
});
