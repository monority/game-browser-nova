# NOVA — Development Workflow

## 1. Standard implementation cycle

```text
Product requirement
        ↓
Repository inspection
        ↓
Technical/design decision
        ↓
Smallest coherent vertical slice
        ↓
Implementation
        ↓
Unit/integration tests
        ↓
Browser/render validation
        ↓
Full relevant gates
        ↓
Diff review
        ↓
Commit
        ↓
Step report
```

## 2. Task specification

Each substantial step should define:

- objective;
- current state;
- requirements;
- non-goals;
- acceptance criteria;
- validation;
- expected files/systems only when known.

## 3. Vertical slices

Prefer slices that make the game more complete.

Example:

Bad sequence:

- build entire resource framework;
- build entire UI framework;
- build entire rendering framework;
- eventually connect them.

Better:

- one resource;
- one producer;
- one storage path;
- one consumer;
- visible analysis;
- test complete causal loop;
- expand.

## 4. Change discipline

Before implementation:

- inspect existing code;
- identify reusable components;
- identify invariants;
- identify affected tests.

After implementation:

- inspect diff;
- remove accidental changes;
- run validation;
- update durable documentation.

## 5. Commit discipline

A commit should represent one coherent engineering change.

Examples:

```text
feat(simulation): add aggregate food production
feat(logistics): distribute resources through storage network
feat(ui): add resource inspection drill-down
fix(population): prevent growth above housing capacity
```

## 6. Product decisions

If a new requirement changes a durable design rule, record an ADR rather than burying the decision in implementation.

## 7. Continuous integration

CI runs the full gate chain on every push to `main` and on every pull
request (`.github/workflows/ci.yml`):

```text
pnpm install --frozen-lockfile
  → pnpm typecheck
  → pnpm lint
  → pnpm test        (unit)
  → pnpm build       (production bundle)
  → playwright install --with-deps chromium
  → pnpm test:e2e    (browser journeys)
```

The E2E job drives the same dev server as a local run, so browser
journeys behave identically in CI and on a workstation. Failed runs
upload `test-results/` as an artifact.

Toolchain versions are pinned so CI cannot drift from the workstation:
`packageManager` (pnpm) and `engines.node` in `package.json`, and
`.nvmrc` for the Node version. Local parity is one command: `pnpm verify`
(typecheck + lint + unit + build + E2E). Finer-grained steps remain
available as `pnpm check`, `pnpm build` and `pnpm test:e2e`; dependencies
are installed once with `pnpm install --frozen-lockfile`.

### Pre-push gate

The repository ships `githooks/pre-push`, which runs `pnpm verify` and
aborts the push when a step is red. It is opt-in, once per clone:

```sh
git config core.hooksPath githooks
```

The chain takes about four minutes (the E2E journeys dominate), so a
deliberate bypass exists for changes that cannot affect the gate, e.g. a
docs-only push:

```sh
NOVA_SKIP_PUSH_GATE=1 git push
```

If a global `core.hooksPath` is configured, the repository hook chains to
that `pre-push` after the gate instead of replacing it, so an environment
wide guard keeps running. The hook is not activated in the agent
container, where a global hook path is already in place.

## 8. Done means done

A task is not complete because the code compiles.

Completion requires:

- behavior implemented;
- relevant tests;
- validation;
- no accidental changes;
- documentation updated when necessary.
