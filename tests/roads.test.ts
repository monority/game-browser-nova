import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import { type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { allRoadCells } from "@/domain/road/road.js";
import { BUILDING_DEFINITIONS } from "@/content/buildings.js";
import { stockedState, freeCell, mustOk, stripToAnchor } from "./helpers.js";

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
  return stockedState(CONFIG);
}

describe("road placement validation", () => {
  it("rejects blocked terrain; roads may cross deposits (buildings may not)", () => {
    const state = freshState();
    stripToAnchor(state);
    const blocked = Object.keys(state.world.blockedCells)[0];
    // The seed is part of the fixture: if it ever stops producing a blocked
    // cell, this test must fail rather than quietly assert nothing.
    if (!blocked) throw new Error("seed build-test kept no blocked cell");
    expect(applyCommand(state, { kind: "placeRoads", cells: [blocked] })).toEqual({
      ok: false,
      reason: "blockedCell",
    });
    // pinned contract: unlike buildings, roads may cross deposit cells
    expect(applyCommand(state, { kind: "placeRoads", cells: [cellKey(5, 5)] })).toEqual({
      ok: true,
    });
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
