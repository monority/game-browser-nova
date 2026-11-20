import { describe, expect, it } from "vitest";
import type { GameState } from "@/domain/simulation/state.js";
import { PLANKS_PER_WORKSHOP_PER_TICK } from "@/domain/production/transformation.js";
import { playGame, SELFPLAY_CONFIG } from "./selfplay.governor.js";
import type { EventFrequency } from "@/domain/events/events.js";
import type { WorldConfig } from "@/domain/world/world.js";
import { BUILDING_DEFINITIONS } from "@/content/buildings.js";
import { staffingOrder } from "@/domain/jobs/jobs.js";
import {
  FOOD_PER_COLONY_CENTER_PER_TICK,
  foodPerFarm,
  waterPerWell,
} from "@/domain/production/production.js";
import { plankThroughput } from "@/domain/production/transformation.js";
import { WOOD_PER_LUMBER_CAMP_PER_TICK } from "@/domain/production/extraction.js";
import { emptyTickFlows } from "@/domain/simulation/tick.js";
import type { IndustryAllocationPolicy } from "@/domain/jobs/jobs.js";

/**
 * ADR atelier (2026-11-20) — grille de validation multi-scénarios.
 *
 * Rejoue le gouverneur de self-play (la vraie simulation, aucune loi réécrite)
 * sur les six scénarios de l'ADR, avec un débit lu sur la constante du jeu :
 * on lance la grille avant et après le changement, la comparaison 1 vs 2
 * planches/tick est donc produite par la même sonde.
 *
 *   MEASURE_THROUGHPUT=1 node node_modules/vitest/vitest.mjs run \
 *     tests/measure-throughput.test.ts > /tmp/grid.jsonl
 *
 * Ce n'est pas une porte de régression : sans la variable, elle ne fait rien.
 */

const ENABLED = import.meta.env.MEASURE_THROUGHPUT === "1";

interface Scenario {
  name: string;
  config: WorldConfig;
  housingCap: number;
  growthCap: number;
  stopEarly: boolean;
  events: false | EventFrequency;
  budget: number;
  /** Plafonds de construction du harnais (défauts du gouverneur : 1 camp,
   *  4 ateliers). Les changer ne change aucune loi : cela teste si la
   *  pénurie de bois mesurée est une loi ou un choix de politique. */
  campCap?: number;
  workshopCap?: number;
  /** W1-C1 : politique d'allocation. Absente = le jeu livré. */
  policy?: IndustryAllocationPolicy;
}

const SCENARIOS: Scenario[] = [
  {
    name: "standard",
    config: SELFPLAY_CONFIG,
    housingCap: 14,
    growthCap: 24,
    stopEarly: false,
    events: false,
    budget: 1500,
  },
  {
    name: "bois-contraint",
    config: { ...SELFPLAY_CONFIG, seed: "wood-tight", woodDeposits: [{ x: 5, y: 5, amount: 10 }] },
    housingCap: 14,
    growthCap: 24,
    stopEarly: false,
    events: false,
    budget: 1500,
  },
  {
    name: "main-oeuvre-limitee",
    config: { ...SELFPLAY_CONFIG, seed: "small-labour" },
    housingCap: 10,
    growthCap: 10,
    stopEarly: false,
    events: false,
    budget: 1500,
  },
  {
    name: "expansion",
    config: { ...SELFPLAY_CONFIG, seed: "expansion" },
    housingCap: 20,
    growthCap: 40,
    stopEarly: false,
    events: false,
    budget: 1500,
  },
  {
    name: "stress-hydrique",
    config: { ...SELFPLAY_CONFIG, seed: "drought" },
    housingCap: 14,
    growthCap: 24,
    stopEarly: false,
    events: "frequent",
    budget: 1500,
  },
  {
    name: "longue-partie",
    config: { ...SELFPLAY_CONFIG, seed: "long-run" },
    housingCap: 20,
    growthCap: 40,
    stopEarly: false,
    events: false,
    budget: 3000,
  },
];

// W1: les six lignes de référence restent mesurées sous l'ANCIENNE loi (elles
// sont le « avant » du rapport) ; le défaut du jeu est désormais la loi
// conditionnelle, donc la politique est écrite ici plutôt que héritée.
const SCENARIOS_BASELINE: Scenario[] = SCENARIOS.map((s): Scenario => ({
  ...s,
  policy: "baseline" as const,
}));

