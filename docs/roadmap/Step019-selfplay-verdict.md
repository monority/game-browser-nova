# Step019 - Self-play verifier + D1 poverty-trap verdict (audit)

No src changes. Built tests/selfplay.test.ts (run: pnpm test:selfplay):
a scripted governor plays the canonical 100-money start headlessly,
3000 ticks, asserting global invariants every tick plus system
engagement. Baseline: a56fc58 (Step018).

## AUDIT

Question: can a clean session complete the MVP loop with no intervention
(Phase 10 final gate), and what is the best-known opening?

## OBSERVATIONS (all measured, probes 2026-10-12, seed "selfplay")

- Best-known line: residence, well, workshop, park, then growth. It reaches
  pop1@2, commerce@6, park@85, then stalls: pop1, money ~0-10, forever
  (3000-tick run).
- Farm-first lines stall earlier (pop1, money 0): a farm before commerce
  spends the treasury into the trap with nothing funding recovery.
- Park-late line: the workshop emits +1 pollution/tick with no absorption,
  quality crashes, the admission gate shuts, growth freezes.
- Structural cause: at pop1 max income is 3 (1 tax + 2 commerce) against a
  minimum viable set of 3-4 upkeep (residence, well, workshop, park).
  Surplus for the 2nd residence (25) never forms; without it no pop2, no
  pop2 taxes, no recovery. Circular at every scale tried, including a
  funded 500-money start (stalls pop4/money0) and commerce-first overbuild
  (maintenance spiral, 19 buildings vs 11 income).
- Robustness, proven by the same runs: 3000 ticks, zero invariant
  violations (resources finite and non-negative, pollution clamped,
  deposits within capacity), save round-trips clean, fully deterministic.

## DECISION

STOP: economic constants change only with an explicit product decision.
No rebalance in this step. The verifier locks in stability + engagement
proof; the full-loop proof stays blocked on D1.

## IMPLEMENTATION

- tests/selfplay.test.ts: governor (best-known line + mothball economy),
  per-tick invariants, engagement phases, mid/end save round-trips,
  determinism double-run. 2 tests, green in ~60ms.
- package.json: test:selfplay script.
- STATE.md: D1 row gains measured evidence.

## VALIDATION (executed 2026-10-12)

- npx tsc --noEmit: PASS.
- npx eslint .: PASS.
- npx vitest run: PASS, including 2 new self-play tests.
- pnpm build: PASS. E2E: unchanged, run at commit.

## RESULT

The game is stable, deterministic, and all systems engage � but
unwinnable as shipped: no line escapes the pop1 poverty trap from the
canonical start, and funded starts stall at pop4. Awaiting the D1 product
decision (options: starting treasury, commerce rate, upkeep model, or
accept brutal difficulty).

## DEFERRED

Full-loop self-play proof (blocked on D1), pollution depth, graphs,
storage caps.
