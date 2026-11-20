import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import type { GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import { assignJobs, staffingDecision } from "@/domain/jobs/jobs.js";
import { buildingActivity } from "@/domain/building/activity.js";
import { getStaffingOverview } from "@/application/queries/staffing.js";
import {
  adjacentFree,
  freeCell,
  mustOk,
  neighborsOf,
  stockedState,
  stripToAnchor,
} from "./helpers.js";

const CONFIG = { seed: "activity-test", width: 16, height: 16 };

/**
 * W1 finalisation (2026-11-20) — « pourquoi ce bâtiment ne produit-il pas ? »
 *
 * Chaque cause est fabriquée à la main, puis relue DEUX fois : une fois sur le
 * domaine (`buildingActivity`) et une fois sur la surface que le joueur voit
 * (`getStaffingOverview().activityLine`). Une seule des deux ne prouverait rien
 * sur l'accord entre la phase et l'inspecteur.
 *
 * Aucune de ces constructions ne contourne une loi : les bâtiments passent par
 * les commandes réelles, seule la dotation en matériaux du fixture est offerte
 * (D3 facture le placement).
 */

/** Empty colony with a clean wallet and materials. */
function bare(): GameState {
  const state = stockedState(CONFIG);
  stripToAnchor(state);
  state.population = 0;
  state.resources.money = 2000;
  state.resources.planks = 200;
  state.resources.stone = 200;
  state.resources.wood = 0;
  return state;
}

function hasRoad(state: GameState, x: number, y: number): boolean {
  const key = cellKey(x, y);
  return Object.values(state.roads).some((r) => r.cells.includes(key));
}

function occupied(state: GameState, x: number, y: number): boolean {
  const key = cellKey(x, y);
  return (
    state.woodDeposits[key] !== undefined ||
    state.stoneDeposits[key] !== undefined ||
    Object.values(state.buildings).some((b) => b.x === x && b.y === y) ||
    hasRoad(state, x, y)
  );
}

/** Road cell + one road-adjacent cell, so a building can be staffed at all. */
function roadAndSpot(state: GameState): { spot: { x: number; y: number } } {
  const road = freeCell(state);
  mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
  return { spot: adjacentFree(state, road.x, road.y) };
}

/** Place a building and let construction finish (staffing runs at tick end). */
function place(state: GameState, type: "workshop" | "lumberCamp" | "quarry" | "farm" | "well"): string {
  const { spot } = roadAndSpot(state);
  mustOk(applyCommand(state, { kind: "placeBuilding", type, x: spot.x, y: spot.y }));
  stepTicks(state, 2);
  // By CELL, not by type: a second workshop of the same type must not answer
  // with the first one's id (that would report one post as two).
  const id = Object.values(state.buildings).find((b) => b.x === spot.x && b.y === spot.y)?.id;
  if (!id) throw new Error(type + " missing");
  return id;
}

/** Wood under the worksite, exactly where the extraction law reads it. */
function giveDeposit(state: GameState, buildingId: string, remaining: number): void {
  const worksite = state.buildings[buildingId];
  if (!worksite) throw new Error("building missing");
  for (const cell of neighborsOf(worksite.x, worksite.y)) {
    if (state.world.blockedCells[cellKey(cell.x, cell.y)]) continue;
    if (occupied(state, cell.x, cell.y)) continue;
    state.woodDeposits[cellKey(cell.x, cell.y)] = { remaining, capacity: 10 };
    return;
  }
  throw new Error("no free neighbour for a deposit");
}

/** A buildable cell whose four neighbours carry no road and no building. */
function isolatedSpot(state: GameState): { x: number; y: number } {
  for (let y = state.world.height - 2; y >= 1; y--) {
    for (let x = state.world.width - 2; x >= 1; x--) {
      if (state.world.blockedCells[cellKey(x, y)]) continue;
      if (occupied(state, x, y)) continue;
      if (neighborsOf(x, y).every((c) => !occupied(state, c.x, c.y))) return { x, y };
    }
  }
  throw new Error("no isolated cell");
}

/** The verdict, as the domain names it. */
function verdict(state: GameState, id: string): string {
  const building = state.buildings[id];
  if (!building) throw new Error("building missing");
  return buildingActivity(state, building);
}

/** The verdict, as the inspector prints it. */
function line(state: GameState, id: string): string | undefined {
  return getStaffingOverview(state).entries.find((e) => e.id === id)?.activityLine;
}

describe("W1 inactivity reasons", () => {
  it("distinguishes the five causes and the shell still being built", () => {
    const state = bare();

    // under construction: neither resting nor blocked — it is not finished.
    const { spot } = roadAndSpot(state);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: spot.x, y: spot.y }));
    const shellId = Object.values(state.buildings).find(
      (b) => b.x === spot.x && b.y === spot.y,
    )?.id;
    if (!shellId) throw new Error("shell missing");
    expect(verdict(state, shellId)).toBe("under_construction");
    expect(line(state, shellId)).toBe("En construction");

    // The shell finishes: NOW the allocation can judge it, and it says the
    // cause is the missing worker, not the (present) wood.
    stepTicks(state, 2);
    state.population = 0;
    state.resources.wood = 10;
    assignJobs(state);
    expect(verdict(state, shellId)).toBe("no_workers");
    expect(line(state, shellId)).toBe("Aucun travailleur disponible");

    // one worker, no wood: the workshop is passed over for want of INPUT.
    state.population = 1;
    state.resources.wood = 0;
    assignJobs(state);
    expect(state.buildings[shellId]?.staffed).toBe(false);
    expect(verdict(state, shellId)).toBe("insufficient_input");
    expect(line(state, shellId)).toBe("Matière première insuffisante");

    // the wood arrives: the SAME building becomes operational (no new phase).
    state.resources.wood = 2;
    assignJobs(state);
    expect(state.buildings[shellId]?.staffed).toBe(true);
    expect(verdict(state, shellId)).toBe("operational");
    expect(line(state, shellId)).toBe("Opérationnel");

    // wood spent again → back to short of input.
    state.resources.wood = 0;
    assignJobs(state);
    expect(verdict(state, shellId)).toBe("insufficient_input");

    // resting is a player decision, not a shortage.
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: shellId, active: false }));
    expect(verdict(state, shellId)).toBe("inactive");
    expect(line(state, shellId)).toBe("Bâtiment au repos");

    // off the network: never eligible, so "no worker" would be a lie.
    state.resources.money = 2000;
    const remote = isolatedSpot(state);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: remote.x, y: remote.y }));
    stepTicks(state, 2); // it must be FINISHED before a cause applies
    const remoteId = Object.values(state.buildings).find(
      (b) => b.x === remote.x && b.y === remote.y,
    )?.id;
    if (!remoteId) throw new Error("remote workshop missing");
    expect(verdict(state, remoteId)).toBe("disconnected");
    expect(line(state, remoteId)).toBe("Connexion logistique manquante");
  });

  it("names an exhausted gisement as short of input, not operational", () => {
    const state = bare();
    const campId = place(state, "lumberCamp");
    state.population = 1;
    giveDeposit(state, campId, 10);
    assignJobs(state);
    expect(state.buildings[campId]?.staffed).toBe(true);
    expect(verdict(state, campId)).toBe("operational");
    expect(line(state, campId)).toBe("Opérationnel");

    // The deposit runs dry while the camp keeps its worker: the player must see
    // that the camp is no longer producing, and why.
    for (const key of Object.keys(state.woodDeposits)) {
      state.woodDeposits[key] = { remaining: 0, capacity: 10 };
    }
    expect(verdict(state, campId)).toBe("insufficient_input");
    expect(line(state, campId)).toBe("Matière première insuffisante");
  });
});

