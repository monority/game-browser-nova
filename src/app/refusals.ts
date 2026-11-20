/**
 * Player-facing wording for a refused command.
 *
 * The domain answers `{ ok: false, reason }` with a stable code — `occupied`,
 * `insufficientPlanks`, `milestonesIncomplete`. That code is machine
 * vocabulary: it is what tests assert and what logs keep. Printing it verbatim
 * in the status bar ("Cannot place: insufficientPlanks") tells the player
 * nothing, and it is the one moment they need the reason most (MVP criterion
 * 8: inspect the cause of a shortage).
 *
 * So the UI owns one table, and every refusal goes through it. The wording is
 * a statement of fact, never an instruction (design rule §7): the game says
 * what is missing, not what to click.
 *
 * A new reason code must be added here: `tests/refusals.test.ts` scans the
 * domain for `reason: "…"` literals and fails when one has no line, so a code
 * cannot reach the player as a raw identifier.
 */
const REFUSAL_LINES: Record<string, string> = {
  // Placement (src/domain/building/placement.ts)
  unknownBuildingType: "that building does not exist",
  outOfBounds: "outside the map",
  blockedCell: "the terrain there cannot be built on",
  occupied: "that cell is already taken",
  depositBlocked: "a deposit occupies that cell",
  colonyCenterExists: "the Colony Center cannot be rebuilt",
  ageLocked: "that building needs a later age",
  insufficientMoney: "not enough money",
  insufficientWater: "not enough water",
  insufficientPlanks: "not enough planks",
  insufficientStone: "not enough stone",
  // Roads
  emptyPath: "the road path is empty",
  unknownRoadCell: "there is no road on that cell",
  // Removal
  unknownBuilding: "there is no such building",
  anchorProtected: "the Colony Center cannot be removed",
  // Technology and progression
  unknownTech: "there is no such technology",
  techNotAvailable: "that technology is not available",
  techRequiresLaterAge: "that technology needs a later age",
  alreadyResearched: "already researched",
  milestonesIncomplete: "this age's milestones are not complete yet",
};

/** True when the code has player-facing wording (used by the coverage test). */
export function hasRefusalLine(code: string): boolean {
  return Object.hasOwn(REFUSAL_LINES, code);
}

/**
 * The sentence for a refusal code. An unknown code keeps its identifier in
 * parentheses rather than being swallowed: the test above should have caught
 * it, and if it ships anyway the player can still report what they saw.
 */
export function refusalLine(code: string): string {
  return REFUSAL_LINES[code] ?? `refused (${code})`;
}
