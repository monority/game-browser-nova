import type { GameState } from "@/domain/simulation/state.js";
import type { Building } from "@/domain/building/building.js";
import { isAdjacentToCells } from "@/domain/network/network.js";
import { allRoadCells } from "@/domain/road/road.js";
import { isActive } from "@/domain/building/building.js";
import { compareCellsWithId } from "@/domain/shared/cells.js";
import { buildLogisticsMap } from "@/domain/logistics/logistics.js";
import {
  WOOD_PER_LUMBER_CAMP_PER_TICK,
  projectedExtraction,
} from "@/domain/production/extraction.js";
import { WOOD_PER_PLANK_BATCH } from "@/domain/production/transformation.js";
import { BUILDING_DEFINITIONS } from "@/content/buildings.js";
import { waterPerWell } from "@/domain/production/production.js";
import {
  WATER_PRESSURE_GRAVE_THRESHOLD,
  isSevereShortage,
} from "@/domain/water/water.js";


/**
 * Aggregate workforce assignment (ADR-004).
 * Eligible workplace = active (operational, not mothballed), job capacity > 0,
 * road-adjacent (staffing requires road access). Colonists fill workplaces
 * greedily in priority-class order, then canonical order (y asc, x asc, id)
 * inside a class; capacity 1 per documented contract.
 *
 * Timing contract: assignJobs runs as the LAST phase of a tick, so a
 * newly operational workplace is staffed next tick — production phases
 * read the previous assignment.
 */
/** One workplace against a road-cell set the caller gathered once. */
function isEligibleWorkplace(building: Building, roadCells: Set<string>): boolean {
  return (
    isActive(building) &&
    BUILDING_DEFINITIONS[building.type].jobCapacity > 0 &&
    isAdjacentToCells(roadCells, building.x, building.y)
  );
}

/**
 * Who gets the workers first (Step070, re-measured by the Phase 0 audit).
 *
 * Placement order used to decide it: a colony whose wells and shops happened to
 * sit on lower cells could leave farms idle next door, and since a staffed farm
 * yields exactly one colonist's food, one unstaffed farm means the granary can
 * never fill. The colony eats first, drinks second.
 *
 * The third class is one bucket ranked by cell, and that is a MEASURED decision,
 * not an oversight: ranking extraction before transformation was tried and
 * rejected on the Phase 0 audit. It bought planks early (3 → 33 by t=400 on the
 * governed line) but capped the run at 60 colonists instead of 86 and left Age 3
 * unreachable, because a camp holding the last worker cannot feed a colony that
 * has no free workers left. Name the cause, do not reorder the bucket: the
 * overview reports an idle workplace as "no-workers", which is the truth a
 * player can act on (build housing, mothball, or wait for a farm tech).
 */
function staffPriority(type: Building["type"]): number {
  if (type === "farm") return 0;
  if (type === "well") return 1;
  return 2;
}

/** Eligible workplaces in staffing order — the ONE home of that order, read by
 *  the assignment, by the ordinary-order probe of the reserve latch and by the
 *  read-only staffing overview — so the surface cannot disagree with the phase. */
export function staffingOrder(state: GameState): Building[] {
  // Gathered once per order, not once per building: the road graph is shared
  // and this order is rebuilt on every tick.
  const roadCells = allRoadCells(state.roads);
  return Object.values(state.buildings)
    .filter((b) => isEligibleWorkplace(b, roadCells))
    .sort((a, b) => staffPriority(a.type) - staffPriority(b.type) || compareCellsWithId(a, b));
}

/**
 * Wells the ORDINARY order staffs, without the reserve (Step082a §3.2).
 *
 * This is the counterfactual the latch needs: what the colony would have if
 * Step081's reserve were switched off this tick. Pure — locals only, no
 * `staffed` flag written, same filter and same canonical order as the real
 * assignment — so the answer cannot drift from what the release would produce.
 */
export function ordinaryWellStaffing(state: GameState): number {
  let remaining = state.population;
  let wells = 0;
  for (const workplace of staffingOrder(state)) {
    if (remaining <= 0) break;
    const capacity = BUILDING_DEFINITIONS[workplace.type].jobCapacity;
    remaining -= capacity;
    if (workplace.type === "well") wells += capacity;
  }
  return wells;
}

/**
 * Water the ordinary order alone can PRODUCE, capped by the population — the
 * standing counterfactual the latch needs.
 *
 * Deliberately capacity, not stock: measuring the stock let a full cistern
 * release the reserve, which then drained, turned the shortage severe again and
 * re-armed — 67 assignments in 200 ticks at population 3 (measured, Step082b).
 * The cistern is a buffer, not a capability: a colony that cannot serve itself
 * from its wells is not ready to give the wells back.
 */
export function ordinaryWaterCapacity(state: GameState): number {
  return Math.min(ordinaryWellStaffing(state) * waterPerWell(state), state.population);
}

