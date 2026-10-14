# NOVA — Repository State

## Purpose

This document records the **actual state of the repository**.

It is not a roadmap and not a wish list.

Never mark a feature complete without implementation and validation evidence.

---

## Status Vocabulary

- `IMPLEMENTED` — implemented and validated
- `PARTIAL` — partially implemented
- `PLANNED` — documented but not implemented
- `DEFERRED` — explicitly postponed
- `BLOCKED` — blocked by a known issue
- `UNKNOWN` — not inspected or evidence is insufficient

---

## Repository

| Field | Value |
|---|---|
| Branch | `master` (local only; no remote configured) |
| HEAD | Step025 staffing visibility (UI slice, no migration) |
| Working tree | CLEAN |
| Package manager | `pnpm` (pnpm 11.21.0) |
| Node version | v24.19.0 |
| Typecheck | PASS — `npx tsc --noEmit`, no errors (2026-10-14, Step025) |
| Lint | PASS — `npx eslint .`, no findings (2026-10-14, Step025) |
| Unit tests | PASS — `npx vitest run`: 17 files / 218 tests, all green (2026-10-14, Step025) |
| E2E | PASS — Playwright: 13/13 scenarios (2026-10-14, Step025; staffing-visibility journey) |
| Build | PASS — `pnpm build` (tsc -p tsconfig.build.json + vite build) (2026-10-14, Step025) |

> **Rebuild note (2026-10-09):** this repository was intentionally reset to
> docs-only and the implementation was rebuilt from the documented contract
> (docs/game/, docs/adr/, roadmap Steps 001–006). The historical test counts
> (1908 unit / 336 E2E checks) and SAVE_VERSION 4→12 migration chain of the
> pre-reset repository do NOT apply here. See `docs/roadmap/Step007-rebuild-from-contract.md`.

Update these values from actual command output.

---

## Implementation State

| Area | Status | Evidence / Notes |
|---|---|---|
| Foundation | IMPLEMENTED | TypeScript strict (`noUncheckedIndexedAccess`), Vite, Vitest, ESLint flat, pnpm; single runtime dependency `three` |
| World | IMPLEMENTED | seeded terrain (explicit + 6% seeded obstacles), blocked cells, bounds validation (`src/domain/world`) |
| Camera | IMPLEMENTED | orbit/pan/zoom (`src/renderer`), drag + wheel |
| Construction | IMPLEMENTED | placement commands with full validation (occupied/blocked/bounds/deposits/affordability), road drag, 2-tick construction, money + plank + water costs |
| Population | IMPLEMENTED | aggregate population number (ADR-004), food-gated admission with water headroom + bootstrap exemption for the first colonist |
| Housing | IMPLEMENTED | residences, capacity 1 each, derived housing capacity |
| Needs | IMPLEMENTED | Food 1/colonist/tick all-or-nothing (starvation removes all); Water 1/served colonist/tick |
| Production | IMPLEMENTED | Farms/Wells +2/tick staffed; extraction +2/tick from adjacent finite deposits; Workshop transformation 2 Wood → 1 Plank/tick staffed; farm/quarry yields include tech levels (Step016) |
| Deposits | IMPLEMENTED | finite cell-keyed wood/stone deposits; exhaustion keeps entry at 0; placement on deposits refused |
| Colony Center | IMPLEMENTED | day-0 anchor, operational at tick 0, unstaffed 1 wood/tick, maintenance-exempt, never player-placed, bottom-right-most deterministic placement |
| Economy | IMPLEMENTED | Step001 money model: treasury 100 start, tax 1/inhabitant/tick, commerce 2/connected Workshop/tick (staffing-independent; tradeRoutes tech adds +1/workshop, Step016), maintenance 1/operational building/tick, uncapped treasury clamped ≥ 0; Age 2 Markets sell up to 2 surplus food/tick at 1 money each (Step017) |
| Storage | PARTIAL | Food/Water uncapped colony stocks; treasury uncapped; no storage capacity mechanics (StorageHub never rebuilt — audit D5 consciously parked) |
| Logistics | PARTIAL | road networks + road access for staffing and commerce (orthogonal components); no distance/congestion/capacity effects |
| Analysis | IMPLEMENTED | derived stats + resource forecasts (production/consumption/balance/ticks-remaining) + state alerts (never prescriptive) + staffing overlay + forecast drill-down (Step010–011); commerce throughput-anchored (Step012: 2/connected + 1/plank produced); food forecast includes farm tech (Step016) and nets the market drain (Step017) |
| UI | IMPLEMENTED | palette, road mode, hover validity + info tooltip, inspection (detail/mothball/remove), time controls pause/1×–8× with keyboard (Space/1/2/4/8; rate bug fixed Step010), save/load, forecast + alerts; progression panel, research, age advance (Step016); age-gated palette plus market row (Step017) |
| Deactivation (mothball) | IMPLEMENTED | `setBuildingActive` (Step009): inactive = no maintenance/output/housing/staffing/commerce; anchor protected; next-tick reactivation; SAVE_VERSION 14 + v13→v14 migration |
| Demolition | IMPLEMENTED | `removeBuilding` / `removeRoads` commands (Step008): anchor-protected, no refund, cell reuse, deterministic staffing recalculation, immediate maintenance relief; save v13 round-trips removals | 
| Environment | IMPLEMENTED | global pollution stock, park absorption, admission quality gate (Step014); parks regrow adjacent wood to capacity (Step018) |
| Technology | IMPLEMENTED | 5 techs, researchTech command, additive farm/quarry/commerce effects (Step016) |
| Ages | IMPLEMENTED | Age 1 complete, milestones, advanceAge transition, Age 2 techs plus atmosphere (Step016); Age 2 systems continue Phase 9 |
| Persistence | IMPLEMENTED | `SAVE_VERSION = 17` (sequential chain v13-v17: mothball flag, pollution stock, age plus techs, deposit capacity) - no legacy migration chain (user decision: pre-reset saves do not exist here); strict validation, round-trip + deterministic continuation tests |
| Performance | UNKNOWN | no measurements taken |

