import type { GameState } from "@/domain/simulation/state.js";
import type { Building } from "@/domain/building/building.js";
import { isAdjacentToRoad } from "@/domain/network/network.js";
import { buildLogisticsMap } from "@/domain/logistics/logistics.js";
import {
  WOOD_PER_LUMBER_CAMP_PER_TICK,
  projectedExtraction,
  stonePerQuarry,
} from "@/domain/production/extraction.js";
import { staffingDecision, type StaffingDecision } from "@/domain/jobs/jobs.js";
import { isRestingForTools } from "@/domain/building/tools.js";

/**
 * W1 finalisation — « pourquoi ce bâtiment ne produit-il pas ? » (2026-11-20).
 *
 * UNE réponse, typée, lue par l'inspecteur : aucune deuxième règle n'est écrite
 * ici. La raison vient de la décision d'affectation elle-même
 * (`staffingDecision`, la phase qui décide qui travaille au tick suivant) et,
 * pour un chantier d'extraction doté, de la borne haute de la phase 3
 * (`projectedExtraction`) — jamais d'une lecture de stock recalculée par
 * l'interface, qui pourrait nommer une cause que la simulation n'a pas
 * appliquée.
 *
 * Les cinq causes ne se confondent pas :
 *   - `no_workers` : le seau de bras était vide à son tour (agir : logement,
 *     tech de ferme, ou mise au repos d'un autre poste) ;
 *   - `insufficient_input` : l'atelier est passé avant faute de bois pour son
 *     lot, ou le chantier n'a plus de gisement à portée ;
 *   - `disconnected` : aucun accès routier, donc jamais éligible ;
 *   - `inactive` : mise au repos volontaire (`active: false`) ;
 *   - `operational` : la phase l'a doté et rien ne manque.
 *
 * `under_construction` existe en plus du minimum demandé : un chantier n'est
 * pas « au repos », et le dire éviterait de confondre deux états que le joueur
 * traite différemment.
 */
export type BuildingActivityReason =
  | "operational"
  | "no_workers"
  | "insufficient_input"
  | "disconnected"
  | "inactive"
  | "under_construction"
  | "no_tools";

/**
 * The tick's verdict for one building. `decision` is threaded in so a caller
 * that reads many buildings pays for one assignment, not one per building —
 * and so every line it prints comes from the SAME decision.
 */
export function buildingActivity(
  state: GameState,
  building: Building,
  decision: StaffingDecision = staffingDecision(state),
): BuildingActivityReason {
  if (building.status !== "operational") return "under_construction";
  if (!building.active) return "inactive";
  // Same predicate as isEligibleWorkplace: staffing requires road access, so a
  // building off the network is never passed over for want of a worker.
  if (!isAdjacentToRoad(state.roads, building.x, building.y)) return "disconnected";

  const rejection = decision.rejected.get(building.id);
  if (rejection === "no-input") return "insufficient_input";
  if (!decision.assigned.has(building.id)) return "no_workers";
  // D7: the tool bill is settled before production, so a workplace that could
  // not pay it is already resting — and that is a different cause from a
  // missing worker or a missing input, so it gets its own reason.
  if (isRestingForTools(state, building)) return "no_tools";

  // Staffed extraction is only "operational" if there is something left to
  // take: a camp or a quarry drawing on an exhausted gisement holds a worker
  // and produces nothing — the first case a player must be able to SEE.
  if (building.type === "lumberCamp" || building.type === "quarry") {
    const map = buildLogisticsMap(state);
    const remaining =
      building.type === "lumberCamp"
        ? projectedExtraction(
            state,
            building,
            state.woodDeposits,
            WOOD_PER_LUMBER_CAMP_PER_TICK,
            map,
          )
        : projectedExtraction(state, building, state.stoneDeposits, stonePerQuarry(state), map);
    if (remaining <= 0) return "insufficient_input";
  }

  return "operational";
}