/**
 * W1-C1 (2026-11-20) — les six MÊMES scénarios, mêmes graines, mêmes
 * plafonds, seuls la politique d'allocation change. Le nom porte `-c1` pour
 * qu'une ligne JSON ne puisse pas être confondue avec sa référence.
 */
const C1_SCENARIOS: Scenario[] = [
  "standard",
  "bois-contraint",
  "main-oeuvre-limitee",
  "expansion",
  "stress-hydrique",
  "longue-partie",
].map((name) => {
  const base = SCENARIOS.find((s) => s.name === name);
  if (!base) throw new Error("scénario inconnu: " + name);
  return { ...base, name: name + "-c1", policy: "conditional-wood" as const };
});

/**
 * W1 finalisation : les six mêmes scénarios, SANS politique explicite — ils
 * empruntent donc le défaut livré. Comparés ligne à ligne aux `-c1`, ils
 * prouvent que le chemin joueur reproduit exactement l'expérience validée.
 */
const OFFICIAL_SCENARIOS: Scenario[] = C1_SCENARIOS.map((s): Scenario => ({
  ...s,
  name: s.name.replace(/-c1$/, "-official"),
  policy: undefined,
}));

/**
 * Une seule variante, pour répondre à la question que le dossier pose sans la
 * trancher : les ateliers mesurés meurent-ils de la main-d'œuvre ou du bois ?
 * Même graine, même politique, même budget — seuls les plafonds de
 * construction changent (3 camps au lieu d'1). Aucune loi n'est touchée.
 */
const CAMPS_VARIANT: Scenario[] = [
  {
    name: "standard-3-camps",
    config: SELFPLAY_CONFIG,
    housingCap: 14,
    growthCap: 24,
    stopEarly: false,
    events: false,
    budget: 1500,
    campCap: 3,
    // « avant la loi » : la variante répond à une question de politique, pas
    // de règle, et doit rester comparable à la référence.
    policy: "baseline" as const,
  },
];


/**
 * Le dossier « Workforce & Labor Allocation » (§7, §2.3) demande des chiffres
 * qui n'existaient pas : qui travaille, qui attend, et ce que l'attente coûte.
 * Tout est lu sur l'état du jeu après chaque tick, avec les lois du jeu
 * (staffingOrder, foodPerFarm, plankThroughput) — aucune valeur écrite ici.
 *
 * Un poste = un travailleur (contrat de capacité 1, jobCapacity). « Demande »
 * = postes éligibles (bâtiment actif, sur route, capacité > 0) ; « affectés » =
 * ceux que l'ordre ferme → puits → reste a staffés. L'état est lu APRÈS le tick,
 * donc le drapeau staffed décrit l'affectation du tick SUIVANT : le décalage
 * d'un tick sur les pertes est connu et négligeable sur 1 500 ticks.
 */
interface Labour {
  ticks: number;
  availablePeak: number;
  availableFinal: number;
  demandSum: number;
  farmDemandSum: number;
  wellDemandSum: number;
  tailDemandSum: number;
  assignedSum: number;
  vitalAssignedSum: number;
  tailAssignedSum: number;
  unassignedSum: number;
  spareTicks: number;
  peakSpare: number;
  firstSpareTick: number | null;
  unstaffedFarmTicks: number;
  unstaffedWellTicks: number;
  unstaffedTailTicks: number;
  farmTicks: number;
  wellTicks: number;
  workshopTicks: number;
  workshopOperationalTicks: number;
  firstOperationalShopTick: number | null;
  peakStaffedShops: number;
  labourStarvedShopTicks: number;
  materialStarvedShopTicks: number;
  planksLostLabour: number;
  planksLostMaterial: number;
  woodLostLabour: number;
  foodLostLabour: number;
  waterLostLabour: number;
  famineTicks: number;
  thirstTicks: number;
  minFood: number;
  minWater: number;
  /** Postes vitaux que la LOI demande à la fin, lus sur foodPerFarm /
   *  waterPerWell : la comparaison avec les postes construits dit si la
   *  colonie garde des bras dans ses fermes et ses puits au-delà du besoin. */
  farmsNeeded: number;
  wellsNeeded: number;
  /** Qui, dans le seau « reste », a réellement un bras : la question du
   *  dossier est de savoir si le dernier travailleur va au bois ou à la
   *  planche, et ces trois sommes le disent. */
  campsStaffedSum: number;
  shopsStaffedSum: number;
  quarryStaffedSum: number;
  /** Matière encore dans le sol à la fin : distingue un camp sans bras
   *  d'un gisement vide. Sans ce chiffre, les deux causes se confondent. */
  woodLeft: number;
  stoneLeft: number;
  /** Flux réels cumulés, lus sur TickFlows (W1-C1) : jamais déduits des
   *  stocks, qui mélangent production, consommation et construction. */
  woodProducedSum: number;
  woodConsumedSum: number;
  planksProducedSum: number;
  campTicks: number;
  campUnstaffedTicks: number;
}

