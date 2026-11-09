import type { ShadowCaster, ShadowReceiver } from "./received-shadow";
import type { Silhouette } from "./silhouette";

/** An entity that casts shadows on others and receives theirs: its silhouettes, where it stands. */
export type ShadowBody = {
  /** Elevation of the ground it stands on. */
  readonly elevation: number;
  readonly silhouettes: readonly Silhouette[];
};

/**
 * Farthest ground distance (tiles) at which a silhouette `height` screen pixels tall, `lift`
 * blocks above a receiver, may still shade it. Grows with both.
 */
export type ShadowReach = (height: number, lift: number) => number;

/** Side (tiles) of the cells `pairShadows()` sorts casters into. */
export const SHADOW_PAIR_CELL = 4;

/**
 * The shadows entities may cast on each other: for every silhouette of each body that
 * `receives`, the silhouettes of the other bodies whose feet stand within `reach` of its foot,
 * with their lift over it; silhouettes no caster reaches are left out. The result is the one
 * comparing every pair gives (receivers in body order, their casters in body and silhouette
 * order), but each caster is first listed in every {@link SHADOW_PAIR_CELL} cell its farthest
 * reach covers among those the receivers stand in, and each receiver only looks at the casters
 * listed in its own cell. A chunk pairs its own entities with those of the chunks around it: the
 * casters far from every receiver are never listed.
 */
export function pairShadows<B extends ShadowBody>(
  bodies: readonly B[],
  receives: (body: B) => boolean,
  reach: ShadowReach,
): ShadowReceiver[] {
  const cellOf = (value: number) => Math.floor(value / SHADOW_PAIR_CELL);
  const receiving = bodies.filter(receives);

  // The cells the receivers stand in: a caster is only listed there.
  let minColumn = Infinity;
  let maxColumn = -Infinity;
  let minRow = Infinity;
  let maxRow = -Infinity;
  receiving.forEach(({ silhouettes }) =>
    silhouettes.forEach(({ worldFoot: { x, y } }) => {
      minColumn = Math.min(minColumn, cellOf(x));
      maxColumn = Math.max(maxColumn, cellOf(x));
      minRow = Math.min(minRow, cellOf(y));
      maxRow = Math.max(maxRow, cellOf(y));
    }),
  );
  if (minColumn > maxColumn) return [];
  const rows = maxRow - minRow + 1;
  const lowest = Math.min(...receiving.map(({ elevation }) => elevation));

  // The casters that may reach each of those cells, column after column, in body and silhouette order.
  type Listed = { readonly body: B; readonly silhouette: Silhouette };
  const cells: Listed[][] = Array.from({ length: (maxColumn - minColumn + 1) * rows }, () => []);
  const cellAt = (x: number, y: number) => cells[(cellOf(x) - minColumn) * rows + cellOf(y) - minRow];
  bodies.forEach((body) =>
    body.silhouettes.forEach((silhouette) => {
      // Farthest it reaches: onto the lowest receiver.
      const farthest = reach(silhouette.display.height, body.elevation - lowest);
      const { x, y } = silhouette.worldFoot;
      const fromRow = Math.max(cellOf(y - farthest), minRow);
      const toRow = Math.min(cellOf(y + farthest), maxRow);
      // One entry, listed in every cell it reaches.
      const entry: Listed = { body, silhouette };
      for (
        let column = Math.max(cellOf(x - farthest), minColumn);
        column <= Math.min(cellOf(x + farthest), maxColumn);
        column += 1
      ) {
        for (let row = fromRow; row <= toRow; row += 1) cells[(column - minColumn) * rows + row - minRow].push(entry);
      }
    }),
  );

  // Plain loops: a chunk pairs thousands of silhouettes, and an array per candidate fed the garbage
  // collector.
  const receivers: ShadowReceiver[] = [];
  receiving.forEach((body) => {
    body.silhouettes.forEach((own) => {
      // Never empty: its own body lists itself there.
      const listed = cellAt(own.worldFoot.x, own.worldFoot.y);
      const casters: ShadowCaster[] = [];
      for (let index = 0; index < listed.length; index += 1) {
        const { body: other, silhouette } = listed[index];
        if (other === body) continue;
        const lift = other.elevation - body.elevation;
        const { worldFoot, display } = silhouette;
        const distance = Math.hypot(own.worldFoot.x - worldFoot.x, own.worldFoot.y - worldFoot.y);
        if (distance <= reach(display.height, lift)) casters.push({ silhouette, lift });
      }
      if (casters.length > 0) receivers.push({ own, casters });
    });
  });
  return receivers;
}
