# NOVA

A 3D stylized civilization / city-builder in the browser.

You direct a colony rather than micro-managing it: place infrastructure, choose what to
produce, organize logistics, balance growth against the environment, and push the
civilization through the ages. The simulation handles routine work — staffing,
distribution, trade — so the interesting decisions stay with the player.

## Status

The MVP is playable end to end: a day-0 colony runs through production, storage,
logistics, population needs and research, and clears the Age 2 and Age 3 gates. The
simulation is deterministic (fixed ticks, seeded world), so a run is reproducible and
testable.

What is left is product work rather than implementation: no human playtest session has
been run yet, and one self-play finding — a dominated endgame posture — is an open
design call. `docs/STATE.md` records the current facts and the measurement behind every
closed item.

## Tech stack

TypeScript (strict) · Vite · Three.js · Vitest · Playwright · pnpm

## Getting started

Requirements: Node.js `24.19.0` (see `.nvmrc`) and pnpm `11.21.0` (via Corepack).

```bash
corepack enable
pnpm install
pnpm dev
```

Then open the URL printed by Vite (default `http://localhost:5173`).

## Controls

| Input | Action |
|---|---|
| Left click | Build, select, inspect |
| Drag | Orbit the camera |
| Wheel | Zoom |
| Right-drag | Pan |
| `Space` | Pause / resume |
| `1` `2` `4` `8` | Simulation speed |

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server with hot reload |
| `pnpm build` | Typecheck + production bundle |
| `pnpm typecheck` | `tsc --noEmit` (strict) |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit + self-play tests (Vitest) |
| `pnpm test:e2e` | Browser journeys (Playwright) |
| `pnpm test:audit` | Vacuity audit: every test must assert something |
| `pnpm test:mutations:fast` | Mutation probe: does the suite catch planted defects? |
| `pnpm check` | Typecheck + lint + audit + unit + fast mutation probe |
| `pnpm verify` | Full local CI gate: check + build + browser journeys |

## Project structure

```text
src/domain/       deterministic simulation rules (no React, no Three.js)
src/application/  use cases and queries over the game state
src/content/      game data definitions (buildings, techs, resources)
src/renderer/     Three.js presentation
src/app/          UI, input and bootstrap
e2e/              Playwright browser journeys
tests/            Vitest unit and self-play tests
tools/agent/      Headless play + evaluation cockpit (JSONL over the real rules)
```

## Validation

`pnpm verify` replays the whole CI gate locally (typecheck, lint, vacuity audit, unit,
mutation probe, build, browser journeys); `pnpm check` and `pnpm test:e2e` run the same
steps separately. CI runs the chain on every push and pull request to `main`.

The browser journeys need Playwright's Chromium (`pnpm exec playwright install chromium`, or
`./node_modules/.bin/playwright install chromium` when `pnpm` itself is broken).
Playwright starts the dev server itself, and calls Vite through `node` rather than `pnpm`,
so a broken `pnpm` cannot block the suite. On a bare Linux container Chromium still needs
the usual shared libraries — point `LD_LIBRARY_PATH` at them if the run dies with
`error while loading shared libraries`.
