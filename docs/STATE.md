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
| Branch | `master` (tracks `Nova/master`, ahead 1) |
| HEAD | `5700172` — docs(nova): raise doc grades — links, STATE, Step001, D1/D2/D4 decisions |
| Working tree | `DIRTY` — Step002 foundation pass: AGENTS.md + docs corpus rewrite, 90 test files migrated to the Step001 money model, `audits.txt` debug log removed; see `docs/roadmap/Step002-money-suite-green.md` |
| Package manager | `pnpm` (pnpm 11.21.0) |
| Node version | v24.19.0 |
| Typecheck | PASS — `npx tsc --noEmit`, no errors (2026-10-08) |
| Lint | PASS — `npx eslint .`, no findings (2026-10-08) |
| Unit tests | PASS — `npx vitest run`: 124 files / 1908 tests, all green (2026-10-08, Step006) |
| E2E | PASS — full suite: 27/27 scripts, 0 failed (Step003 pass, 2026-10-08); two pre-existing single-read hover races noted (pass in isolation) |
| Build | PASS — `npm run build` (tsc -p tsconfig.build.json + vite build) (2026-10-08) |

Update these values from actual command output.

---

## Implementation State

| Area | Status | Evidence / Notes |
|---|---|---|
| Foundation | IMPLEMENTED | `src/domain` (pure simulation), `src/application` (queries/scenarios), `src/renderer`, `src/app/main.ts`; strict TS, single runtime dependency `three` |
| World | IMPLEMENTED | seeded terrain, blocked cells (`src/domain/world`, terrain E2E) |
| Camera | IMPLEMENTED | Three.js orbit/pan camera (`src/renderer`) |
| Construction | IMPLEMENTED | placement commands, road drag, 2-tick construction, Construction Crew (09H/10AD) |
| Population | IMPLEMENTED | aggregate colonists, admission gate (housing + Food + Water), deterministic growth |
| Housing | IMPLEMENTED | residences, capacity 1 each, service queries |
| Needs | IMPLEMENTED | Food 1/colonist/tick all-or-nothing; Water 1/served colonist/tick |
| Production | IMPLEMENTED | Farms 2 Food/tick, Wells 2 Water/tick; Workshops earn commerce (no physical output) |
| Storage | PARTIAL | Food/Water uncapped colony stocks; treasury uncapped; per-Workshop storage cap removed with the Material resource in Step001 |
| Logistics | IMPLEMENTED | road networks, road access for staffing + commerce, per-network Water coverage |
| Analysis | IMPLEMENTED | stats surface (money/taxes/commerce/revenue/maintenance/netMoney), inspection panel, food forecast |
| Economy | IMPLEMENTED | Step001 money model: treasury 100 start, tax 1/inhabitant/tick, commerce 2/connected Workshop/tick, maintenance 1/operational building/tick, uncapped treasury |
| Environment | UNKNOWN | not inspected this pass |
| Technology | PLANNED | no implementation found |
| Ages | PLANNED | progression stages implemented (wilderness→village→settlement→town); Age system is not |
| Persistence | IMPLEMENTED | versioned save/load, `SAVE_VERSION = 13` (Step003 wood + Step004 anchor + Step005 stone + Step006 planks: `resources.wood/stone/planks`, `woodDeposits`/`stoneDeposits`), canonical hash, deterministic continuation |
| Performance | UNKNOWN | no measurements taken this pass |

---

## Known Issues

Only confirmed issues belong here.

| Issue | Impact | Status |
|---|---|---|
| Step001 baseline is net-negative for typical colonies (e.g. revenue 4 vs maintenance 5 for a 2-colonist village with a Workshop): the `water-reserve-industry` scenario cannot fund its promised second Well | Scenario promises are unfundable; commerce rarely beats maintenance | OPEN — D1 income/expense balance, deliberately deferred (see `docs/roadmap/Step002-money-suite-green.md` §D1); needs a product decision |

---

## Deferred Scope

Examples of explicitly deferred systems:

- factions;
- advanced diplomacy;
- complex BOT civilizations;
- colonies;
- war;
- advanced global economy;
- advanced events.

Do not implement deferred scope without an explicit product decision.

---

## Current Approved Step

Step006 (first physical transformation: Workshop 2 Wood → 1 Plank) — complete; see `docs/roadmap/Step006-first-transformation.md`.

---

## Update Protocol

Update this file only when actual repository state changes materially.

Do not turn it into a task list.

Do not claim validation that was not executed.

Record concise evidence, not long explanations.
