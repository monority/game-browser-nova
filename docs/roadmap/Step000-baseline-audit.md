# Step000 — Baseline Audit (new docs base)

## AUDIT

Objective: reconcile the implementation with the recreated documentation
base (`docs/game/`, `docs/adr/`) and establish a healthy base for the
migration. Audit only — no gameplay mechanic changed in this step.

Prior commits in this step (already pushed where noted):

- `48bc946` — preserved pre-existing gameplay fixes (workshop-only
  Material income, water admission deadlock, road feedback). Pushed to
  `Nova/master`.
- `74c21e3` — removed superseded root docs, tracked `docs/game/`,
  `docs/adr/`, root engineering docs, un-ignored `docs/`. Not yet pushed.

Validation rerun for the preserved fixes: `tsc --noEmit` clean,
`eslint .` clean, `vitest run` 124 files / 1922 tests pass,
`vite build` succeeds.

## OBSERVATIONS

What the code is (evidence from `src/`, HEAD `74c21e3`):

- Empty-world start: 0 buildings, 0 colonists, 0 roads; stock
  100 Material / 100 Food / 0 Water (`createInitialResourceStock`,
  `createInitialState`). First colonist arrives through the bootstrap
  admission gate.
- Individual population: canonical `ColonistState` entities with
  `workplaceId`; 1:1 employment (Farm/Workshop/Well capacity 1 each);
  manual reassignment with override flags (`jobs.ts`, `colonist.ts`).
- Housing: one Residence admits one colonist (`housingCapacity: 1`).
- Economy: exactly 3 resources (Food, Water, construction Material);
  Material doubles as currency (construction costs, road costs, upkeep);
  no money, tax, commerce, maintenance or pollution anywhere in `src/`.
- Needs: binary-ish signals (`fed`, water `shortage`/`noReserve`/…);
  no progressive satisfaction bands, no quality of life, no growth-rate
  effects.
- Production: 3 direct producers, no inputs (except 1 Water on Workshop
  placement), no chains, no maintenance, no environmental cost.
- Progression: Settlement → Village → Town capability stages; Town
  intentionally undefined (old Step 10BN deferral). No ages, technology,
  or milestone system.
- Architecture (conforms): domain / application / presentation layers,
  explicit commands, deterministic fixed tick, seeded world, versioned
  persistence, no React/Three.js in domain. Road networks and the access
  contract exist (usable topology base for aggregate logistics).

Gaps against the new contract:

| # | Contract (`docs/game`, `docs/adr`) | Code reality | Severity |
|---|------------------------------------|--------------|----------|
| 1 | ADR-004 aggregate-first population | Individual colonist entities + manual assignment | Blocking |
| 2 | Start: colony of 10 inhabitants (user decision) | Empty world + 1-colonist bootstrap | Blocking |
| 3 | Material → Money (user decision) | Material is the currency | Blocking |
| 4 | MVP 5–10 resources + money | 3 resources, no money | Major |
| 5 | Progressive satisfaction / QoL | Binary fed/shortage signals | Major |
| 6 | Maintenance + pollution costs | None | Major |
| 7 | Age 1 + technology + milestones | Settlement/Village/Town only | Major |
| 8 | Aggregate logistics (capacity, distance, congestion) | Topology + access exist; flow effects unverified | To verify |
| 9 | Large procedural world / sectors | Small grid world (terrain exists) | To verify |

## DECISION

User-confirmed product decisions (2026-10-06):

1. New docs overwrite everything old; obsolete docs removed.
2. Migrate to the documented model (aggregate-first).
3. Canonical start: a colony of **10 inhabitants**.
4. **Material becomes Money** (rename/migration design still open).
5. Preserve-then-commit-then-push order for pre-existing fixes: done.
6. Steps live in `docs/roadmap/` (this file + `README.md` start it).

Open design points (migration design needed before implementation):

- D1: Money model — straight rename of Material, or new resource with
  conversion, prices, income/expenses?
- D2: 10-inhabitant start — which buildings/roads/stocks ship on day 0,
  and what is the intended solvable problem?
- D3: Aggregate population shape — which fields are canonical
  (total, housing capacity, QoL, employed, flexible, education, health)?
- D4: What happens to manual reassignment UI and existing scenarios?

## IMPLEMENTATION

This step: commits above + `docs/roadmap/README.md` + this file.
No `src/` change.

## VALIDATION

- `git status`: clean except `audits.txt` (untracked leftover from
  earlier runs, intentionally not committed).
- Preserved-fixes validation rerun: typecheck clean, lint clean,
  vitest 124/1922 pass, build succeeds.

## RESULT

Healthy base established: pushed gameplay fixes, versioned docs base,
tracked step folder, gap table with evidence. Migration design (D1–D4)
is the next decision gate; no migration code written yet.
