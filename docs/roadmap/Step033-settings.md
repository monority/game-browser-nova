# Step033 — Settings Screen

Baseline: `6678cbd` (Step032). Implements minimal settings UI +
preferences persistence per authorized scope. No simulation, migration,
or dependency changes.

## 1. What shipped

**`src/application/persistence/preferences.ts` (new)** — self-contained
UI-preferences module: `StoredSpeedId`/`StoredOverlayMode` allowlists,
`parsePreferences` (per-field fallback to defaults on missing/wrong/
unknown values), `serializePreferences`, total storage wrappers
(`loadPreferences`, `savePreferences`, `clearSaveSlot` — never throw).
Own `nova-prefs` slot, separate from the colony save. Allowlist
duplication vs `kit.ts`/`overlay.ts` is deliberate (application layer
stays UI-import-free); `tests/preferences.test.ts` pins the lists.

**Reset saved colony** — `controlsPanel` Reset button with two-step
arming (first click arms + relabels "Confirm reset?", second click
within 8s deletes; expiry is silent). `boot.ts onResetSave` deletes
only the `nova-save` slot via `clearSaveSlot` and reports
cleared/empty/failed on the status line. Active simulation untouched.

**Persist speed + overlay** — `boot.ts` saves `{speedId, overlay}` on
every speed/overlay change (string boundary coerced via
`coerceSpeedId`/`coerceOverlayMode`); at boot, `loadPreferences` +
clicks the real speed/overlay buttons so tested handlers run. Invalid
or missing values fall back to 1x/none. `SAVE_STORAGE_KEY` moved to
`persistence/save.ts` (single source; boot imports it).

## 2. Tests

- `tests/preferences.test.ts` (14 tests): parse fallbacks per-field,
  round-trip, corrupt/throwing storage, exact JSON, coerce, slot
  deletion (target-only, empty, throwing).
- `e2e/settings.spec.ts` (4 tests): reload restores 4x+staffing;
  corrupt prefs fall back to defaults; reset requires confirmation
  (slot intact after one click), clears with status, preserves other
  keys, Load reports empty; reset on empty slot reports empty and
  leaves the running game untouched.

## 3. Validation (all executed 2026-10-16)

- `npx tsc --noEmit`: clean. `npx eslint .`: exit 0 (one unused
  import caught and removed mid-task).
- `npx vitest run`: 20 files / 249 tests green (+14 preferences).
- `npx vite build`: PASS.
- `npx playwright test`: 19/19 green (+4 settings), local Chromium.

## 4. Notes

- Restoring a saved `pause` keeps the game paused; `lastSpeedId`
  starts at 1x so Space-resume never dead-ends (verified by reading
  `input.ts`, not just assumed).
- Overlay restore clicks the real button, so a restored non-none
  overlay shows its honest status message at boot.
- A future overlay mode added to the UI without updating the prefs
  allowlist degrades to "none" on restore — graceful, documented.
