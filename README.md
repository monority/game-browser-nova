# NOVA

A 3D stylized civilization / city-builder in the browser.

You direct a colony rather than micro-managing it: place infrastructure, choose what to
produce, organize logistics, balance growth against the environment, and push the
civilization through the ages. The simulation handles routine work — staffing,
distribution, trade — so the interesting decisions stay with the player.

## Status

MVP delivered. The playable loop runs from a day-0 colony through production,
storage, logistics, population needs, research and Age 2 into Age 3. The
simulation is deterministic (fixed ticks, seeded world), which keeps runs reproducible
and testable. Post-MVP product decisions (F13, Step054 human playtest) remain open; the
F12 water-forecast defect is fixed and committed (`54575bd`). Current facts live
in `docs/STATE.md`.

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
| `pnpm check` | Typecheck + lint + unit tests |
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

`pnpm verify` replays the whole CI gate locally (typecheck, lint, unit, build, browser
journeys); `pnpm check` and `pnpm test:e2e` run the same steps separately. CI runs the
chain on every push and pull request to `main`.

The browser journeys need Playwright's Chromium (`pnpm exec playwright install chromium`, or
`./node_modules/.bin/playwright install chromium` when `pnpm` itself is broken).
Playwright starts the dev server itself, and calls Vite through `node` rather than `pnpm`,
so a broken `pnpm` cannot block the suite. On a bare Linux container Chromium still needs
the usual shared libraries — point `LD_LIBRARY_PATH` at them if the run dies with
`error while loading shared libraries`.
