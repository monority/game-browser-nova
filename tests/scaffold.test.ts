import { describe, expect, it } from "vitest";
import { NOVA_VERSION } from "../src/index.js";

describe("scaffold", () => {
  it("exposes the library barrel", () => {
    expect(NOVA_VERSION).toBe("0.1.0");
  });
});
