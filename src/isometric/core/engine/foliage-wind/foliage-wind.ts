import type { Container } from "pixi.js";
import type { EntityView, SceneModule } from "../scene";
import { DEFAULT_WIND_STRENGTH, getSwayOffset, getSwayPhase } from "../wind";
import type { EntitySway } from "../../types";

/**
 * Real milliseconds between two leans of the swaying sprites (~30 Hz): a sway is slow (a lean
 * moves a fraction of a pixel in that time) and every lean re-packs the sprite's vertices.
 */
export const SWAY_REFRESH_MS = 33;

/** A sprite that leans in the wind: the top part of a cut entity sprite. */
type Swaying = {
  readonly sprite: Container;
  readonly sway: EntitySway;
  readonly phase: number;
  /** Height of the part that leans, in world pixels: the lean is a skew about the cut. */
  readonly height: number;
};

/** Options of {@link createFoliageWind}. */
export type FoliageWindOptions = {
  /** Wind strength: `1` sways every entity at its `sway.amplitude`. Defaults to {@link DEFAULT_WIND_STRENGTH}. */
  readonly strength?: number;
};

/**
 * Scene module of the wind on the foliage: every {@link SWAY_REFRESH_MS} it leans the top part of
 * each swaying entity (`sway`, drawn cut in two by `entity-view`: the view marked `stacked`) that the
 * camera shows, about the cut, by `getSwayOffset()` at the real time elapsed, so the trunk stays
 * still and the canopy sways. Only a skew: the sprites stay in their batch and draw order. It reads
 * the entities of the shown chunks from the `entityViews` service (nothing to sway without it) and
 * lists the swaying sprites of each chunk once. Leans are visual only: nothing in the world changes.
 */
export function createFoliageWind(options: FoliageWindOptions = {}): SceneModule {
  const strength = options.strength ?? DEFAULT_WIND_STRENGTH;
  return {
    id: "foliage-wind",
    setup({ services, profile }) {
      const byChunk = services.get("entityViews");
      // The swaying sprites of each chunk's entity views, listed the first time they are seen.
      const swayingOf = new WeakMap<readonly EntityView[], readonly Swaying[]>();
      const listSwaying = (views: readonly EntityView[]) => {
        const listed: Swaying[] = [];
        views.forEach(({ entity, views: drawn }) => {
          const { sway, id } = entity.box;
          if (!sway) return;
          const phase = getSwayPhase(id);
          drawn.forEach(({ view, stacked }) => {
            if (stacked) listed.push({ sprite: view, sway, phase, height: view.height });
          });
        });
        swayingOf.set(views, listed);
        return listed;
      };
      let timeMs = 0;
      let sinceMs = SWAY_REFRESH_MS;
      const lean = () => {
        if (!byChunk) return;
        for (const views of byChunk.values()) {
          for (const { sprite, sway, phase, height } of swayingOf.get(views) ?? listSwaying(views)) {
            if (sprite.culled) continue;
            // A skew of `k` moves the top `height` pixels above the origin by `−sin(k) × height`.
            const offset = getSwayOffset(sway, phase, timeMs, strength);
            const skew = -Math.asin(Math.max(-1, Math.min(1, offset / height)));
            if (sprite.skew.x !== skew) sprite.skew.x = skew;
          }
        }
      };
      return {
        update: ({ elapsedMs }) => {
          timeMs += elapsedMs;
          sinceMs += elapsedMs;
          if (sinceMs < SWAY_REFRESH_MS) return;
          sinceMs = 0;
          profile("foliage-wind:sway", lean);
        },
        destroy: () => {},
      };
    },
  };
}
