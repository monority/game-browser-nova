# Step008 — Removal Commands (Freeze Recovery)

Baseline: `1ebea37` (Step007 rebuild complete). Implements the MVP-contract
"removal" scope (`docs/game/02-MVP.md` §4 Construction, `09-UI-UX.md` §8
Actions) and converts the D1 construction freeze from permanent to
player-recoverable. User decision: **no refund**. Date: 2026-10-09.

## AUDIT (post-rebuild, see session report)

- Step006 contract verified faithful (PASS); gameplay loop validated live.
- D1 assessed: documented intentional deficit, not a bug — but the
  money-0 + net ≤ 0 freeze was unrecoverable because buildings were
  permanent (removal missing despite being required MVP scope).

## IMPLEMENTATION

- `removeBuilding(id)` command: validation (`unknownBuilding`,
  `anchorProtected` — the Colony Center is never removable, Step004),
  deletion with **no refund** (money untouched; relief comes from stopped
  maintenance). Under-construction buildings are removable.
- `removeRoads(cells)` command: per-cell removal, `emptyPath` /
  `unknownRoadCell` validation; empty road entries deleted; networks
  recompute on demand (losing access unstaffs workplaces deterministically
  via the next `assignJobs`).
- Staffing: no special handling needed — `assignJobs` rebuilds the full
  assignment from canonical state each tick (deterministic by design).
- Maintenance relief: `payMaintenance` counts fewer operational buildings
  from the next economy calculation — no code change required.
- UI: inspection panel (building or road cell) with Remove buttons;
  anchor shows a non-removable note; `onRemoveBuilding` /
  `onRemoveRoadCell` callbacks dispatch commands.
- Persistence: schema unchanged — SAVE_VERSION stays 13; removals
  round-trip losslessly.

## ZERO-MONEY COLONY RECOVERY (explicit probes, tests/removal.test.ts)

Rule-derived equilibrium for a fully reorganized money-0 colony
(housing = pop, minimal staffed farms, wells removed — water gates only
admission, not survival): **net = W − F** (connected workshops minus
staffed farms).

- **W = F** (probe 1): 1 workshop + 1 farm + 1 residence frozen at 0 →
  removing the unstaffed well yields net 0: colony survives indefinitely,
  money never accumulates.
- **W > F** (probe 2, corrective addition): 2 residences + 1 farm +
  2 connected workshops + 2 wells frozen at 0 (net −1) → removing both
  wells via `removeBuilding` → net +1 → money accumulates deterministically
  (0 → +5 over 5 ticks) → a well + residence become affordable again:
  **growth genuinely restarts**.

Verdict (corrected by the follow-up commit; the original text here
overgeneralized the W = F probe): removal enables genuine full recovery
from zero treasury **iff the standing colony is workshop-dense (W > F)**;
workshop-light colonies only stabilize at net ≤ 0 and still need the D1
balance decision. D3/D6 stay blocked.

## VALIDATION (executed 2026-10-09)

| Gate | Command | Result |
|---|---|---|
| G1 | `npx tsc --noEmit` | PASS |
| G2 | `npx eslint .` | PASS |
| G3 | `npx vitest run` | PASS — 9 files / 105 tests (14 new), 0 failed (105/105 after the corrective probe) |
| G8 | `pnpm build` | PASS |
| G9 | `pnpm test:e2e` | PASS — 6/6 scenarios (1 new: place → mature → inspect → remove → cell/stats restored) |
| G10 | `git show --stat` + per-file diff review (commit time; re-verified in the follow-up) | PASS |

## RESULT

Removal slice complete: players can correct mistakes and shed maintenance;
the Colony Center anchor stays protected; no economic constant changed;
D3/D6 remain blocked on D1.

## DEFERRED

Removal refunds (no-refund decided), D1 rebalancing, commerce
re-anchoring (D3/D6), storage caps (D5), environment/fertility, tech/ages.
