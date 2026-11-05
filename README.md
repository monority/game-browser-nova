# NOVA

A 3D stylized civilization / city-builder in the browser.

You direct a colony rather than micro-managing it: place infrastructure, choose what to
produce, organize logistics, balance growth against the environment, and push the
civilization through the ages. The simulation handles routine work — staffing,
distribution, trade — so the interesting decisions stay with the player.

## Status

MVP delivered. The playable loop runs from a day-0 colony through production,
storage, logistics, population needs, research, Age 2 and the first market. The
simulation is deterministic (fixed ticks, seeded world), which keeps runs reproducible
and testable. Post-MVP product decisions (F12/F13, events, Step054 human playtest)
remain open; current facts live in `docs/STATE.md`.

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

## Project structure

```text
src/domain/       deterministic simulation rules (no React, no Three.js)
src/application/  use cases and queries over the game state
src/content/      game data definitions (buildings, techs, resources)
src/renderer/     Three.js presentation
src/app/          UI, input and bootstrap
e2e/              Playwright browser journeys
tests/            Vitest unit and self-play tests
```

## Validation

`pnpm check` mirrors the CI gate for types, lint and unit tests; `pnpm test:e2e` adds
the browser journeys. CI runs both on every push and pull request to `main`.
