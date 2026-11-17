/**
 * Mutation probe (docs/STATE.md): inject one deliberate regression at a time,
 * run the unit suite, restore the file, and expect the build to go RED.
 *
 * Why it exists: the suite was cut from 248 to 107 tests, and a test that is
 * gone cannot fail. This probe is the only instrument that measures what the
 * remaining tests still catch. Its first campaign (32 mutations) found eight
 * laws that had no observer at all — see docs/STATE.md.
 *
 * Usage:
 *   node tools/testing/probe-mutations.mjs                 # every batch (~2.5 min)
 *   node tools/testing/probe-mutations.mjs --batch 3       # one batch (~40 s)
 *   node tools/testing/probe-mutations.mjs --only M4,M5    # named mutations
 *   node tools/testing/probe-mutations.mjs --fast          # the CI subset (~35 s)
 *   node tools/testing/probe-mutations.mjs --list          # the table only
 *
 * Discipline: a batch is the unit that fits the 2-minute cap; the
 * full table is a checkpoint, not an iteration command.
 *
 * A verdict of SURVIVED is a claim about the tests, so it must come with proof
 * the suite actually ran: the probe refuses to start on a sandbox that cannot
 * spawn workers, and a run that exits without a green summary is BROKE, never
 * SURVIVED. Measured 2026-11-14: at 1004 of 1024 PIDs, Vitest children died
 * with `spawn EAGAIN`, exited 1 with no summary, and five mutations were
 * reported SURVIVED in 2.2 s — which reads exactly like five missing tests.
 *
 * NOVA_PROBE_VITEST overrides the runner path; it exists so the gate above can
 * be exercised on a healthy sandbox (`NOVA_PROBE_VITEST=/nonexistent`) instead
 * of by starving the machine.
 *
 * Tags:
 *   equivalent: true — the mutation cannot change behaviour (e.g. floor/ceil on
 *   an integer, or a ceiling that cannot bite at amount 1). These are EXPECTED
 *   to survive: a red suite here would mean a test pins an artefact, not a law.
 *
 * Safety: each file's original bytes are restored in a finally block and
 * re-hashed at the end; the script exits 2 if any file differs. It never
 * touches git, and it never runs two mutations at once.
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const VITEST = process.env.NOVA_PROBE_VITEST ?? join(ROOT, "node_modules/vitest/vitest.mjs");
const TIMEOUT_MS = 115_000;

/** @typedef {{ id: string, batch: number, file: string, find: string, replace: string, equivalent?: boolean }} Mutation */

