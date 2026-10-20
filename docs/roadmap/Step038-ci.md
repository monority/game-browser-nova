# Step038 — Continuous Integration

Baseline: `8c5ee3e` (Step037). Adds the missing CI floor — the audit's
long-standing P1, unblocked once the remote existed. No product code
changed.

## 1. What shipped

**`.github/workflows/ci.yml`** — one job, the same gate order as
`docs/VALIDATION.md`:

```text
pnpm install --frozen-lockfile
  → pnpm typecheck
  → pnpm lint
  → pnpm test        (unit)
  → pnpm build       (production bundle)
  → playwright install --with-deps chromium
  → pnpm test:e2e
```

- Triggers: push to `master`, pull requests to `master`, manual dispatch.
- `permissions: contents: read` (least privilege), `concurrency` group
  cancelling superseded runs, 20-minute timeout.
- Failed runs upload `test-results/` as an artifact (7-day retention).
- E2E drives the same dev server as a local run (identical journeys);
  the production bundle is validated by the separate build step.

**Reproducibility pins** — `packageManager: "pnpm@11.21.0"`,
`engines.node: ">=24.19.0"`, `.nvmrc` (`24.19.0`). CI cannot drift
from the workstation.

**Docs** — `docs/DEVELOPMENT.md` §7 (Continuous integration) and
`docs/VALIDATION.md` (Continuous integration section): both previously
mentioned CI nowhere.

## 2. Defect found and fixed while validating (adopted Tier2 work)

The full E2E suite failed once during the CI-chain rehearsal:
`accessibility.spec.ts` "alert announcements fire on kind changes, not
every tick" — the scenario relied on a **transient** food-deficit alert
(the colony starves within the observation window, so the alert
disappears) and the announcer re-fired because the environment alert's
**severity** flipped (info → warning at quality 25) — severity is part
of the announcement identity, so a severity change is a legitimate
re-announce.

Fixed the test, not the product: the scenario now uses a **deterministic**
persistent alert (pollution 52 with the colony's own emitters
mothballed, +1 per 100 ms from a page-side interval) whose kind AND
severity stay stable while its numbers move. The test now also asserts
the visual panel shows the newer value — proving the world advanced
while the live region stayed silent. Stable 4/4 in isolation, and
30/30 twice in the full suite.

## 3. Validation (all executed 2026-10-20)

- `pnpm install --frozen-lockfile`: exit 0 (validates the CI install
  step against the pinned lockfile).
- `npx tsc --noEmit`: clean. `npx eslint .`: clean.
- `npx vitest run`: 20 files / 271 tests green.
- `npx vite build`: PASS.
- `npx playwright test`: 30/30, twice (1.1m / 1.0m), local Chromium.
- Workflow YAML: action pinning, artifact upload, and the `pnpm dev`
  webServer contract reviewed against `playwright.config.ts`.

## 4. Notes

- GitHub Actions on a private repo consumes the free minutes quota;
  the suite takes ~2 min per run.
- The workflow has not yet been observed on GitHub (first run triggers
  on the push of this step) — local execution of every step is the
  evidence here, not a green GitHub check.
