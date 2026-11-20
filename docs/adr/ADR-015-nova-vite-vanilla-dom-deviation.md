# ADR-015 — NOVA Vite + Vanilla DOM UI Deviation

## Status

Accepted — 2026-11-04.

## Context

The vault project blueprint prescribes Next.js variants (`next-app`, `next-site`) and a component contract tuned for React. NOVA is a client-side 3D game built with TypeScript strict, Vite 6, Three.js, vanilla DOM and CSS, Vitest, Playwright and pnpm.

Repository evidence:

- `package.json` has no React or Next.js dependency; the only runtime dependency is `three`.
- `src/app/ui/` manipulates DOM nodes directly.
- Domain code imports neither React, Three.js, DOM nor browser APIs (ADR-001).
- `node tools/check-blueprint.mjs <repo> --variant next-app --adoption` reports 0 errors and 23 adoption warnings.

Forcing the Next.js structure would be a rewrite with no product benefit: NOVA has no SSR/SEO requirement, and the simulation must remain independent of rendering and DOM. The blueprint's documentary contract — one hub, area indexes, frontmatter, kebab-case, ADR trail — remains useful and is adopted.

## Decision

Adopt the blueprint selectively:

- Keep one project hub at `05-Projects/nova/README.md` and area indexes for product, engineering, ADRs, roadmap and audits.
- Keep Vite + TypeScript + Three.js + vanilla DOM for the application.
- Do not scaffold Next.js and do not introduce React solely to satisfy the blueprint.
- Enforce the existing domain / application / UI / rendering boundaries from ADR-001.

## Consequences

Positive:

- The documentation gains the vault's navigation and metadata guarantees without forcing a code rewrite.
- The actual stack stays honest in the docs.
- The simulation/rendering separation remains the primary architectural constraint.

Negative:

- NOVA is not scaffold-compatible with the vault blueprint variants.
- Future agents must read this ADR before applying blueprint structure rules.
- The component contract is interpreted for vanilla DOM components, not React components.

Neutral:

- Revisit only if a concrete requirement appears: server rendering, shared React component library, or multi-app workspace.

## Alternatives Considered

- Port to Next.js: large rewrite, no product requirement, would not improve the 3D client.
- Introduce React for the UI only: adds a dependency and a rendering layer without solving a demonstrated problem.
- Leave the documentation contradictory: agents and readers would keep targeting the wrong stack.

## Revisit Triggers

- A real SSR/SEO or multi-app requirement.
- A decision to share UI components with another React project.
- A measured maintenance problem that vanilla DOM cannot handle.

## Related

- [Architecture](../game/04-ARCHITECTURE.md)
- [Code structure](../CODE-STRUCTURE.md)
- [ADR index](./README.md)
