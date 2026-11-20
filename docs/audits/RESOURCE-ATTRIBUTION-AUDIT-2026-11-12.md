# NOVA — Resource Attribution & Surplus Audit (v2, deep)

**Date:** 2026-11-12 · **Scope:** how resources reach colonists, how a surplus is disposed of, and what
the city-builder genre and the economy-design literature say about both · **Status:** audit only — no
design decision taken, no gameplay code changed. The one code change made since v1 is a severity/copy
fix (`Step066`), documented here as evidence, not as a design decision.

Repository state: `main` @ `c4ed77d`, `SAVE_VERSION` 18, 194 unit tests / 16 E2E specs green, `pnpm`
verify documented. Owner constraints, unchanged:

1. Resource attribution should feel like **Kingdoms Reborn** — not necessarily identical.
2. **No market that distributes to citizens.** (The market itself was removed in Step065.)
3. Audit first, plan after the owner's decisions.

> **Reading this v2.** v1 answered "is there a problem and how big is it". v2 answers "what is the
> problem *made of*, what does the genre actually do about it, what would each fix cost in this
> codebase, and what would prove the fix wrong". v1's measurements are preserved (§1, §7); every
> new claim carries an evidence tag:
>
> | Tag | Meaning |
> |---|---|
> | **M** | measured on the shipped cockpit, reproducible with Appendix A |
> | **C** | derived from the code or from the constants (arithmetic, not a playtest) |
> | **S** | reported by a source in §17 (wiki, patch notes, design essay) |
> | **J** | judgement — the reasoning is given, the conclusion is mine |

---

## 1. Executive summary

1. **Food's only sink is capped, and every unit above it is deleted.** `consumeFood` takes
   `min(stock, population)`; `clampStorage` truncates to `foodCapacity` (120 base + 60 per warehouse);
   nothing else destroys food. On the three shipped lines, 36.8 % to 82.8 % of ticks sit at the cap and
   1 984 / 1 996 units are destroyed over the long journeys (**M**, §7 F1).
2. **The cap is an absolute number derived from day-0 stock, so the buffer shrinks as the city grows.**
   120 food is 12 ticks of consumption at pop 10, 7.5 at pop 16, 5 at pop 24 (**C**). The cap was
   written for a 10-colonist opening (Step031) and was never re-expressed in ticks. The player's real
   buffer is silently halved by growing.
3. **The first farm technology makes the hole worse.** `cropRotation` adds +1 food per farm per tick;
   on the D2 opening's 5 farms that is +5/tick against a 10/tick appetite — the colony goes from +1 to
   +6 net and fills the remaining 60 units of capacity in 10 ticks (**C**). Research is a pure faucet
   multiplier with no matching drain: the reward for progressing is *more waste*, which inverts the
   reward loop the genre relies on (**S** Lostgarden: a pool with no drain reduces the pull of every
   node before it).
4. **The bountiful-harvest event is structurally wasted.** It pays 40 food once, at phase 11; the clamp
   runs at phase 6 of the next tick, so a granary at 100/120 keeps 20 of the 40 and deletes the rest as
   soon as production keeps the stock above the cap (**C**). The one event whose fiction is "extra food"
   is the one the simulation is worst at absorbing.
5. **The journeys were re-anchored around the hole.** `age2` and `age3` now end on *exact* food/water
   balances so the granary never pins (Step065) — which means **no shipped scenario can detect a
   regression in surplus handling any more** (**M**, F3/F17). This is the most expensive consequence in
   the whole audit: the test fleet lost its surplus witness. v2 proposes adding one (`surplus.jsonl`).
6. **There is no attribution layer at all.** Consumption is `population × 1/tick` from one scalar, in the
   same tick, with no distance, no carrying, no household, no request/delivery distinction (**C**). A
   residence 30 tiles from the nearest well is fed exactly as cheaply as one next door, while a remote
   *quarry* already pays a distance tax (Step050). The asymmetry is an implementation residue, not a
   doctrine: `05-SIMULATION` §10 asks for flows driven by demand, capacity, topology and distance.
7. **The genre has two families of answer, and NOVA picked neither.** *Global-pool* games (Anno 1800)
   delete the spatial game; *visible-logistics* games (The Settlers, Banished, Kingdoms Reborn, Manor
   Lords, Songs of Syx, Timberborn) make distance and hauling the game. NOVA's prose describes the second
   family and its code implements the first (**S** §5, **C** §6).
8. **Surplus disposal is a separate axis with at least seven genre answers**: nothing (Banished), decay
   (RimWorld, Songs of Syx, Manor Lords, Timberborn-adjacent), variety (Manor Lords, Ostriv, Against the
   Storm), processing (SoS rations, ATS complex food), export (Caesar III warehouses are export-only),
   growth (Anno needs → more residents), and district rebalancing (Timberborn crossings). NOVA has
   "nothing" plus a clamp (**S** §6).
9. **Spoilage is the cheapest *coherent* sink here, but it is not free: it invalidates the
   exact-balance doctrine.** A stateless decay term needs no save migration, no new resource and no new
   building (**C**), but at any decay rate a colony producing exactly what it eats slowly empties its
   granary. Steady state requires `production = consumption + decay × buffer`; at 2 %/tick and a 12-tick
   buffer that is **+24 % gross production** over appetite (**C**, §11). And because farms yield in 3/tick
   lumps, 2 %/tick is too weak to stop the pin at pop 16: the workable rate there is ~3 %/tick, not 2 %
   (**C**, §11). Every calibrated journey must be re-anchored — v1 under-costed S2 on this point, and its
   "small" estimate assumed the cap could stay where it is.
10. **Recommendation, refined:** do not build the household larder (D2) yet. Build the *measurement*
    (Phase 1), then spoilage (S2) as the sink, and only then a distance-priced fetch (D1) and a larder
    (D2) if the player-facing need survives contact with the measurements. D2 alone scores **below the
    status quo** in §12 because its value is only realised once a need model (S1) exists to make a
    household buffer interesting; D1 is the cheapest step that makes distance bite.

---

## 2. What the simulation actually does today

### 2.1 The tick, as implemented

```
1 advanceConstruction
2 produceFood  = staffed farms × (2 + farmFood tech) + 1 (Colony Center)
  produceWater = staffed wells × (2 − drought)
3 produceWood / produceStone   (finite deposits, logistics tax on extraction)
4 producePlanks                (2 wood → 1 plank)
5 consumeFood  = min(food, population)   consumeWater = min(water, population)
6 clampStorage                (food > cap → cap; water > cap → cap; surplus destroyed)
7 updatePopulation            (starvation −1/tick; admission +1/tick while housing/air/water allow)
8 updateEnvironment
9 assignJobs                  (next tick's staffing)
10 collectRevenue / payMaintenance
11 resolveEvents              (harvest windfall lands here, i.e. AFTER the clamp)
```

Everything about food is aggregate: one number in, one number out. The step that would express
*attribution* — who got what, from where, at what cost — does not exist; step 5 subtracts from a
colony-wide scalar and step 6 deletes the rest (**C**).

### 2.2 The constants, and what they imply

| Quantity | Value | Consequence |
|---|---|---|
| Food per staffed farm | 2/tick (+1 per `farmFood` tech) | one farm feeds 2 colonists (3 with one tech, 4 with two) |
| Colony Center trickle | 1/tick, always on | re-seeds a wiped colony; also a permanent +1 faucet |
| Food per colonist | 1/tick | appetite is linear in population |
| Base food cap | 120 (2 × D2 stock) | 12 ticks at pop 10, 5 at pop 24 |
| Food per warehouse | 60 | +2.5 ticks at pop 24; costs 2 planks, no labour |
| Base water cap / per warehouse | 80 / 40 | 8 ticks at pop 10, 3.3 at pop 24 |
| D2 opening | pop 10, 60 food, 40 water, 5 farms, 5 wells, 2 workshops | production 11/tick vs appetite 10 → surplus-positive by construction |
| Warehouses | passive capacity, `jobCapacity: 0` | buying capacity is not a decision the design rules recognise (§8) |

The D2 opening is **surplus-positive at t=0**: 5 farms (10) + the Center (1) = 11 against 10 colonists.
With 60 free units of capacity, the granary pins after ~60 ticks; the measured first pin is t=70, after
construction and staffing settle (**M**). In other words the shipped opening is *designed* to hit the
clamp within a minute of play — the defect is not an edge case reached by overbuilding.

### 2.3 What the player is shown

`getResourceSummaries` reports stock, production, consumption, net and `ticksRemaining` (stock → 0). The
storage alert reports the pinned state and the rate that is not stored (post-Step066, `info`). There is
**no cumulative "lost" figure** anywhere in the UI: `clampStorage` returns `{ foodWasted, waterWasted }`
and no production caller reads it — only a unit test does (**C**, verified by grep). `05-SIMULATION` §9
explicitly asks the game to distinguish *produced / stored / requested / delivered / consumed /
lost*, so the missing ledger is a spec gap, not a formatting preference.

There is also **no "storage full in N ticks" forecast**. The game can say "your food runs out in 12
ticks" but not "your granary fills in 4", even though both are the same arithmetic on the same numbers
(**C**). A player watching a colony overproduce gets silence, then an event.

---

## 3. Method and evidence grades

### 3.1 Code read

