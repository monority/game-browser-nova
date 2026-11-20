# NOVA — Game Design Contract

**Status:** direction of record — consolidated 2026-11-13. This document states
**intent**. It is not a specification, not a roadmap and not a state report.

**Scope.** NOVA is a deterministic, browser-first city builder about a settlement
that must survive, then grow, across three ages. This contract fixes what every
other design document must serve; it does not restate the rules those documents
own.

## Where each question is answered (one rule, one home)

| Question | Owner |
| --- | --- |
| Why the game exists, what it refuses to be, how a mechanic is accepted | this file |
| Functional scope of the current build (what ships, what is out) | [`02-MVP.md`](02-MVP.md) |
| Detailed rules of each system (values, phases, edge cases) | [`03-DESIGN-RULES.md`](03-DESIGN-RULES.md) |
| Ages, milestones, technologies, their values | [`07-PROGRESSION.md`](07-PROGRESSION.md) |
| Resource and economy model, long-term directions | [`08-RESOURCES.md`](08-RESOURCES.md) |
| Tick phases and pipeline order | [`05-SIMULATION.md`](05-SIMULATION.md) |
| UI surfaces, information hierarchy, terminology | [`09-UI-UX.md`](09-UI-UX.md) |
| Observation and legibility rules (alerts, inspector, forecasts) | [`03-DESIGN-RULES.md`](03-DESIGN-RULES.md), [`09-UI-UX.md`](09-UI-UX.md) |
| Ordering of work and history | [`11-ROADMAP.md`](11-ROADMAP.md) |
| What is implemented, validated and measured today | [`../STATE.md`](../STATE.md) |
| Why the architecture is what it is | `docs/adr/ADR-00*.md` |

**Reading rules.**

- A *rule* (threshold, phase, formula) is stated in exactly one specialist
  document. If this file and a specialist document disagree about a rule, the
  specialist document is authoritative and this file is corrected.
- If a specialist document contradicts the *intent* below, the intent is the
  reference: the document is aligned, or the conflict is reported — never
  silently resolved in either direction.
- "Implemented" always means *verified in code at the date given*. A decision
  that has not shipped is labelled **designed**, never described in the present
  tense. Planned work is labelled **proposed**.
- Ages are numbered 1–3 in the code and displayed as *Age of Founding*,
  *Age of Expansion*, *Age of Prosperity*.

---

## 1. Vision and positioning

NOVA is a **survival-driven city builder with an economic core**: the player
places buildings, staffs them, and keeps food, water, stone, wood and money in
coherent balance while the settlement grows through three ages.

Positioning statement:

> A deterministic city builder where every number is explainable and every loss
> is a decision the player could have seen coming.

What NOVA is *not*:

- not a per-citizen life simulator (no individual pawns with needs);
- not a combat or diplomacy game;
- not a narrative campaign (events are systemic pressure, never a story);
- not a large-empire simulation (no regions, no colonies, no navy);
- not an idle or incremental game (nothing plays itself);
- not a market-economy game in the current build (see §6 and `02-MVP.md`).

**Design ambition:** depth from the interaction of a few systems, not from the
breadth of many. NOVA competes on how *readable* its consequences are, not on how
many mechanics it contains.

## 2. Genre and design references

Primary genre: colony/city survival builder with production-chain economics.
Single player, mouse and keyboard, browser.

| Reference | Taken | Deliberately not taken |
| --- | --- | --- |
| Banished | survival pressure, consequences of a bad chain, seasons of scarcity | per-citizen simulation, walker logistics |
| Anno | production chains, logistics distance, trade as a strategic lever | naval layer, huge tech web, multi-settlement play |
| Frostpunk | failure legibility, tension from a single missing input | scripted narrative, morality meters, scenario campaigns |
| Factorio | throughput thinking, ratios the player can compute | belt-level construction, machine-by-machine layout |
| SimCity | growth feedback loops, zoning intuition | zoning itself (NOVA places explicit buildings) |
| RimWorld | events as bounded pressure | storyteller AI, individual colonists |

References are directional only. Naming a reference never commits NOVA to one of
its features: a feature enters through §10, not through imitation.

## 3. Player promise

What the player must be able to say after a session:

1. "I can explain every number on my screen."
2. "I can see why the settlement failed, and what I would change."
3. "My choices had consequences that arrived late, but legibly."
4. "The same situation replays identically — the game is not cheating me."

