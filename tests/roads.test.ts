import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { allRoadCells } from "@/domain/road/road.js";
import { BUILDING_DEFINITIONS } from "@/content/buildings.js";
import { freeCell, mustOk, stripToAnchor } from "./helpers.js";

/**
 * Road-specific contracts (Step048 backfill, audit coverage gap): the
 * placement cost/dedupe/overlap cases live in buildings.test.ts; this
 * suite centralizes the rest — geometry validation, canonical storage,
 * and removal semantics.
 */

const CONFIG = {
  seed: "build-test", // proven D2-compatible seed (same as buildings.test.ts)
  width: 16,
  height: 16,
  woodDeposits: [{ x: 5, y: 5, amount: 6 }],
  stoneDeposits: [{ x: 10, y: 10, amount: 6 }],
};

function freshState(): GameState {
  return createInitialState(CONFIG);
}

describe("road placement validation", () => {
  it("rejects cells outside the world bounds", () => {
    const state = freshState();
    stripToAnchor(state);
    expect(applyCommand(state, { kind: "placeRoads", cells: [cellKey(-1, 0)] })).toEqual({
      ok: false,
      reason: "outOfBounds",
    });
    expect(
      applyCommand(state, { kind: "placeRoads", cells: [cellKey(0, 16)] }),
    ).toEqual({ ok: false, reason: "outOfBounds" });
  });

  it("rejects blocked terrain; roads may cross deposits (buildings may not)", () => {
    const state = freshState();
    stripToAnchor(state);
    const blocked = Object.keys(state.world.blockedCells)[0];
    if (blocked) {
      expect(applyCommand(state, { kind: "placeRoads", cells: [blocked] })).toEqual({
        ok: false,
        reason: "blockedCell",
      });
    }
    // pinned contract: unlike buildings, roads may cross deposit cells
    expect(applyCommand(state, { kind: "placeRoads", cells: [cellKey(5, 5)] })).toEqual({
      ok: true,
    });
  });

  it("rejects cells already covered by an existing road", () => {
    const state = freshState();
    stripToAnchor(state);
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(2, 2)] }));
    expect(applyCommand(state, { kind: "placeRoads", cells: [cellKey(2, 2)] })).toEqual({
      ok: false,
      reason: "occupied",
    });
  });

  it("stores multi-cell roads in canonical order regardless of input order", () => {
    const state = freshState();
    stripToAnchor(state);
    const unordered = [cellKey(3, 1), cellKey(1, 1), cellKey(2, 1)];
    mustOk(applyCommand(state, { kind: "placeRoads", cells: unordered }));
    const road = Object.values(state.roads)[0];
    expect(road?.cells).toEqual([cellKey(1, 1), cellKey(2, 1), cellKey(3, 1)]);
  });
});

describe("road removal semantics", () => {
  it("partial removal keeps the road object minus the cell; full removal deletes it", () => {
    const state = freshState();
    stripToAnchor(state);
    mustOk(
      applyCommand(state, {
        kind: "placeRoads",
        cells: [cellKey(1, 2), cellKey(2, 2)],
      }),
    );
    const roadId = Object.keys(state.roads)[0];
    if (!roadId) throw new Error("road missing");

    mustOk(applyCommand(state, { kind: "removeRoads", cells: [cellKey(1, 2)] }));
    expect(state.roads[roadId]?.cells).toEqual([cellKey(2, 2)]);
    expect(allRoadCells(state.roads).has(cellKey(1, 2))).toBe(false);

    mustOk(applyCommand(state, { kind: "removeRoads", cells: [cellKey(2, 2)] }));
    expect(state.roads[roadId]).toBeUndefined();
  });

  it("removal is free (no refund) and frees the cell for construction", () => {
    const state = freshState();
    stripToAnchor(state);
    const spot = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(spot.x, spot.y)] }));
    const moneyAfterPlacement = state.resources.money;

    mustOk(applyCommand(state, { kind: "removeRoads", cells: [cellKey(spot.x, spot.y)] }));
    expect(state.resources.money).toBe(moneyAfterPlacement);

    const farm = BUILDING_DEFINITIONS.farm;
    expect(
      applyCommand(state, { kind: "placeBuilding", type: "farm", x: spot.x, y: spot.y }),
    ).toEqual({ ok: true });
    expect(state.resources.money).toBe(moneyAfterPlacement - farm.moneyCost);
  });
});
