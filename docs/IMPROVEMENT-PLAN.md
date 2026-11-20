# NOVA — Improvement & Cleanup Plan (2026-11-17)

Baseline: `main` @ `c9c6d96` + Batch 1 (`ba972c4`, `6ad20ac`), clean tree. 31 test files /
187 tests green (5.5 s re-measured on 2026-11-17), vacuity audit 38 files / 201
declarations / 0 findings, 16 browser journeys in 7 files (`--list`, 1 s).

The rule this plan follows: **no item may be justified by taste.** Every batch below
names what was measured, what changes, and the gate that proves the change landed.
Nothing here tunes a game constant: balance and endgame posture are owner decisions
(see Batch 3), measured and reported, not edited.

---

## 0. What was already clean (measured, so it stays out of the plan)

| Check | Method | Result |
|---|---|---|
| Unused locals / parameters | `tsc --noEmit --noUnusedLocals --noUnusedParameters` | 0 diagnostics |
| Dead exported symbols | every `export` declared in `src/**` matched against the whole tree | 1 (`storedOverlayModes`), removed in Batch 1 |
| Unused CSS classes | 28 `.nova-*` selectors vs every `.ts` / `.html` | 0 unused |
| `TODO` / `FIXME` / `HACK` markers | grep across `src`, `tests`, `e2e`, `tools` | 0 |
| Broken relative links | 111 markdown files in `docs/` + `README.md` | 0 broken |
| Tracked build junk | `git status`, `.gitignore` | clean; `dist/`, `playwright-report/`, `test-results/`, `playtest/` all ignored |
| Content named in a test | 9 buildings / 8 techs vs `tests/` + `e2e/` | 9/9 and 8/8 |

Conclusion: there is no dead-code or leftover-artifact backlog worth a batch. The real
debt is elsewhere: **documentation that has drifted from the code**, and **product
questions still living inside the test harness**.

---

## Batch 1 — Cleanup + documentation truth (small, no behaviour)

**C1 — dead accessor.** `storedOverlayModes()` in
`src/application/persistence/preferences.ts` was declared, exported and imported by
nothing. The module header already explains why: the overlay list has no importable
source, so the pin it was written for cannot exist. Removed.

**C2 — README claimed a closed issue was open.** It read "Post-MVP product decisions
(F13, Step054 human playtest) remain open", but F13 was **implemented on 2026-11-10**
(`consumeFood` returns the fed colonists, `updatePopulation` removes one colonist per
unfed tick, locked by `tests/famine-recovery.test.ts`). The status paragraph now states
what is actually left (no human playtest session; the endgame posture is a design call)
and points at `docs/STATE.md` for evidence instead of quoting a commit hash.

**C3 — README script table under-reported the gate.** `pnpm check` also runs
`test:audit` and `test:mutations:fast`, and `pnpm verify` therefore covers them too.
Both rows added, `check`/`verify` descriptions corrected against `package.json` and
`.github/workflows/ci.yml`.

Gate: `typecheck`, `lint`, `vitest run` green; README tables re-read against
`package.json`.

---

## Batch 2 — Split live state from history (docs only) — DONE (`36fe083`)

`docs/STATE.md` is 184 lines / 75 KB because prose lives inside table cells, and the
Known Issues table mixes three kinds of row: **1 OPEN**, plus dozens of
RESOLVED / SUPERSEDED / CLOSED entries that each carry their full measurement.

- **D1** Keep one row per *live* issue (today: the Step085 endgame posture only) in
  `docs/STATE.md`; move the closed rows verbatim to `docs/archive/known-issues.md`,
  dated, with a pointer from the table.
- **D2** Record the audit findings that have no status line at all: `F14` (no cumulative
  lost ledger), `F15` (no cap forecast) and `F16` (storage capacity is a purchasable
  non-decision) appear in
  `docs/audits/RESOURCE-ATTRIBUTION-AUDIT-2026-11-12.md` and **zero times** in
  `docs/STATE.md`, so the reader cannot tell whether they were fixed, accepted or
  forgotten. Each gets one row: IMPLEMENTED, ACCEPTED or DEFERRED.

Gate: no claim is lost (grep each `F**` id before/after), `docs/STATE.md` still parses
as one markdown table (`grep -c "|$"` on the Known Issues block before/after), and the
tracked file remains the only doc that changed.

---

## Batch 3 — The three product questions (owner decision, blocked)

These are **not** implementation gaps; they are choices with measurements attached.

| # | Question | Measured today | Cost of deciding |
|---|---|---|---|
| I1 | Endgame posture: dormant workshops (+4/tick, pollution 37, commerce 0/9) or workshops + parks awake (+9/tick, pollution 0, planks 38)? | both lines run to t=3500; B is strictly better and stable | policy change in `tests/selfplay.governor.ts`, re-measure the whole self-play portfolio, add a guard |
| I2 | Water headroom: production equals consumption exactly (86 for 86 mouths, cistern 0–1) | one lost well = immediate shortage, no buffer | a balance change; needs a measured comparison, not a guess |
| I3 | Land: the 16×16 map saturates at pop 86 with 23 free cells | identical with and without `growthCap` 86 | decide whether 86 is the intended final population before touching anything |

Nothing in Batch 3 is started without the owner's word; the plan's job is to keep the
measurements attached to the question.

---

## Batch 4 — Player-facing validation (engineering, no design change) — DONE (`0eaa228`)

**E1 — the first minute was never validated through the shipped UI.** The rating found
no journey that boots the game and plays the opening as a new player would (place,
staff, see the alerts). The self-play governor proves the *rules*, not the *interface*.
One Playwright journey (`e2e/onboarding.spec.ts`) that builds from the palette, reads
the alert line, and reaches a first upgrade would close the gap.

**E2 — reachability guard on the mothball bands.** The water band (`water > pop * 2` =
172 at the measured ceiling) cannot be reached by the growing line; rediscovering that
cost a step. A named constant plus a test asserting each band against the measured
maximum stock turns a silent trap into a failing check.

*Landed differently, because the measurement corrected the premise.* The bands are not
unreachable for the whole run: the workshop wake band holds for 347 consecutive ticks
and dies at **t=347**, the well-rest band fires exactly once (**t=345**), the park wake
band holds through **t=353** — while the population only reaches its cap at t=1497. The
water triage therefore works for the first quarter of a 1500-tick run and cannot fire
for the last three, and the park band's input disappears because the only emitters are
asleep. The guard pins those four dates, so a moved constant fails instead of being
rediscovered by hand.

Gate: one spec, targeted run under 2 minutes
(`LD_LIBRARY_PATH=~/.local/pwlibs/usr/lib/x86_64-linux-gnu:~/.local/lib node
node_modules/@playwright/test/cli.js test e2e/onboarding.spec.ts`), then the smoke gate
once — not the full suite.

---

## Out of scope (deliberately)

- new buildings, techs or ages — content track, not cleanup;
- any balance constant touched without a before/after measurement;
- a visual redesign (no screenshot pass has been run; that is a separate request);
- publishing the rest of `docs/` — the single-versioned-file rule for `docs/*` is an
  owner decision, not drift.

## Order and budget

1. Batch 1 — done (`ba972c4`, `6ad20ac`).
2. Batch 2 — done (`36fe083`): 7 closed rows archived, 3 audit findings given a status,
   37 038 characters preserved byte for byte.
3. Batch 4 — done (`0eaa228`): onboarding journey 1/1 in 6.0 s, band guard 0.8 s inside
   the suite, full E2E gate 17/17 in 1.8 min.
4. Batch 3 — still open: it resumes when the owner picks a posture.
