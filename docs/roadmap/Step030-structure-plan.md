# Step030 — Structure Plan (shadcn-style, maintainable + scalable)

Baseline: `9909531` (Step029). **Design-only — no `src/` change in this
step.** Awaiting GO to execute slices.

## 1. Objective

Translate shadcn/ui structural principles to this stack (vanilla TS DOM,
no React — principles, not a port):

1. **Single source of design truth** — tokens defined once, consumed
   everywhere (shadcn `:root` variables ↔ our `TOKENS`/index.html).
2. **State in the DOM, visuals in CSS** — `data-*` attributes +
   classes drive presentation; JS toggles state, never paints styles
   (shadcn variant classes ↔ our `data-selected` / `[aria-pressed]`).
3. **Small composited components with narrow props** — already true
   post-Step029 (`createXPanel(callbacks)`); keep as the rule.
4. **Stable public facades, deep internals free to move** — `createUi`
   / `__nova` contracts stay; internals may be reorganized freely.

Evidence of current gaps: 35 inline-style mutation sites across 6 UI
files; `#0b0e14`/`#d8dee9` hardcoded in both `index.html` and
`TOKENS`; `main.ts` 365 lines mixing composition, input, loop,
diagnostics; deep relative imports (`../../domain/…`) that break on any
move; audit leftovers (live-deposit refs in `serialize`, ~35
over-exports, e2e `as unknown as` casts).

## 2. Slices (each = one gated vertical commit)

### S1 — Design tokens CSS layer (highest value)
- NEW `src/styles/nova.css`: `:root` custom properties (all TOKENS +
  derived), semantic classes — `.panel`, `.btn`, `.row`,
  `.section-header`, `.note`, `.value--ok/--warn/--danger`, layout
  utilities used today (flex rows, gaps, margins). `index.html` inline
  `<style>` folded in; imported once from `main.ts`.
- Panels stop mutating styles: selection/active/age-locked states move
  to data attributes (`data-selected`, `data-active`, `data-locked`,
  `aria-pressed` for speed/overlay) + CSS rules. Dynamic colors
  (forecast balance, net money, staffing tint) become classes.
- `TOKENS` JS shrinks to the values JS genuinely needs (none painted →
  delete, or keep only if a consumer remains — verify by `rg`).
- Files: `src/styles/nova.css`, `src/app/ui/kit.ts`, the 4 panels,
  `ui.ts`, `index.html`.
- Acceptance: `rg "style.cssText|Object.assign\(.*style" src/app` → 0
  (outside data-attr geometry like tooltip position); all 15 E2E
  green unmodified (ids/data-* contract untouched); visual parity —
  side-by-side screenshot before/after (one manual browser pass).

### S2 — main.ts decomposition
- `main.ts` → thin entry (~40 l.): `app/boot.ts` (state, renderer,
  callback composition, refreshStats, diagnostics attach),
  `app/input.ts` (pointer/keyboard, `inspectAt`, `describeCell`,
  road-drag), `app/loop.ts` (fixed-timestep frame), `app/diagnostics.ts`
  (`__nova` surface + shared `NovaHandle` typing — `declare global`
  replaces e2e's `as unknown as` casts).
- Acceptance: `wc -l src/app/main.ts` ≤ 60; `createUi`/`__nova`
  contracts byte-identical; 15/15 E2E unmodified; vitest unchanged.

### S3 — Hygiene sweep (audit leftovers)
- `serialize`: deep-copy deposits into the save document (defensive).
- Over-export sweep: un-export symbols with zero external importers
  (rg-verified per file); keep type exports that document the contract.
- `package.json`: add `check` script = `typecheck && lint && test` (one
  command gates).
- Acceptance: `rg` proofs in report; gates green; 217+ unit.

### S4 — Import alias `@/` (OPTIONAL — needs your call)
- `tsconfig.paths` + `vite resolve.alias` + vitest; sweep ~40 files
  from `../../domain/…` → `@/domain/…`.
- Benefit: reads/moves stay stable as the tree grows (scalability).
- Cost: whole-repo mechanical diff (~40 files, no behavior).
- Acceptance: gates green, E2E unmodified; diff reviewed as pure
  import rewrites.

## 3. Non-goals (explicit)

- No React/Next port, no CSS framework or runtime dep (zero-dep rule),
  no state-management framework, no barrels (hide dependencies), no
  visual redesign (parity only), no renderer/mechanics change, no
  premature primitives beyond what the 4 panels actually share.

## 4. Risks

- S1 is the only slice with visual surface → mitigated by unmodified
  E2E (selector contract) + one screenshot parity pass.
- S2 touches every input handler → input-driven E2E flows (build,
  inspect, keyboard, road-drag) are the proof.
- Ordering: S1 → S2 → S3 (value desc, S2 benefits from stable CSS);
  S4 independent, anytime.

## 5. Validation (per slice, escalated only when justified)

    npx tsc --noEmit
    npx eslint .
    npx vitest run
    npx vite build
    npx playwright test          # 15/15 unmodified = parity proof

## 6. Decision requested

- **GO for S1–S3?** (recommended: yes, in that order, one commit each)
- **S4 alias sweep: yes or skip?** (mechanical, whole-repo; I lean yes
  for long-term readability, skip if diff noise worries you)
