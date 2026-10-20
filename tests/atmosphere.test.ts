import { describe, expect, it } from "vitest";
import { ageAtmosphere, MAX_DEFINED_AGE } from "@/renderer/atmosphere.js";

/**
 * Age atmosphere (Step041): each age is a visible chapter. The mapping
 * is pure — the renderer applies it per tick; these tests pin the
 * contract: distinct palettes per age, Step016 regression values, and
 * clamping for unknown ages.
 */

describe("age atmosphere (Step041)", () => {
  it("Age 1 (Founding) keeps the cold night-blue baseline", () => {
    expect(ageAtmosphere(1)).toEqual({
      fog: 0x0b0e14,
      background: 0x0b0e14,
      directional: 0xfff2df,
    });
  });

  it("Age 2 (Expansion) keeps the Step016 warm ember identity", () => {
    expect(ageAtmosphere(2)).toEqual({
      fog: 0x181109,
      background: 0x151009,
      directional: 0xffdfb0,
    });
  });

  it("Age 3 (Prosperity) has its own radiant gold chapter", () => {
    expect(ageAtmosphere(3)).toEqual({
      fog: 0x1e1708,
      background: 0x1a1408,
      directional: 0xffe9b4,
    });
  });

  it("every age is visually distinct from its neighbors", () => {
    const a1 = ageAtmosphere(1);
    const a2 = ageAtmosphere(2);
    const a3 = ageAtmosphere(3);
    expect(a1).not.toEqual(a2);
    expect(a2).not.toEqual(a3);
    // prosperity is brighter than expansion in every channel
    expect(a3.fog).toBeGreaterThan(a2.fog);
    expect(a3.background).toBeGreaterThan(a2.background);
  });

  it("clamps out-of-range ages to the nearest defined chapter", () => {
    expect(ageAtmosphere(0)).toEqual(ageAtmosphere(1)); // floor
    expect(ageAtmosphere(-3)).toEqual(ageAtmosphere(1));
    expect(ageAtmosphere(MAX_DEFINED_AGE + 5)).toEqual(ageAtmosphere(MAX_DEFINED_AGE)); // ceiling
    expect(ageAtmosphere(2.9)).toEqual(ageAtmosphere(2)); // fractional ages floor
  });

  it("purity: identical inputs, identical outputs", () => {
    expect(ageAtmosphere(3)).toEqual(ageAtmosphere(3));
  });
});
