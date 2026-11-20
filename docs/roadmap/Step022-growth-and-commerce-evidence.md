# Step022 — Sustained Growth & Organic Commerce Evidence

Baseline: `e0b6463` (Step021). No A1. No Easy/Hard. No UI redesign.

## AUDIT

Two open questions from Step021, investigated with evidence only:

- **A.** Growth stalls around pop 12 with water near zero — is staffed
  well capacity structurally lagging population, and can the player
  resolve it with current mechanics?
- **B.** Market is reached in self-play only through project-mode
  staffing — does an organic, player-command-only path
  (camp → wood → planks → market → first sale) exist?

## OBSERVATIONS

### A. Sustained growth (probe governor + faithful Step021 runs)

- Step021 stall reproduced in structure: with the fixture's housing cap
  at 14, pop pins at 14 (faithful run: `pop12@218`, pop14 by t300, flat
  to t1500). The cap, not water, is the limiter there.
- Water NEVER binds in shipped-governor runs: stock oscillates 20–64
  (mothball cycling), staffed wells keep pace through the wells ratio
  (`ceil(pop/2)+1`), cropRotation slack (fewer farms needed, workers
  freed for wells), and mothball cycling.
- Housing cap lifted (fixture-only 14 → 22/24, product has no cap):
  pop tracks housing 1:1 to **pop22@t450**, holds to t1500 with water
  in surplus (12–92), money → 3704, 12/12 wells staffed, farms
  12 total / 8 active / 8 staffed (yield-tech slack working as
  designed), quality 38 ≥ 25, save round-trips clean.
- The prompt's premise (stall around zero water from well-capacity
  lag) is **refuted** for the shipped path: no water-0 stall observed
  in any Step021-governor run; admission freezes observed were the
  housing cap (governor) and, once, the quality gate (see B).
- Real fragility found and reported honestly (dumb-governor probe, no
  techs/parks/triage): fast growth overshoots water+food capacity
  (pop14 vs cap 10) → all-or-nothing wipe to pop1 → single worker sorts
  onto a workshop → wells idle, money 0, quality 0 — frozen 1400 ticks
  identically. Recovery EXISTS via player commands, first leg verified:
  mothball all production → +1 tax/tick banks (money 0→30 over 30
  ticks), pop stable on the Center trickle; remainder (park purchase →
  absorption → readmission) rests on unit-covered mechanics
  (environment absorption, admission gates), not re-proven end to end.

### B. Organic commerce (player commands only, no project mode)

- Mechanical chain works organically: camp placed via deposit scan,
  staffed 11 ticks → ~22 wood → 11 planks, no project mode, no state
  edits (blocked upstream in that run only by the dumb governor's
  crash/money stall, unrelated to the chain).
- B2 (full governor minus project mode): reaches `age2@185`, then
  freezes at pop10 with money exploding to 9424 and zero builds.
  Autopsy at t1500: camp exists but never staffed (sorts last: 10
  workers < 13 eligible); quality 0 / pollution 100 (4 shops vs 1
  park) freezes admission independently of water (28) and housing
  vacancy. Farm/well placements fail persistently on a pocket cell
  (governor artifact: first-free-cell with no buildable road neighbor —
  a human picks another cell).
- Triage doctrine verified with player commands only (committed
  regression test): mothball 1 farm + 1 well + 1 shop → eligible 10
  ≤ 10 workers → last-sorting camp staffs deterministically → wood
  flows → restore 1 shop (sorts before the camp, staffs while the camp
  idles) → planks ≥ 2, pop stable at 10 on stock buffers.
- Full assembly to first sale: market unit tests (gate, sales, stats,
  persistence) + self-play full loop (`market-sale@327`) + the new
  triage test covering the disputed link. No link relies on injected
  resources or privileged commands.
- UI discoverability (code-verified, not playtested): palette buttons
  show costs including `+2pl`; Planks stat row exists; market hidden
  until Age 2 (deliberate Step017 gating via `requiredAge`); inspection
  details spell out staffing, deposit-adjacency, and market rules;
  staffing overlay shows staffed state; deposits overlay marks deposits.
  GAPS (recorded, not implemented per mission): staffing ORDER is
  nowhere surfaced; mothball-as-staffing-lever is emergent and
  unguided; the hidden market button gives no "requires Age 2" hint.

## DECISION

No source changes: no implementation defect demonstrated on either
question. Both premises resolved as mechanism-understanding:

- A: growth follows housing construction 1:1; water holds through
  pop22 via ratio + tech slack + cycling. Committed: `housingCap`
  parameter on the self-play governor (default 14, existing runs
  byte-identical) + sustained-growth regression test.
- B: late-camp staffing needs triage; triage is player-executable and
  overlay-visible. Committed: triage-to-planks regression test.
  UI guidance gaps recorded as a design decision (staffing-visibility
  slice candidate), not implemented here.

## IMPLEMENTATION

- `tests/selfplay.test.ts`: `playGame(..., housingCap = 14)` +
  sustained-growth test (cap 24: pop ≥ 20, water > 0 at end, save
  round-trip).
- `tests/market.test.ts`: triage-to-planks test (camp unstaffed 30
  ticks → triage → staffed → planks ≥ 2, pop stable).
- No `src/` changes. No save changes. No E2E changes (no
  player-visible behavior change; UI untouched).

## VALIDATION (executed 2026-10-14)

- Throwaway probes (deleted): instrumented growth run, mothball
  intervention, organic market trace, faithful full-budget run,
  no-project-mode run, placement/map autopsies, freeze recovery.
- New tests green (sustained-growth, triage-woodchain).
- Full unit suite: 17 files / 200 passed. `tsc --noEmit` clean.
  ESLint clean.
- E2E and build skipped with rationale: no source or player-facing
  changes; last full E2E/build green at Step021 baseline.

## RESULT

- A: sustained growth proven (pop22, water surplus, all gates pass);
  limiter is housing construction pacing. Premise refuted with data.
- B: complete organic path demonstrated across linked evidence;
  camp-staffing link now regression-covered; UI order/guidance gaps
  recorded as design input.
- Unresolved design decisions (no guessing, A1 may proceed regardless):
  1. Staffing-order visibility + triage guidance (UI slice?).
  2. Exact-balance water fragility (2W == P flatlines; dips freeze
     admission until capacity added — recovery exists, no change
     proposed).
  3. Single-park absorption vs multi-emitter pacing (player-observable
     via quality stat; no change proposed).

## GO / NO-GO for A1

**GO.** No blocking design decision: growth sustains past 20, the
commerce chain functions end-to-end through player commands, and the
economy funds progression (treasury → 3704 by t1500 in the sustained
run). Recommended A1 entry: milestone/tech depth; optional companion:
staffing-visibility slice if onboarding evidence demands it.