/** @type {Mutation[]} */
const MUTATIONS = [
  {
    id: "T1 maintenance per operational building 1 -> 2",
    batch: 1,
    file: "src/domain/economy/economy.ts",
    find: "export const MAINTENANCE_PER_OPERATIONAL_BUILDING_PER_TICK = 1;",
    replace: "export const MAINTENANCE_PER_OPERATIONAL_BUILDING_PER_TICK = 2;",
  },
  {
    id: "T2 spoilage runs after consumption (colonists eat fresh harvest)",
    batch: 1,
    file: "src/domain/simulation/tick.ts",
    find: "  const foodSpoiled = applyFoodSpoilage(state);\n\n  const foodBeforeConsumption = state.resources.food;\n  const fedColonists = consumeFood(state);",
    replace: "  const foodBeforeConsumption = state.resources.food;\n  const fedColonists = consumeFood(state);\n\n  const foodSpoiled = applyFoodSpoilage(state);",
  },
  {
    id: "T3 reserve production drops the spoilage denominator",
    batch: 1,
    file: "src/domain/storage/reserve.ts",
    find: "  return (population + FOOD_SPOILAGE_RATE_PER_TICK * target) / (1 - FOOD_SPOILAGE_RATE_PER_TICK);",
    replace: "  return population + FOOD_SPOILAGE_RATE_PER_TICK * target;",
  },
  {
    id: "M4 commerce under embargo",
    batch: 2,
    file: "src/domain/economy/economy.ts",
    find: "const floorPerWorkshop = closed ? Math.ceil(perWorkshop / 2) : perWorkshop;",
    replace: "const floorPerWorkshop = closed ? Math.floor(perWorkshop / 2) : perWorkshop;",
  },
  {
    id: "M5 workshop batch off-by-one (wood ex nihilo)",
    batch: 2,
    file: "src/domain/production/transformation.ts",
    find: "return transformingCandidates(state).slice(0, batches);",
    replace: "return transformingCandidates(state).slice(0, batches + 1);",
  },
  {
    id: "M6 colony-center wood trickle 1 -> 2",
    batch: 2,
    file: "src/domain/production/extraction.ts",
    find: "export const WOOD_PER_COLONY_CENTER_PER_TICK = 1;",
    replace: "export const WOOD_PER_COLONY_CENTER_PER_TICK = 2;",
  },
  {
    id: "M7 mothballed residence still houses",
    batch: 2,
    file: "src/domain/population/population.ts",
    find: "    if (!isActive(building)) continue;\n    capacity += BUILDING_DEFINITIONS[building.type].housingCapacity;",
    replace: "    capacity += BUILDING_DEFINITIONS[building.type].housingCapacity;",
  },
  {
    id: "M8 food capacity base x3",
    batch: 2,
    file: "src/domain/storage/storage.ts",
    find: "export const BASE_FOOD_CAPACITY = D2_FOOD * 2;",
    replace: "export const BASE_FOOD_CAPACITY = D2_FOOD * 3;",
  },
  {
    id: "M9 an unfed colonist counts as fed",
    batch: 2,
    file: "src/domain/production/production.ts",
    equivalent: true,
    find: "  return Math.floor(eaten / FOOD_PER_COLONIST_PER_TICK);",
    replace: "  return Math.ceil(eaten / FOOD_PER_COLONIST_PER_TICK);",
  },
  {
    id: "M10 camps ignore logistics (flat rate)",
    batch: 2,
    file: "src/domain/production/extraction.ts",
    find: "        share: applyLogistics(state, building, WOOD_PER_LUMBER_CAMP_PER_TICK, map),",
    replace: "        share: WOOD_PER_LUMBER_CAMP_PER_TICK,",
  },
  {
    id: "M11 a mothballed park still regrows",
    batch: 3,
    file: "src/domain/environment/environment.ts",
    find: "  for (const building of Object.values(state.buildings)) {\n    if (!isActive(building)) continue;\n    if (building.type !== \"park\") continue;",
    replace: "  for (const building of Object.values(state.buildings)) {\n    if (building.type !== \"park\") continue;",
  },
  {
    id: "M12 regrowth overshoots the deposit ceiling",
    batch: 3,
    file: "src/domain/world/deposits.ts",
    equivalent: true,
    find: "    const room = Math.min(deposit.capacity - deposit.remaining, amount - grown);",
    replace: "    const room = Math.min(deposit.capacity, amount - grown);",
  },
  {
    id: "M13 milestone met only strictly above threshold",
    batch: 3,
    file: "src/domain/progression/progression.ts",
    find: "      done: value >= definition.threshold,",
    replace: "      done: value > definition.threshold,",
  },
  {
    id: "M14 age gate locked at its own age",
    batch: 3,
    file: "src/domain/building/placement.ts",
    find: "  if ((definition.requiredAge ?? 1) > state.age) {",
    replace: "  if ((definition.requiredAge ?? 1) >= state.age) {",
  },
  {
    id: "M15 staffing ignores road access",
    batch: 3,
    fast: true,
    file: "src/domain/jobs/jobs.ts",
    find: "    BUILDING_DEFINITIONS[building.type].jobCapacity > 0 &&\n    isAdjacentToRoad(state.roads, building.x, building.y)",
    replace: "    BUILDING_DEFINITIONS[building.type].jobCapacity > 0",
  },
  {
    id: "M16 an idle workshop stops polluting (Step083 free revenue)",
    batch: 3,
    file: "src/domain/environment/environment.ts",
    find: "  if (!isActive(building)) return 0;\n  return pollutionContributionPerTick(building.type);",
    replace: "  if (!isActive(building)) return 0;\n  if (!building.staffed) return 0;\n  return pollutionContributionPerTick(building.type);",
  },
  {
    id: "A5 the air countdown never warns before the gate shuts (Step083)",
    batch: 3,
    file: "src/application/queries/analysis.ts",
    find: "  if (admissionBlocksIn !== null && admissionBlocksIn > 0) {",
    replace: "  if (admissionBlocksIn !== null && admissionBlocksIn > 1000) {",
  },
  {
    id: "M17 the treasury may go negative",
    batch: 3,
    fast: true,
    file: "src/domain/resource/resource.ts",
    find: "  stock.money = Math.max(0, stock.money + amount);",
    replace: "  stock.money = stock.money + amount;",
  },
  {
    id: "M18 drought halves wells twice as hard (2 -> 0 water)",
    batch: 4,
    file: "src/domain/events/events.ts",
    find: "export const DROUGHT_WATER_REDUCTION_PER_WELL = 1;",
    replace: "export const DROUGHT_WATER_REDUCTION_PER_WELL = 2;",
  },
  {
    id: "M19 harvest windfall 40 -> 50",
    batch: 4,
    file: "src/domain/events/events.ts",
    find: "export const HARVEST_WINDFALL_FOOD = 40;",
    replace: "export const HARVEST_WINDFALL_FOOD = 50;",
  },
  {
    id: "M20 starvation wipes two colonists per unfed tick",
    batch: 4,
    fast: true,
    file: "src/domain/population/population.ts",
    find: "export const STARVATION_LOSS_PER_TICK = 1;",
    replace: "export const STARVATION_LOSS_PER_TICK = 2;",
  },
  {
    id: "M21 admission needs cleaner air (25 -> 30)",
    batch: 4,
    file: "src/domain/environment/environment.ts",
    find: "export const MIN_QUALITY_FOR_ADMISSION = 25;",
    replace: "export const MIN_QUALITY_FOR_ADMISSION = 30;",
  },
  {
    id: "M22 road costs 4 instead of 5",
    batch: 4,
    file: "src/content/buildings.ts",
    find: "export const ROAD_MONEY_COST_PER_CELL = 5;",
    replace: "export const ROAD_MONEY_COST_PER_CELL = 4;",
  },
  {
    id: "M23 spoilage 3 % -> 4 %",
    batch: 4,
    file: "src/content/conservation.ts",
    find: "FOOD_SPOILAGE_RATE_PER_TICK = 0.03",
    replace: "FOOD_SPOILAGE_RATE_PER_TICK = 0.04",
  },
  {
    id: "P1 a food carry >= 1 is accepted as plausible",
    batch: 5,
    file: "src/application/persistence/save.ts",
    find: "  if (foodSpoilCarry >= 1) {\n    throw new SaveValidationError(\"save.foodSpoilCarry must be < 1\");\n  }",
    replace: "",
  },
  {
    id: "P2 two buildings may share a cell",
    batch: 5,
    fast: true,
    file: "src/application/persistence/save.ts",
    find: "    if (buildingCells.has(key)) {\n      throw new SaveValidationError(`two buildings occupy the same cell: ${key}`);\n    }",
    replace: "",
  },
  {
    id: "P3 operational building may carry construction time",
    batch: 5,
    file: "src/application/persistence/save.ts",
    find: "    if (status === \"operational\" && constructionTicksLeft !== 0) {\n      throw new SaveValidationError(`operational building ${id} has construction time left`);\n    }",
    replace: "",
  },
  {
    id: "P4 a building may sit on a deposit",
    batch: 5,
    file: "src/application/persistence/save.ts",
    find: "    if (woodDeposits[key] || stoneDeposits[key]) {\n      throw new SaveValidationError(`building ${building.id} sits on a deposit: ${key}`);\n    }",
    replace: "",
  },
  {
    id: "P5 two roads may claim the same cell",
    batch: 5,
    file: "src/application/persistence/save.ts",
    find: "      if (roadCells.has(key)) throw new SaveValidationError(`duplicate road cell: ${key}`);",
    replace: "",
  },
  {
    id: "P6 pollution may exceed the documented 0-100 stock",
    batch: 5,
    file: "src/application/persistence/save.ts",
    find: "  if (pollution > POLLUTION_MAX) {",
    replace: "  if (pollution > POLLUTION_MAX * 2) {",
  },
  {
    id: "P7 the same tech may be researched twice",
    batch: 5,
    file: "src/application/persistence/save.ts",
    find: "    if (researchedTechs.includes(techId)) {\n      throw new SaveValidationError(`duplicate tech: ${techId}`);\n    }",
    replace: "",
  },
  {
    id: "P8 the v16 -> v17 migration is never applied",
    batch: 5,
    file: "src/application/persistence/save.ts",
    find: "  if (Number(doc.formatVersion) === 16) doc = migrateV16ToV17(doc);",
    replace: "",
  },
  {
    id: "P9 a future save version loads as current",
    batch: 5,
    fast: true,
    file: "src/application/persistence/save.ts",
    find: "  if (version < MIGRATABLE_SAVE_VERSION || version > SAVE_VERSION) {",
    replace: "  if (version < MIGRATABLE_SAVE_VERSION) {",
  },
  // Batch 6 (2026-11-14): the laws Step067-069 introduced. Batches 1-5 were
  // written before conservation, the reserve doctrine and the cockpit forecast
  // existed, so the youngest rules had never been asked what observes them.
  {
    id: "F1 the fractional spoil loss is rounded up instead of carried",
    batch: 6,
    file: "src/domain/storage/spoilage.ts",
    find: "  const whole = Math.max(0, Math.floor(loss));",
    replace: "  const whole = Math.max(0, Math.ceil(loss));",
  },
  {
    id: "F2 the equilibrium stock divides by (1 - r) instead of r",
    batch: 6,
    file: "src/domain/storage/spoilage.ts",
    find: "      population * FOOD_PER_COLONIST_PER_TICK) /\n    FOOD_SPOILAGE_RATE_PER_TICK\n  );",
    replace: "      population * FOOD_PER_COLONIST_PER_TICK) /\n    (1 - FOOD_SPOILAGE_RATE_PER_TICK)\n  );",
  },
  {
    id: "F3 the projection forgets the storage cap",
    batch: 6,
    file: "src/domain/storage/spoilage.ts",
    find: "  const stock = Math.min(afterEating, foodCapacity(state));",
    replace: "  const stock = Math.min(afterEating, foodCapacity(state) + 1000);",
  },
  {
    id: "F4 the projection eats more than the granary holds",
    batch: 6,
    file: "src/domain/storage/spoilage.ts",
    find: "  const eaten = Math.min(afterSpoilage, state.population * FOOD_PER_COLONIST_PER_TICK);",
    replace: "  const eaten = state.population * FOOD_PER_COLONIST_PER_TICK;",
  },
  {
    id: "F5 the reserve target drops from 5 to 3 ticks of consumption",
    batch: 6,
    file: "src/domain/storage/reserve.ts",
    find: "export const FOOD_RESERVE_TICKS = 5;",
    replace: "export const FOOD_RESERVE_TICKS = 3;",
  },
  {
    id: "F6 the plan may sit its equilibrium exactly on the granary cap",
    batch: 6,
    file: "src/domain/storage/reserve.ts",
    find: "  const ceiling = capacity - 1;",
    replace: "  const ceiling = capacity;",
  },
  {
    id: "F7 the plan prefers the nearest under-target reserve to the first one above",
    batch: 6,
    file: "src/domain/storage/reserve.ts",
    find: "      if (!atOrAbove || equilibrium < atOrAbove.equilibrium) atOrAbove = candidate;",
    replace: "      if (!atOrAbove || equilibrium > atOrAbove.equilibrium) atOrAbove = candidate;",
  },
  {
    id: "F8 a draining granary is reported as a storage limit",
    batch: 6,
    file: "src/domain/storage/reserve.ts",
    find: "  if (input.equilibrium <= 0) return \"deficit\";\n  if (input.target <= 0) return \"thin\";\n  if (input.capacityShort) return \"storage-limited\";",
    replace: "  if (input.target <= 0) return \"thin\";\n  if (input.capacityShort) return \"storage-limited\";\n  if (input.equilibrium <= 0) return \"deficit\";",
  },
  {
    id: "F9 the sustainable population stops one short of the exact balance",
    batch: 6,
    file: "src/domain/storage/reserve.ts",
    find: "    if (Math.min(steady, capacity) < next * ticks) break;",
    replace: "    if (Math.min(steady, capacity) <= next * ticks) break;",
  },
  // Batch 7 (2026-11-14): the pins added to make three vacuous tests real.
  // A pin that no mutation trips is decoration; these three exist to find out.
  {
    id: "S1 the idle tail loses its reason and claims a road defect",
    batch: 7,
    file: "src/application/queries/staffing.ts",
    find: '        order, state: "idle", reason: "no-workers",',
    replace: '        order, state: "idle", reason: "no-road",',
  },
  {
    id: "S2 buildings without jobs enter the staffing overview",
    batch: 7,
    file: "src/application/queries/staffing.ts",
    find: ".filter((b) => BUILDING_DEFINITIONS[b.type].jobCapacity > 0)",
    replace: ".filter((b) => BUILDING_DEFINITIONS[b.type].jobCapacity >= 0)",
  },
  {
    // Surgical version of S2: only a residence leaks in, so the claim
    // "lists no non-workplace" is the assertion under test and nothing else
    // in the fixtures changes shape.
    id: "S4 a residence is listed as a workplace",
    batch: 7,
    file: "src/application/queries/staffing.ts",
    find: ".filter((b) => BUILDING_DEFINITIONS[b.type].jobCapacity > 0)",
    replace: '.filter((b) => BUILDING_DEFINITIONS[b.type].jobCapacity > 0 || b.type === "residence")',
  },
  {
    id: "S3 day-0 ships one building nobody counted",
    batch: 7,
    file: "src/domain/simulation/state.ts",
    find: "  state.population = D2_POPULATION;",
    replace:
      '  const stray = createBuilding("stray-park", "park", 1, state.world.height - 1);\n  stray.status = "operational";\n  stray.constructionTicksLeft = 0;\n  state.buildings["stray-park"] = stray;\n  state.population = D2_POPULATION;',
  },
  // Batch 8 (2026-11-14): the two largest modules the table never touched -
  // the cockpit verdict engine and the player-command seam. A hole here is
  // visible to the player before any simulation law is.
  {
    id: "A1 environment severity bands invert",
    batch: 8,
    file: "src/application/queries/analysis.ts",
    find: 'severity: quality < 25 ? "warning" : "info",',
    replace: 'severity: quality < 25 ? "info" : "warning",',
  },
  {
    id: "A2 a full granary is reported as a warning",
    batch: 8,
    file: "src/application/queries/analysis.ts",
    find: '      severity: "info",\n      message: `Food storage full (',
    replace: '      severity: "warning",\n      message: `Food storage full (',
  },
  {
    id: "A3 the frozen treasury warns on a positive net",
    batch: 8,
    file: "src/application/queries/analysis.ts",
    find: "    if (net < 0) {",
    replace: "    if (net > 0) {",
  },
  {
    id: "A4 demolishing refunds ten money",
    batch: 8,
    file: "src/domain/simulation/commands.ts",
    find: "  if (!validation.ok) return validation;\n  delete state.buildings[id];",
    replace: "  if (!validation.ok) return validation;\n  state.resources.money += 10;\n  delete state.buildings[id];",
  },
  // Batch 9 (2026-11-14): the road-graph law. Every mutation here is a rule a
  // player can buy or build their way into, so a survivor is a wrong number on
  // screen, not an unused branch.
  {
    id: "B1 a mothballed warehouse still seeds the network",
    batch: 9,
    file: "src/domain/logistics/logistics.ts",
    find: '    if (building.type !== "warehouse" || !isActive(building)) continue;',
    replace: '    if (building.type !== "warehouse") continue;',
  },
  {
    // The branch moves the boundary without moving the number: at d == radius
    // the raw curve is 100 − 0×4 = 100. Behaviour-identical, so it must stay
    // green; a red run here would mean a test pins the comparator, not the law.
    id: "B2 the free radius loses its last cell",
    batch: 9,
    file: "src/domain/logistics/logistics.ts",
    find: "  if (d <= radius) return 100;",
    replace: "  if (d < radius) return 100;",
    equivalent: true,
  },
  {
    id: "B3 logistics rounds the share up to the nearest unit",
    batch: 9,
    file: "src/domain/logistics/logistics.ts",
    find: "  return Math.floor((base * logisticsEfficiencyPercent(state, building, map)) / 100);",
    replace: "  return Math.round((base * logisticsEfficiencyPercent(state, building, map)) / 100);",
  },
  {
    id: "B4 the wheelbarrow widens nothing",
    batch: 9,
    file: "src/domain/logistics/logistics.ts",
    find: '  return LOGISTICS_FREE_RADIUS + techLevel(state, "logisticsRadius") * WHEELBARROW_FREE_RADIUS_BONUS;',
    replace: "  return LOGISTICS_FREE_RADIUS;",
  },
  // Batch 10 (2026-11-14): the two remaining large modules - UI preferences and
  // the cockpit's read-only stats view. Preferences claims in its own header
  // that a test pins the allowlists; stats feeds numbers no test names.
  {
    id: "C1 one bad preference field resets both",
    batch: 10,
    file: "src/application/persistence/preferences.ts",
    find: '    speedId: isSpeedId(record.speedId) ? record.speedId : DEFAULT_PREFERENCES.speedId,\n    overlay: isOverlayMode(record.overlay) ? record.overlay : DEFAULT_PREFERENCES.overlay,',
    replace:
      '    ...(isSpeedId(record.speedId) && isOverlayMode(record.overlay)\n      ? { speedId: record.speedId, overlay: record.overlay }\n      : { ...DEFAULT_PREFERENCES }),',
  },
  {
    id: "C2 an unknown speed id is stored as itself",
    batch: 10,
    file: "src/application/persistence/preferences.ts",
    find: "  return isSpeedId(id) ? id : DEFAULT_PREFERENCES.speedId;",
    replace: "  return isSpeedId(id) ? id : (id as StoredSpeedId);",
  },
  {
    id: "C3 preferences share the colony save slot",
    batch: 10,
    file: "src/application/persistence/preferences.ts",
    find: 'export const PREFS_STORAGE_KEY = "nova-prefs";',
    replace: 'export const PREFS_STORAGE_KEY = "nova-save";',
  },
  {
    id: "C4 the stats view reports water waste as food waste",
    batch: 10,
    file: "src/application/queries/stats.ts",
    find: "    foodLostPerTick: flows?.foodWasted ?? 0,",
    replace: "    foodLostPerTick: flows?.waterWasted ?? 0,",
  },
  {
    id: "C5 the reserve reads infinity instead of null with no mouths",
    batch: 10,
    file: "src/application/queries/stats.ts",
    find: "      reserve.consumptionPerTick > 0 ? reserve.equilibrium / reserve.consumptionPerTick : null,",
    replace: "      reserve.equilibrium / reserve.consumptionPerTick,",
  },
  {
    id: "D1 seeded terrain covers a sixth of the map instead of a fifteenth",
    batch: 11,
    file: "src/domain/world/world.ts",
    find: "  const obstacleCount = Math.floor(normalized.width * normalized.height * 0.06);",
    replace: "  const obstacleCount = Math.floor(normalized.width * normalized.height * 0.15);",
  },
  {
    id: "D2 the rightmost column counts as in bounds",
    batch: 11,
    file: "src/domain/world/world.ts",
    find: "  return x >= 0 && y >= 0 && x < world.width && y < world.height;",
    replace: "  return x >= 0 && y >= 0 && x <= world.width && y < world.height;",
  },
  {
    id: "D3 the string hash ignores a seed's last character",
    batch: 11,
    file: "src/domain/shared/rng.ts",
    find: "  for (let i = 0; i < text.length; i++) {",
    replace: "  for (let i = 0; i < text.length - 1; i++) {",
  },
  {
    id: "D4 the rng sequence shifts its final fold by one bit",
    batch: 11,
    file: "src/domain/shared/rng.ts",
    find: "    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;",
    replace: "    return ((t ^ (t >>> 13)) >>> 0) / 4294967296;",
  },
  {
    id: "D5 a mothballed building still counts as active",
    batch: 11,
    file: "src/domain/building/building.ts",
    find: '  return building.status === "operational" && building.active;',
    replace: '  return building.status === "operational" || building.active;',
  },
  {
    // Expected to survive: with a whole-unit stock and a carry in [0, 1), the
    // floor of (0.03·stock + carry) never exceeds the stock itself, so the
    // clamp is a guard, not a law any state reaches. (stock ≥ 2: 0.03·s + 1 ≤ s
    // ⟺ s ≥ 1.03; stock = 1 floors to exactly 1; stock = 0 → 0.) A red here
    // would mean a test pins the clamp.
    id: "E1 spoilage removes more than the stock holds",
    batch: 12,
    file: "src/domain/storage/spoilage.ts",
    equivalent: true,
    find: "  return { spoiled: Math.min(whole, Math.max(0, stock)), carry: loss - whole };",
    replace: "  return { spoiled: whole, carry: loss - whole };",
  },
  {
    id: "E2 the plan accepts a reserve sitting exactly on the cap",
    batch: 12,
    file: "src/domain/storage/reserve.ts",
    find: "    if (equilibrium > ceiling) continue;",
    replace: "    if (equilibrium > capacity) continue;",
  },
  {
    id: "E3 the plan takes the largest reserve above the target, not the first",
    batch: 12,
    file: "src/domain/storage/reserve.ts",
    find: "      if (!atOrAbove || equilibrium < atOrAbove.equilibrium) atOrAbove = candidate;",
    replace: "      if (!atOrAbove || equilibrium > atOrAbove.equilibrium) atOrAbove = candidate;",
  },
  {
    id: "E4 migration invents a spoilage carry on load",
    batch: 12,
    file: "src/application/persistence/save.ts",
    find: "    foodSpoilCarry: 0,",
    replace: "    foodSpoilCarry: 0.5,",
  },
  {
    id: "E5 a colony draining to an empty granary is not called a deficit",
    batch: 12,
    file: "src/domain/storage/reserve.ts",
    find: '  if (input.equilibrium <= 0) return "deficit";',
    replace: '  if (input.equilibrium < 0) return "deficit";',
  },
];

