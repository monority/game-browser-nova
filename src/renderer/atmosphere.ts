/**
 * Age atmosphere (Step041): the renderer's visual chapter per age —
 * docs/game/07-PROGRESSION.md "an age is visibly a chapter".
 * Pure mapping, unit-tested; the renderer applies it per tick.
 *
 *   Age 1 (Founding)   — cold night blues
 *   Age 2 (Expansion)  — warm ember browns (Step016 identity, unchanged)
 *   Age 3 (Prosperity) — radiant gold: brighter, clearer, luminous
 *
 * Unknown future ages keep the highest defined palette (>= 3).
 */

export interface AgeAtmosphere {
  fog: number;
  background: number;
  directional: number;
  /** Road plate color (Step043: roads join the age chapter). */
  road: number;
  /** Raised lane stripe color — brighter than the plate for hierarchy. */
  roadLane: number;
}

const AGE_ATMOSPHERES: Record<number, AgeAtmosphere> = {
  1: {
    fog: 0x0b0e14,
    background: 0x0b0e14,
    directional: 0xfff2df,
    road: 0x4a5462,
    roadLane: 0x6e7a8a,
  },
  2: {
    fog: 0x181109,
    background: 0x151009,
    directional: 0xffdfb0,
    road: 0x5c4c3c,
    roadLane: 0x8a7458,
  },
  3: {
    fog: 0x1e1708,
    background: 0x1a1408,
    directional: 0xffe9b4,
    road: 0x6b5a34,
    roadLane: 0x9a8448,
  },
};

/** Highest age with a defined visual chapter. */
export const MAX_DEFINED_AGE = Math.max(...Object.keys(AGE_ATMOSPHERES).map(Number));

/** Atmosphere palette for an age; unknown ages clamp to the newest chapter. */
export function ageAtmosphere(age: number): AgeAtmosphere {
  const key = Math.min(Math.max(1, Math.floor(age)), MAX_DEFINED_AGE);
  return AGE_ATMOSPHERES[key]!;
}
