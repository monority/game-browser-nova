# NOVA — Roadmap Steps

This folder holds the implementation step history. The durable product
contract lives in `../game/` and `../adr/`; steps record what was done,
why, and what was measured.

## Naming

```text
docs/roadmap/Step000-baseline-audit.md
docs/roadmap/Step001-<short-name>.md
```

Three digits, zero-padded, chronological. Never reuse a number.

## Step report format

Every step follows the evidence-driven workflow:

```text
AUDIT
→ OBSERVATIONS
→ DECISION
→ IMPLEMENTATION
→ VALIDATION
→ RESULT
```

## Rules

- One step = one coherent scope. No unrelated cleanup inside a step.
- Audit-only steps touch no `src/` code.
- Product decisions that change the contract update `../game/` or
  `../adr/` in the same step and say so explicitly.
- Validation claims must cite commands actually executed.
- Current step is tracked here: **Step019 (Self-play verifier + D1 verdict — audit, complete — see Step019 file)**. Steps 001–006 describe the pre-reset repository; this repository was rebuilt from their contracts (see Step007).