Non-promises, stated so they are not assumed: no tech tree sprawl, no per-citizen
simulation, no combat, no multiplayer, no procedural campaign, no living market.

## 4. Gameplay pillars

Each pillar is a test a proposed change must pass. The column on the right is the
part that actually does the work: what the pillar **forbids**.

| # | Pillar | Forbids |
| --- | --- | --- |
| P1 | **Legibility** — every state change is observable and attributable | hidden modifiers, unlabelled losses, silent caps, numbers without a unit or window |
| P2 | **Determinism** — same seed and same commands produce the same state | wall-clock time, unordered iteration over collections, randomness outside the seeded stream, state derived in the UI |
| P3 | **Production = consumption + losses + margin** — no resource appears from nowhere and none disappears unaccounted | free resources, unlimited stockpiles, "add a building" as the only answer to a balance problem |
| P4 | **Player agency over automation** — the player decides when the settlement moves on | automatic age advance, systems that resolve themselves, irreversible choices made for the player |
| P5 | **Small surface, deep interaction** — new systems must interact with existing ones | mechanics whose only value is breadth, duplicated forecast sources, a second way to compute the same figure |

Pillar test questions (use them in design review):

- P1: after this change, can the player attribute the difference to a cause?
- P2: does this change read anything that is not canonical state?
- P3: which of the three terms moves, and by how much?
- P4: what does the player choose, and when?
- P5: what existing system does this new one talk to?

## 5. Core loop

- **Tick (1 s)** — read the forecast, act (place, staff, research), read the new
  forecast. The loop must close without opening a menu.
- **Minutes** — stabilise the food and water chains, fix a logistics bottleneck,
  absorb a crisis, bank the margin that allows the next building.
- **Session** — meet the current age's milestones, then trigger the transition
  yourself and discover the possibilities it opens.
- **Across runs** — no meta-progression, no unlocks carried over. The progression
  that persists is the player's understanding.

The loop breaks when the player cannot tell *why* a number moved (P1), cannot
predict the next tick at all (P1), or when the settlement's fate is decided
without an input from them (P4).

## 6. Progression principles

1. **Three ages, three identities.** *Founding* is about autonomy — surviving on
   the first chains. *Expansion* is about development — transforming and
   diversifying, absorbing growth. *Prosperity* is about mastery — specialising
   what already works.
2. **Milestones are gates, not a score.** All milestones of the current age must
   be met; the transition is then **player-triggered**. Milestones measure
   canonical facts only, and the inspector must state requirement, current value
   and what remains.
3. **The implemented milestone set is kept.** It is the first form of maturity for
   each age, not its final expression: values and dimensions may be improved
   later, but there is no redesign in flight. Exact values live in
   [`07-PROGRESSION.md`](07-PROGRESSION.md).
4. **Age III is terminal.** No milestone set exists beyond it, so no transition is
   offered — the block is data-driven. The command itself increments the age
   without an explicit guard (verified 2026-11-13); this is a known technical
   limit, not a design statement, and no change is decided.
5. **Technology is a small selection with system effects**, not a tree. Each
   technology changes one named system-wide value, gated by age. The catalogue and
   its effects live in [`07-PROGRESSION.md`](07-PROGRESSION.md).

## 7. Difficulty philosophy

1. **Difficulty is legibility of trade-offs**, not punishment. The settlement
   should fail for reasons the player can name, and should be recoverable from
   most of them.
2. **The calibration identity is P3.** A balance claim is a claim about
   production, consumption and losses — never about a single number in isolation.
3. **Reserves are read in ticks first, in absolute units second.** A stock of 40
   food means nothing until it is expressed as time-to-empty under the current
   balance.
4. **Autonomy has three states, never one.** *Deficit* (reserve falling,
   time-to-empty matters), *equilibrium* (reserve stable, time-to-empty
   undefined), *surplus* (reserve rising toward capacity, time-to-saturation
   matters). An infinite-autonomy readout is never acceptable, and the three
   states must not share a single ambiguous label.

   **Status 2026-11-13:** implemented by the reserve forecast (Step069). The
   analysis layer and the cockpit expose the three states in the doctrine's own
   terms — `deficit`, `thin` (equilibrium without the target reserve),
   `building`, `funded`, `storage-limited` — plus the exact per-tick net and a
   time-to-empty that follows the tick's law instead of the balance's sign
   ([`../roadmap/Step069-cockpit-forecast.md`](../roadmap/Step069-cockpit-forecast.md)).

