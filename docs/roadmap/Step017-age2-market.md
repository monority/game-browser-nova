# Step017 — Age 2 Market (Phase 9 first slice)

Baseline: 091f967 (Step016 docs close-out). First Phase 9 system: the MVP
market/basic commerce building, Age 2-gated, converting food surplus into
treasury. Date: 2026-10-12.

## DESIGN

- Market: 50 money + 2 planks, 2-tick construction, no jobs, no housing,
  requiredAge 2. Placement in Age 1 rejected as ageLocked (charges nothing).
- Each operational road-connected Market sells up to 2 surplus food per
  tick at 1 money each. Sales run inside revenue collection, after
  consumption and admission, so markets liquidate leftovers and can never
  starve colonists or suppress admission.
- Player decision: food surplus goes to treasury (growth fuel) versus
  reserve/admission buffer. Net per market at full sales: +2 market income
  against 1 maintenance, paid for in 2 food.
- Stats honesty fix in the same area: commerce now includes tradeRoutes
  tech plus plank throughput (was base-only); revenue/net include expected
  market income; food forecast balance shows the market drain.

## IMPLEMENTATION

- Content: market type + definition (requiredAge 2); requiredAge field.
- Domain: placement ageLocked; connectedMarkets/expectedMarketSales/
  sellMarketSurplus; collectRevenue returns taxes/commerce/market;
  foodProductionPerTick helper (produceFood refactored onto it).
- Application: stats marketPerTick/connectedMarkets, honest commerce;
  food forecast balance nets the market drain (production/consumption
  labels untouched).
- UI: palette gains Market, hidden until Age 2 via setAvailableBuildings;
  stats show a market row; inspection copy added.
- Renderer: market stall silhouette (counter + striped awning + poles).
- Persistence unchanged (SAVE_VERSION 16): markets round-trip as generic
  building records, no migration.

## VALIDATION (executed 2026-10-12)

- npx tsc --noEmit: PASS, no errors.
- npx eslint .: PASS, no findings.
- npx vitest run: PASS, 15 files / 179 tests, 0 failed (10 new market).
- pnpm build: PASS.
- Playwright: PASS, 12/12 scenarios.

Caught during validation: sellMarketSurplus priced money AND collectRevenue
priced it again (double count, +2 ghost money per sale). Fixed to deduct-only
helper with single pricing in collectRevenue; regression covered by the
surplus test asserting exact money/food deltas.

## RESULT

Age 2 opens with a real economic decision layered over the unchanged Age 1
city: surplus food becomes treasury via connected markets. Old cities
continue untouched (no markets, no sales, forecasts identical).

## DEFERRED

Further Age 2 systems/buildings, renewable wood, pollution depth beyond
admission gating, graphs, storage caps.
