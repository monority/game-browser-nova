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
| Branch | `main` (origin: https://github.com/monority/game-browser-nova; default branch on GitHub, CI on `main`) |
| HEAD | `3c3bed9` — fix(nova): keep the next meal out of the market's stock; pushed to `origin/main` on 2026-11-12 with `26f844b` (feat(nova): play and judge the colony from a headless cockpit). History below: `149026b` (docs state), `180844b` (chore: local CI gate + opt-in `githooks/pre-push`), `ee7cd1f` (Step056 + Step057) — the remote history was rewritten once under it (`226a3c3` → `97ad592`, same tree `8d6499e`) and that commit was rebased onto the new base. |
| Working tree | CLEAN — everything below is committed and pushed. The agent evaluation system (`tools/agent/{run.mjs,play.ts,observe.mjs,evaluate.mjs,scenarios/{opening,balanced,age2,age3}.jsonl,README.md}`, headless play + `assess` verdict + `plan` dry-run + browser probe + unified report), `__nova.cameraView()` (additive) across `src/renderer/renderer.ts` / `src/app/diagnostics.ts` / `src/app/boot.ts`, `package.json` scripts (`play`/`observe`/`evaluate`), `tools` typechecked by `tsconfig.json` and linted by `eslint.config.js`; the Step062/Step063 fixes (`marketSafetyStock` in `src/domain/economy/economy.ts`, served-colonist water reading + market-floor alert in `src/application/queries/analysis.ts`, `src/app/details.ts`, the phase-9 comment in `src/domain/simulation/tick.ts`, `tests/{market,analysis}.test.ts`, the `market safety floor` spec in `e2e/economy.spec.ts`); and the `playwright.config.ts` `webServer` that no longer depends on `pnpm`. Local CI gate: `pnpm verify` (typecheck → lint → unit → build → E2E) plus the opt-in `githooks/pre-push` hook, documented in `README.md`, `docs/DEVELOPMENT.md` §7, `docs/VALIDATION.md` and this file (the last two stay local-only mirror docs). The hook is not activated in the agent container, whose global `core.hooksPath` is already set. `AGENTS.md`, `TASK.md` and `.agents/` stay local-only; `docs/STATE.md` is the single versioned documentation exception (README links to it), the rest of `docs/` remains a local mirror. |
| Package manager | `pnpm` 11.21.0 required. The global binary needs `libatomic.so.1`: it fails in the agent container until `LD_LIBRARY_PATH` points at the cached Debian trixie libraries (`~/.cache/nova-e2e/root`), which is how `pnpm verify` ran on 2026-11-11. Without that path the `./node_modules/.bin/*` equivalents perform the same steps. |
| Documentation | Canonical durable copy in the project vault at `05-Projects/nova`; repository `docs/STATE.md` is the single versioned status exception; the rest of `docs/` is a local working mirror |
| Node version | v24.22.2 used for the 2026-11-10 validation; `package.json` requires `>=24.19.0` |
| Typecheck | PASS — `tsc --noEmit`, no errors, including `e2e/` and `tools/` (2026-11-12) |
| Lint | PASS — `eslint .`, no findings (2026-11-12) |
| Unit tests | PASS — `vitest run`: 26 files / 347 tests, all green (2026-11-12) |
| E2E | PASS — `playwright test`: 36/36 specs on Chromium 1248 (2026-11-12), 2.8 min, including the Step056 admission-block pin, `economy.spec.ts` `market sells` after Step062 and the new `market safety floor` spec (buffer drained to exactly one tick of consumption; removing `marketSafetyStock` makes it fail). The `webServer` now runs `node node_modules/vite/bin/vite.js` instead of `pnpm dev`, so a broken `pnpm` in a container can no longer block the whole suite; `LD_LIBRARY_PATH` over the cached trixie libraries (`~/.cache/nova-e2e/root`) is still required for Chromium to load glib. |
| Build | PASS — tsc -p tsconfig.build.json + vite build; app 68.96 kB (22.20 kB gzip) + three 470.93 kB vendor chunk, 52 modules, 1.89 s (2026-11-12) |
| CI (GitHub) | PASS — run 50 on `main` @ `667c856` (2026-11-10): install → typecheck → lint → unit → build → E2E, all green; the Step053 red was not reproduced (run 47 @ `828241d` was the first green). The Actions quota was exhausted on 2026-11-11, so the same chain is replayed locally with `pnpm verify` until it resets. |

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
| Agent play | IMPLEMENTED | `tools/agent` (Step059): JSONL CLI over the real command layer and tick pipeline (`init`/`tick`/`build`/`do`/`report`/`assess`/`map`/`state`/`save`/`load`), loaded by `node tools/agent/run.mjs` through Vite's SSR loader (no new dependency); every reading composes the app queries, so the `healthy`/`tight`/`critical` verdict cannot drift from the UI. Step060 adds the rendering axis: `observe.mjs` (Playwright probe → canvas 1280×800, 634 draw calls, 598 geometries, orbit camera via the new `__nova.cameraView()`, console errors, PNG captures) and `evaluate.mjs` (one command, both axes, `PASS`/`FAIL` + `playtest/artifacts/agent/evaluate.md`); `playtest/` stays git-ignored. First real play test (2026-11-11): the shipped opening is genuinely blocked (2 workshops emit +2 pollution/tick, no absorber → quality 0 closes admission, pop pinned 10/10 through t=300), the age-1 arithmetic is infeasible while workshops run (`f + w + 2 = P` cannot satisfy food and water at once), staffing is positional so row-1 workshops starve row-2 wells, and opening housing before capacity produces a measured famine equilibrium at pop 11. The winning line is recorded in `scenarios/balanced.jsonl`: `cropRotation` first, parks before growth, water before housing, purchases spread — `verdict=HEALTHY` at t=540 and t=660 (pop 16/16, food 16 = 16, water 16 = 16, pollution 0, net +3/tick, no alert). Step061 adds `plan`: a dry-run on a clone of the live state (real command layer for cell/road rules, population pinned during the 4 simulated ticks) that reports cost/affordability, food and water per tick, jobs, money net and `capacity` = min(food, water, housing) with the binding constraint — the arithmetic the play test had to do by hand. It changes nothing in the live session. Step063 adds the age-3 line, `scenarios/age3.jsonl`: from the completed age 2 to the **Age of Prosperity** — `HEALTHY` at t=1100 (pop 24/24, money 2441, net +7/tick, no alert) and `advanceAge` → `age3 Age of Prosperity` at t=1101 with its own milestone set already satisfied. Measured doctrine: an UNSTAFFED workshop still pays (commerce is staffing-independent: +3/tick for 1 upkeep), residences are upkeep-exempt so they add operational buildings for free, one farm + two wells carry 20 → 24 colonists, and a FOURTH workshop is poison (pollution 100 with only 2 parks closed admission and starved the colony: pop 22/24, food 0, verdict CRITICAL). Measured on the shipped opening (seed `nova-default`, t=0): 4 extra residences → `cost 120$ (NOT affordable, short 20$ · treasury 100$)`, `food 11/tick` (5 staffed farms + the anchor's 1), `water 10/tick`, `capacity 10 resident(s) (binding: water)`, headroom 0 — housing stops being the limit first, water does. Capacity is a resource ceiling only (pollution gate and storage are not modelled by it). Step061 also records `scenarios/age2.jsonl`, the age-1 line continued to a completed age 2: `HEALTHY` at t=800 and t=860 (age 2, pop 20/20, money 891 net +5/tick, food 118 +0 where 22 is produced = 20 eaten + 2 sold, water 27 +0 with 20 = 20, workforce 20/20, pollution 0, `milestones pending: none`, 0 rejected command). It had to build industry first — the market costs 2 planks, so a lumber camp on the (4,4) wood deposit feeds the workshops (36 wood → 18 planks in 20 ticks, ~+10 money/tick) and the camp must precede any extra workshop (one spare worker, positional staffing) — and it had to hit an exact balance: the market drains the reserve, water is 2/well so the population must be even, which rules out irrigation and picks 7 farms + 10 wells for 20 residents |
| Construction | IMPLEMENTED | placement commands with full validation (occupied/blocked/bounds/deposits/affordability), road drag, 2-tick construction, money + plank + water costs |
| Population | IMPLEMENTED | aggregate population number (ADR-004), food-gated admission with water headroom + bootstrap exemption for the first colonist |
| Housing | IMPLEMENTED | residences, capacity 1 each, derived housing capacity |
| Needs | IMPLEMENTED | Food 1/colonist/tick with partial feeding; an unfed tick removes ONE colonist (Step055 option B, 2026-11-10); Water 1/served colonist/tick. The water alert counts SERVED colonists (`min(stock + production, population)`, Step063) instead of the post-consumption stock: the old reading reported a shortage in every colony whose reserve sat below its population (measured false positive on the age-3 line: 12 wells, water 22/80, pop 24, everyone served) |
| Production | IMPLEMENTED | Farms/Wells +2/tick staffed; extraction +2/tick from adjacent finite deposits; Workshop transformation 2 Wood → 1 Plank/tick staffed; farm/quarry yields include tech levels (Step016) |
| Deposits | IMPLEMENTED | finite cell-keyed wood/stone deposits; exhaustion keeps entry at 0; placement on deposits refused |
| Colony Center | IMPLEMENTED | day-0 anchor, operational at tick 0, unstaffed 1 wood/tick, maintenance-exempt, never player-placed, bottom-right-most deterministic placement |
| Economy | IMPLEMENTED | Step001 money model: treasury 100 start, tax 1/inhabitant/tick, commerce 2/connected Workshop/tick (staffing-independent; tradeRoutes tech adds +1/workshop, Step016), maintenance 1/operational building/tick, uncapped treasury clamped ≥ 0; Age 2 Markets sell up to 2 food/tick at 1 money each, keeping one tick of consumption in the granary — trade can drain the buffer, never empty it (Step017, safety stock Step062); when the floor is all that is left the alert stream states `Market: 0/2 food sold · stock N covers the next meal`, so a zero is never silent |
| Storage | IMPLEMENTED | Step031: derived food/water caps (base 120/80 = 2× D2 stocks, +60/40 per operational warehouse at 25$ + 2 planks, upkeep 1, unstaffed, mothball removes); tick clamps true surplus after consumption (colonists eat first, famine/market semantics unchanged); storage-full alerts (states cause); caps in stats; treasury stays uncapped |
| Logistics | PARTIAL | Step050: road-graph distance efficiency on EXTRACTION worksites (camp/quarry; free radius 12, decay 4, floor 60, wheelbarrow +6), overlay + inspection; farms/wells/workshops exempt until V2 network storage; still no congestion/capacity effects |
| Analysis | IMPLEMENTED | derived stats + resource forecasts (production/consumption/balance/ticks-remaining) + state alerts (never prescriptive) + staffing overlay + forecast drill-down (Step010–011); commerce throughput-anchored (Step012: 2/connected + 1/plank produced); food forecast includes farm tech (Step016) and nets the market drain (Step017); workforce ratio is a stat, no-road workplaces the only workforce alert (Step057) |
| UI | IMPLEMENTED | palette, road mode, hover validity + info tooltip, inspection (detail/mothball/remove), time controls pause/1×–8× with keyboard (Space/1/2/4/8; rate bug fixed Step010), save/load, forecast + alerts; progression panel, research, age advance (Step016); age-gated palette plus market row (Step017); S1: visuals in `src/styles/nova.css` via `data-*` attrs, JS paints only tooltip geometry; Step056: per-building pollution line in inspection, admission-block countdown in stats; Step057: workforce ratio moved to a permanent stat row, alert reduced to the fixable no-road cause |
| Deactivation (mothball) | IMPLEMENTED | `setBuildingActive` (Step009): inactive = no maintenance/output/housing/staffing/commerce; anchor protected; next-tick reactivation; SAVE_VERSION 14 + v13→v14 migration |
| Demolition | IMPLEMENTED | `removeBuilding` / `removeRoads` commands (Step008): anchor-protected, no refund, cell reuse, deterministic staffing recalculation, immediate maintenance relief; save v13 round-trips removals |
| Environment | IMPLEMENTED | global pollution stock, park absorption, admission quality gate (Step014); parks regrow adjacent wood to capacity (Step018); per-building contribution + admission-block countdown (Step056) |
| Technology | IMPLEMENTED | 5 techs, researchTech command, additive farm/quarry/commerce effects (Step016) |
| Ages | IMPLEMENTED | Age 1 complete, milestones, advanceAge transition, Age 2 techs plus atmosphere (Step016); Age 2 systems continue Phase 9; Age 3 "Prosperity" set (pop20/tre1500/bld30/res20/shop3, Step035), advance proven in self-play |
| Persistence | IMPLEMENTED | `SAVE_VERSION = 18` (sequential chain v13-v18: mothball flag, pollution stock, age plus techs, deposit capacity, controlled events) - no legacy migration chain (user decision: pre-reset saves do not exist here); strict validation of types, ranges, world bounds, cell collisions/overlaps, blocked/deposit cells and construction invariants; round-trip + deterministic continuation tests; `serialize` deep-copies deposit cells (S3 detach regression test) |
| Controlled events | IMPLEMENTED | Step047 + Step049 tuning (ADR-007 amended): 3 cyclic systemic events — drought (wells 2→1/tick, expiry taper), closed trade routes (workshop floor HALVED, plank bonus kept), bountiful harvest (one-off +40 food windfall at spawn; NO event inflates a production rate — measured wipe risk, Step048/049); 40 ticks, draws pure f(seed, occurrence), off by default (sandbox), frequency cursor in Settings (GameState-persisted), alerts states-only; no-famine collapse guard on the robustness seed passes (was wiping pop 24→0 pre-tuning) |
| Performance | MEASURED | sim 0.06–0.14 ms/tick (≤0.2% of 8x budget); mesh rebuild 1.6 ms/update; geometry leak found+fixed (Step027); full rebuild kept, measured OK |

