/**
 * Canonical cell key convention: "x,y".
 * Used by terrain, deposits, buildings and roads alike.
 */

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function parseCellKey(key: string): { x: number; y: number } {
  const i = key.indexOf(",");
  if (i < 0) throw new Error(`invalid cell key: ${key}`);
  const x = Number(key.slice(0, i));
  const y = Number(key.slice(i + 1));
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`invalid cell key: ${key}`);
  }
  return { x, y };
}

/** Canonical coordinate order: y asc, x asc. */
export function compareCellCoords(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return a.y - b.y || a.x - b.x;
}

/** Canonical id-tiebroken order: y asc, x asc, id (staffing rank order). */
export function compareCellsWithId(
  a: { x: number; y: number; id: string },
  b: { x: number; y: number; id: string },
): number {
  return compareCellCoords(a, b) || a.id.localeCompare(b.id);
}

/** Canonical iteration order for a cell-keyed record: y asc, x asc. */
export function sortedCellKeys(keys: Iterable<string>): string[] {
  return [...keys].sort((a, b) => compareCellCoords(parseCellKey(a), parseCellKey(b)));
}

export function orthogonalNeighbors(x: number, y: number): Array<{ x: number; y: number }> {
  return [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 },
  ];
}