// ---------------------------------------------------------------- arguments

const argv = process.argv.slice(2);
const flag = (name) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
};
const has = (name) => argv.includes(`--${name}`);

if (has("list")) {
  for (const mutation of MUTATIONS) {
    const tag = mutation.equivalent ? " (equivalent)" : "";
    console.log(`b${mutation.batch}  ${mutation.id}${tag}`);
  }
  process.exit(0);
}

const batchArg = flag("batch");
const onlyArg = flag("only");
const only = onlyArg ? onlyArg.split(",").map((id) => id.trim()) : undefined;
const selected = MUTATIONS.filter((mutation) => {
  if (has("fast") && !mutation.fast) return false;
  if (batchArg !== undefined && mutation.batch !== Number(batchArg)) return false;
  if (only && !only.some((id) => mutation.id.startsWith(id))) return false;
  return true;
});

if (selected.length === 0) {
  console.error("no mutation selected");
  process.exit(1);
}

// ------------------------------------------------------------- run helpers

const sha = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

/** @type {{ path: string, digest: string }[]} */
const originals = [];
const scratch = mkdtempSync(join(tmpdir(), "nova-probe-"));

for (const mutation of selected) {
  const path = join(ROOT, mutation.file);
  if (!originals.some((entry) => entry.path === path)) {
    originals.push({ path, digest: sha(path) });
  }
}