`src/domain/production/production.ts` (faucets and appetite), `src/domain/storage/storage.ts` (cap and
clamp), `src/domain/logistics/logistics.ts` (Step050 distance model), `src/domain/population/population.ts`
(admission/starvation), `src/domain/simulation/tick.ts` (phase order), `src/content/buildings.ts`,
`src/content/techs.ts`, `src/domain/events/events.ts`, `src/application/queries/analysis.ts`,
`src/domain/building/building.ts` (no inventory field), plus `03-DESIGN-RULES`, `05-SIMULATION`,
`07-PROGRESSION`, `08-RESOURCES`.

### 3.2 Measurement

The shipped cockpit (`node tools/agent/run.mjs --json`) replays the real command layer and the real tick
pipeline. Each scenario line is expanded to `tick 1 + assess` pairs; `assess` reports
`food.balancePerTick` and `storage.foodPinned`, whose product is the food the clamp destroys that tick.
The recipe is in Appendix A. Validation: the `age2` replay ends at t=780, pop 16/16, money 787, verdict
`healthy` — identical to the documented scenario, so the instrumented run is the shipped scenario.

### 3.3 Literature method

Sources were fetched on 2026-11-12 and are listed in §17 with what each is used for and its limits. I
restricted claims to what the pages say: no mechanic was inferred from a review's vibes. Where a figure
comes from a community test rather than the developer (Manor Lords spoilage bands), it is labelled.

### 3.4 Limits

- Food/water only. Wood, stone and planks are not clamped the same way and are out of scope.
- Three lines, 10–24 colonists, one seed family — calibration journeys, not a player survey. A human who
  overbuilds wastes more; a human who plays the exact balance wastes nothing (until a tech or an event
  breaks the balance, which is §7 F11/F12).
- Absolute waste assumes `getResourceSummaries`' balance; event windfalls land on top and are not
  separated in the measurement.
- The literature is design writing and wikis, not controlled studies. Its value is the *space* of
  solutions it documents, not statistical proof that one is better.

---

## 4. Theory: what a resource economy is, and why this one leaks

### 4.1 The vocabulary

A game economy is a network of five operations: **sources** (create tokens from nothing), **pools**
(hold them), **transforms** (convert them), **sinks** (destroy them), plus **gates** (conditions).
Daniel Cook's value-chain essay is the clearest statement that these form *chains* ending in a player
motivation, and that "if the chain is broken, imbalanced or obfuscated, players stop finding value in the
early steps" (**S**). Czerkawski's textbook definition is blunter: a sink "removes currency, resources or
goods from the economy… permanently", and the designer's job is to keep sources and sinks in proportion
(**S**).

NOVA's food chain today:

```
Farm (source, 2/tick) → Colony stock (pool, cap 120) → Colonist (sink, 1/tick, capped)
                                        ↘ clampStorage (sink, unnamed, unmeasured)
```

The chain is not broken — it is *short-circuited*. The terminal sink is capped by housing and air
quality, and the only other drain is an implementation detail with no fiction, no UI and no decision
attached. In value-chain terms the anchor node ("fed population → growth → a city that works") stops
pulling once housing is full, so every farm built past that point produces nothing the player values.

### 4.2 Constant demand is the property that makes a faucet worth turning

The reason the genre keeps sinks strong is not realism, it is **flow**. Cook: a faucet-and-drain economy
has "a nice velocity of goods flowing through the economy and out via the sinks", which is what lets the
designer "incentivize players to continue engaging in gameplay actions that generate resources". The
F2P literature says the same thing from the other side: if the tap outruns the sink, the surplus "becomes
effectively worthless to the player and they stop interacting with the tap" (**S**, Department of Play),
and GMTK lists "feeding citizens" among the canonical drains that "send players back to the tap" (**S**).

This is exactly the observed behaviour. On the passive D2 line the player's optimal move is to build no
more farms; on the calibrated lines it is to build *fewer* farms than the population could support
(5 farms for 16 colonists would be 16/tick at 3 each — the balance is exact, not generous). The game
teaches "do not invest in food", which is the opposite of what a city-builder wants to teach.

### 4.3 Sinks have types, and the types create different decisions

| Sink type | Mechanism | Decision it creates | Genre example |
|---|---|---|---|
| Per-capita consumption | stock −= population × rate | how many mouths to support | everyone |
| Per-stock decay | stock −= stock × rate | how big a buffer to hold | RimWorld, Songs of Syx, Manor Lords |
| Variety / quality | need satisfied only by N distinct goods | what to produce, how far to carry it | Manor Lords, Anno, Against the Storm |
| Transform | inputs consumed into a preserved/other good | process now or eat now | SoS rations, ATS complex food |
| Export | goods leave the map for money | sell the surplus or keep it | Caesar III warehouses, Anno trade |
| One-off projects | stock spent on a building/feast | spend now or grow later | NOVA's plank costs, feast designs |
| Cap + throttle | production stops at a target | automate or micromanage | Manor Lords production limits, NOVA farms |

NOVA implements the first and a degenerate form of the last (the clamp, without the throttle). Every
other row is absent (**C**).

### 4.4 Stocks vs flows: the buffer is measured in time, not units

A stock is only meaningful against the flow that drains it. If a colony eats `c` per tick and holds `S`,
its buffer is `S/c` ticks. That is the unit players actually reason in ("we have a winter of grain"), and
it is the unit NOVA's cap ignores: the cap is derived from day-0 *stock* (Step031), so its depth in ticks
falls as the city grows (**C**). The genre states buffer depth explicitly or implicitly everywhere: Manor
Lords' spoilage is per stack per month and its granary is rated in food units against a known monthly
appetite; Caesar III's cartload is defined as "100 units, each of which feeds one person for one month";
Kingdoms Reborn's storage yards are judged by whether they are within 100 tiles of the house that needs
them (**S**). None of those games asks the player to compare an absolute stock to an absolute cap without
a time reference.

There is a second consequence, and it is the one that makes D2 expensive: **a per-household buffer changes
what the cap means**. If 16 houses hold 12 ticks each, the colony holds 192 food in larders plus whatever
is in the granary. The cap must either become "sum of stores" (and then it is not a cap at all) or be
re-defined as a *granary* limit while households hold their own (**J**). Either way the invariant the
tests assert today (`state.resources.food <= foodCapacity`) stops being the right invariant.

### 4.5 Distribution is a transport problem

The genre splits cleanly:

- **Global pool, no transport** (Anno 1800): needs are fulfilled from island storage as long as the
  residence is road-connected; consumption is computed island-wide from storage at rates set by the
  number of residences (**S**). Carts and loading ramps exist between *buildings*, not between the pool
  and the citizen. Cheap, readable, and it deletes the spatial game — which is why the owner's rejection
  of "a market that distributes" is coherent, and why Anno is the wrong reference for NOVA.
- **Visible hauling** (The Settlers II, Banished, Kingdoms Reborn, Manor Lords, Songs of Syx, Timberborn,
  Ostriv): goods are carried by someone, over a distance, with a capacity, and the player's leverage is
  the network. The Settlers makes it literal — a carrier per road segment between flags, and "pulling out
  all the stops in production just leads to bottlenecks where the transportation infrastructure can't get
  the goods to their destinations" (**S**). Banished's market exists so that "citizens … use the market
  to collect goods, rather than taking long walks to outlying storage areas", and vendors collect the
  *variety* the town produces (**S**). Kingdoms Reborn's market is a paid service with a 30-tile radius
  and 50 units per worker (**S**).
- **District gates** (Timberborn): each district has its own stock, resources are not usable across
  districts, and crossings with workers and per-good import/export rules move goods between them (**S**).
  This is the middle ground between "one global pool" and "per-house larder": state per district, no
  per-citizen state, and the player's decision is where to put storage and how many crossing workers to
  staff.

NOVA's own spec is unambiguous: "The MVP does not simulate every courier. Instead, aggregate flow is
influenced by supply, demand, stock, capacity, network topology, route distance, congestion, priorities"
(`05-SIMULATION` §10). That is the Timberborn/Settlers insight in aggregate form. The implementation has
the aggregate part and none of the influence part: consumption is location-free, so topology and distance
cannot influence it.

### 4.6 Legibility: an unobservable sink is noise

Tynan Sylvester's "Player Model Principle": designers build a game model, players build a mental model
from what they can observe, and "anything in the Game Model that doesn't copy into the Player Model is
worthless" — the ecologies of Ultima Online and BioShock "degraded into noise" (**S**). NOVA's own design
rules say the same at §3–§4: a bottleneck must be observable, explainable, actionable, measurable after
intervention; the game provides evidence, not instructions.

By that standard the clamp is the worst possible sink: it is real (food disappears), invisible (no
ledger), unexplained (no fiction), and previously *misattributed* (a warning that read as a fault the
player could only clear by demolishing farms). Step066 fixed the severity and the copy; it did not give
the loss a home in the player model.

### 4.7 Decisions, hoarding, and why caps feel like punishment

Meier's "a game is a series of interesting decisions" is the usual yardstick (**S**). A cap that deletes
food creates no decision: there is no choice between two paths, only "build fewer farms", which is
anti-play. The hoarding literature is the mirror image: players hoard because the future is uncertain,
and the standard remedies are to make the vital resource easy to reacquire, to cap what can be held, or
to make spending clearly rational (**S**, Josh Bycer). A hard cap *without* a fiction is the remedy
applied as punishment — the player loses stock for a reason the game never states. NOVA's rule §6 ("no
arbitrary punishment… the player should be able to trace the chain of causes") is the constraint that any
decay or cap must satisfy.

This is also where the design's honesty matters: real stockpiling is an adaptive response to scarcity
(**S**, Preston), not a bug. A game that punishes storage without explaining *why* is fighting the
player's instinct instead of using it.

### 4.8 Seven propositions this audit tests