---

## Known Issues

Only confirmed issues belong here.

| Issue | Impact | Status |
|---|---|---|
| Step001 baseline is net-negative; self-play (Step019) measured the trap as structural: best-known line (residence, well, workshop, park) stalls at pop1/money0 over 3000 ticks - income 3 (1 tax + 2 commerce) cannot cover the 3-4 upkeep minimum, so growth surplus never forms. Funded starts stall at pop4; commerce-first overbuild spirals (19 upkeep vs 11 income) | No line completes the MVP loop as shipped; human players stall where the governor stalls | RESOLVED in implementation (Step021) - D1 decided as: D2 day-0 colony (10 pop, 10 res, 5 farm, 5 well, 2 shops, food 60 / water 40 / money 100) + residence upkeep exemption + workshop base floor gated on pop>=8. Measured: B/F2 variants ready@140, age2@140, market@155, zero wipes; A/C/D/F stall. IMPLEMENTED Step021 (D2 colony ships, residences exempt, commerce gated pop>=8; self-play: ready@185, age2@185, pop12@218, market-sale@327) |
| Zero-money colony: Step008 removal + Step009 mothballing make ANY composition recoverable — deactivate/mothball all but a minimal staffed core → net ≥ 0 → accumulate (verified W>F: net +1; W=F: net 0 boundary) | Crises are prolonged but recoverable; growth pace still set by standing workshop density | RESOLVED in implementation (Step009) — remaining tuning only on measured evidence |
| Commerce hybrid (Step012 D3/D6 + Step021 gate + Step016 tech): 2/tick connection base gated on pop>=8 (vacant earns floor, staffing-independent) + 1/plank actually produced (throughput bonus, always on) + tradeRoutes +1/connected workshop; staffed woodless = base only, vacant with wood = no bonus, unconnected/under-construction = 0 | Floor preserves small-colony viability, bonus makes real transformation the growth engine; D3 second step (mills/goods) remains future scope | RESOLVED in implementation — locked by economy/transformation/progression tests + selfplay equilibrium |
| Water coverage is a global stock gate (no per-network coverage) | Simplification vs. the pre-reset per-network water contract | ACCEPTED for the rebuild (aggregate MVP model per ADR-003); revisit if water logistics design lands |
| Market sales drain the RESERVE, not only a surplus: while `stock + production >= need` a market sells 2 food/tick, so a colony at food balance 0 empties its granary (measured Step061, seed `nova-default`: 120 → 0 in 60 ticks, 16 then 20 colonists unfed) | A market must be paired with `production >= mouths + 2` or it starves the colony; `economy.ts` states sales "never starve colonists", which the measurement contradicts | RESOLVED in implementation (Step062) — decided as: a market sells food the colony can SPARE, i.e. the granary above one tick of consumption (`marketSafetyStock` = population × 1); trade never takes the next meal, so the measured famine is impossible (a balanced colony now floors at its need instead of draining 120 → 0). The stricter alternative — sell the tick's FLOW surplus only, never the reserve — was measured and rejected: the budget governor earned nothing (`treasury 991` vs the 1500 Age-3 milestone, even after keeping a surplus farm awake) because a market then pays 2/tick for a worker that a workshop pays 3/tick, leaving the Age-2 building dominated. Locked by the market tests (forecast = sale, cap, starving colony 0, `never empties the granary` regression) |

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
- fertility beyond Step014 pollution/quality/parks.

