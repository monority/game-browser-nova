import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  PREFS_STORAGE_KEY,
  clearSaveSlot,
  loadPreferences,
  parsePreferences,
  savePreferences,
  serializePreferences,
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


describe("serialize/load/save round-trip", () => {
  it("round-trips, defaults on missing/corrupt/throwing storage, and reports save failures", () => {
    const prefs = { speedId: "8x", overlay: "deposits" } as const;
    expect(parsePreferences(JSON.parse(serializePreferences(prefs)))).toEqual(prefs);

    expect(
      loadPreferences(
        fakeStorage({ [PREFS_STORAGE_KEY]: serializePreferences({ speedId: "2x", overlay: "staffing" }) }),
      ),
    ).toEqual({ speedId: "2x", overlay: "staffing" });
    expect(loadPreferences(fakeStorage())).toEqual(DEFAULT_PREFERENCES);
    expect(loadPreferences(fakeStorage({ [PREFS_STORAGE_KEY]: "not-json{" }))).toEqual(
      DEFAULT_PREFERENCES,
    );
    expect(loadPreferences(fakeStorage({}, { get: true }))).toEqual(DEFAULT_PREFERENCES);

    const storage = fakeStorage();
    expect(savePreferences(storage, { speedId: "4x", overlay: "staffing" })).toBe(true);
    expect(storage.getItem(PREFS_STORAGE_KEY)).toBe('{"speedId":"4x","overlay":"staffing"}');
    expect(savePreferences(fakeStorage({}, { set: true }), DEFAULT_PREFERENCES)).toBe(false);
  });
});


describe("clearSaveSlot", () => {
  it("deletes only the target slot, reporting cleared/empty/failed without throwing", () => {
    const storage = fakeStorage({
      "nova-save": "{...}",
      [PREFS_STORAGE_KEY]: '{"speedId":"4x","overlay":"none"}',
      "other-game": "x",
    });
    expect(clearSaveSlot(storage, "nova-save")).toBe("cleared");
    expect(storage.keys()).toEqual([PREFS_STORAGE_KEY, "other-game"]);

    expect(clearSaveSlot(fakeStorage(), "nova-save")).toBe("empty");
    expect(clearSaveSlot(fakeStorage({}, { get: true }), "nova-save")).toBe("failed");
    expect(clearSaveSlot(fakeStorage({ "nova-save": "x" }, { remove: true }), "nova-save")).toBe(
      "failed",
    );
  });
});
