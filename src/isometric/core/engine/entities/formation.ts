import type { EntityFormation, GridOffset } from "../../types";

/** Character that marks a member in a formation map. */
const MEMBER = "X";
/** Character that marks an empty cell in a formation map. */
const EMPTY = ".";

/** A formation ready to be placed: its orientations and how many members must fit. */
export type ResolvedFormation = {
  /** Member offsets for each allowed orientation; the anchor `(0, 0)` comes first. */
  readonly rotations: readonly (readonly GridOffset[])[];
  /** Minimum number of members that must fit for the group to spawn. */
  readonly minMembers: number;
};

const SINGLE_ANCHOR: ResolvedFormation = {
  rotations: [[{ x: 0, y: 0 }]],
  minMembers: 1,
};

/**
 * Parses a formation map into member offsets.
 *
 * Rows run along `y` and columns along `x`. Offsets are relative to the first `"X"` in
 * reading order (the anchor), which is always returned first; the rest follow in reading
 * order.
 *
 * @throws When the map has no member or contains a character other than `"X"` or `"."`.
 */
export function parseFormationMap(map: readonly string[]): GridOffset[] {
  const cells: GridOffset[] = [];

  map.forEach((row, y) => {
    Array.from(row).forEach((cell, x) => {
      if (cell === MEMBER) cells.push({ x, y });
      else if (cell !== EMPTY) {
        throw new Error(
          `Invalid formation map character "${cell}" at row ${y}, column ${x}: use "${MEMBER}" or "${EMPTY}".`,
        );
      }
    });
  });

  if (cells.length === 0) {
    throw new Error(`A formation map needs at least one "${MEMBER}".`);
  }

  const [anchor] = cells;
  return cells.map(({ x, y }) => ({ x: x - anchor.x, y: y - anchor.y }));
}

/**
 * Rotates formation offsets around the anchor by quarter turns (`(x, y)` → `(-y, x)` per
 * turn). Any integer is accepted; negative values turn the other way.
 */
export function rotateFormation(
  offsets: readonly GridOffset[],
  quarterTurns: number,
): GridOffset[] {
  const turns = ((quarterTurns % 4) + 4) % 4;

  return offsets.map((offset) => {
    let { x, y } = offset;
    for (let turn = 0; turn < turns; turn++) {
      // `0 - y` avoids producing -0, which would make equal offsets compare unequal.
      [x, y] = [0 - y, x];
    }
    return { x, y };
  });
}

/**
 * Resolves an entity formation into its orientations and member threshold. A missing
 * formation behaves as a single anchor, so ungrouped entities share the same placement path.
 */
export function resolveFormation(formation: EntityFormation | undefined): ResolvedFormation {
  if (formation === undefined) return SINGLE_ANCHOR;

  const offsets = parseFormationMap(formation.map);
  const rotations = formation.rotate
    ? [0, 1, 2, 3].map((turns) => rotateFormation(offsets, turns))
    : [offsets];
  const requested = Math.floor(formation.minMembers ?? offsets.length);

  return {
    rotations,
    minMembers: Math.min(offsets.length, Math.max(1, requested)),
  };
}

/**
 * Picks the orientation used by one group. Only consumes `random` when the formation has
 * more than one orientation.
 */
export function pickFormationOffsets(
  formation: ResolvedFormation,
  random: () => number,
): readonly GridOffset[] {
  const { rotations } = formation;
  if (rotations.length === 1) return rotations[0];

  const index = Math.min(rotations.length - 1, Math.floor(random() * rotations.length));
  return rotations[index];
}