function restoreAll() {
  for (const entry of originals) {
    const saved = join(scratch, entry.path.replaceAll("/", "_"));
    try {
      writeFileSync(entry.path, readFileSync(saved));
    } catch {
      /* file never mutated in this run */
    }
  }
}

// A killed run must not leave a mutated source behind. SIGINT was handled
// first; SIGTERM was not, and a `timeout`/kill during a batch left
// BASE_FOOD_CAPACITY at x3 in the working tree until `git status` caught it.
const onSignal = (signal) => {
  restoreAll();
  rmSync(scratch, { recursive: true, force: true });
  console.error(`\n${signal}: sources restored, no verdict`);
  process.exit(130);
};
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => onSignal(signal));
process.on("uncaughtException", (error) => {
  restoreAll();
  rmSync(scratch, { recursive: true, force: true });
  console.error(error);
  process.exit(2);
});

/**
 * @param {Mutation} mutation
 * @returns {{ verdict: "caught" | "survived" | "stale" | "broke", files: string[], seconds: number, reason?: string }}
 */
function probe(mutation) {
  const path = join(ROOT, mutation.file);
  const original = readFileSync(path, "utf8");
  const saved = join(scratch, mutation.file.replaceAll("/", "_"));
  writeFileSync(saved, original);
  if (!original.includes(mutation.find)) return { verdict: "stale", files: [], seconds: 0 };

  writeFileSync(path, original.replace(mutation.find, mutation.replace));
  const started = Date.now();
  const run = spawnSync(process.execPath, [VITEST, "run"], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: TIMEOUT_MS,
    env: { ...process.env, GOMAXPROCS: "2" },
  });
  const seconds = (Date.now() - started) / 1000;
  writeFileSync(path, original); // restore before anything else can throw

  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const files = [...output.matchAll(/^\s*❯ (tests\/[\w./-]+\.test\.ts) \(\d+ tests? \| (\d+) failed/gm)].map(
    (match) => `${match[1]}:${match[2]}`,
  );
  if (files.length > 0) return { verdict: "caught", files, seconds };
  // A crash or a timeout is not a detection: the suite never finished judging.
  const died = run.status === null || run.signal !== null || run.status >= 2;
  if (died) return { verdict: "broke", files: [], seconds, reason: "the suite crashed or timed out — no verdict either way" };
  // Exit 1 with nothing red is not a green suite: a starved sandbox kills the
  // workers before they collect a single file. Demand the summary Vitest prints
  // only after judging, with every file and test accounted for.
  const settled = /Test Files\s+(\d+) passed \(\1\)/.test(output) && /Tests\s+(\d+) passed \(\1\)/.test(output);
  if (!settled) {
    return { verdict: "broke", files: [], seconds, reason: "exit 1 without a green summary — no test ever ran (a starved sandbox looks like this)" };
  }
  return { verdict: "survived", files: [], seconds };
}

