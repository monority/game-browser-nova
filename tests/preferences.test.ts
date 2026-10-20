import { describe, expect, it } from "vitest";
import { SPEED_SETTINGS } from "@/app/ui/kit.js";
import {
  DEFAULT_PREFERENCES,
  PREFS_STORAGE_KEY,
  clearSaveSlot,
  coerceOverlayMode,
  coerceSpeedId,
  loadPreferences,
  parsePreferences,
  savePreferences,
  serializePreferences,
  storedOverlayModes,
  storedSpeedIds,
  type PrefsStorage,
} from "@/application/persistence/preferences.js";

/** In-memory stand-in for localStorage (vitest runs in node, no DOM). */
function fakeStorage(
  initial: Record<string, string> = {},
  failing?: { get?: boolean; set?: boolean; remove?: boolean },
): PrefsStorage & { keys(): string[] } {
  const data = { ...initial };
  const fail = (op: "get" | "set" | "remove"): void => {
    if (failing?.[op]) throw new Error(`storage ${op} failed`);
  };
  return {
    getItem: (key: string): string | null => {
      fail("get");
      return key in data ? data[key]! : null;
    },
    setItem: (key: string, value: string): void => {
      fail("set");
      data[key] = value;
    },
    removeItem: (key: string): void => {
      fail("remove");
      delete data[key];
    },
    keys: (): string[] => Object.keys(data),
  };
}

describe("parsePreferences", () => {
  it("accepts a full valid payload", () => {
    expect(parsePreferences({ speedId: "4x", overlay: "staffing" })).toEqual({
      speedId: "4x",
      overlay: "staffing",
    });
  });

  it("falls back per-field on missing values", () => {
    expect(parsePreferences({ speedId: "4x" })).toEqual({
      speedId: "4x",
      overlay: "none",
    });
    expect(parsePreferences({ overlay: "deposits" })).toEqual({
      speedId: "1x",
      overlay: "deposits",
    });
    expect(parsePreferences({})).toEqual(DEFAULT_PREFERENCES);
  });

  it("falls back per-field on wrong types", () => {
    expect(parsePreferences({ speedId: 4, overlay: ["staffing"] })).toEqual(
      DEFAULT_PREFERENCES,
    );
  });

  it("rejects unknown ids but keeps valid siblings", () => {
    expect(parsePreferences({ speedId: "16x", overlay: "staffing" })).toEqual({
      speedId: "1x",
      overlay: "staffing",
    });
    expect(parsePreferences({ speedId: "2x", overlay: "satellite" })).toEqual({
      speedId: "2x",
      overlay: "none",
    });
  });

  it("rejects non-objects and ignores extra fields", () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences("{\"speedId\":\"4x\"}")).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences(42)).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences({ speedId: "4x", overlay: "none", volume: 11 })).toEqual({
      speedId: "4x",
      overlay: "none",
    });
  });

  it("stays in sync with the UI sources", () => {
    for (const setting of SPEED_SETTINGS) {
      expect(storedSpeedIds()).toContain(setting.id);
    }
    expect(storedOverlayModes()).toEqual(["none", "staffing", "deposits", "food", "water", "pollution"]);
  });
});

describe("serialize/load/save round-trip", () => {
  it("round-trips through JSON", () => {
    const prefs = { speedId: "8x", overlay: "deposits" } as const;
    expect(parsePreferences(JSON.parse(serializePreferences(prefs)))).toEqual(prefs);
  });

  it("loads stored prefs, defaults when missing", () => {
    const storage = fakeStorage({
      [PREFS_STORAGE_KEY]: serializePreferences({ speedId: "2x", overlay: "staffing" }),
    });
    expect(loadPreferences(storage)).toEqual({ speedId: "2x", overlay: "staffing" });
    expect(loadPreferences(fakeStorage())).toEqual(DEFAULT_PREFERENCES);
  });

  it("defaults on corrupt JSON and on throwing storage", () => {
    expect(loadPreferences(fakeStorage({ [PREFS_STORAGE_KEY]: "not-json{" }))).toEqual(
      DEFAULT_PREFERENCES,
    );
    expect(loadPreferences(fakeStorage({}, { get: true }))).toEqual(DEFAULT_PREFERENCES);
  });

  it("saves exact JSON, reports failure instead of throwing", () => {
    const storage = fakeStorage();
    expect(savePreferences(storage, { speedId: "4x", overlay: "staffing" })).toBe(true);
    expect(storage.getItem(PREFS_STORAGE_KEY)).toBe(
      '{"speedId":"4x","overlay":"staffing"}',
    );
    expect(savePreferences(fakeStorage({}, { set: true }), DEFAULT_PREFERENCES)).toBe(false);
  });
});

describe("coerce helpers", () => {
  it("passes valid ids, falls back on anything else", () => {
    expect(coerceSpeedId("8x")).toBe("8x");
    expect(coerceSpeedId("pause")).toBe("pause");
    expect(coerceSpeedId("16x")).toBe("1x");
    expect(coerceSpeedId("")).toBe("1x");
    expect(coerceOverlayMode("deposits")).toBe("deposits");
    expect(coerceOverlayMode("food")).toBe("food");
    expect(coerceOverlayMode("satellite")).toBe("none");
  });
});

describe("clearSaveSlot", () => {
  it("deletes only the target slot and reports cleared", () => {
    const storage = fakeStorage({
      "nova-save": "{...}",
      [PREFS_STORAGE_KEY]: '{"speedId":"4x","overlay":"none"}',
      "other-game": "x",
    });
    expect(clearSaveSlot(storage, "nova-save")).toBe("cleared");
    expect(storage.keys()).toEqual([PREFS_STORAGE_KEY, "other-game"]);
  });

  it("reports empty when the slot is absent", () => {
    expect(clearSaveSlot(fakeStorage(), "nova-save")).toBe("empty");
  });

  it("reports failed on throwing storage without throwing", () => {
    expect(clearSaveSlot(fakeStorage({}, { get: true }), "nova-save")).toBe("failed");
    expect(clearSaveSlot(fakeStorage({ "nova-save": "x" }, { remove: true }), "nova-save")).toBe(
      "failed",
    );
  });
});
