# Step004 — Day-0 Bootstrap Hardening

Baseline: `7fb0eb6` (Step003 wood slice). Implements the audit's D4 day-0
guarantee: **every new colony owns its Colony Center from tick 0**.
Date: 2026-10-08.

## PRODUCT DECISION (mandated)

The Colony Center is the settlement anchor, not an optional building. A new
colony must always be able to reach its primitive Wood recovery capability
without depending on resources it may already have spent — including at
population 0, with no Lumber Camp and no money.

## IMPLEMENTATION

- `createInitialState` pre-places exactly one Colony Center:
  - canonical id `colony-center` (deliberately NOT from the `building-N`
    counter, so the player's first building keeps id `building-1`);
  - deterministic bottom-right placement: first valid cell scanning
    y desc / x desc, skipping terrain-blocked cells and wood deposits;
  - `operational` from tick 0 (founding structure, not a construction
    project); a world without a single valid cell throws at initialization.
- **Uniqueness**: `validatePlacement` rejects `colonyCenter` placement with
  the new reason `colonyCenterExists` — the anchor is never player-placed.
- **Maintenance exemption**: the anchor is operational but does NOT pay the
  uniform 1/tick maintenance (`isMaintenanceExempt`). Billing the recovery
  capability itself would be an economy-balancing change, which is out of
  scope; taxes/commerce/construction costs are untouched.
- **Save migration**: `SAVE_VERSION` 10 → 11; `MIGRATABLE_SAVE_VERSION` 10.
  `migrateV10ToV11` deterministically adds the anchor to old saves (same
  bottom-right rule over the SAVED world's blocked cells and deposits) and
  preserves an existing Colony Center untouched (no duplicates). Old saves
  that previously carried a player-placed Center keep it as-is.
- `parseState` now round-trips `config.world.woodDeposits` (seed array), so
  Step003 saves with deposits validate against the strict canonical check.

## DAY-0 INVARIANT (tests/colonyCenterBootstrap.test.ts, 8 tests)

```text
New colony
→ Colony Center exists (operational, exactly one)
→ no Lumber Camp required
→ primitive Wood recovery is possible at population 0
```

Plus the failure boundary: with all deposits exhausted, the anchor cannot
create Wood ex nihilo (Step003 invariant still holds). Also covered:
deterministic placement (bottom-right), blocked/deposit avoidance,
uniqueness rejection, persistence round-trip, maintenance exemption.

## VALIDATION

| Gate | Command | Result |
|---|---|---|
| G1 | `npx tsc --noEmit` | PASS |
| G2 | `npx eslint .` | PASS |
| G3 | `npx vitest run` | PASS — 123 files / 1897 tests (8 new), 0 failed |
| G8 | `npm run build` | PASS |
| G9 | full E2E suite | PASS — 27/27 scripts (2 pre-existing hover races pass in isolation); counts updated +1 for the anchor |

Fallout was pure bookkeeping: every fixture/E2E that counts `buildings` or
`operational` shifted +1 (the anchor is maintenance-exempt, so NO money
arithmetic changed). Two source-inventory freezes gained
`world/woodDeposits.ts`; terrain-invariance `strip` helpers now exclude the
anchor (its cell legitimately depends on buildability).

## DEFERRED

Demolition (the anchor is protected by the absence of removal — §3
"Protection" holds trivially), economy balancing (the D1 net-negative
question remains the next product decision), stone/transformation/commerce
re-anchoring, fertility.

## RESULT

Day-0 bootstrap hardening complete: the primitive recovery capability is
guaranteed from tick 0 in every colony, present and future.
