# Step005 — Physical Stone + Extraction

Baseline: `993a21a` (Step004 day-0 bootstrap hardening). Implements the second
physical-resource slice from the audit — Stone deposits + Quarry — by mirroring
the validated Step003 Wood architecture.
Date: 2026-10-08.

## IMPLEMENTATION

### Deposits module generalization

`world/woodDeposits.ts` renamed to `world/deposits.ts` with shape-generic,
neutral helpers (`Deposit`, `Deposits`, `depositKey`, `adjacentRemaining`,
`extractAdjacent`, `hasDepositAt`, `normalizeDeposits`). The math is
resource-agnostic cell-keyed bookkeeping; Wood and Stone remain concrete
per-resource state fields — no generic deposit framework.

### Stone deposits (audit D1/D2)

- `state.stoneDeposits` — same canonical cell-keyed representation as Wood;
  finite, exhaustion keeps the entry at 0; seeded from
  `config.world.stoneDeposits`; placement on a deposit cell is refused with
  `depositBlocked` (validated for both deposit kinds).
- Old saves default to empty stone deposits (v12 migration).

### Quarry (extraction)

- Building type `quarry`: workplace (capacity 1) with the exact
  Lumber Camp contract — same staffing, mobility, road-access and
  next-tick production timing; 2-tick construction, 25 money, no water cost.
- `produceStone` (tick phase 4d, after `produceWood`): every staffed
  operational Quarry extracts `STONE_PER_QUARRY_PER_TICK = 2` stone from
  orthogonally adjacent stone deposits, capped by what remains, deterministic
  sorted-id drain order.
- The Colony Center does NOT collect stone: Wood remains the primitive
  recovery resource (audit D4).

### Resource accounting

`resources.stone` added to the canonical stock (initial 0 for migrated saves;
never created ex nihilo). Economy untouched: taxes, maintenance, commerce,
construction costs, and Wood extraction rates unchanged.

### Save / migration

`SAVE_VERSION` 11 → **12**; `MIGRATABLE_SAVE_VERSION` 10 → 11 (chain now
v4–v11). `migrateV11ToV12` adds `resources.stone: 0` and empty
`stoneDeposits`; Wood deposits, stock, buildings and the Colony Center anchor
are preserved untouched.

## SELF-LOCK / REGRESSION TESTS (tests/stoneExtraction.test.ts, 11 tests)

Normal extraction (+2/−2), unstaffed Quarry → 0, empty deposit → 0 (entry
remains), final extraction capped by remaining quantity, no ex-nihilo
generation, orthogonal adjacency only, deterministic hash, full-tick
integration, Colony Center wood recovery unaffected (collects no stone),
stone deposits block placement, save/load round-trip of stone fields.

## VALIDATION

| Gate | Command | Result |
|---|---|---|
| G1 | `npx tsc --noEmit` | PASS |
| G2 | `npx eslint .` | PASS |
| G3 | `npx vitest run` | PASS — 124 files / 1908 tests (11 new), 0 failed |
| G8 | `npm run build` | PASS |
| G9 | full E2E suite | 27/27 (progression/industrial save-keys 9→10; three state-injection fixtures gained `stone`/`stoneDeposits`) |

## DEFERRED

Unchanged from the audit and Step003/004: transformation/factories, commerce
re-anchoring, economy balancing, resource-dependent construction costs,
fertility, regeneration, recycling, logistics, technologies, ages, factions,
demolition, generic frameworks.

## RESULT

Stone slice complete: finite cell-keyed stone deposits + staffed Quarry
extraction, fully mirroring the validated Wood architecture with zero
economy changes.