describe("W1 official allocation", () => {
  it("never lets an empty workshop take the last worker from a camp that can cut", () => {
    const state = bare();
    // Canonical order is y then x: the workshop is placed first, the camp after.
    const workshopId = place(state, "workshop");
    const campId = place(state, "lumberCamp");
    state.population = 1;
    state.resources.wood = 0;
    giveDeposit(state, campId, 10);

    const decision = staffingDecision(state);
    expect(decision.assigned.has(campId)).toBe(true);
    expect(decision.assigned.has(workshopId)).toBe(false);
    expect(decision.rejected.get(workshopId)).toBe("no-input");
    // one worker, one post: nothing was handed out twice.
    expect(decision.assigned.size).toBe(1);
  });

  it("never promises the same batch to two workshops, and the phase consumes only what exists", () => {
    const state = bare();
    const first = place(state, "workshop");
    const second = place(state, "workshop");
    state.population = 2;
    state.resources.wood = 2;

    const decision = staffingDecision(state);
    expect(decision.assigned.size).toBe(1);
    expect(decision.assigned.has(first)).toBe(true);
    expect(decision.rejected.get(second)).toBe("no-input");

    // The decision is pure: write it on the buildings the way the phase does,
    // then let the tick transform. One batch in, one workshop transformed.
    assignJobs(state);
    stepTicks(state, 1);
    expect(state.resources.wood).toBe(0);
    expect(state.resources.planks).toBeGreaterThan(0);
  });

  it("leaves the vital order untouched: farm then well, whatever the wood says", () => {
    const state = bare();
    const farmId = place(state, "farm");
    const wellId = place(state, "well");
    const workshopId = place(state, "workshop");
    state.population = 2;
    state.resources.wood = 4;

    const decision = staffingDecision(state);
    expect(decision.assigned.has(farmId)).toBe(true);
    expect(decision.assigned.has(wellId)).toBe(true);
    expect(decision.assigned.has(workshopId)).toBe(false);
    expect(decision.rejected.get(workshopId)).toBe("no-workers");
    expect(verdict(state, farmId)).toBe("operational");
    expect(verdict(state, workshopId)).toBe("no_workers");
  });

  it("keeps the previous law reachable only as a measurement reference", () => {
    // `baseline` exists so the six reference scenarios can still be measured;
    // it is never the default. Two workshops, 2 wood: the old law staffs both.
    const state = bare();
    place(state, "workshop");
    place(state, "workshop");
    state.population = 2;
    state.resources.wood = 2;
    expect(staffingDecision(state).assigned.size).toBe(1);
    expect(staffingDecision(state, "baseline").assigned.size).toBe(2);
  });
});
