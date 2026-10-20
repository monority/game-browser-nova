/**
 * UI preferences persistence (Step033): the last selected simulation
 * speed and overlay mode, kept in their own localStorage slot —
 * separate from the colony save and from simulation state.
 *
 * Layering: this module is self-contained on purpose. The canonical
 * speed ids live in `app/ui/kit.ts` and the overlay modes in
 * `renderer/overlay.ts`; duplicating the literal allowlists here keeps
 * the application layer free of UI imports. `tests/preferences.test.ts`
 * pins the lists so drift fails loudly. Unknown values fall back
 * per-field, so a newer/older prefs payload degrades gracefully.
 *
 * All storage access goes through the minimal `PrefsStorage` surface
 * so unit tests inject fakes — no DOM needed. Every function is total:
 * corrupt storage can never throw into the boot path.
 */

const SPEED_IDS = ["pause", "1x", "2x", "4x", "8x"] as const;
export type StoredSpeedId = (typeof SPEED_IDS)[number];

const OVERLAY_IDS = ["none", "staffing", "deposits", "food", "water", "pollution"] as const;
export type StoredOverlayMode = (typeof OVERLAY_IDS)[number];

export interface UiPreferences {
  speedId: StoredSpeedId;
  overlay: StoredOverlayMode;
}

export const DEFAULT_PREFERENCES: UiPreferences = {
  speedId: "1x",
  overlay: "none",
};

/** Own localStorage slot — never the colony save slot. */
export const PREFS_STORAGE_KEY = "nova-prefs";

/** Minimal surface of Web Storage used here (real localStorage satisfies it). */
export interface PrefsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function isSpeedId(value: unknown): value is StoredSpeedId {
  return typeof value === "string" && (SPEED_IDS as readonly string[]).includes(value);
}

function isOverlayMode(value: unknown): value is StoredOverlayMode {
  return typeof value === "string" && (OVERLAY_IDS as readonly string[]).includes(value);
}

/** Validate unknown input, falling back per-field to defaults. */
export function parsePreferences(input: unknown): UiPreferences {
  if (typeof input !== "object" || input === null) return { ...DEFAULT_PREFERENCES };
  const record = input as Record<string, unknown>;
  return {
    speedId: isSpeedId(record.speedId) ? record.speedId : DEFAULT_PREFERENCES.speedId,
    overlay: isOverlayMode(record.overlay) ? record.overlay : DEFAULT_PREFERENCES.overlay,
  };
}

export function serializePreferences(prefs: UiPreferences): string {
  return JSON.stringify({ speedId: prefs.speedId, overlay: prefs.overlay });
}

/** Read prefs; missing/corrupt/unreadable storage yields defaults. */
export function loadPreferences(storage: PrefsStorage): UiPreferences {
  try {
    const raw = storage.getItem(PREFS_STORAGE_KEY);
    if (raw === null) return { ...DEFAULT_PREFERENCES };
    return parsePreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

/** Persist prefs; returns false instead of throwing. */
export function savePreferences(storage: PrefsStorage, prefs: UiPreferences): boolean {
  try {
    storage.setItem(PREFS_STORAGE_KEY, serializePreferences(prefs));
    return true;
  } catch {
    return false;
  }
}

export type ClearSaveResult = "cleared" | "empty" | "failed";

/**
 * Delete one save slot, leaving every other key untouched.
 * Returns whether a slot existed ("cleared"), was already absent
 * ("empty"), or storage failed ("failed").
 */
export function clearSaveSlot(storage: PrefsStorage, key: string): ClearSaveResult {
  try {
    if (storage.getItem(key) === null) return "empty";
    storage.removeItem(key);
    return "cleared";
  } catch {
    return "failed";
  }
}

/** Coerce an untrusted speed id (button/keyboard strings) to a stored value. */
export function coerceSpeedId(id: string): StoredSpeedId {
  return isSpeedId(id) ? id : DEFAULT_PREFERENCES.speedId;
}

/** Coerce an untrusted overlay mode string to a stored value. */
export function coerceOverlayMode(mode: string): StoredOverlayMode {
  return isOverlayMode(mode) ? mode : DEFAULT_PREFERENCES.overlay;
}

/** Test pin: the allowlists above must stay in sync with the UI sources. */
export function storedSpeedIds(): readonly string[] {
  return SPEED_IDS;
}

export function storedOverlayModes(): readonly string[] {
  return OVERLAY_IDS;
}