| # | Proposition | Status after §5–§7 |
|---|---|---|
| P1 | A resource whose only consumer is capped and whose surplus is deleted becomes a formality | **Supported** — measured, and the scenarios were re-anchored around it |
| P2 | A sink must scale with whatever grows (population, stock, expectations), or the economy has a wall | **Supported** — the cap is fixed while appetite grows; techs scale the faucet only |
| P3 | Distribution cost belongs to labour and distance, not to a global pool, if the spatial game is the product | **Supported by the genre**; NOVA's spec agrees, its code does not |
| P4 | Buffer depth (ticks), not absolute stock, is the meaningful quantity | **Supported** — the cap's depth halves between pop 10 and pop 24 |
| P5 | An unobservable mechanic is noise | **Supported** — no loss ledger, no cap forecast |
| P6 | A cap/decay without a traceable cause reads as arbitrary punishment | **Design constraint**, not yet violated (the clamp is invisible rather than punitive) |
| P7 | Mechanics should create decisions, not chores | **Violated** — "build fewer farms" is not a decision |

---

## 5. Case studies

Eleven games, chosen because each answers at least one of the two questions differently. The last column
is the only part that is judgement.

### 5.1 Kingdoms Reborn (the owner's reference)

**What food is.** A per-settlement resource produced by farms, eaten by citizens; houses also hold
luxuries and level up while they last.

**Where it lives.** In storage buildings. "When Products are not on a Storage Yard (or Warehouse)
Citizens can not use those Products" (**S**). Houses need such storage "nearby or at least in a range of
100 tiles — the closer, the better" for luxuries (**S**).

**How it moves.** Citizens walk. The Market is a *service building*: 30-tile range, 3 workers (6
upgraded), "Supplies anything a household needs within its radius. Workers carry 50 units" (**S**). It
exists to stop citizens walking to distant warehouses; it is not a shop and it does not create goods.

**What happens to a surplus.** It is stored; the pressure valve is hauling capacity and market throughput,
not deletion. Players report the failure mode as *starvation next to full storage* when the network is
too spread out — "markets only work in their circle" and people "can't walk fast enough to get food"
(**S**). Late game, players describe an import spiral because domestic chains cannot keep up (**S**).

**What the player learns.** Distance is the enemy; storage near housing is a real investment; a market is
a labour purchase, not a magic distribution.

**Cost.** Per-house state, per-trip carrying, hauling as a job line, pathing; players complain that
haulers "get distracted by other general labour duties" (**S**).

**Transfer to NOVA at pop 16–22.** The *fiction* transfers (goods live where stored, distance costs
labour, a household can be hungry while the colony is full). The *market* does not (owner constraint) and
the per-trip hauling does not (F9: 5 farms, 8 wells, 34–46 buildings, 16–24 colonists — a courier model
would be the largest system in the game and the least visible).

### 5.2 Banished

**Where it lives.** Storage barns and stockpiles; the Market holds 10 000 weight and vendors collect from
many barns so that "citizens that live near a market will use the market to collect goods, rather than
taking long walks to outlying storage areas" (**S**).

**How it moves.** Citizens walk; vendors stock the market from outlying storage; the market's value is
variety ("collect the full variety of resources that the town produces") and shorter walks (**S**).

**Surplus.** Stored, not destroyed. The pressure is storage capacity, labour and walking time.

**What the player learns.** Walking distance is the dominant efficiency variable — the community's own
guides say so in one line: "If your citizens have to travel very far to work or get resources, you are
doing it wrong" (**S**).

**Transfer.** Banished is the closest proof that a market can be a *logistics* building rather than a
*shop*: it moves goods and labour, not money. NOVA's constraint forbids even that, which pushes NOVA
towards D1/D2 (residents fetch for themselves) rather than Banished's vendors.

### 5.3 Caesar III / Pharaoh (Impressions)

**Where it lives.** Food must be in a **granary** to be eaten: "All food to be eaten is stored in
granaries… Your city can also store food in warehouses, but this will never be eaten directly. Any food
at warehouses is deemed to be for export" (**S**). Pharaoh's granary holds 3 200 units and up to four
food types; imported food never enters a granary and goes to a storage yard instead (**S**).

**How it moves.** Market traders walk to granaries (within 40 tiles, per community tests) and "drop
enough food to last each house several months" (**S**). Pharaoh's bazaar buyers do the same; a bazaar more
than 40 tiles from a granary "simply does not collect food from there" (**S**).

**Surplus.** Warehouses are export silos: the game *separates* "food for the city" from "food for trade"
by building type, so overproduction has a legitimate destination. Cart pushers also top granaries up from
warehouses when they fall below half (**S**).

**What the player learns.** Storage type is a decision (eat vs sell); distance from granary to market is
a hard constraint; a city can have enough food overall and still starve a district (**S**, manual).

**Transfer.** The strongest idea for NOVA is not the granary but the **split between edible and
exportable stock** — a cheap way to make a surplus *mean* something without a market that hands goods to
citizens.

### 5.4 Anno 1800

**Where it lives.** In island storage. "Goods-based needs are fulfilled when appropriate goods are
located within island's storage. As long as a residence is connected to the trading post via roads, all
goods from the storage are readily available for the residence" (**S**). Consumption is computed
island-wide, from storage, at rates depending on residences and their maximum population; pausing a need
pauses its consumption (**S**).

**How it moves.** Between buildings by carts to warehouses with loading ramps; warehouses are "a magic
chest" linked together (**S**). The citizen never carries anything.

**Surplus.** Stored; the limits are warehouse capacity and the production/demand ratio, surfaced in the
statistics screen. Anno's answer to "too much" is growth: needs unlock residents who consume more.

**What the player learns.** Ratios, not space: how many tons per minute per house. It is an interface
over a spreadsheet, and deliberately so.

**Transfer.** Almost none for attribution — this is the model the owner rejected. One transferable idea:
**needs as the growth engine** (satisfy a need → the house holds more people → appetite rises), which is
S1/S4 territory and would give a surplus somewhere to go without a market.

### 5.5 The Settlers II

**Where it lives.** In storehouses and in transit. Every stretch of road between two flags has one
carrier; goods move segment by segment, visibly (**S**).

**Surplus.** It jams. Production beyond transport capacity piles up at flags; "pulling out all the stops
in production just leads to bottlenecks" (**S**).

**What the player learns.** The network *is* the economy: short roads, more flags, storehouses as hubs,
and transport priority. Rock Paper Shotgun's retrospective: "your towns lived or died based largely on
how well you designed your transport logistics… it's the roads, man" (**S**).

**Cost.** Extreme: per-carrier simulation, congestion, pathing. The genre's most precise logistics and
its least scalable.

**Transfer.** As doctrine, not implementation: a distribution cost that is a function of distance and
volume, computed in aggregate, is the Settlers lesson at NOVA's scale.

### 5.6 Manor Lords

**Where it lives.** Granary (500, upgraded 2 500), storehouse, burgage pantry, market stalls. Families
assigned to a granary set up food stalls and stock them from their own building; each stall serves a
limited number of homes (**S**).

**How it moves.** Workers carry one item per trip, a handcart 10; stalls pool goods so plots "draw what
they need from the market's pooled supply instead of trekking across the map" (**S**).

