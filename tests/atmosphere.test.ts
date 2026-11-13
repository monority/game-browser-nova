import { describe, expect, it } from "vitest";
import { ageAtmosphere, MAX_DEFINED_AGE } from "@/renderer/atmosphere.js";

/**
 * Age atmosphere (Step041): each age is a visible chapter. The mapping
 * is pure — the renderer applies it per tick; these tests pin the
 * contract: distinct palettes per age, Step016 regression values, per-age
 * road plates (Step043: roads join the chapter, lane brighter than plate),
 * and clamping for unknown ages.
 */

describe("age atmosphere (Step041)", () => {
  it("every age is visually distinct from its neighbors", () => {
    const a1 = ageAtmosphere(1);
    const a2 = ageAtmosphere(2);
    const a3 = ageAtmosphere(3);
    expect(a1).not.toEqual(a2);
    expect(a2).not.toEqual(a3);
    // prosperity is brighter than expansion in every channel
    expect(a3.fog).toBeGreaterThan(a2.fog);
    expect(a3.background).toBeGreaterThan(a2.background);
    expect(a3.road).toBeGreaterThan(a2.road); // roads join the chapter
  });

  it("road lanes stay brighter than their plates in every age (readable network)", () => {
    for (let age = 1; age <= MAX_DEFINED_AGE; age++) {
      const a = ageAtmosphere(age);
      expect(a.roadLane).toBeGreaterThan(a.road);
    }
  });

});
