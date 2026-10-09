# NOVA — UI / UX Specification

## 1. Visual language

The interface should be:

- modern;
- minimalist;
- polished;
- information-dense when needed;
- visually calm by default.

It should not look like a generic futuristic HUD full of permanent panels.

## 2. Information hierarchy

The UI should answer:

1. Is something wrong?
2. What is wrong?
3. Why is it happening?
4. Where is it happening?
5. What can I change?

The final decision belongs to the player.

## 3. Progressive disclosure

Beginner-level view:

```text
Food
Production   1,240/y
Consumption  1,380/y
Balance       -140/y
Stock        2,840
```

Advanced view:

```text
Food
└─ Fish
   └─ Fishery #2
      ├─ Capacity
      ├─ Workforce
      ├─ Inputs
      ├─ Transport
      └─ District
```

## 4. Inspection

Contextual inspection should work on:

- buildings;
- roads;
- resources;
- population;
- districts;
- logistics;
- environment;
- technology.

## 5. Analysis center

A dedicated analysis area should aggregate:

- resources;
- production;
- consumption;
- stocks;
- needs;
- population;
- workforce;
- logistics;
- economy;
- environment;
- technology.

## 6. Overlays

Initial useful overlays:

- food;
- water;
- energy;
- traffic;
- pollution;
- population;
- employment;
- environment.

The system should eventually allow comparing multiple indicators without turning the screen into a permanent dashboard.

## 7. Alerts

Alerts communicate states, not instructions.

Bad:

> Build a farm.

Good:

> Food balance: −140/year. Fish accounts for 82% of the deficit. Transport utilization: 91%.

## 8. Actions

Actions should be explicit and reversible where possible.

Examples:

- place;
- remove;
- upgrade;
- prioritize;
- authorize/limit a policy;
- choose technology;
- advance age when eligible.

## 9. Camera

Long-term target:

```text
Planet → Sector → Region → Metropolis → District → Building
```

Transitions should feel continuous where technically practical.

## 10. Performance-aware UX

Do not require the renderer to draw every world object at maximum detail simply because the camera is technically capable of zooming out.

LOD and aggregate presentation are expected.

## 11. Accessibility

Where practical:

- readable typography;
- clear focus states;
- non-color-only status cues;
- scalable UI;
- understandable warning levels.