interface Metrics {
  scenario: string;
  rate: number;
  budget: number;
  finalTick: number;
  age: number;
  age2Tick: number | null;
  finalPop: number;
  peakPop: number;
  minPop: number;
  deaths: number;
  finalMoney: number;
  minMoneyAfter50: number | null;
  totalPlanks: number;
  totalSpentPlanks: number;
  finalPlanks: number;
  peakPlanks: number;
  workshops: number;
  firstWorkshopTick: number | null;
  maxStaffedShops: number;
  idleIndustryTicks: number;
  finalWood: number;
  finalFood: number;
  finalWater: number;
  buildings: Record<string, number>;
  techs: number;
  roads: number;
  mothballed: number;
  moneyAt: string[];
  labour: Labour;
}

function measure(scenario: Scenario): Metrics {
  let prevPlanks = -1;
  let prevPop = -1;
  const m: Metrics = {
    scenario: scenario.name,
    rate: PLANKS_PER_WORKSHOP_PER_TICK,
    budget: scenario.budget,
    finalTick: 0,
    age: 1,
    age2Tick: null,
    finalPop: 0,
    peakPop: 0,
    minPop: Number.POSITIVE_INFINITY,
    deaths: 0,
    finalMoney: 0,
    minMoneyAfter50: null,
    totalPlanks: 0,
    totalSpentPlanks: 0,
    finalPlanks: 0,
    peakPlanks: 0,
    workshops: 0,
    firstWorkshopTick: null,
    maxStaffedShops: 0,
    idleIndustryTicks: 0,
    finalWood: 0,
    finalFood: 0,
    finalWater: 0,
    buildings: {},
    techs: 0,
    roads: 0,
    mothballed: 0,
    moneyAt: [],
    labour: {
      ticks: 0,
      availablePeak: 0,
      availableFinal: 0,
      demandSum: 0,
      farmDemandSum: 0,
      wellDemandSum: 0,
      tailDemandSum: 0,
      assignedSum: 0,
      vitalAssignedSum: 0,
      tailAssignedSum: 0,
      unassignedSum: 0,
      spareTicks: 0,
      peakSpare: 0,
      firstSpareTick: null,
      unstaffedFarmTicks: 0,
      unstaffedWellTicks: 0,
      unstaffedTailTicks: 0,
      farmTicks: 0,
      wellTicks: 0,
      workshopTicks: 0,
      workshopOperationalTicks: 0,
      firstOperationalShopTick: null,
      peakStaffedShops: 0,
      labourStarvedShopTicks: 0,
      materialStarvedShopTicks: 0,
      planksLostLabour: 0,
      planksLostMaterial: 0,
      woodLostLabour: 0,
      foodLostLabour: 0,
      waterLostLabour: 0,
      famineTicks: 0,
      thirstTicks: 0,
      minFood: Number.POSITIVE_INFINITY,
      minWater: Number.POSITIVE_INFINITY,
      farmsNeeded: 0,
      wellsNeeded: 0,
      campsStaffedSum: 0,
      shopsStaffedSum: 0,
      quarryStaffedSum: 0,
      woodLeft: 0,
      stoneLeft: 0,
      woodProducedSum: 0,
      woodConsumedSum: 0,
      planksProducedSum: 0,
      campTicks: 0,
      campUnstaffedTicks: 0,
    },
  };

  const flows = emptyTickFlows();
  const { state, phases } = playGame(
    -1,
    scenario.stopEarly,
    scenario.housingCap,
    scenario.growthCap,
    scenario.events,
    (s: GameState) => {
      const L = m.labour;
      const eligible = staffingOrder(s);
      const cap = (b: (typeof eligible)[number]) => BUILDING_DEFINITIONS[b.type].jobCapacity;
      const farms = eligible.filter((b) => b.type === "farm");
      const wells = eligible.filter((b) => b.type === "well");
      const tail = eligible.filter((b) => b.type !== "farm" && b.type !== "well");
      const demand = eligible.reduce((n, b) => n + cap(b), 0);
      const assigned = eligible.filter((b) => b.staffed).reduce((n, b) => n + cap(b), 0);
      const vitalAssigned =
        farms.filter((b) => b.staffed).reduce((n, b) => n + cap(b), 0) +
        wells.filter((b) => b.staffed).reduce((n, b) => n + cap(b), 0);
      const tailAssigned = tail.filter((b) => b.staffed).reduce((n, b) => n + cap(b), 0);
      const spare = Math.max(0, s.population - assigned);
      const unstaffedFarms = farms.filter((b) => !b.staffed).length;
      const unstaffedWells = wells.filter((b) => !b.staffed).length;
      const unstaffedTail = tail.filter((b) => !b.staffed).length;
      const shopsEligible = eligible.filter((b) => b.type === "workshop");
      const staffedShops = shopsEligible.filter((b) => b.staffed).length;
      const unstaffedShops = shopsEligible.length - staffedShops;
      // Un atelier staffé peut encore manquer de bois : plankThroughput dit
      // combien transforment vraiment, l'écart est la faim de matières.
      const materialStarved = Math.max(0, staffedShops - plankThroughput(s));
      const campsEligible = eligible.filter((b) => b.type === "lumberCamp");

      L.ticks += 1;
      L.availablePeak = Math.max(L.availablePeak, s.population);
      L.availableFinal = s.population;
      L.demandSum += demand;
      L.farmDemandSum += farms.length;
      L.wellDemandSum += wells.length;
      L.tailDemandSum += tail.length;
      L.assignedSum += assigned;
      L.vitalAssignedSum += vitalAssigned;
      L.tailAssignedSum += tailAssigned;
      L.unassignedSum += spare;
      if (spare > 0) {
        L.spareTicks += 1;
        if (L.firstSpareTick === null) L.firstSpareTick = s.tick;
      }
      L.peakSpare = Math.max(L.peakSpare, spare);
      if (farms.length > 0) {
        L.farmTicks += 1;
        L.unstaffedFarmTicks += Math.min(1, unstaffedFarms);
      }
      if (wells.length > 0) {
        L.wellTicks += 1;
        L.unstaffedWellTicks += Math.min(1, unstaffedWells);
      }
      L.unstaffedTailTicks += Math.min(1, unstaffedTail);
      if (shopsEligible.length > 0) {
        L.workshopTicks += 1;
        if (staffedShops > 0) {
          L.workshopOperationalTicks += 1;
          if (L.firstOperationalShopTick === null) L.firstOperationalShopTick = s.tick;
        }
      }
      L.labourStarvedShopTicks += unstaffedShops;
      L.materialStarvedShopTicks += materialStarved;
      L.planksLostLabour += unstaffedShops * PLANKS_PER_WORKSHOP_PER_TICK;
      L.planksLostMaterial += materialStarved * PLANKS_PER_WORKSHOP_PER_TICK;
      // Borne haute : ne déduit ni le gisement épuisé ni la logistique.
      L.woodLostLabour += campsEligible.filter((b) => !b.staffed).length * WOOD_PER_LUMBER_CAMP_PER_TICK;
      L.foodLostLabour += unstaffedFarms * foodPerFarm(s);
      L.waterLostLabour += unstaffedWells * waterPerWell(s);
      L.peakStaffedShops = Math.max(L.peakStaffedShops, staffedShops);
      const staffedCamps = campsEligible.filter((b) => b.staffed).length;
      L.campsStaffedSum += staffedCamps;
      if (campsEligible.length > 0) {
        L.campTicks += 1;
        if (staffedCamps === 0) L.campUnstaffedTicks += 1;
      }
      L.woodProducedSum += flows.woodProduced;
      L.woodConsumedSum += flows.woodConsumed;
      L.planksProducedSum += flows.planksProduced;
      L.shopsStaffedSum += staffedShops;
      L.quarryStaffedSum += eligible.filter((b) => b.type === "quarry" && b.staffed).length;
      if (s.resources.food < 1) L.famineTicks += 1;
      if (s.resources.water < 1) L.thirstTicks += 1;
      L.minFood = Math.min(L.minFood, s.resources.food);
      L.minWater = Math.min(L.minWater, s.resources.water);

      const shops = Object.values(s.buildings).filter((b) => b.type === "workshop");
      const staffed = shops.filter((b) => b.staffed).length;
      if (prevPlanks >= 0) {
        const delta = s.resources.planks - prevPlanks;
        if (delta > 0) m.totalPlanks += delta;
        else m.totalSpentPlanks += -delta;
      }
      if (prevPop >= 0 && s.population < prevPop) m.deaths += prevPop - s.population;
      prevPlanks = s.resources.planks;
      prevPop = s.population;
      m.peakPop = Math.max(m.peakPop, s.population);
      m.minPop = Math.min(m.minPop, s.population);
      m.peakPlanks = Math.max(m.peakPlanks, s.resources.planks);
      m.workshops = shops.length;
      if (shops.length > 0 && m.firstWorkshopTick === null) m.firstWorkshopTick = s.tick;
      m.maxStaffedShops = Math.max(m.maxStaffedShops, staffed);
      if (shops.length > 0 && staffed === 0) m.idleIndustryTicks++;
      if (s.tick % 150 === 0) {
        const inactive = Object.values(s.buildings).filter((b) => !b.active).length;
        m.moneyAt.push("t" + s.tick + " m" + Math.floor(s.resources.money) + " pop" + s.population + " pl" + Math.floor(s.resources.planks) + " rest" + inactive);
      }
      if (s.tick > 50) {
        m.minMoneyAfter50 = m.minMoneyAfter50 === null
          ? s.resources.money
          : Math.min(m.minMoneyAfter50, s.resources.money);
      }
    },
    scenario.config,
    scenario.budget,
    scenario.campCap ?? 1,
    scenario.workshopCap ?? 4,
    scenario.policy,
    flows,
  );

  const age2 = phases.find((p) => p.startsWith("age2@"));
  m.age2Tick = age2 ? Number(age2.split("@")[1]) : null;
  m.finalTick = state.tick;
  m.age = state.age;
  m.finalPop = state.population;
  m.finalMoney = Math.floor(state.resources.money);
  m.finalPlanks = Math.floor(state.resources.planks);
  m.finalWood = Math.floor(state.resources.wood);
  m.finalFood = Math.floor(state.resources.food);
  m.finalWater = Math.floor(state.resources.water);
  for (const b of Object.values(state.buildings)) {
    m.buildings[b.type] = (m.buildings[b.type] ?? 0) + 1;
  }
  m.mothballed = Object.values(state.buildings).filter((b) => !b.active).length;
  m.techs = state.researchedTechs.length;
  m.roads = Object.keys(state.roads.cells ?? state.roads).length;
  m.labour.farmsNeeded = Math.max(
    0,
    Math.ceil(
      (state.population - FOOD_PER_COLONY_CENTER_PER_TICK) / Math.max(1, foodPerFarm(state)),
    ),
  );
  m.labour.wellsNeeded = Math.ceil(state.population / Math.max(1, waterPerWell(state)));
  for (const d of Object.values(state.woodDeposits)) m.labour.woodLeft += d.remaining;
  for (const d of Object.values(state.stoneDeposits)) m.labour.stoneLeft += d.remaining;
  return m;
}