**Surplus and decay.** Food is eaten at 1 per family per month, *any* food; upgrading a plot requires
**distinct food types** ("fill the granary with nothing but bread and every family eats, no plot
upgrades") (**S**). Since the food-spoilage update (Update 3; patch notes titled 0.8.004, release reported as 0.7.987)
each food type decays per month; storage location changes the rate (granary better than a workplace pantry; a large granary is better still), weather multiplies it,
and there is a difficulty setting for it (**S**). Food sitting in a market stall does not spoil, and
spoilage rolls per stack, so many small stacks rot faster than one large one (**S**, community-tested).

**What the player learns.** "Reach, not supply": a full granary upgrades nobody if the stalls cannot
reach the plots; and a buffer has a *cost per month*, so overproduction is a decision, not a free win.

**Transfer.** The best template for NOVA's S1+S2 pair, in both directions: variety is what makes more
than one food chain worth building, and spoilage is what makes the granary size a choice. Note the
coupling: variety without reach is useless, decay without variety is just a smaller cap.

### 5.7 Ostriv

**Where it lives.** Granary for food, warehouse for materials, household money for purchases.

**How it moves.** Families **buy** food, firewood and clothes at market stalls (up to four goods per
stall); carts and hired carters move bulk; residents fetch what they need (**S**). Adults eat ~100 food a
year, children ~50; there are no food preferences — quantity, not variety, except that a varied diet is
needed for immigration/health in the wider design (**S**).

**Surplus.** Sold, or exported through the trading post; households' money circulates and the treasury
taxes it.

**What the player learns.** Market coverage and cart logistics; the internal market is a *distribution
network* with prices, not a sink.

**Transfer.** Confirms that "market" can mean three different things (shop, logistics hub, price
mechanism). NOVA's constraint bans the shop; the logistics hub is what Banished/KR use; the price
mechanism is what Step065 removed.

### 5.8 Songs of Syx

**Where it lives.** Stockpiles, warehouses, food stalls.

**How it moves.** Haulers and transports; food stalls are "open-air Distribution rooms where workers turn
stored Food into simple meals for citizens", with a 100-tile service radius; "citizens choose what they
eat, which raises their food preference" (**S**).

**Surplus and decay.** Goods decay over time; warehouses "significantly decrease the spoil rate" (halved)
while haulers only reduce it by 25 %; food not in a warehouse "will spoil much quicker" (**S**). Rations
(from meat/bread/eggs/fruit/vegetables) have the slowest spoil rate (10 %) and feed the army (**S**).

**What the player learns.** Storage *quality* is a decision (cheap open pile vs warehouse), processing is
a way to convert perishable surplus into durable stock, and distribution points must sit near housing.

**Transfer.** The decay-rate-by-storage-type idea is directly portable as a single multiplier on a
single decay phase; the food-stall service radius is a market by another name and is excluded.

### 5.9 RimWorld

**Where it lives.** Stockpile zones with per-item filters and priorities; shelves; freezers.

**How it moves.** Hauling is a work type; colonists and trained animals carry items; stockpile priority
steers where things end up (**S**).

**Surplus and decay.** Food spoils above 0 °C, slower below 10 °C, and stops when frozen; a cooked meal
spoils in four days regardless of ingredient shelf life (**S**). The counter-play is a freezer, pemmican,
and stockpile discipline.

**What the player learns.** Preservation is infrastructure; overproduction without cold storage is a
countdown; stockpile *priorities* are a policy language.

**Transfer.** Strong on S2/S5: decay is legible because it is a rate on a known stack with a known
counter (cold, preservation). Weak on attribution: RimWorld deliberately abstracts carrying into a job,
which is what NOVA's spec forbids at MVP scale.

### 5.10 Against the Storm

**Where it lives.** In Storage, colony-wide per settlement.

**How it moves.** Villagers walk to a Hearth and "try to eat food from your Storage" on each break; if
they cannot, they take a stacking Resolve penalty called Hunger (**S**). No carrying, no per-house stock.

**Surplus and decay.** No spoilage; the sink is **consumption efficiency and need satisfaction**: raw
food feeds one villager inefficiently, complex food "feeds more villagers than raw food" and grants
Resolve; players use Consumption Control to forbid eating an ingredient they want to process, at a
Resolve cost (**S**).

**What the player learns.** Food is a *policy*: what to eat, what to process, who may consume what. The
decision is in the consumption rules, not in the logistics.

**Transfer.** The most important negative result for NOVA: a global pool is perfectly playable *if* the
decisions live in the consumption rules (variety, processing, rationing). NOVA has the pool and none of
the rules, which is precisely why its pool feels empty.

### 5.11 Timberborn

**Where it lives.** Per district, with a District Center and its own path network; "available resources in
one District are not usable by another" (**S**).

**How it moves.** Haulers within a district (double carrying capacity, freed from production); District
Crossings with up to 10 workers per side, 30 units per good, and per-good import/export settings
(`Import always`, `Import if needed`, retention slider) (**S**).

**Surplus.** Balanced between districts by percentage of storage; the bottleneck is crossing workers and
storage near the crossing.

**What the player learns.** Where to draw the boundary of a stock, and how much labour to spend moving
goods across it.

**Transfer.** The most realistic *middle* option for NOVA if per-house state is judged too expensive:
district-level stock + haulers replaces the global pool without a market. It is D5 in §8, and it costs
roughly D3-lite (a hauler job pool) plus a notion of district.

### 5.12 Summary matrix

| Game | Stock lives in | Who moves goods | Surplus destination | Player decision | Fits "no market"? |
|---|---|---|---|---|---|
| Kingdoms Reborn | storage buildings (+ house luxuries) | citizens, market workers, haulers | stored; throughput-bound | storage placement, market labour | market excluded, rest fits |
| Banished | barns / market | citizens, vendors | stored | walking distance, market coverage | vendors excluded, rest fits |
| Caesar III / Pharaoh | granary (food) vs warehouse (export) | cart pushers, market traders, bazaar buyers | export silo | eat vs sell, granary/market distance | **yes, via export split** |
| Anno 1800 | island pool | carts building↔warehouse | stored; growth consumes more | ratios, needs tiers | pool fits, growth model needed |
| The Settlers II | storehouse + in transit | carriers per segment | jams | road network | yes (labour, no market) |
| Manor Lords | granary/storehouse/stalls | families, handcarts | spoilage + variety + trade | storage quality, stall reach | stalls are a market (excluded) |
| Ostriv | granary/warehouse + households | families buy, carters | sales/export | stall coverage, prices | shop model excluded |
| Songs of Syx | stockpiles/warehouses | haulers | decay + processing | storage quality, processing | stalls excluded, decay fits |
| RimWorld | stockpiles/freezer | haulers | spoilage | preservation, priorities | **yes** |
| Against the Storm | settlement storage | nobody (abstracted) | consumption rules | what to eat/process | **yes** |
| Timberborn | district storage | haulers, crossing workers | inter-district balance | district boundaries | **yes** |

---

## 6. Cross-case synthesis

### 6.1 Five ways to attribute, ranked by state cost

1. **Global pool** (Anno, ATS): zero per-location state; decisions must live elsewhere.
2. **Distance-priced fetch** (NOVA-D1; the aggregate reading of Settlers/Banished/KR): no new state, one
   derived cost per residence.
3. **District stock + haulers** (Timberborn; D5): state per district, a hauler job pool.
4. **Household larder** (KR houses, Manor Lords pantries; D2): state per residence, save migration.
5. **Per-citizen couriers** (Settlers, Ostriv carters; D3): entities, trips, queues, pathing.

NOVA is at 1, its spec describes 2/3 in aggregate, and the owner's reference is 2/4.

### 6.2 Five ways to dispose of a surplus

1. **Nothing** (Banished, Anno at cap): the cap is the game; overproduction is a storage/labour problem.
2. **Decay** (RimWorld, SoS, Manor Lords): the surplus has a half-life, so the buffer has a price.
3. **Variety** (Manor Lords, ATS, Anno tiers): more of the same stops helping; demand differentiates.
4. **Transform** (SoS rations, ATS complex food, Manor Lords sausage): perishable → durable, or bulk →
   efficient.
5. **Export / projects** (Caesar III, Anno trade, feasts): the surplus leaves the food system entirely.

NOVA is at 1 with an invisible clamp. The cheapest coherent move is 2; the richest is 3; 4 is 2's natural
companion; 5 collides with Step065 unless it is framed as export, not as feeding citizens.

### 6.3 The genre's convergences (what almost everyone does)

- **A buffer is expected to be visible and finite.** Every game above surfaces stock, capacity or both,
  and most give the player a way to see *why* it is full or empty.
- **Distance is either priced or deliberately deleted.** Nobody half-prices it. NOVA prices extraction and
  not consumption — the one combination no game in the sample uses.
- **A surplus is either stored or converted, never silently destroyed.** Even Anno's cap is a warehouse
  limit the player builds; the goods are not deleted mid-tick without a trace.
- **Variety is the standard long-game sink** because it scales with expectations rather than stomachs.
- **Decay is the standard short-game sink** because it is a single rate and it makes storage a decision.

---

## 7. Findings

Severity is about *product risk*, not code quality. Confidence is M/C/S/J per the tag table above.

### F1 — Food's only sink is capped, and the surplus is destroyed by design (severity: high)

`consumeFood` = `min(stock, population)`; `clampStorage` truncates to `foodCapacity`; nothing else
consumes food (**C**). Measured: 331/400 ticks pinned on the passive line (331 units destroyed), 413/783
on `age2` (1 984 destroyed), 418/1 147 on `age3` (1 996 destroyed); peak +6/tick (**M**). The game ships
a resource whose value is zero at the margin.

### F2 — The cap was reported as a fault; Step066 fixed the report, not the hole (severity: was high, now medium)

v1 measured a passive colony at `critical` for 331 of 400 ticks purely because of the storage warning.
Step066 made both storage alerts `info`, changed "wasted" to "not stored", and the same line now measures
**400/400 `healthy`** with the alert still rendered and the loss still real (**M**). `age2` replays
`healthy` on 411 of its 413 pinned ticks; its single remaining `critical` (t=423) is a genuine transient
(`stocks under 20 ticks`, treasury net −1) (**M**). The legibility half is closed; the coherence half is
F1.

> Status: the alert is now honest. The resource is still a formality.

### F3 — The content was re-anchored around the hole (severity: high)

Step065 re-anchored both journeys to *exact* food/water balances (5 farms = 16 food for 16 colonists;
7 farms = 22 for 22) precisely so the granary never pins; the self-play governor dropped its food triage
because "the old food-based triage never fires on a food-pinned colony" (**C**, commit `8d89aea`, scenario
headers, `tests/selfplay.governor.ts`). Both are rational engineering responses. Together they mean the
shipped content now **encodes the absence of a mechanic**, and the calibration doctrine ("production =
appetite, exactly") is the opposite of what a surplus economy needs.

### F4 — No attribution layer exists (severity: high; owner-visible)

Consumption is aggregate, instantaneous, location-free; there is no household stock, request, delivery,
distance or carrying (**C**). `05-SIMULATION` §9's produced/stored/requested/delivered/consumed/lost
distinction exists only for produced, stored, consumed — and "lost" only as a clamp side effect.

### F5 — Distance is priced on extraction, never on consumption (severity: medium-high)

Step050 taxes extraction output by road-graph hops to the nearest warehouse, with farms and wells exempt
"until the V2 network storage lands" (**C**, `logistics.ts` comments). A remote *house* is fed at the same
cost as a central one. The documented reason for the exemption is calibration, not principle — the
asymmetry is explicitly a placeholder, and this audit is the moment to decide whether it stays.

### F6 — Storage is one scalar per resource, with no quality, type or locality (severity: medium)

Food and water share one clamp mechanism; warehouses only add capacity and act as BFS anchors; there is no
granary vs warehouse distinction, no per-resource storage, no decay (**C**). `08-RESOURCES` §3 asks for
per-resource storage characteristics; none exist.

### F7 — Residences have nothing to hang a household on (severity: medium)

`Building` has no inventory; population is an integer; housing capacity counts operational residences
(**C**). Any per-household stock is a state-model change: new field(s), `SAVE_VERSION` 18 → 19,
`SAVE-FORMAT.md`, persistence tests, an inspect-panel surface, and a forecast that sums larders. This is
the single biggest cost in the option space, and it is why D2's score in §12 is not the top.

### F8 — The reference designs and NOVA's spec agree; the implementation does not (severity: medium)

§4.5/§5: KR, Banished, Manor Lords, Timberborn, Settlers all bind distribution to labour/distance;
`03-DESIGN-RULES` §6 and `05-SIMULATION` §10 say exactly that in aggregate form. The gap is
implementation, not doctrine. This matters because it means D1/D5 need no new design theory, only an
executor.

### F9 — Per-citizen carriers are unaffordable and invisible at this scale (severity: informational)

The lines run 16–24 colonists, 5–7 farms, 8–11 wells, 34–46 buildings (**M**). A courier model would add
entities, pathing, per-tick BFS and determinism risk to a food economy of five buildings, against
`05-SIMULATION` §4 (**J**). The owner asked for the *fiction*, not the simulation of every basket.

### F10 — The cap is absolute, so the buffer depth shrinks as the city grows (severity: high, new in v2)

120 food = 12 ticks at pop 10, 7.5 at 16, 5 at 24; 80 water = 8 / 5 / 3.3 ticks; a warehouse adds 60/40
units, i.e. +6 / +2.5 ticks at pop 24 (**C**). The cap was derived from day-0 stocks in Step031 and never
re-expressed in consumption time. Growing the city silently halves the safety margin, and the player is
never told. Every genre example in §5 that has a cap expresses it against appetite (Caesar's cartload =
one person-month; Manor Lords' food per family per month; Anno's tons per minute), not against a
founder's inventory.

**Cheap coherence fix (S10 below):** express capacity as `k × population` (e.g. 10 ticks) instead of a
constant. It adds no sink, but it stops the game from punishing growth with a shrinking buffer. It is a
balance change, so it is a decision, not a cleanup.

### F11 — Techs scale the faucet and nothing scales the drain (severity: high, new)

`cropRotation` (+1/farm, Age 1) and `irrigation` (+1/farm, Age 2) are pure yield multipliers (**C**). On
the D2 opening's 5 farms, `cropRotation` turns +1/tick into +6/tick against 10 eaters and fills the
remaining 60 units in 10 ticks (**C**). The player's first research reward is a larger waste stream;
the game then re-anchors the journeys to *cancel* the tech by building fewer farms or more mouths. That
is the definition of a reward the simulation cannot use, and it is the clearest single argument that the
missing sink is not cosmetic.

### F12 — The one event that adds food is the one the clamp eats (severity: medium, new)

`bountifulHarvest` pays 40 food once at phase 11; the clamp runs at phase 6 of the next tick (**C**). A
granary at 100/120 keeps 20 and deletes 20 as soon as production holds the stock at the cap. The event is
narratively "a good harvest" and mechanically "a rounding error". No measurement was run for this one
(the event schedule is seeded), so it is C, not M; the code path is unambiguous.

### F13 — Water's storage alert has never fired (severity: low, new)

Wells are matched to demand on every measured line, so water never pins (0/783, 0/1 147, 0/400) (**M**).
The water alert is a copy of the food alert with its own constants, and no line exercises it. That is
evidence that the thresholds were derived rather than calibrated; it also means a regression in water
storage would be invisible.

### F14 — No cumulative "lost" ledger (severity: medium, new)

`clampStorage` returns the loss; no production code consumes it (**C**). The UI reports a rate at the
moment of pinning and nothing afterwards, so the player cannot answer "how much food did this city destroy
this year", and the game cannot either. `05-SIMULATION` §9 asks for the line by name.

### F15 — No cap forecast (severity: low-medium, new)

The forecast reports stock → 0 ticks (shortage), never stock → cap ticks (overflow) (**C**). A colony at
119/120 with +6/tick shows nothing until the tick it pins. The design rules ask for evidence before the
failure, not after it (§3, §4).

### F16 — Storage capacity is a purchasable non-decision (severity: medium, new)

A warehouse costs 25 money + 2 planks, adds 60 food + 40 water capacity, and has no jobs (**C**). So the
answer to "my granary is full" is "buy capacity", which is a cash purchase with no labour, no location
trade-off and no ongoing cost beyond the 1/tick upkeep shared with every building. Design rule §8 (a
mechanic must create a decision) is not satisfied: capacity is a number you buy, and the clamp is a
number you postpone.

### F17 — The test fleet lost its surplus witness (severity: high, methodological, new)

The four witnesses (D2 passive, `age2`, `age3`, governor) are now exact-balance lines that never pin on
purpose (**M**). A future change to `clampStorage`, to the cap arithmetic or to a tech's yield could
regress surplus behaviour and every shipped scenario would still pass. This is the audit's most
actionable finding: before touching design, re-add a **surplus-positive witness** so the fix can be
measured against a baseline that actually exercises the code path.

### F18 — The governor's triage encodes the same blind spot (severity: medium, new)

`tests/selfplay.governor.ts` replaced food triage with water triage because food triage "never fires on a
food-pinned colony" (**C**). A triage that cannot see the dominant failure mode is not a governor; it is a
water watchdog. If S2 introduces decay, the governor needs a *stock target* rule (build farms when stock
< N ticks), not a starvation rule.

---

## 8. Attribution options (D0–D6)

| | Model | What the player sees / decides | New state | Save | Simulation | UI | Honest cost |
|---|---|---|---|---|---|---|---|
| **D0** | Status quo: global pool | "granary full" information | none | none | none | none | answers nothing; food stays a formality |
| **D1** | **Distance-priced fetch**: each inhabited residence pays a labour cost derived from road-graph hops to the nearest food/water source; the cost consumes effective workforce (or yields a "fetching" population share) | a "distribution" line in stats; workforce ratio drops with sprawl; the logistics overlay becomes relevant to housing | none (derived) | none | one derived per-residence cost per tick, reusing `buildLogisticsMap` | medium: stats row + overlay + inspect line | all four witnesses re-anchor (they run at workforce saturation, e.g. 15/15); risk of a sprawl death-spiral if the tax is unbounded |
| **D2** | **Household larder**: each residence holds N ticks of food/water, refilled by its own residents at a distance-dependent rate; consumption draws from the larder; a house can starve while the colony is full | per-house stock in inspect; hungry houses in overlay; local shortage before global | per-building inventory | **v19 + migration** | refill phase + per-house consumption; determinism to re-verify | large: inspect, overlay, forecast rewrite (sum of stores), alerts per house | ~10 files, a migration, a new invariant; only worth it once a need model exists (S1) |
| **D3** | **Dedicated carriers**: a job pool moving units/tick storage → houses, with congestion | little people carrying crates; hiring haulers | jobs + queues | v19 | largest: per-tick trips, pathing, queues | large | over-modeled at pop 16–24 (F9); hardest to test; rejected |
| **D4** | **Market that hands goods to houses** | — | — | — | — | — | **owner-rejected** (Step065 + constraint 2) |
| **D5** | **District stock + haulers** (Timberborn): the map is split into N stock areas; haulers move goods between them; no per-house state | where storage sits; how many haulers; district boundaries | per-district stock + hauler jobs | v19 (or derived if districts are pure spatial partitions) | medium: hauler pool, transfer rules | medium: district overlay, transfer settings | a district concept does not exist in NOVA; adds a job line and a second inventory model for a 16×16 map |
| **D6** | **Household self-provision**: residences produce a small food trickle (garden/pantry) | houses as tiny producers; farms for the rest | none | none | small: +1 per some residences, capped | small: inspect line | cheap fiction, but it *adds* a faucet to a leaking economy and blurs the farm/house boundary; not a distribution model |

**Reading the table.** D1 is the only option that makes distance bite without new state. D2 is the owner's
reference fiction (KR) and the only one that makes shortage *local*, but it is the most expensive and its
value is contingent on S1/S2. D5 is the realistic compromise if per-house state is rejected; it is
essentially "make the warehouse a real place" rather than "make the house a real place".

---

## 9. Surplus-sink options (S0–S10)

| | Sink | Decision it creates | New state | Save | Re-anchors | Cost | Notes |
|---|---|---|---|---|---|---|---|
| **S0** | None; keep losing the surplus, reported honestly (current) | "build fewer farms" | none | none | no | XS | the measured baseline; F1/F11 remain |
| **S1** | **Variety needs** (Manor Lords, ATS, Anno): households want N distinct foods; more of the same stops helping | what to produce, where, how far to carry it | 2–3 food resources + needs model | v19 | D2 + both journeys + milestones | L | the richest long-game answer; requires a need model NOVA does not have (`08-RESOURCES` §6 anticipates it) |
| **S2** | **Spoilage**: stock decays per tick (optionally by storage type) | how big a buffer, when to harvest, whether to process | none (stateless rate) | **none** | all exact-balance lines (see §11) | S–M | cheapest coherent sink; must be traceable (design rule §6) and forecast |
| **S3** | **Rationed construction/expeditions**: food spent on projects | spend now or grow later | none | none | opening budgets | S | reads as a tax unless the project is desirable; collides with the plank economy |
| **S4** | **Raise the growth ceiling** (housing/air) | how fast to grow | none | none | growth gates | M | moves the wall; may just relocate it |
| **S5** | **Preservation chain** (SoS rations, ATS complex food, Manor Lords sausage): perishable → durable, bulk → efficient | process now or eat now; build the workshop | 1 building + 1 resource | v19 if a new good | both journeys | M | only meaningful *with* S2; without decay it is a free multiplier |
| **S6** | **Export** (Caesar warehouses, Anno trade) | sell the surplus or keep it; what to specialise in | trade system | v19 | economy | L | Step065 removed food-for-money; an export model is a *different* mechanic (prices, transport, partners) and needs its own decision. Not MVP. |
| **S7** | **Waste → compost/soil** | overproduce to fertilise | fertility model | v19 | farms/extraction | M | weakens the decision: part of the loss is recovered, so the surplus still has no cost |
| **S8** | **Feasts / rituals / prestige** | hold a feast now or stock for winter | happiness/prestige | v19 | needs | M–L | strong fiction, but needs the happiness system first; good Age-2+ content |
| **S9** | **Production governor** (Manor Lords limits, ATS consumption control): auto-throttle farms at a stock target | set the policy, not the click | policy field | maybe | none (it prevents pinning) | S | turns waste into *idle labour*, which is a real cost the player can reassign; does not give food a purpose, but it is the honest automation of "stop overproducing" (§8 of the rules) |
| **S10** | **Capacity in ticks** (`cap = k × population`) | how deep a buffer to pay for | none (derived) | none | all caps | XS | fixes F10 (the shrinking buffer); adds no sink; a balance change, so a decision |

**S2 in detail, because it is the recommendation.**

- Mechanics: one phase, `stock -= ceil(stock × rate)` per resource, `rate` per resource (e.g. 1–3 %/tick),
  optionally multiplied by a storage-quality factor (granary vs open pile, S5 later). No new field, no
  migration.
- Steady state: with net production `p − c` and decay `d`, stock converges to `(p − c)/d`; if production
  equals consumption, stock goes to zero. Therefore **a colony must overproduce by `d × buffer`** to hold
  a buffer of that depth. At `d = 2 %/tick` and a 12-tick buffer, that is +24 % gross production (**C**).
- Consequence: the "exact balance" doctrine must be replaced by "consumption + spoilage at target stock".
  That is a *design gain* (the player now has a target), but it invalidates every calibrated line and the
  governor's assumptions. This is the correction to v1's cost estimate.
- Legibility: the alert must say "stored food is spoiling: −N/tick (−M %/tick), granary X/Y", and the
  forecast must show the equilibrium stock, not just "full". Otherwise S2 becomes the new invisible sink.
- Fiction: rot, rats, damp, vermin, spoilage in the open; the fix (granary/warehouse, later salt/smoking)
  is physical and traceable. NOVA already has a warehouse building whose only current role is a capacity
  number — S2 gives it a second role (reduced spoilage) *without* a market.

---

## 10. Costs in this codebase, concretely

| Change | Files likely touched | State/save | Tests | Calibration damage |
|---|---|---|---|---|
| Loss ledger + cap forecast (F14/F15) | `storage.ts` (already returns the loss), `analysis.ts`, stats view, one test | none | 1–2 | none |
| Surplus witness (`surplus.jsonl`) | `tools/agent/scenarios/`, README | none | scenario only | none |
| S10 cap in ticks | `storage.ts`, `analysis.ts` messages, tests | none | 2–3 | all caps shift; opening buffer grows |
| S2 spoilage | `storage.ts` or a new `decay.ts`, `tick.ts`, `analysis.ts`, content constants, tests | none | 3–5 | all four witnesses; governor rule |
| S9 production governor | `jobs.ts`/`production.ts`, policy field, UI toggle | new field (v19) or derived command | 2–3 | none if opt-in |
| D1 fetch labour | `logistics.ts` (reuse BFS), `population.ts`/`jobs.ts` (workforce share), `analysis.ts`, `play.ts` (assess) | none | 3–5 | all witnesses (workforce saturation) |
| D2 larder | `building.ts` (inventory), `state.ts`, persistence + migration, `production.ts`/`tick.ts`, `analysis.ts`, `details.ts`, `overlay`/renderer, tests | **v19** | 6–10 | all witnesses + UI + forecast |
| S1 variety | resources model, content (farms/foods), needs, production, analysis, UI, milestones, scenarios | v19+ | 10+ | all content and both journeys |
| S5 preservation | workshop variant, 1 resource, content, UI | v19 | 4–6 | both journeys |

The pattern is clear: the cheap options (ledger, forecast, witness, S10) are **measurement and coherence**
work; the expensive ones (D2, S1) are **content and state**. The audit's recommendation follows that
gradient rather than the opposite one.

---

## 11. Buffer arithmetic (why the sink changes the tuning, not just the alert)

Let `c` = appetite (1/tick/colonist), `p` = gross production, `d` = decay rate per tick on stored stock,
`B` = buffer depth in ticks (stock / c). Steady state requires `p = c + d × S` with `S = B × c`, i.e.

```
p / c = 1 + d × B
```

| Decay `d` | Buffer 6 ticks | Buffer 12 ticks | Buffer 24 ticks |
|---|---|---|---|
| 1 %/tick | +6 % production | +12 % | +24 % |
| 2 %/tick | +12 % | **+24 %** | +48 % |
| 3 %/tick | +18 % | +36 % | +72 % |

Consequences (**C**):

- The formula is the honest one: at 2 %/tick and a 12-tick buffer, appetite must be covered plus 24 %;
  at 3 %/tick and 6 ticks, plus 18 %. Every age line's "exact balance" becomes a deficit the moment decay
  exists, and the deficit is not waste — it is the price of the buffer.
- With no decay (today), the same city needs 5 farms and destroys the surplus. With decay it needs one
  extra farm per 16 colonists *and a reason to keep it running*, which is the decision the audit is
  looking for. The cap turns that formula into a constraint: because equilibrium stock is `surplus / d`,
  a workable pair must satisfy `surplus / d <= cap` — the quantum problem below.
- The deeper the buffer the player wants, the more surplus production is *required*, which is exactly the
  "constant demand" property the literature says makes a faucet worth turning (**S** §4.2). Spoilage turns
  overproduction from a bug into a **cost of insurance** — the decision the audit is looking for.
- If `d` is too high (> ~5 %/tick), the buffer becomes unaffordable and the player is pushed to
  just-in-time production, which makes famines twitchy; if too low (< 0.5 %), it is invisible and the
  economy converges back to today's clamp.

**The quantum problem, which v1 missed.** Production comes in farm-sized lumps: 3/tick per farm with
`cropRotation` at pop 16. At the cap, 2 %/tick removes 2.4/tick, *less than one farm's yield*. So with
five farms the stock decays to zero, and with six it converges to `3 / 0.02 = 150`, above the 120 cap:
there is no farm count that lands at a sub-cap equilibrium. Spoilage at 2 % therefore does **not** remove
the pin at pop 16; it only converts it from "free waste" to "waste after paying for an extra farm". At
3 %/tick the same six farms settle at `3 / 0.03 = 100` — a 6.25-tick buffer, no pin, +18.75 % gross
production. The lesson: **the useful decay rate is set by yield granularity ÷ cap (≈3/120 = 2.5 %/tick at
pop 16), not chosen freely**, and Phase 2 must measure 2 / 3 / 4 % rather than assume 2 % works. It also
means S2 may want fractional or per-farm-scaled yields, or a decay rate expressed per *tick of stock*
(a 1 %/tick rate on a 120 cap removes 1.2), which is the same arithmetic from the other side.

This is also why S2 must ship with a forecast: the player needs to see "at this rate you hold ~9 ticks" or
the equilibrium is invisible and the decision disappears.

---

## 12. Scoring

Weights express this project's own priorities (design rules: decision value first, legibility second, then
the complexity budget). Scores are 1–5, 5 = best. "Calibration" scores *inverse* damage: 5 = no re-anchor.

| Weight | Criterion |
|---|---|
| 30 % | Decision value (does it create a real choice?) |
| 25 % | Legibility (can the player see and explain it?) |
| 15 % | Cost (inverse: 5 = cheap) |
| 10 % | Calibration damage (inverse) |
| 10 % | Reversibility |
| 10 % | Save/state risk (inverse: 5 = no migration) |

| Option | Value | Legibility | Cost | Calib. | Revers. | Save | **Weighted** |
|---|---|---|---|---|---|---|---|
| D0 status quo | 1 | 3 | 5 | 5 | 5 | 5 | **3.30** |
| D1 distance fetch | 4 | 3 | 3 | 2 | 4 | 5 | **3.50** |
| D2 larder | 5 | 3 | 2 | 2 | 3 | 1 | **3.15** |
| D3 carriers | 3 | 2 | 1 | 2 | 2 | 1 | 2.05 |
| D5 districts | 4 | 3 | 2 | 3 | 3 | 4 | 3.25 |
| D6 self-provision | 2 | 2 | 4 | 3 | 4 | 5 | 2.90 |
| S0 nothing | 1 | 4 | 5 | 5 | 5 | 5 | **3.55** |
| S1 variety | 5 | 3 | 2 | 1 | 3 | 3 | 3.25 |
| S2 spoilage | 4 | 4 | 4 | 3 | 5 | 5 | **4.10** |
| S3 rations | 3 | 3 | 4 | 2 | 4 | 5 | 3.35 |
| S4 growth ceiling | 2 | 3 | 3 | 2 | 3 | 4 | 2.70 |
| S5 preservation | 3 | 4 | 3 | 3 | 3 | 4 | 3.35 |
| S6 export | 4 | 3 | 2 | 2 | 2 | 3 | 2.95 |
| S7 compost | 2 | 3 | 4 | 3 | 4 | 5 | 3.15 |
| S8 feasts | 3 | 3 | 2 | 2 | 3 | 3 | 2.75 |
| S9 governor | 2 | 4 | 4 | 3 | 5 | 5 | 3.50 |
| S10 cap in ticks | 2 | 4 | 5 | 3 | 5 | 5 | **3.65** |

Two results deserve comment.

- **S2 wins clearly (4.10)** and S10 is next (3.65), with the status quo third (3.55) — the three options
  that cost no state. That is not a coincidence: they are the only ones whose complexity is paid in
  *arithmetic* rather than in *content*.
- **D2 loses to the status quo (3.15 vs 3.30)** under these weights, because its value is unrealised until
  a need model exists and its save cost is the worst in the table. Under the owner-friendly alternative
  weights below it climbs to 3.55 — competitive, never dominant. The honest conclusion is that **D2 is a
  destination, not a first step**, which is what v1 guessed and v2 can now justify with numbers.

Sensitivity, computed rather than asserted. With **equal weights**, the status quo ties spoilage at 4.17
(S10 4.00, S9 3.83, D1 3.50, D2 2.67). That is the honest picture: the status quo is cheap, safe and
legible; it loses only on decision value, which is exactly the axis the project's own rules put first. If
the owner weights decision value at 50 % and save risk at 0, D2 rises to 3.55 — level with spoilage (3.60)
and above D1 (3.20), i.e. **the larder becomes rational exactly when the household is declared the unit of
care the product is about**. No weighting makes D3, D6, S4 or S8 competitive.

---

## 13. Recommendation and staged roadmap

The recommendation is **conditional and sequential**, because the cheapest steps are also the ones that
make the later decisions measurable.

### Phase 0 — legibility (done, Step066)

Storage alerts are `info`, copy is "not stored", the cockpit verdict no longer escalates. Measured:
400/400 `healthy` on the passive line, `age2` 411/413 pinned ticks healthy, one real `critical` at t=423.
No design change.

### Phase 1 — instrument before deciding (no gameplay change)

1. **Loss ledger**: accumulate `foodWasted`/`waterWasted` into a `lost` stat (derived or persisted; prefer
   derived per session) and show it in stats and in the alert. Closes F14.
2. **Cap forecast**: "storage full in N ticks" beside the existing "stock lasts N ticks". Closes F15.
3. **Buffers in ticks**: report stock as `X/Y (N ticks)` in the inspection/forecast, without changing the
   cap rule. Makes F10 visible to the player and to the audit.
4. **`surplus.jsonl` witness**: a deliberately overproducing line (the D2 opening, 400 ticks, no action)
   that asserts the pin, the loss rate and the alert text. This is the regression net the fleet lost.
5. **Governor stock rule**: build farms when the stock is below a target in ticks (not only when starving),
   so the governor sees the dominant failure mode.

*Acceptance:* a surplus line exists and fails if the clamp stops reporting; the ledger reconciles
`produced − consumed − stored − lost = 0` over the run; no change to D2/age2/age3 outcomes.

### Phase 2 — S2 spoilage (headless prototype, feature-flagged)

Measure at 1 %, 2 % and 3 %/tick on: passive D2, `age2`, `age3`, `surplus.jsonl`. Report equilibrium
stock, required gross production, famine risk, governor behaviour, and the number of farms/wells each line
needs to stay healthy. **Kill criterion:** if the playable band requires re-anchoring more than one
building per line, or if a colony at target stock still starves without warning, the rate/forecast design
is wrong and the option returns to the owner.

*Acceptance:* the pin disappears (equilibrium below cap), losses are reported as a rate with a cause, the
forecast shows the equilibrium, and all four existing witnesses either pass unchanged or are re-anchored
with a documented number.

### Phase 3 — D1 distance-priced fetch (headless prototype)

Price fetch labour by road-graph hops beyond a free radius, surfaced as "distribution: N workers" (or a
workforce share). Measure on the same five lines; the known hazard is that they run at workforce
saturation (15/15, 24/24), so any labour tax re-anchors them. **Kill criterion:** an unbounded tax causes
a sprawl death-spiral on the age-3 line (a district too far to feed); the radius/floor must be calibrated
like Step050's.

*Acceptance:* the player can see the cost, improving roads/warehouse placement measurably reduces it, and
no line collapses into a famine it cannot diagnose.

### Phase 4 — decide D2 and S1 (owner decisions, not agent decisions)

D2 only if per-household shortage is a product goal after Phase 2/3 (it is the KR fiction); S1 only if
food variety is the intended long game. Do not do both at once: D2 changes the state model, S1 changes the
content model, and each needs its own witness set.

### Explicitly not recommended

- **D3** couriers (cost/benefit at pop 16–24), **D4** market (owner-rejected), **D6** house production
  (adds a faucet to a leak), **S7** compost (recovers part of the loss, weakening the decision), **S6**
  export inside the MVP (reopens the Step065 question in a new costume).
- **S1 now**: the strongest long-term answer, but it invalidates both journeys, the milestones and the
  content before the measurement exists to tell whether it helped.

---

## 14. Predictions and falsification

If the analysis is right, Phase 2 at **3 %/tick** should produce, on a re-anchored `age2` (pop 16, cap
120): six farms at 3/tick plus the Center (19 produced for 16 eaten), equilibrium stock ~100 (6.25 ticks,
below the cap), zero pins, and a `healthy` verdict whose storage line reports ~3/tick of spoilage instead
of "+6 not stored". At 2 %/tick the same colony should still pin at 120 with ~2.4/tick lost — that is the
falsifiable difference between "a rate that matters" and "a rate that decorates" (**C**).

What would falsify the recommendation:

- If, with spoilage, the optimal play is still "build fewer farms" (because the decay cost exceeds the
  growth benefit), then S2 is a tax, not a sink.
- If the equilibrium stock sits at the cap for every playable rate (because production is lumpy), the cap
  is still doing the work and S2 is cosmetic.
- If the governor needs per-household information to keep a colony alive, D2 is not optional and the
  roadmap order is wrong.
- If a spoilage line cannot be made legible in one alert + one forecast row, the mechanic is too complex
  for the UI budget and S10 (cap in ticks) plus S9 (governor) is the better pair.

---

## 15. Decisions requested from the owner

Q1–Q6 were v1's. v2 keeps them, narrows Q5 (answered by Step066) and adds six.

- **Q1.** Is "no market" absolute — no building whose workers hand goods to houses — so household delivery
  must be done by the residents themselves (D2) or by a non-market carrier role (D3/D5)?
- **Q2.** Should distance bite on labour (D1/D5) or on the household's stock (D2), or both?
- **Q3.** Accept a save migration (`SAVE_VERSION` 18 → 19) for per-household stock, or is state-free
  aggregate the constraint?
- **Q4.** Which surplus sink is intended: spoilage (S2), variety (S1), preservation (S5), a higher growth
  ceiling (S4), or a combination?
- **Q5.** *(answered)* The storage alert is `info` since Step066; no decision needed.
- **Q6.** Do policies/rations (design rule 8) belong to the MVP, or to Age 2+ content?
- **Q7.** Should capacity be expressed in ticks of consumption (S10) instead of the Step031 constants?
  This is the cheapest fix to the shrinking buffer and it changes every number in the scenarios.
- **Q8.** May the bountiful-harvest event be re-specified so its windfall is not eaten by the clamp (e.g.
  a temporary capacity bonus, a one-off feast, or a harvest that raises the cap)? Today it is C-wasted.
- **Q9.** Should the loss ledger be persisted in the save (a "this city destroyed X food" history, which
  design rule §20 likes) or only session-derived?
- **Q10.** Is food allowed to become a *policy* resource (eat raw vs process, ration, feast) before the
  need model exists, ATS-style, or is that out of MVP scope?
- **Q11.** Is a district/warehouse-area concept acceptable (D5), or is the map to stay one colony-wide
  pool?
- **Q12.** Should the calibration doctrine move from "exact balance" to "target buffer in ticks"? Any sink
  (S2/S1) requires it; the scenarios and the governor would encode the new doctrine.

---

## 16. Out of scope

- No code, no ADR, no re-anchoring, no constant changes; the plan waits for Q1–Q4/Q7/Q12.
- Money/taxes/commerce balance (covered by the Step065 record, commit `8d89aea`).
- Wood, stone and planks storage (not clamped the same way; separate question).
- Housing quality/satisfaction as a growth input (Step021/Step053 territory).
- Rendering work implied by carriers, districts or household stock.
- Multiplayer/performance beyond the existing `avgUpdateMs < 10` budget.

---

## 17. Sources

Fetched 2026-11-12. Each entry says what it is used for and its limit.

**Economy design**

- Daniel Cook (Lostgarden), *Value chains* — sources/pools/transforms/sinks, "strong sinks" create
  constant demand, big pools "reduce pull", broken/obfuscated chains kill early-step value.
  https://lostgarden.com/2021/12/12/value-chains/ · design essay, not empirical.
- Charlie Czerkawski, *Game Economy Design* (excerpt) — source/sink definitions and the balance mandate.
  https://www.gamedeveloper.com/design/book-excerpt-game-economy-design-metagame-monetization-and-live-operations
- Department of Play, *The Principles of Building A Game Economy* — excess makes a resource "effectively
  worthless" and players stop interacting with the tap.
  https://departmentofplay.net/the-principles-of-building-a-game-economy
- Mark Brown (GMTK), *How Video Games Economies are Designed* — drains "send players back to the tap";
  "feeding citizens" is listed as a drain. https://gmtk.substack.com/p/how-video-games-economies-are-designed
- Josh Bycer, *How to Stop Hoarding in Video Games* — hoarder syndrome, cap/limit remedies, vital resources
  should be easy to reacquire. https://www.gamedeveloper.com/game-platforms/how-to-stop-making-hoarders-in-video-games
- Stephanie Preston, *Your brain evolved to hoard supplies…* — stockpiling as an adaptive response to
  uncertainty. https://daily.jstor.org/your-brain-evolved-hoard-supplies-shame-others-doing-same
- Tynan Sylvester, *The Simulation Dream* — the Player Model principle; unobserved model content "degrades
  into noise". https://tynansylvester.com/2013/06/the-simulation-dream
- Sid Meier, "a game is a series of interesting decisions" — interviews/keynote summaries.
  https://www.thegamer.com/sid-meier-interview/ · https://venturebeat.com/technology/quotes-from-sid-meiers-keynote-gdc-speech

**Case studies**

- Kingdoms Reborn wiki — Market (30 tiles, 3→6 workers, 50 units, "supplies anything a household needs"):
  https://kingdomsreborn.fandom.com/wiki/Market
- Kingdoms Reborn wiki — Buildings (Market, Hauling Services, Storage Depot, Warehouse):
  https://kingdomsreborn.fandom.com/wiki/Buildings
- Kingdoms Reborn wiki — House (luxuries need storage within ~100 tiles, "the closer, the better"):
  https://kingdomsreborn.fandom.com/wiki/House
- Kingdoms Reborn wiki — Storage Yard (off-storage products unusable):
  https://kingdomsreborn.fandom.com/wiki/Storage_Yard
- Kingdoms Reborn Steam — starvation with spread-out storage; markets only work in their circle:
  https://steamcommunity.com/app/1307890/discussions/0/3882723164275588345
- Kingdoms Reborn Steam — market stock not counted in totals; players cap luxury stock at 20:
  https://steamcommunity.com/app/1307890/discussions/0/5733650980533136360
- Banished Info wiki — Market (vendors collect variety from barns/stockpiles, 10 000 weight):
  https://banishedinfo.com/wiki/Market
- Banished Steam guide — walking distance as the dominant efficiency variable:
  https://steamcommunity.com/sharedfiles/filedetails?id=2354760242
- Caesar III Augustus handbook — food (cartload = 100 person-months; granaries only; warehouse food is
  export-only; traders drop several months at each house):
  https://www.caesar3augustus.com/book/farmingindustry/food
- Caesar III Augustus handbook — storage & distribution (granaries, warehouses, market, auto top-up):
  https://www.caesar3augustus.com/book/farmingindustry/storagedistribution
- Pharaoh wiki — Granary (3 200 units, four food types, bazaar range):
  https://impressionsgames.fandom.com/wiki/Granary_(Pharaoh)
- Anno 1800 wiki — Needs (island storage, road connection, island-wide consumption):
  https://anno1800.fandom.com/wiki/Needs
- Anno Union devblog — consumption needs calculated island-wide from storage; pausing a need pauses
  consumption. https://www.anno-union.com/devblog-fulfil-needs-your-way
- Anno 1800 wiki — Warehouse (carts, loading ramps, linked storage):
  https://anno1800.fandom.com/wiki/Warehouse
- The Settlers II guide — roads, carriers, flags, storehouses, transport jams:
  https://settlers2.net/guides/roads
- Rock Paper Shotgun on The Settlers — logistics as the whole design:
  https://www.rockpapershotgun.com/i-was-a-fool-for-skipping-widelands-the-only-game-as-good-as-the-settlers
- Manor Lords planner — stalls stocked by granary/storehouse families, each stall serves limited homes:
  https://manor-planner.com/guides/market-placement
- Manor Lords needs guide — 1 food/family/month, variety by group, spoilage bands, pantry/granary modifiers,
  stalls do not spoil, rolls per stack: https://manorlordsguide.com/town-needs
- Manor Lords official wiki, 0.8.004 patch notes — food decay per type, storage-dependent, weather
  multiplier, difficulty setting: https://wiki.hoodedhorse.com/Manor_Lords/0.8.004_-_Update_3
- Ostriv Steam guide — adults 100 food/year, children 50, market stalls, no preferences:
  https://steamcommunity.com/sharedfiles/filedetails?id=2243217692
- Songs of Syx wiki — Logistics (decay; warehouses halve it; haulers 25 %):
  https://songsofsyx.wiki.gg/wiki/Logistics
- Songs of Syx wiki — Food Stall (distribution room, 100-tile service radius, food preference):
  https://songsofsyx.wiki.gg/wiki/Food_Stall
- Songs of Syx wiki — Rations (preserved food, 10 % spoil rate): https://songsofsyx.com/wiki/index.php/Rations
- RimWorld wiki — Food (spoilage above 0 °C, slower below 10 °C, frozen stops; meals spoil in 4 days):
  https://www.rimworldwiki.com/wiki/Food
- RimWorld wiki — Stockpile zone (filters, priorities, hauling):
  https://rimworldwiki.com/wiki/Stockpile_zone
- Against the Storm wiki — Resources (eat from Storage at hearth breaks, stacking Hunger):
  https://wiki.hoodedhorse.com/Against_the_Storm/Resources
- Against the Storm — Rationing update (Consumption Control, resolve penalties for denied needs):
  https://eremitegames.com/rationing-update
- Timberborn wiki — Districts (per-district stock, crossings, haulers):
  https://timberborn.wiki.gg/wiki/Districts
- Timberborn wiki — District Crossing (30 slots/good, import/export, retention):
  https://timberborn.wiki.gg/wiki/District_Crossing
- Timberborn wiki — Hauling Post (double capacity, frees producers):
  https://timberborn.wiki.gg/wiki/Hauling_Post

**Repository evidence**

`src/domain/{production,population,storage,logistics}`, `src/content/{buildings,techs}.ts`,
`src/domain/events/events.ts`, `src/application/queries/analysis.ts`, `src/domain/simulation/tick.ts`,
`docs/game/{03-DESIGN-RULES,05-SIMULATION,07-PROGRESSION,08-RESOURCES}.md`,
`tools/agent/scenarios/{age2,age3}.jsonl`, `tests/selfplay.governor.ts`, commits `8d89aea` (market removal),
`626410c` (storage legibility, Step066).

---

## Appendix A — measurement recipe

```bash
# expand a scenario into tick/assess pairs, one JSON object per line
# (see §3.2 of v1 for the generator used; the shape is {"cmd":"tick"} / {"cmd":"assess"} pairs)
node tools/agent/run.mjs --json --quiet --script /tmp/idle-probe.jsonl  > /tmp/idle-out.jsonl
node tools/agent/run.mjs --json --quiet --script /tmp/age2-probe.jsonl  > /tmp/age2-out.jsonl
node tools/agent/run.mjs --json --quiet --script /tmp/age3-probe.jsonl  > /tmp/age3-out.jsonl
```

Derived per tick: `pinned = assess.storage.foodPinned`, `lost = max(0, assess.food.balancePerTick) × pinned`
(the clamp destroys exactly the reported balance when the stock is pinned), `bufferTicks = floor(stock /
population)`. The `age2` replay must end at t=780, pop 16/16, money 787, verdict `healthy`; if it does
not, the instrumented run is not the shipped scenario and the numbers are void.

For a *surplus* witness (Phase 1), use the D2 opening and run 400 ticks with no commands; assert the first
pin, the loss rate and the alert.

## Appendix B — constants at a glance

| Constant | Value | Source |
|---|---|---|
| `FOOD_PER_FARM_PER_TICK` | 2 | `production.ts` |
| `FOOD_PER_COLONIST_PER_TICK` | 1 | `production.ts` |
| `WATER_PER_WELL_PER_TICK` | 2 (1 during drought) | `production.ts`, `events.ts` |
| `FOOD_PER_COLONY_CENTER_PER_TICK` | 1 | `production.ts` |
| `BASE_FOOD_CAPACITY` | 120 | `storage.ts` (`D2_FOOD × 2`) |
| `FOOD_PER_WAREHOUSE` | 60 | `storage.ts` |
| `BASE_WATER_CAPACITY` / per warehouse | 80 / 40 | `storage.ts` |
| `HARVEST_WINDFALL_FOOD` | 40, one-off | `events.ts` |
| `LOGISTICS_FREE_RADIUS` / decay / floor | 12 hops / 4 %/hop / 60 % | `logistics.ts` |
| D2 opening | pop 10, 60 food, 40 water, 5 farms, 5 wells, 2 workshops, 10 residences | `state.ts` |
| Cap depth | 12 ticks @10, 7.5 @16, 5 @24 | derived |

## Appendix C — glossary

- **Faucet / source**: a mechanic that creates a resource from nothing (farms).
- **Sink / drain**: a mechanic that removes it permanently (eating, spoilage, export).
- **Pool**: a stock (granary).
- **Transform**: a conversion (2 wood → 1 plank; later, grain → flour).
- **Buffer depth**: stock ÷ consumption, in ticks.
- **Attribution**: who receives what, from where, at what cost.
- **Pinned**: stock at its cap, production positive.
- **Clamp**: `clampStorage`'s truncation of a stock at capacity.
- **Exact balance**: production = appetite, the Step065 calibration doctrine.