// -------------------------------------------------------------- preflight

/**
 * Reasons this host cannot produce a trustworthy verdict right now.
 * The PID check catches the measured failure before it costs a batch; the
 * canary catches every other way a child process can fail to start.
 * @returns {string[]}
 */
function preflight() {
  const problems = [];
  try {
    const current = Number(readFileSync("/sys/fs/cgroup/pids.current", "utf8").trim());
    const max = readFileSync("/sys/fs/cgroup/pids.max", "utf8").trim();
    if (max !== "max" && current > Number(max) * 0.9) {
      problems.push(`${current} of ${max} PIDs in use — the suite's workers would fail to spawn`);
    }
  } catch {
    // No cgroup v2 on this host; the canary below still speaks for spawning.
  }
  const canary = spawnSync(process.execPath, ["-e", ""], { encoding: "utf8", timeout: 10_000 });
  if (canary.status !== 0) problems.push(`a child process cannot start (${canary.error?.code ?? canary.status})`);
  return problems;
}

// -------------------------------------------------------------------- run

const blocked = preflight();
if (blocked.length > 0) {
  console.error("refusing to probe — every verdict would read SURVIVED for the wrong reason:");
  for (const problem of blocked) console.error(`  - ${problem}`);
  process.exit(2);
}

console.log(`probing ${selected.length} mutation(s) — one file at a time, suite fully re-run each time\n`);
let failures = 0;
let expectedSurvivors = 0;
let caught = 0;
const totalStarted = Date.now();

