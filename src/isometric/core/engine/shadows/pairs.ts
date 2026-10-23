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
 * reach covers, and each receiver only looks at the casters listed in its own cell.
 */
export function pairShadows<B extends ShadowBody>(
  bodies: readonly B[],
  receives: (body: B) => boolean,
  reach: ShadowReach,
): ShadowReceiver[] {
  const lowest = Math.min(...bodies.map(({ elevation }) => elevation));
  const cellOf = (value: number) => Math.floor(value / SHADOW_PAIR_CELL);

  // The casters that may reach each cell, by cell column and then row, in body and silhouette order.
  type Listed = { readonly body: B; readonly silhouette: Silhouette };
  const cells = new Map<number, Map<number, Listed[]>>();
  bodies.forEach((body) =>
    body.silhouettes.forEach((silhouette) => {
      // Farthest it reaches: onto the lowest body.
      const farthest = reach(silhouette.display.height, body.elevation - lowest);
      const { x, y } = silhouette.worldFoot;
      for (let column = cellOf(x - farthest); column <= cellOf(x + farthest); column += 1) {
        const rows = cells.get(column) ?? new Map<number, Listed[]>();
        cells.set(column, rows);
        for (let row = cellOf(y - farthest); row <= cellOf(y + farthest); row += 1) {
          const listed = rows.get(row) ?? [];
          rows.set(row, listed);
          listed.push({ body, silhouette });
        }
      }
    }),
  );

  return bodies
    .filter(receives)
    .flatMap((body) =>
      body.silhouettes.map((own) => ({
        own,
        // Never empty: its own body lists itself there.
        casters: (cells.get(cellOf(own.worldFoot.x))?.get(cellOf(own.worldFoot.y)) as Listed[]).flatMap(
          ({ body: other, silhouette: { worldFoot, display }, silhouette }): ShadowCaster[] => {
            if (other === body) return [];
            const lift = other.elevation - body.elevation;
            const distance = Math.hypot(own.worldFoot.x - worldFoot.x, own.worldFoot.y - worldFoot.y);
            return distance <= reach(display.height, lift) ? [{ silhouette, lift }] : [];
          },
        ),
      })),
    )
    .filter(({ casters }) => casters.length > 0);
}