/**
 * The reserve latch (Step082a §3.3, model B1).
 *
 * Step079/081 measured the trap the reserve removes, and Step082a measured what
 * it introduced: at exact well capacity (pop 10, five wells) the reserve
 * restored coverage to 100 %, the gauge fell below 75, the reserve dropped, the
 * shortage turned severe again and the gauge climbed back — 126 assignments in
 * 200 ticks.
 *
 * The cure is not to tune the threshold but to make the exit monotone: the
 * reserve lets go ONLY when the ordinary order already serves at least 75 % of
 * the colony, i.e. in the band where the gauge HOLDS. From there it can fall
 * (full coverage) but never rise back to 75, so a release cannot be followed by
 * a re-arm: the cycle has no second leg.
 *
 * Arming stays where Step081 put it (the grave band, 75) and the reserve size,
 * its bounds and the farm-first order are untouched. One boolean, one exit
 * rule, no new resource.
 */
export function updateWaterReserveLatch(state: GameState): void {
  if (state.waterPressure >= WATER_PRESSURE_GRAVE_THRESHOLD) {
    state.waterReserveLatched = true;
    return;
  }
  if (!state.waterReserveLatched) return;
  // Held while the ordinary order is still severe; released into the light band
  // (or a balanced colony), where the gauge holds or falls.
  if (!isSevereShortage(ordinaryWaterCapacity(state), state.population)) {
    state.waterReserveLatched = false;
  }
}

/**
 * Workers the wells may claim first (Step081, Step080 §3.3), while the latch
 * holds.
 *
 * Step079 measured the trap this removes: at pop 8 with 7 farms and 3 wells the
 * farms took the workers one by one as the colony shrank, water produced fell to
 * 2 then 0, and the population drained to the floor without ever recovering.
 *
 * The reserve is BOUNDED BY THE NEED, not by the number of wells: a well serves
 * `waterPerWell` colonists, so `ceil(population / waterPerWell)` wells cover
 * everybody. The need is READ FROM THE LAW, never written down here (Step088):
 * with the Well Shafts technology a well serves three, so the same colony needs
 * one well fewer; under drought the flat -1 puts the count back where it was.
 * Armed only by the grave band or by a latch that has not been released yet
 * (Step082b) — below it, the colony keeps its Step070 farm-first order.
 *
 * It is a staffing priority, never a fictional allocation: the reserved workers
 * are removed from the pool before the usual order runs, so no worker is
 * counted twice.
 */
export function waterWorkerReserve(state: GameState): number {
  if (!state.waterReserveLatched) return 0;
  // max(1, …) is a floor against a future effect that would zero the yield:
  // the reserve then claims every well instead of dividing by zero.
  return Math.ceil(state.population / Math.max(1, waterPerWell(state)));
}

/**
 * W1 — loi officielle d'allocation industrielle (adoptée le 20 novembre 2026,
 * après l'expérience C1 ; référence comportementale :
 * `docs/rebalance/v0.1/decisions/W1-conditional-allocation-experiment.md`).
 *
 * Le harnais a mesuré un cercle vicieux (W1-workforce-allocation.md §5) : le
 * bûcheron et l'atelier partagent le seau « reste », ordonné par cellule ;
 * l'atelier prend le dernier bras, le bois ne rentre plus, et les ateliers
 * tournent à vide (bûcheron staffé 2 % des ticks, ateliers 3,07 sur 4 en
 * standard). L'atelier capturait un bras qu'il ne pouvait pas employer.
 *
 * La règle n'invente PAS d'ordre nouveau : c'est le MÊME ordre canonique, avec
 * une seule condition — un atelier ne prend un bras que si le bois disponible
 * couvre son lot (`WOOD_PER_PLANK_BATCH`). Le bûcheron, lui, n'est jamais
 * prioritaire : il alimente le budget quand son tour arrive dans l'ordre
 * habituel, ce qui laisse un tick de retard la première fois et rien d'autre.
 *
 * Pourquoi une projection et pas un simple `state.resources.wood` : la phase
 * d'affectation est la DERNIÈRE du tick, donc le stock lu ici est le résidu
 * d'après-transformation. Le tick suivant produit le bois (phase 3) AVANT de
 * transformer (phase 4) : un contrôle sur le seul stock refuserait tous les
 * ateliers à jamais, alors que le camp qu'on vient de staffer va livrer. Le
 * budget ajoute donc la coupe du camp au moment où on lui donne son bras,
 * bornée par la logistique et par le gisement adjacent restant
 * (`projectedExtraction`).
 *
 * Le budget est DÉBITÉ à chaque atelier doté, dans l'ordre où la phase 4
 * consommera : deux ateliers ne peuvent pas se voir promettre le même lot. Il
 * n'y a ni ressource fantôme ni réservation persistée — le bois reste celui du
 * stock, et la phase de transformation ne consomme que ce qui existe.
 *
 * `conditional-wood` est le défaut ; `baseline` n'existe plus que comme
 * référence de mesure pour la sonde, jamais comme chemin joueur. Aucune
 * sauvegarde, aucune constante, aucun rendement n'est touché.
 */
export type IndustryAllocationPolicy = "baseline" | "conditional-wood";

