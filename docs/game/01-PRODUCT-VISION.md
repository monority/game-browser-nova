# NOVA — Product Vision

## 1. Product identity

NOVA combines the systemic depth of a city-builder with the long-term evolution of a civilization-builder.

The player builds one principal metropolis on a large procedural world. The city changes through ages, while the wider planet supplies resources, communities, competitors and opportunities that become progressively more important.

The game is deliberately not a traditional RTS. The player designs systems and makes strategic decisions; simulation agents execute routine work.

## 2. Emotional target

The desired player reaction after a long session is:

- “I understand why my city works.”
- “I found the bottleneck.”
- “I improved the layout/network and it actually changed the result.”
- “The city now looks and functions better.”
- “If I restarted, I would optimize the early layout differently.”
- “I am proud of what this civilization became.”

The game must produce satisfaction from understanding and optimization, not from administrative burden.

## 3. Player role

The player is the director of a civilization.

The player decides:

- where infrastructure goes;
- what production capacity is developed;
- how logistics are organized;
- what districts emerge;
- which technologies receive priority;
- how the public budget is used;
- how growth is balanced with environmental pressure;
- when to accelerate civilization progression.

The player does not:

- manually assign every citizen;
- manually dispatch every delivery;
- micro-manage individual couriers;
- perform routine repetitive tasks that a competent city system can automate.

## 4. Core loop

```text
BUILD
  ↓
PRODUCE
  ↓
STORE
  ↓
DISTRIBUTE
  ↓
CONSUME
  ↓
OBSERVE / ANALYSE
  ↓
IDENTIFY A BOTTLENECK
  ↓
OPTIMISE
  ↓
GROW
  ↓
REACH A MILESTONE
  ↓
ENTER A NEW AGE
  ↓
NEW SYSTEMS / NEW PROBLEMS
```

The loop is intentionally diagnostic. The player should be able to connect a decision to an observed outcome.

## 5. Logistics philosophy

Canonical flow:

```text
Production → Storage → Road Network → Transport → Consumer
```

Delivery is automated.

Physical proximity is an optimization variable, not a universal hard requirement. A remote producer can still serve the city if the logistics system can support it.

The player's optimization space includes:

- warehouse placement;
- network topology;
- road hierarchy;
- capacity;
- congestion;
- transport technology;
- priorities;
- district specialization.

## 6. Construction philosophy

Placement is free-form and readable.

The game should naturally support districts such as:

- residential;
- industrial;
- commercial;
- administrative;
- research/technology;
- energy;
- logistics;
- green/natural areas.

There is no rigid adjacency puzzle.

Housing should avoid undesirable environmental conditions such as excessive pollution, noise or industrial pressure.

Historic districts can remain useful. A new age must not force the player to demolish the city's history simply to access new technology.

## 7. Population

The population is primarily an aggregate simulation.

The first metropolis starts around 100 inhabitants. Population grows through the ages.

Core concepts:

- housing capacity;
- population;
- workforce;
- unemployment/flexible workforce;
- qualification;
- education;
- health;
- quality of life;
- demographic growth.

Later systems can introduce colonist expeditions. Colonists are not a simple “+500 population” button; they are a strategic source with an understandable world context.

## 8. Needs

Needs are hierarchical categories satisfied by specific resources and services.

Example:

```text
Population
├─ Food
│  ├─ Cereals
│  ├─ Meat
│  └─ Fish
├─ Water
├─ Housing
├─ Goods
│  ├─ Clothing
│  ├─ Tools
│  └─ Furniture
└─ Services
   ├─ Health
   ├─ Education
   └─ Culture
```

A population does not need every resource in a category simultaneously. Multiple resources can satisfy a category.

Satisfaction is progressive rather than binary.

## 9. Resources and production

The complete game can support roughly 30–80 resources, grouped into readable categories.

The MVP deliberately uses a much smaller representative set.

Production chains should usually be direct or short. NOVA is not Factorio or Satisfactory.

Most resources should remain useful across ages through substitution, improved processing, new uses or better efficiency rather than abrupt obsolescence.

## 10. Economy

Three related layers exist:

1. **Physical economy:** resources, production, consumption, stock, transport and workforce.
2. **Market layer:** supply, demand, regional prices, imports and exports.
3. **Public finance:** taxes, trade/resource revenue and public expenditure.

The player has one principal currency and a public budget.

The long-term game can support dynamic regional prices and direct trade with BOT civilizations.

## 11. Environment

Environment is a real gameplay system.

The city must manage:

- pollution;
- environmental quality;
- trees and vegetation;
- green spaces;
- ecosystems;
- natural resources.

Industrial growth creates pressure. Nature preservation and restoration are meaningful parts of city planning.

## 12. Ages and civilization evolution

The complete game targets roughly 8–10 major ages with sub-ages.

The first age is relatively short. Later ages become progressively longer.

Age progression is based on civilization milestones, not generic XP.

Each age should introduce new systems, new problems and a strong visual transformation.

Macro progression is linear, while the player can choose priorities within each age.

## 13. Technology

Major technologies unlock through milestones. Within an age, the player chooses research/development priorities.

Most technologies should remain obtainable eventually. Some choices create durable specialization without making the game irrecoverable.

Technology should alter systems rather than only add flat percentage bonuses.

## 14. World

The planet is large and procedural.

Conceptual hierarchy:

```text
Planet → Sectors → Regions → Metropolis
```

The detailed metropolis is the primary simulation.

Other sectors can contain:

- resources;
- communities;
- outposts;
- small colonies;
- BOT cities;
- trade opportunities;
- strategic value.

The wider world is progressively abstracted for performance.

## 15. External civilizations

The long-term world supports BOT civilizations with:

- production;
- trade;
- diplomacy;
- competition;
- research;
- expansion;
- alliances;
- influence;
- limited automated warfare.

War remains secondary and does not become a tactical RTS layer.

## 16. Events

Events are coherent system events, not arbitrary punishment.

They can affect the economy, environment, production, population or world.

Frequency and intensity are configurable and can be disabled where appropriate.

Events should not casually erase hours of progress.

## 17. Time

The game is slow and contemplative, with:

- Pause;
- 1×;
- 2×;
- 4×;
- 8×.

Acceleration exists to skip periods without decisions, not to hide weak gameplay.

## 18. Game modes

Initial mode: Sandbox.

Later modes:

- Normal;
- Scenarios;
- Challenges.

Multiplayer is not planned.

## 19. Visual identity

NOVA is a stylized 3D futuristic city maquette:

- dark;
- colorful;
- elegant;
- minimalistic;
- slightly dystopian;
- strongly readable.

Visual transformation between ages is a core part of the fantasy.

## 20. Factions — deferred

Playable factions with different bonuses/maluses are a valid future system, but explicitly post-MVP.

The eventual model should change strategic starting conditions rather than create objectively superior civilizations. A faction might specialize in agriculture, industry, commerce, technology, urbanism or expansion while carrying corresponding constraints.

No faction-specific system is required for the MVP.