---

## Known Issues

Only confirmed issues belong here.

| Issue | Impact | Status |
|---|---|---|
| Step001 baseline is net-negative; self-play (Step019) measured the trap as structural: best-known line (residence, well, workshop, park) stalls at pop1/money0 over 3000 ticks - income 3 (1 tax + 2 commerce) cannot cover the 3-4 upkeep minimum, so growth surplus never forms. Funded starts stall at pop4; commerce-first overbuild spirals (19 upkeep vs 11 income) | No line completes the MVP loop as shipped; human players stall where the governor stalls | RESOLVED in implementation (Step021) - D1 decided as: D2 day-0 colony (10 pop, 10 res, 5 farm, 5 well, 2 shops, food 60 / water 40 / money 100) + residence upkeep exemption + workshop base floor gated on pop>=8. Measured: B/F2 variants ready@140, age2@140, market@155, zero wipes; A/C/D/F stall. IMPLEMENTED Step021 (D2 colony ships, residences exempt, commerce gated pop>=8; self-play: ready@185, age2@185, pop12@218, market-sale@327) |
| Zero-money colony: Step008 removal + Step009 mothballing make ANY composition recoverable — deactivate/mothball all but a minimal staffed core → net ≥ 0 → accumulate (verified W>F: net +1; W=F: net 0 boundary) | Crises are prolonged but recoverable; growth pace still set by standing workshop density | RESOLVED in implementation (Step009) — remaining tuning only on measured evidence |
| Commerce is a subsidy mechanic (2/tick for a connected operational Workshop regardless of inputs) while the Workshop also transforms wood → planks; documented physical/commerce separation | Workshop earns commerce from existence, contradicting the transformation principle (audit D3/D6) | DEFERRED — re-anchoring blocked on the D1 product decision |
| Water coverage is a global stock gate (no per-network coverage) | Simplification vs. the pre-reset per-network water contract | ACCEPTED for the rebuild (aggregate MVP model per ADR-003); revisit if water logistics design lands |

---

## Deferred Scope

Examples of explicitly deferred systems:

- factions;
- advanced diplomacy;
- complex BOT civilizations;
- colonies;
- war;
- advanced global economy;
- advanced events;
- building removal refunds (no-refund policy decided, Step008);
- storage capacity mechanics;
- fertility beyond Step014 pollution/quality/parks.

Do not implement deferred scope without an explicit product decision.

---

## Current Approved Step

Step025 (Staffing visibility, complete) - see `docs/roadmap/Step025-staffing-visibility.md`. Staffing order/state inspectable per workplace; workforce shortage alert; age-locked market button labeled.

---

## Update Protocol

Update this file only when actual repository state changes materially.

Do not turn it into a task list.

Do not claim validation that was not executed.

Record concise evidence, not long explanations.
