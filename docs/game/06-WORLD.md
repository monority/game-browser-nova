# NOVA — World Specification

## 1. World model

NOVA takes place on a large procedural planet.

The conceptual hierarchy is:

```text
Planet
  ↓
Sectors
  ↓
Regions
  ↓
Metropolis
  ↓
Districts / Buildings
```

The detailed metropolis is the main simulation object.

## 2. Scale

The long-term world can contain 1,000+ sectors if performance permits.

This does not mean 1,000 full city simulations.

The simulation uses levels of detail.

## 3. World levels of detail

### Detailed

The active player metropolis.

### Regional

Nearby sectors relevant to resources, trade, expansion or diplomacy.

### Aggregate

Distant sectors represented through statistics and state variables.

### Overview

Planet-level presentation.

## 4. Sector state

A sector can expose:

- biome;
- terrain type;
- natural resources;
- population;
- development;
- community;
- outpost;
- BOT city;
- strategic value;
- diplomatic relation;
- expansion potential;
- notable events.

## 5. Procedural generation

World generation must be deterministic.

Same seed and generation parameters produce the same world.

Generation is controlled rather than chaotic.

Potential parameters:

- biome distribution;
- terrain frequency;
- resource distribution;
- population distribution;
- development level;
- community density;
- starting-region candidates.

## 6. Starting regions

The player should choose among roughly 4–6 generated starting regions.

Each presents understandable trade-offs.

Examples:

- fertile region;
- coastal region;
- mineral-rich region;
- temperate balanced region;
- difficult frontier.

The player should make a strategic choice without configuring a simulation spreadsheet.

## 7. Metropolis

The main city is a continuous detailed environment.

The long-term target is a large city-building space closer in scale to a modern large-map city builder than a tiny classical city map.

The MVP deliberately uses a smaller map/data scale while preserving the architecture for expansion.

## 8. World inhabitants

The long-term world can contain:

- neutral communities;
- BOT civilizations;
- outposts;
- colonies;
- trade partners.

These are aggregate entities unless detailed simulation becomes gameplay-relevant.

## 9. External demand

The wider world eventually creates demand for:

- resources;
- manufactured goods;
- strategic products;
- services.

This is intentionally post-MVP.

## 10. World interaction

Long-term interactions include:

- trade;
- diplomacy;
- resource access;
- migration;
- influence;
- expansion;
- limited war.

The MVP only needs enough world context to establish that the metropolis exists within a larger civilization/world.
