# NOVA — Resources, Needs and Economy

## 1. Resource scale

Long-term target: approximately 30–80 resources.

MVP target: approximately 5–10 meaningful resource types/categories, plus money.

The smaller MVP set is intentional. It is better to validate one excellent logistics chain than 40 uninteresting resources.

## 2. Categories

Potential categories:

- Food;
- Water;
- Materials;
- Energy;
- Goods;
- Services;
- Strategic resources;
- Money.

## 3. Resource data model

A resource should conceptually have:

- stable identifier;
- display name;
- category;
- units;
- storage characteristics;
- production sources;
- consumption uses;
- substitution rules where applicable;
- age availability;
- economic properties where applicable.

## 4. Production model

Prefer direct production for common resources.

Use short chains for more advanced resources.

Long chains are justified only when they create an interesting optimization problem.

## 5. Resource continuity

Most resources remain useful through the game.

Technology can provide:

- substitution;
- efficiency improvements;
- new processing;
- new uses;
- alternative sources.

Complete obsolescence should be uncommon.

## 6. Needs

Needs are categories rather than one-resource checklists.

Example:

```text
Food
├─ Cereals
├─ Meat
└─ Fish
```

The population can satisfy Food through a valid combination of available resources.

## 7. Satisfaction

Satisfaction is progressive.

Reference interpretation:

- 90–100: excellent;
- 70–89: normal;
- 50–69: degraded;
- 25–49: serious;
- 0–24: crisis.

Effects should be gradual and coherent.

Potential effects:

- growth speed;
- productivity;
- quality of life;
- housing progression;
- migration/immigration;
- economic activity.

## 8. Population growth

Housing determines capacity.

Quality determines growth rate.

Severe dissatisfaction can produce decline.

## 9. Economy

Public money comes from combinations of:

- taxes;
- commerce;
- trade;
- strategic resources;
- specialization.

Public expenditure can fund:

- infrastructure and civic buildings (construction itself is paid in
  materials, see the MVP decision of 2026-11-20);
- major projects;
- colonist expeditions;
- diplomacy;
- research/programs.

## 10. Market

Long-term market model:

- global abstract market;
- regional prices;
- supply/demand;
- distance/logistics;
- direct BOT trade.

Automatic imports can be enabled where a source exists. Otherwise shortages emerge progressively.

**Status (2026-11-13).** None of this is implemented. A fixed-price Age-2 market
existed and was removed at Step065; nothing replaced it, and no trade or market
model is decided. The section states a long-term direction, not a plan.

## 11. Maintenance

Buildings have ongoing maintenance.

Maintenance should matter but must not become accounting hell.

## 12. Environmental costs

Production can carry pollution/environmental costs.

The economic optimum should not always be the environmental optimum.

This creates meaningful long-term decisions.

## 13. Storage, conservation and loss accounting

**Status 2026-11-13: IMPLEMENTED (Step067).** This section describes the shipped
rule; the measurements and the open questions live in
[`../roadmap/Step067-food-preservation.md`](../roadmap/Step067-food-preservation.md).

Food only. Water does not degrade. There is **no** FIFO, no per-unit age and no
shelf life: the granary is degraded as a whole.

```text
per tick:  loss = stock × 0.03  (+ the fraction carried from the previous tick)
           whole units leave the stock, the fraction is carried
           order: after production, before consumption, before the storage cap
```

- **Proportional, not FIFO.** Freshly harvested food is exposed to the same loss
  as the old stock. Do not describe this as expiry.
- **Fractional carry.** The stock is an integer, so the unremoved fraction is
  kept in the save (`foodSpoilCarry`, save v19, initialised at 0 on migration).
  Without it the 3% rate would silently do nothing below 34 units — a hidden
  threshold.
- **Equilibrium.** A colony with a harvest surplus of `P − C` settles near
  `(P − C) / 0.03`; production must exceed consumption by roughly 3% of the
  reserve the player wants to keep.
- **Reserve, not balance (Step068).** `production = consumption` has a fixed
  point of **zero** here, so an exact-balance colony lives on the starvation
  boundary (one death and one admission per tick, permanently unfed — measured
  on the three shipped journeys). Food sizing therefore targets a reserve in
  ticks of consumption `T`: `production = C(1 + 0.03·T) / 0.97`, with `T = 5`
  in the reference governor (`src/domain/storage/reserve.ts`,
  [`../roadmap/Step068-food-reserve.md`](../roadmap/Step068-food-reserve.md)).
  Farm granularity is coarse (one farm = 32–130 stock units at 3%), so the plan
  reports the autonomy it actually reaches instead of pretending to hit `T`;
  a target that does not fit the granary asks for a warehouse rather than
  destroying the surplus at the cap.
- **Rationing floor (governor only).** The harness rests water/wood/stone
  getters below `food < population × 2` (ticks of consumption, Step068). The
  served ration (`consumeFood`), the alert (`analysis.ts`), mortaliy
  (`updatePopulation`) and deactivation stay separate responsibilities — the
  threshold moves a temporary workforce decision, never the starvation rule.
- **Losses are distinct and observable.** Conservation (spoiled) and overflow at
  the cap (wasted) are separate readings, both shown per tick in the stats
  panel, and the forecast exposes the real net change. They are not one number,
  and they are not the production deficit (an unfed colonist is a shortage, not
  a storage loss).
- **3% is experimental.** It is the first rate measured to stop a +3/tick colony
  from pinning at its cap, not a settled balance constant. Its doctrine
  dependency is resolved (Step068: 7/7 guardrails and the three journeys green
  with the reserve law), the value itself still is not tuned.
