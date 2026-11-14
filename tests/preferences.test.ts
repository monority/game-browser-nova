import { describe, expect, it } from "vitest";
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
  storedSpeedIds,
  type PrefsStorage,
} from "@/application/persistence/preferences.js";
import { SPEED_SETTINGS } from "@/app/ui/kit.js";

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

describe("the trust boundary on stored values", () => {
  it("falls back per field, so one stale value cannot reset the other", () => {
    // a payload written by a newer build: unknown overlay, known speed
    expect(parsePreferences({ speedId: "8x", overlay: "happiness" })).toEqual({
      speedId: "8x",
      overlay: DEFAULT_PREFERENCES.overlay,
    });
    expect(parsePreferences({ speedId: "warp", overlay: "food" })).toEqual({
      speedId: DEFAULT_PREFERENCES.speedId,
      overlay: "food",
    });
  });

  it("coerces an untrusted id instead of storing it", () => {
    // button and keyboard strings reach these without passing through a list
    expect(coerceSpeedId("4x")).toBe("4x");
    expect(coerceSpeedId("16x")).toBe(DEFAULT_PREFERENCES.speedId);
    expect(coerceOverlayMode("logistics")).toBe("logistics");
    expect(coerceOverlayMode("production")).toBe(DEFAULT_PREFERENCES.overlay);
  });

  it("keeps its speed allowlist in step with the UI's speed settings", () => {
    // the literals are duplicated on purpose (no UI import in this layer), so
    // something has to compare them
    expect(storedSpeedIds()).toEqual(SPEED_SETTINGS.map((setting) => setting.id));
  });
});
