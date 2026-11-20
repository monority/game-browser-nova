import { describe, expect, it } from "vitest";
import { hasRefusalLine, refusalLine } from "@/app/refusals.js";

/**
 * The status bar used to print the domain's own code — "Cannot place:
 * insufficientPlanks" — at the exact moment the player needed the reason
 * (MVP criterion 8). These tests keep the wording table honest: every code the
 * domain can return has a sentence, and no refusal reaches the screen as an
 * identifier again.
 *
 * Sources are read through Vite's `?raw` import rather than `node:fs`: the test
 * tsconfig carries only `vite/client`, and this keeps the scan typed.
 */

const DOMAIN_SOURCES = import.meta.glob("../src/domain/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const APP_SOURCES = import.meta.glob("../src/app/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

describe("refusal wording", () => {
  it("names every refusal code the domain can return", () => {
    const codes = new Set<string>();
    for (const source of Object.values(DOMAIN_SOURCES)) {
      for (const match of source.matchAll(/reason:\s*"([A-Za-z]+)"/g)) {
        if (match[1]) codes.add(match[1]);
      }
    }
    // Guard against the scan silently finding nothing (a moved directory).
    expect(codes.size).toBeGreaterThan(10);
    const unnamed = [...codes].filter((code) => !hasRefusalLine(code)).sort();
    expect(unnamed).toEqual([]);
  });

  it("never interpolates a refusal code straight into a status message", () => {
    const leaks = Object.entries(APP_SOURCES).flatMap(([file, source]) =>
      [...source.matchAll(/\$\{[^}]*\breason\}/g)].map((match) => `${file}: ${match[0]}`),
    );
    expect(leaks).toEqual([]);
  });

  it("writes a sentence fragment, not a camel-case token", () => {
    expect(refusalLine("insufficientPlanks")).toBe("not enough planks");
    expect(refusalLine("milestonesIncomplete")).toBe("this age's milestones are not complete yet");
    for (const code of ["occupied", "outOfBounds", "insufficientMoney", "alreadyResearched"]) {
      expect(refusalLine(code)).not.toMatch(/[A-Z_]/);
    }
  });

  it("keeps an unknown code visible instead of swallowing it", () => {
    expect(refusalLine("somethingNew")).toBe("refused (somethingNew)");
    expect(hasRefusalLine("somethingNew")).toBe(false);
  });
});
