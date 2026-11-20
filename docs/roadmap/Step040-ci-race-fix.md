# Step040 — CI Race Fix (MVP acceptance loop)

Baseline: `58d1dfd` (Step039). Closes the red CI discovered right after
the defect fixes: all 4 GitHub Actions runs since Step038 failed on the
same single test while local gates were green.

## 1. Symptom and evidence

`e2e/economy.spec.ts` "MVP acceptance loop", line 223:
`Expected: > 120, Received: 120` — on every CI run; 30/31 other tests
passed. 120 is exactly the Step031 food capacity cap.

## 2. Root cause (test race, not a product defect)

The sequence was:

```text
8x (16 ticks/s running) → drain food=40 → pause → read foodBefore → 8x → poll food > foodBefore
```

The drain executed **while the simulation ran**. With cropRotation the
balance is positive, so the stock refills ~+3/tick from 40 toward the
120 cap. On a slow CI runner, the refill can reach the cap **between
the drain and the baseline read** → `foodBefore = 120` → the growth
assertion is unsatisfiable by design (a pinned stock cannot grow,
Step031). Locally the window is a few ticks, masking the race.

## 3. Fix (test-only, deterministic by construction)

The sim is already paused entering the section (toggled before the
research block). The drain now happens **cold, under pause**: zero
ticks can pass between drain, baseline read and the resume click, on
any runner. `foodBefore = 40` exactly; the poll succeeds on the first
resumed tick (~43). The comment documents the observed CI failure so
the pattern does not regress.

Pattern scan: the only `resources.food =` drain in `e2e/` is this one.

## 4. Validation

- Local (executed 2026-10-20): `tsc` clean, `eslint` clean, `vitest`
  272/272, `vite build` PASS, `playwright` **31/31 ×2**.
- **GitHub Actions (observed): both runs green** — `master` 3m27s and
  `main` 2m22s on `354dfda`. First green CI runs of the project; the
  Step038 floor now holds end to end.