5. **Losses are five distinct families** and must not be merged into one number:
   depletion (stock hits zero), equilibrium (balance at zero), saturation (stock
   pins at capacity), natural degradation (conservation), storage losses
   (overflow at the cap).
6. **Food conservation — decided, not implemented.** The retained model is a
   **proportional degradation of the stock per tick** (candidate rate 3 % per
   tick), with a fractional carry so no quantity is lost to rounding, applied
   after production and before consumption, deterministic. It does **not** track
   the age of individual units (no FIFO). Save compatibility is handled by an
   explicit version step that initialises the carry at 0, destroying nothing at
   migration. Full rationale, measurements and rejected variants:
   [`../roadmap/Step056-food-preservation-design.md`](../roadmap/Step056-food-preservation-design.md).

   **Status 2026-11-13:** **implemented** (Step067, save v19, phase 5a) at the
   experimental rate of 3 %, with the fractional carry persisted and the losses
   exposed per tick ([`../roadmap/Step067-food-preservation.md`](../roadmap/Step067-food-preservation.md)).
   The governor that sized farms to an exact balance was **re-anchored in
   Step068** on a reserve expressed in ticks of consumption (5 ticks), which
   restored the three shipped journeys and took the self-play guardrails to
   7/7 without touching the rate, the yields or any threshold
   ([`../roadmap/Step068-food-reserve.md`](../roadmap/Step068-food-reserve.md)).

   **Rule:** food sizing is a **reserve**, never an equality. Any future target
   (rationing, growth caps, AI players) must leave production above
   consumption by `r × R / (1 − r)`, with `R` the reserve it wants to hold —
   `production = consumption` is not a viable target under this mechanic and
   must not be reintroduced in a scenario, a governance rule or a test fixture.
   Corollary (Step069): a **forecast** may not re-derive this law. Every
   surface that reports production, losses, autonomy or reserve — the stats
   panel, `report`, `assess`, `plan` — reads `forecastFoodReserve`
   (`src/domain/storage/reserve.ts`) on top of `projectFoodTick`
   (`spoilage.ts`), the projection that applies production → conservation →
   consumption → storage cap in the pipeline's own order.
7. **No balancing claim may be made while the mechanic is inactive.** The
   conservation decision is validated only by running the existing guardrail
   scenarios *with the mechanic active* and reporting the measured deltas. The
   guardrail results on record were produced without it and are history, not
   validation.
8. **Losses must become observable before they can be tuned.** Since Step067
   the food conservation loss and the overflow at the cap are separate per-tick
   readings in the stats panel, and the forecast exposes the real net change.
   Water overflow is still only reported as a state (the cap alert). Tuning an
   unseen quantity is a P1 violation.
9. **Rationing does not exist** and no introduction has been decided. No document
   may assume it as a lever.

## 8. UX principles

1. **One source of truth per figure.** Forecasts come from the analysis layer;
   the interface never recomputes a rate.
2. **Four information registers, never mixed:** *now* (current value), *forecast*
   (next tick), *risk* (time-to-empty, saturation), *history* (what happened).
3. **Every number carries its unit and window** — per tick versus total, per
   building versus colony.
4. **Alerts state a cause and an action.** One alert per cause; no alert that
   fires on a healthy settlement.
5. **The inspector explains, it does not decorate**: requirement, current value,
   remaining gap.
6. **Blocked actions state the reason** in the product's own words, instead of
   failing silently.
7. **No decorative information.** A panel that cannot change a decision is
   removed, not shrunk.

Surface ownership, terminology and layout rules live in
[`09-UI-UX.md`](09-UI-UX.md).

## 9. Fundamental design constraints

These are not negotiable per feature. A change that breaks one of them is an
architecture decision, not a feature.

1. **Fixed deterministic tick**, with the simulation and the renderer separated;
   the renderer never advances state (ADR-001, ADR-002).
2. **Determinism means reproducible state equality.** Two runs of the same seed
   with the same command sequence produce deeply equal state; that equality is
   checked by the self-play harness. There is **no state hash** and none is
   claimed — the only hashing in the codebase derives seeds from strings.
3. **Population is aggregate** (ADR-004); logistics is aggregate distance over the
   road graph (ADR-003). Neither becomes per-agent.
4. **State is plain serialisable data**, persisted under a versioned format with
   explicit migrations (version 18, migratable from 13). A new field requires a
   migration step and a save-compatibility test.
