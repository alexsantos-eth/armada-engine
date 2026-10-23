import { rgbToTint } from "../render";
import type { SceneModule } from "../scene";
import { getSunState } from "../time";

/**
 * Scene module of the ambient light: tints the world container (a render group, so the tint is
 * applied on the GPU and multiplied with each view's) with the sun's ambient colour of the
 * current tick. It writes the tint when the scene starts and then only on frames where the tick
 * changed. To change the colours of the day, change the sky palette, not the views.
 */
export function createAmbientLight(): SceneModule {
  return {
    id: "ambient-light",
    setup({ root, world }) {
      let tintedTick: number | undefined;
      const update = (tick: number) => {
        if (tick === tintedTick) return;
        root.tint = rgbToTint(getSunState(tick).ambient);
        tintedTick = tick;
      };
      return {
        start: () => update(world.clock.tick),
        update: ({ tick }) => update(tick),
        destroy: () => {},
      };
    },
  };
}
