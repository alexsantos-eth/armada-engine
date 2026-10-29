import { Sprite, type Texture } from "pixi.js";
import type { SceneMovingCaster } from "../scene";
import type { Silhouette } from "./silhouette";
import { createMovingSilhouette } from "./silhouette";

/** Current caster snapshot, shared by every receiver pass. */
export type MovingCasterState = {
  readonly shape?: Silhouette;
  readonly elevation: number;
  readonly changed: boolean;
  readonly previous?: Silhouette;
  readonly previousElevation: number;
};
/** Moving casters invalidate common maps; they do not own a second shadow overlay. */
export type MovingCasters = {
  readonly states: readonly MovingCasterState[];
  update(): boolean;
};

/** Caches pose silhouettes, then captures one consistent position for all shadow receivers. */
export function createMovingCasters(
  casters: readonly SceneMovingCaster[],
  hasColumn: (x: number, y: number) => boolean,
): MovingCasters {
  const states = casters.map(() => ({
    shape: undefined as Silhouette | undefined,
    elevation: 0,
    changed: false,
    previous: undefined as Silhouette | undefined,
    previousElevation: 0,
  }));
  const poses = casters.map(() => new WeakMap<Texture, Silhouette>());
  const drawn: (
    | { x: number; y: number; elevation: number; texture?: Texture; width: number; height: number; loaded: boolean }
    | undefined
  )[] = casters.map(() => undefined);
  return {
    states,
    update() {
      let changed = false;
      casters.forEach((caster, index) => {
        const state = states[index];
        state.changed = false;
        state.previous = undefined;
        const { ground, screen } = caster.foot();
        const view = caster.view;
        const texture = view instanceof Sprite ? view.texture : undefined;
        const width = view instanceof Sprite ? view.width : 0;
        const height = view instanceof Sprite ? view.height : 0;
        const loaded = hasColumn(Math.round(ground.x), Math.round(ground.y));
        const before = drawn[index];
        if (
          before &&
          before.x === ground.x &&
          before.y === ground.y &&
          before.elevation === ground.elevation &&
          before.texture === texture &&
          before.width === width &&
          before.height === height &&
          before.loaded === loaded
        )
          return;
        drawn[index] = { ...ground, texture, width, height, loaded };
        state.previous = state.shape;
        state.previousElevation = state.elevation;
        const hadShape = state.shape !== undefined;
        state.shape = undefined;
        state.elevation = ground.elevation;
        if (loaded && view instanceof Sprite) {
          let pose = poses[index].get(view.texture);
          if (!pose || pose.bodyDisplay.width !== width || pose.bodyDisplay.height !== height) {
            pose = createMovingSilhouette(view, { ...screen }, { ...ground });
            poses[index].set(view.texture, pose);
          }
          state.shape = { ...pose, worldFoot: { x: ground.x, y: ground.y } };
        }
        state.changed = hadShape || state.shape !== undefined;
        changed ||= state.changed;
      });
      return changed;
    },
  };
}