Do not implement deferred scope without an explicit product decision.

---

## Current Approved Step

Step060 (complete evaluation system, 2026-11-11, implemented uncommitted): the cockpit gains the axis it could not see. `__nova.cameraView()` exposes the orbit camera (position, target, radius, phi, theta, fov, aspect) as an additive diagnostics field; `tools/agent/observe.mjs` boots the real app under Playwright, captures tick 0 and tick N (8×) and reports canvas size, draw calls, geometries, mean mesh rebuild, camera and console errors; `tools/agent/evaluate.mjs` runs a JSONL scenario and the probe in one command and emits a single `PASS`/`FAIL` with both axes. Measured: simulation `t=120 critical`, `t=300 critical` (pollution 100, food pinned), rendering `canvas 1280×800 · drawCalls 634 · geometries 598 · avgUpdate 4.67 ms · radius 26.4 · target (12,12)`, two non-empty PNGs (180–187 kB) → exit 0. The probe's first real failure (Vite on `localhost` binding `::1` while the probe polled IPv4) was fixed at the cause by binding `--host 127.0.0.1`. Validation: tsc, lint, 342 unit tests and E2E green.

Step059 (agent play cockpit, 2026-11-11, implemented uncommitted): `tools/agent` gives a headless way to play and judge the game — JSONL commands through `applyCommand`/`stepTicks`, readings through the app's own queries, an `assess` verdict with exact reasons and a stagnation window, and an ASCII map. Validation: tsc, lint and the 342 unit tests green; a real session (`report` → `assess` → `build` → `tick 120` → `save` → `tick 30` → `load` → `map`) ran clean and the load restored `t=120`. First finding from the tool: the shipped opening saturates pollution to 100 (quality 0, admission blocked) after ~120 ticks with both workshops running and no park, population pinned at 10/10 while food is pinned — the known Step014/056 pressure, now measurable without writing a test.