5. **World and events are seeded** (ADR-005, ADR-007): the same seed replays the
   same world and the same event sequence.
6. **One canonical state**; every derived value (forecasts, alerts, inspector
   text) is computed from it, never stored beside it.
7. **Balance is established by guardrail scenarios** (self-play), not by
   intuition; a scenario that fails is a design result, not a test to loosen.
8. **A visual or interaction change is validated in a browser run**, not only by
   unit tests.
9. **Complexity budget:** each new system must justify itself against P5. Adding
   a mechanic requires naming the existing system it interacts with.

## 10. Acceptance criteria for a new mechanic

A mechanic is accepted only when all of the following are answered in writing:

1. Which pillar it serves, and which pillar it does not violate.
2. Its inputs, its outputs, and its place in the tick order.
3. Its loss and edge behaviour — what happens at zero, at the cap, at a missed
   input.
4. Whether it is observable, and how (forecast, alert, statistic, inspector).
5. Its save compatibility: new fields, migration, and what an old save means.
6. Its effect on the guardrail scenarios, and which scenario now covers it.
7. That it introduces no second source for an existing figure.
8. That its numbers carry a unit and a window wherever the player sees them.
9. That it does not add a silent cap or a hidden modifier.
10. That its rules are written in the owning document, with this contract updated
    only if the *intent* changed.
11. That claims are labelled **implemented**, **designed** or **proposed**, with
    measurements attached for any performance or balance claim.

## 11. Direction matrix

Status reflects what is verified in code on 2026-11-13. It is a summary of intent
per system, not a replacement for [`../STATE.md`](../STATE.md) and not a roadmap
(ordering lives in [`11-ROADMAP.md`](11-ROADMAP.md)).

| System | Status | Direction | Rationale |
| --- | --- | --- | --- |
| Deterministic tick and self-play guardrails | implemented | **KEEP** | P2 and P3 rest on it; nothing else can be measured without it |
| Aggregate population | implemented | **KEEP**, improve later | growth is gated only by vacant housing, food and environmental quality; the service needs the design describes (school, health) do not exist |
| Food and water chains | implemented | **IMPROVE** | conservation shipped at an experimental rate; the referenced governor no longer reaches Age III |
| Extraction and transformation | partial | **EXPAND** | one transformation chain only (wood to planks) |
| Economy (taxes, commerce, upkeep) | implemented, narrow | **EXPAND** | market removed at Step065; commerce is now a flat rule |
| Trade | not implemented | **DEFER** | needs a market or contract model before it can be legible |
| Logistics distance | partial | **KEEP**, **DEFER** expansion | applied to extraction only; expanding it is a calibration change |
| Pollution and environment | implemented | **KEEP** | pressure that is already legible |
| Technology | implemented, 8 entries (verified 20/11) | **IMPROVE** | selection is too small to express the age identities |
| Ages and milestones | implemented, 3 ages | **IMPROVE** | milestone sets are first-form; Age III terminal by data only |
| Events | implemented, 3 kinds, off by default | **KEEP** | systemic pressure, seeded, no narrative |
| Forecasts, alerts, inspector | implemented with gaps | **IMPROVE** | surplus and equilibrium autonomy are unreadable; losses unexposed |
| Persistence and migrations | implemented, version 22 (verified 20/11) | **KEEP** | the conservation carry is the v18 → v19 step |
| Food conservation | implemented, rate experimental | **MEASURE** | 5/7 guardrails with the mechanic active; the 2 failures are a governor reserve gap (§7.7) |
| Per-citizen simulation, combat, trade goods market, colonies | not present | **REJECT** | outside the positioning in §1 |

Definitions: **KEEP** — keep as is, do not touch without a pillar reason.
**IMPROVE** — keep the mechanism, change its depth, values or legibility.
**EXPAND** — extend an existing mechanism to new content. **DEFER** — deliberately
not now, for a stated reason. **PENDING** — decided in design, awaiting
implementation and measurement. **REJECT** — not part of NOVA.

## What this contract does not decide

- It does not fix any threshold, rate or cost: those are owned by the specialist
  documents and by content data.
- It does not order the work, and it contains no dates.
- It does not report what is finished or validated: that is `STATE.md`.
- It does not settle the open questions it names (surplus autonomy, losses
  visibility, conservation implementation, trade). Naming them is the contract's
  job; resolving them needs a measured step.
