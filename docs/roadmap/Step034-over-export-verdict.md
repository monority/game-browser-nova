# Step034 — Over-Export Sweep: Verdict NO-OP

Baseline: `efe56d2` (Step033). The Step028 audit estimated "~35
over-exported symbols". This step measured the claim instead of
assuming it.

## 1. Method

Enumerated all 223 `export (function|const|interface|type|class|enum)
Name` declarations in `src/`, then counted referencing files outside
each defining file (`src/ + tests/ + e2e/`, whole-word match,
conservative: comments and strings count as references).

Also checked: `export default` (none), `export *` (none),
`export {…}` re-exports (one: `boot` in `main.ts`, intentional entry
facade), `noUnusedLocals` (absent from tsconfig, but eslint
`no-unused-vars` covers locals and gates pass).

## 2. Result

**Zero exports with zero external references.** Minimum observed is 1
external referrer. Spot-checked the thinnest cases (`inBounds`,
`normalizeWorldConfig`, `isMaintenanceExempt`, `staffedWorkshops`,
`stonePerQuarry`, `operationalWarehouses`, `commerceUnlocked`) — each is
a genuine cross-module or test consumer, not dead code.

## 3. Decision

No code changes. Un-exporting anything on the list would break a real
importer. The audit's "~35" figure was an eyeball estimate, refuted by
measurement — closing as verified-no-action per root-cause-first
(AGENTS.md §18: never invent work to look productive).

The export surface stays as-is: small helpers exported for single
consumers are normal library shape, not debt.