Step057 (F5 workforce alert, 2026-11-11, implemented uncommitted): the permanent `Workforce: 10/12 workplaces staffed` alert is replaced by a permanent `Workforce N / M staffed` stat row plus a single fixable-cause alert (`Workplaces: N without road access`), silent in the D2 opening; structural shortage stays visible in the stats row, the employment overlay and per-building inspection. Validation: tsc, lint, 342 unit tests, build and E2E 35/35 green.

Step056 (Step052 triage + pollution legibility, 2026-11-11, implemented uncommitted): the remaining F1 gap — the Step053 "Growth blocked" alert requires housing headroom, which the exactly-full D2 opening (10/10) never has — is closed by a derived admission-block countdown in the stats panel and a per-building pollution line in inspection (single counting shared with the tick). Triage: F1/F4/F6/F7/F8/F9 closed, F5 stays deferred (Step053 C.5), F2/F3 stay in the visual scope. Validation: tsc, lint, 341 unit tests, build and E2E (35/35) green; the first E2E run rejected the new pin as too strict (0 = "blocked now" is a valid deadline at 8x), which the corrected assertion now covers.

Step055 gameplay-clarity diagnostic, complete (2026-11-03; doc only, zero code changes). F12 IMPLEMENTED (committed `54575bd`, 2026-11-10): the water forecast consumes the NEED (pop × 1/tick); the served amount remains the alert signal, and the two misleading analysis tests were rewritten around a real deficit. F13 measured via 4 deterministic scenarios (seed f13-test): before the decision the famine was all-or-nothing in ONE tick (measured: pop 14 → 0), the stock buffered 16-45 ticks of visible countdown, recovery works before (1 farm) and after (10 ticks via trickle); option B decided by the owner and IMPLEMENTED (2026-11-10): `consumeFood` returns the fed colonists, `updatePopulation` removes ONE colonist per unfed tick (`STARVATION_LOSS_PER_TICK`), no save migration, and the analysis alert states the loss (`Food: 0 stock · N colonists unfed (−1/tick)`); the Step054 scenario E instrument is in place (deterministic table in `tests/famine-recovery.test.ts`, UI walkthrough in `playtest/famine-recovery.spec.ts`, human protocol in Step054 §3bis); options A and C are closed in docs/roadmap/Step055-gameplay-clarity-survival-balance.md. Context: Step053 pushed (CI E2E red — flake suspected; 3×34/34 at the time, 35/35 locally on 2026-11-10); Step054 human session still open.

---

## Update Protocol

Update this file only when actual repository state changes materially.

Do not turn it into a task list.

Do not claim validation that was not executed.

Record concise evidence, not long explanations.