describe("ADR atelier — grille multi-scénarios", () => {
  // The env gate sits on the test, not on the describe: a blocked describe reads
  // as a block with no test to the vacuity audit, and an off probe must still
  // leave `pnpm check` green (vitest 4 also refuses a file with no test).
  it.skipIf(!ENABLED)("mesure chaque scénario au débit courant", () => {
    const results = [
      ...SCENARIOS_BASELINE,
      ...C1_SCENARIOS,
      ...OFFICIAL_SCENARIOS,
      ...CAMPS_VARIANT,
    ].map(measure);
    for (const r of results) console.log(JSON.stringify(r));
    expect(results).toHaveLength(
      SCENARIOS_BASELINE.length + C1_SCENARIOS.length + OFFICIAL_SCENARIOS.length + CAMPS_VARIANT.length,
    );
    // Le défaut livré doit reproduire l'expérience C1 à l'identique : toute
    // divergence est un écart d'implémentation, pas un arrondi.
    const byName = new Map(results.map((r) => [r.scenario, r]));
    const strip = (r: Metrics) => JSON.stringify({ ...r, scenario: "x" });
    for (const c1 of results.filter((r) => r.scenario.endsWith("-c1"))) {
      const official = byName.get(c1.scenario.replace(/-c1$/, "-official"));
      if (!official) throw new Error("ligne officielle absente: " + c1.scenario);
      expect(strip(official), c1.scenario).toBe(strip(c1));
    }
  }, 120_000);
});