for (const mutation of selected) {
  const result = probe(mutation);
  const label = mutation.equivalent ? "equivalent" : "law";
  if (result.verdict === "broke") {
    failures += 1;
    console.log(`BROKE   ${mutation.id}\n        ${result.reason}\n`);
    continue;
  }
  if (result.verdict === "stale") {
    failures += 1;
    console.log(`STALE   ${mutation.id}\n        pattern not found in ${mutation.file} — update the table\n`);
    continue;
  }
  if (result.verdict === "caught") {
    if (mutation.equivalent) {
      failures += 1;
      console.log(`PINNED  ${mutation.id}\n        an "equivalent" mutation went red: a test pins an artefact, not a law\n`);
      continue;
    }
    caught += 1;
    console.log(`caught  ${mutation.id}  (${result.seconds.toFixed(1)} s)\n        ${result.files.join(", ")}\n`);
    continue;
  }
  if (mutation.equivalent) {
    expectedSurvivors += 1;
    console.log(`noted   ${mutation.id}  (expected survivor)\n`);
    continue;
  }
  failures += 1;
  console.log(`SURVIVED ${mutation.id}  (${result.seconds.toFixed(1)} s)\n        no test noticed — the ${label} has no observer\n`);
}

// ------------------------------------------------------------ verification

const tampered = [];
for (const entry of originals) {
  if (sha(entry.path) === entry.digest) continue;
  // Only the table knows the real path: scratch names flatten separators.
  writeFileSync(entry.path, readFileSync(join(scratch, entry.path.slice(ROOT.length + 1).replaceAll("/", "_"))));
  tampered.push(entry.path);
  console.error(`UNRESTORED then repaired: ${entry.path}`);
}
rmSync(scratch, { recursive: true, force: true });

const total = (Date.now() - totalStarted) / 1000;
console.log(`\n${caught} caught · ${expectedSurvivors} expected survivor(s) · ${failures} problem(s) · ${total.toFixed(1)} s`);
process.exit(tampered.length > 0 ? 2 : failures > 0 ? 1 : 0);
