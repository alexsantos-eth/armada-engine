import type { Texture } from "pixi.js";
import { projectBoxesToIsometric } from "../projection";
import { createBlockViews } from "../render";
import { SCENE_LAYER, type SceneModule, type SceneView } from "../scene";
import { DEFAULT_MIN_ELEVATION, fillElevations, removeHiddenBlocks } from "../terrain";
import type { TerrainMaterial, TerrainTint } from "../../types";

/** Darkest a tinted block gets: the factor of its colour never goes under it. */
const MIN_TINT_FACTOR = 0.35;

function darken(tint: number, levels: number, step: number): number {
  const factor = Math.max(MIN_TINT_FACTOR, 1 - levels * step);
  const red = Math.round(((tint >> 16) & 0xff) * factor);
  const green = Math.round(((tint >> 8) & 0xff) * factor);
  const blue = Math.round((tint & 0xff) * factor);
  return (red << 16) | (green << 8) | blue;
}

/**
 * Tint of a block at `elevation` by its material's `tint` rule (see `TerrainTint`), in a world
 * whose highest elevation is `maxElevation`; `undefined` leaves the texture untinted.
 */
export function getTerrainTint(tint: TerrainTint, elevation: number, maxElevation: number): number | undefined {
  if (tint.kind === "depth") return darken(0xffffff, Math.max(1, Math.abs(elevation)), tint.step);
  if (maxElevation <= 0) return undefined;
  return darken(tint.topTint, Math.max(0, maxElevation - elevation), tint.step);
}

/**
 * Scene module of the terrain: one sprite per visible block, with the texture and the tint of
 * its material (`context.terrain`, game content). Every column is filled down to
 * `DEFAULT_MIN_ELEVATION` (`fillElevations()`), and blocks fully covered by others
 * (`removeHiddenBlocks()`) are never created: from the fixed camera only the shell of the terrain
 * shows. A block whose material has a `topInset` covers nothing behind it.
 *
 * When a material's SVG cannot be loaded, no terrain is drawn.
 */
export function createTerrainView(): SceneModule {
  return {
    id: "terrain",
    async setup({ world, terrain, projection, metrics, assets }) {
      const materials = Object.keys(terrain) as TerrainMaterial[];
      const loaded = await Promise.all(materials.map((material) => assets.loadSvg(terrain[material].textureSource)));
      const textures = new Map<TerrainMaterial, Texture>();
      materials.forEach((material, index) => {
        const texture = loaded[index];
        if (texture) textures.set(material, texture);
      });
      if (textures.size < materials.length) return { destroy: () => {} };

      const filled = fillElevations(world.columns, DEFAULT_MIN_ELEVATION);
      const maxElevation = filled.reduce((maximum, box) => Math.max(maximum, box.elevation), 0);
      const visible = removeHiddenBlocks(filled, (box) => (terrain[box.type].topInset ?? 0) === 0);
      const views: SceneView[] = projectBoxesToIsometric(visible, projection).flatMap((box) =>
        // Typed once by `fillElevations()`: water, ground, or the column's surface on top.
        createBlockViews({
          texture: textures.get(box.box.type) as Texture,
          box,
          metrics,
          tint: getTerrainTint(terrain[box.box.type].tint, box.box.elevation, maxElevation),
        }).map((view) => ({ ...view, layer: SCENE_LAYER.terrain })),
      );
      return { views, destroy: () => {} };
    },
  };
}
