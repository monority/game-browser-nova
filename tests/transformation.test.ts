import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import type { GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import {
  PLANKS_PER_WORKSHOP_PER_TICK,
  WOOD_PER_PLANK_BATCH,
} from "@/domain/production/transformation.js";
import { assignJobs } from "@/domain/jobs/jobs.js";
import { adjacentFree, freeCell, mustOk, stockedState, stripToAnchor } from "./helpers.js";

const CONFIG = { seed: "transform-test", width: 16, height: 16 };

function freshState(): GameState {
  return stockedState(CONFIG);
}

/** Isolated colony, then a staffed, road-connected, operational workshop. */
function placeStaffedWorkshop(state: GameState): string {
  stripToAnchor(state);
  const road = freeCell(state);
  mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
  const adj = adjacentFree(state, road.x, road.y);
  state.resources.water = Math.max(state.resources.water, 1);
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: adj.x, y: adj.y }));
  state.population = 1;
  stepTicks(state, 2);
  const id = Object.keys(state.buildings).find((k) => state.buildings[k]?.type === "workshop");
  if (!id) throw new Error("workshop missing");
  // The placement charge (3 planks, D3) is not what transformation measures.
  state.resources.planks = 0;
  return id;
}

describe("transformation invariants (Step006)", () => {
  it("follows the documented recipe: −2 wood, +2 planks per staffed workshop (ADR 20/11)", () => {
    expect([WOOD_PER_PLANK_BATCH, PLANKS_PER_WORKSHOP_PER_TICK]).toEqual([2, 2]);
    const state = freshState();
    placeStaffedWorkshop(state);
    state.resources.wood = 10;
    // W1: la loi dote l'atelier avec le bois PRÉSENT à la phase d'affectation.
    // Le stocker après le dernier tick ne staffe personne — on rejoue la phase,
    // sinon ce test mesurerait l'absence de bras, pas la recette.
    assignJobs(state);
    const wood = state.resources.wood;
    const planks = state.resources.planks;
    stepTicks(state, 1);
    expect(state.resources.wood).toBe(wood - 2);
    expect(state.resources.planks).toBe(planks + 2);
  });

  it("transforms nothing without a worker or without a full batch (all-or-nothing)", () => {
    const idle = freshState();
    stripToAnchor(idle);
    idle.population = 0; // D2 ships pop 10: zero it before maturation staffing
    const road = freeCell(idle);
    mustOk(applyCommand(idle, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
    const adj = adjacentFree(idle, road.x, road.y);
    idle.resources.water = 1;
    mustOk(applyCommand(idle, { kind: "placeBuilding", type: "workshop", x: adj.x, y: adj.y }));
    idle.resources.planks = 0; // not the charge under test
    stepTicks(idle, 2);
    expect(idle.population).toBe(0);
    idle.resources.wood = 10;
    assignJobs(idle); // W1: personne, donc atelier non doté malgré le bois
    const money = idle.resources.money;
    stepTicks(idle, 1);
    expect(idle.resources.wood).toBe(10); // no transformation, no plank bonus
    expect(idle.resources.money).toBe(money - 1); // gate closed: upkeep only
    expect(idle.resources.planks).toBe(0);

    const short = freshState();
    placeStaffedWorkshop(short);
    short.resources.wood = 1;
    assignJobs(short); // un lot incomplet : la loi ne dote pas l'atelier
    stepTicks(short, 1);
    expect(short.resources).toMatchObject({ wood: 1, planks: 0 });

    const empty = freshState();
    placeStaffedWorkshop(empty);
    stepTicks(empty, 1); // wood 0
    expect(empty.resources).toMatchObject({ wood: 0, planks: 0 });

    // The batch is per workshop: 2 wood feeds ONE of two staffed workshops,
    // so a second workshop's 2 planks are never minted from wood the colony
    // does not have.
    const paired = freshState();
    stripToAnchor(paired);
    const buildable = (x: number, y: number) =>
      !paired.world.blockedCells[cellKey(x, y)] &&
      !Object.values(paired.buildings).some((b) => b.x === x && b.y === y);
    let lane: { x: number; y: number } | null = null;
    for (let y = 1; y < 15 && !lane; y++) {
      for (let x = 1; x < 13; x++) {
        if ([x, x + 1].every((cx) => buildable(cx, y)) && buildable(x - 1, y) && buildable(x + 2, y)) {
          lane = { x, y };
          break;
        }
      }
    }
    if (!lane) throw new Error("no free road pair");
    mustOk(
      applyCommand(paired, {
        kind: "placeRoads",
        cells: [cellKey(lane.x, lane.y), cellKey(lane.x + 1, lane.y)],
      }),
    );
    paired.resources.water = 5;
    mustOk(applyCommand(paired, { kind: "placeBuilding", type: "workshop", x: lane.x - 1, y: lane.y }));
    mustOk(applyCommand(paired, { kind: "placeBuilding", type: "workshop", x: lane.x + 2, y: lane.y }));
    paired.population = 2;
    stepTicks(paired, 2); // both operational and staffed
    paired.resources.wood = WOOD_PER_PLANK_BATCH; // one batch, two workshops
    // W1: le budget est débité atelier par atelier — le second ne peut pas se
    // voir promettre le lot du premier, donc il n'est pas doté du tout.
    assignJobs(paired);
    const stock = paired.resources.planks;
    stepTicks(paired, 1);
    expect(paired.resources).toMatchObject({ wood: 0, planks: stock + 2 });
  });

});

describe("quarry plank gate (Step006, D3 2026-11-20)", () => {
  it("requires 4 planks, no stone, and never accepts money instead", () => {
    const state = freshState();
    stripToAnchor(state);
    const spot = freeCell(state);
    state.resources.planks = 3;
    expect(
      applyCommand(state, { kind: "placeBuilding", type: "quarry", x: spot.x, y: spot.y }),
    ).toEqual({ ok: false, reason: "insufficientPlanks" });

    state.resources.planks = 4;
    const stoneBefore = state.resources.stone;
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "quarry", x: spot.x, y: spot.y }));
    expect(state.resources.planks).toBe(0);
    // The bootstrap building is free of money and of stone (D3): charging it
    // stone would make the only stone producer impossible to build.
    expect(state.resources.money).toBe(100);
    expect(state.resources.stone).toBe(stoneBefore); // the quarry is never charged stone

    const rich = freshState();
    stripToAnchor(rich);
    rich.resources.money = 1000; // money cannot substitute for planks
    rich.resources.planks = 0;
    const other = freeCell(rich);
    expect(
      applyCommand(rich, { kind: "placeBuilding", type: "quarry", x: other.x, y: other.y }),
    ).toEqual({ ok: false, reason: "insufficientPlanks" });

    // Heavy buildings cannot pay stone with money either.
    const heavy = freshState();
    stripToAnchor(heavy);
    heavy.resources.planks = 200;
    heavy.resources.stone = 7;
    const yard = freeCell(heavy);
    heavy.resources.money = 1000;
    expect(
      applyCommand(heavy, { kind: "placeBuilding", type: "warehouse", x: yard.x, y: yard.y }),
    ).toEqual({ ok: false, reason: "insufficientStone" });

    // A residence is paid in planks and in nothing else (D3).
    const free = freshState();
    stripToAnchor(free);
    free.resources.planks = 1;
    free.resources.money = 5;
    const home = freeCell(free);
    mustOk(applyCommand(free, { kind: "placeBuilding", type: "residence", x: home.x, y: home.y }));
    expect(free.resources.planks).toBe(0);
    expect(free.resources.money).toBe(5);
  });
});