/** Pourquoi un poste que l'affectation a croisé n'a pas reçu de bras. */
export type AllocationRejection =
  /** Le seau de bras était vide quand son tour est arrivé. */
  | "no-workers"
  /** Atelier sans budget bois pour son lot (loi conditionnelle). */
  | "no-input";

/**
 * The assignment's own verdict for one tick: who is staffed, and why the others
 * are not. The inspector reads THIS, never a re-derivation — a surface that
 * re-computes the reason can disagree with the phase that made the decision.
 */
export interface StaffingDecision {
  assigned: Set<string>;
  rejected: Map<string, AllocationRejection>;
}

/** Coupe qu'un camp staffé apportera au prochain tick — lecture PURE.
 *  Même loi que `produceWood` (logistique × gisement adjacent), sans écrire.
 *  Deux camps sur le même gisement peuvent surestimer : c'est une borne
 *  haute assumée, jamais un crédit gratuit (la transformation vérifie). */
function projectedCampWood(
  state: GameState,
  camp: Building,
  map: ReturnType<typeof buildLogisticsMap>,
): number {
  return projectedExtraction(state, camp, state.woodDeposits, WOOD_PER_LUMBER_CAMP_PER_TICK, map);
}

/**
 * The workplaces this tick's assignment gives, by id — pure, locals only.
 *
 * `assignJobs`, the read-only staffing overview and the inspector's inactivity
 * reason all read it, so the surface cannot claim a workplace is staffed while
 * the simulation leaves it idle, nor name a cause the phase did not apply.
 * Before the Phase 0 audit the overview re-derived the order by cell alone (a
 * workshop on y=1 came before the camp actually staffed on y=2) and knew
 * nothing of the hydric reserve, so during a water crisis it reported the farms
 * as staffed and the wells as idle — the exact inverse of the phase.
 *
 * W1: `rejected` carries the reason for EVERY workplace the pass did not staff
 * (it used to stop reading at the first empty worker), so the inspector can tell
 * "no worker left" from "no wood to work with" without guessing.
 */
export function staffingDecision(
  state: GameState,
  policy: IndustryAllocationPolicy = "conditional-wood",
): StaffingDecision {
  const assigned = new Set<string>();
  const rejected = new Map<string, AllocationRejection>();
  const ordered = staffingOrder(state);

  let remaining = state.population;

  // First pass (Step081): the hydric reserve, bounded by the need, the workers
  // available and the well posts that actually exist. Iterating `ordered` keeps
  // the canonical well order of the second pass.
  const wellPosts = ordered.reduce(
    (sum, b) => (b.type === "well" ? sum + BUILDING_DEFINITIONS[b.type].jobCapacity : sum),
    0,
  );
  const reserve = Math.min(waterWorkerReserve(state), remaining, wellPosts);
  let reserved = 0;
  if (reserve > 0) {
    for (const well of ordered) {
      if (well.type !== "well") continue;
      const capacity = BUILDING_DEFINITIONS[well.type].jobCapacity;
      if (reserved + capacity > reserve) break;
      assigned.add(well.id);
      reserved += capacity;
      remaining -= capacity;
    }
  }

  // Second pass: the usual order (farms, then the wells the reserve did not
  // cover, then the single tail class ranked by cell), skipping what the first
  // pass already staffed.
  //
  // W1 (official): `conditional-wood` keeps this exact order and adds one
  // condition on the workshop — it is skipped, not reordered, when the wood
  // budget cannot cover its batch, and a skipped workshop consumes no budget. A
  // staffed camp adds its projected cut to the budget at the moment it takes its
  // worker; nothing else changes.
  const conditional = policy === "conditional-wood";
  const logisticsMap = conditional ? buildLogisticsMap(state) : null;
  let woodBudget = state.resources.wood;
  for (const workplace of ordered) {
    if (assigned.has(workplace.id)) continue;
    if (remaining <= 0) {
      rejected.set(workplace.id, "no-workers");
      continue;
    }
    const capacity = BUILDING_DEFINITIONS[workplace.type].jobCapacity;
    if (conditional && workplace.type === "workshop") {
      if (woodBudget < WOOD_PER_PLANK_BATCH) {
        rejected.set(workplace.id, "no-input");
        continue;
      }
      woodBudget -= WOOD_PER_PLANK_BATCH;
    }
    assigned.add(workplace.id);
    remaining -= capacity;
    if (conditional && workplace.type === "lumberCamp" && logisticsMap) {
      woodBudget += projectedCampWood(state, workplace, logisticsMap);
    }
  }

  return { assigned, rejected };
}

/** The staffed ids alone — the shape most callers want. */
export function staffingAssignment(
  state: GameState,
  policy: IndustryAllocationPolicy = "conditional-wood",
): Set<string> {
  return staffingDecision(state, policy).assigned;
}

/** The tick's staffing phase: one source of truth, written onto the buildings. */
export function assignJobs(
  state: GameState,
  policy: IndustryAllocationPolicy = "conditional-wood",
): void {
  const { assigned } = staffingDecision(state, policy);
  for (const building of Object.values(state.buildings)) {
    building.staffed = assigned.has(building.id);
  }
}
