## NOVA — Post-rebuild audit and next-step decision

The clean rebuild is complete. Do not restart the implementation or repeat the original repository audit.

### Objective
Determine whether the Step006 contract has been faithfully implemented, whether the current gameplay loop is viable, and what single next slice offers the highest value.

### Constraints
- Read `docs/STATE.md` and `docs/roadmap/Step007-rebuild-from-contract.md` first.
- Inspect only relevant contract/ADR passages when resolving a concrete discrepancy.
- Do not reread all project documentation or rediscover already validated facts.
- Do not add features, change balance, or refactor speculatively.
- Do not push commits.
- Preserve the existing test suite; never remove tests to make gates pass.

### Work
1. Compare the delivered implementation against the documented Step006 contract. Report only concrete mismatches, omissions, or ambiguities.
2. Inspect the actual gameplay loop in the browser where practical: initial state, building placement, roads/access, staffing, food/water, finite resource extraction, Wood-to-Plank transformation, Quarry unlock, and save/load.
3. Assess the D1 economy using the existing rules and tests. Distinguish a documented intentional deficit from a genuine progression deadlock or implementation bug. Do not rebalance without evidence.
4. Verify current validation results with the smallest relevant commands. Run broader gates only if the audit finds changes or the recorded evidence is insufficient.
5. Recommend exactly one next implementation slice, with its rationale, scope, acceptance criteria, and tests. Keep D3/D6 blocked until D1 is resolved; leave storage caps, demolition, environment, and tech/ages deferred unless evidence establishes a dependency.

### Token efficiency
Batch related inspections and validation. Do not narrate routine progress. Do not repeat successful checks unnecessarily. Spend tokens on concrete evidence and the final decision.

### Final report
Return:
- Contract fidelity: PASS / FAIL / PARTIAL, with evidence.
- Gameplay validation: PASS / FAIL / NOT VERIFIED.
- D1: documented behavior, observed consequence, and decision needed.
- Issues ranked by severity.
- Exactly one recommended next slice.
- Commands executed and actual results.

Do not implement the next slice until the findings and recommendation are reported.
