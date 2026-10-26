import type { Texture } from "pixi.js";
import { projectBoxesToIsometric } from "../projection";
import { createBlockViews, createSpritePool } from "../render";
import { SCENE_LAYER, type SceneModule, type SceneView } from "../scene";
import { type Box, createVisibleBlocks, DEFAULT_MAX_ELEVATION, DEFAULT_MIN_ELEVATION } from "../terrain";
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
 * Scene module of the terrain, chunk by chunk: one sprite per visible block, with the texture and
 * the tint of its material (`context.terrain`, game content). Every column is filled down to
 * `DEFAULT_MIN_ELEVATION`, and blocks fully covered by others are never created
 * (`createVisibleBlocks()`): from the fixed camera only the shell of the terrain shows. A block
 * whose material has a `topInset` covers nothing behind it. The blocks along a
 * chunk's `−x`/`−y` edges are covered by the neighbour chunk's columns (`context.columnAt`), so
 * chunks meet as if the terrain were one. Tints by height count from `DEFAULT_MAX_ELEVATION`, the
 * same in every chunk. A block takes the texture the `terrainSurfaces` service gives it (the
 * animated water of `surface-bands`), if any, instead of its material's own.
 *
 * When a material's SVG cannot be loaded, no terrain is drawn.
 */
export function createTerrainView(): SceneModule {
  return {
    id: "terrain",
    async setup({ terrain, projection, metrics, columnAt, assets, services }) {
      const materials = Object.keys(terrain) as TerrainMaterial[];
      const loaded = await Promise.all(materials.map((material) => assets.loadSvg(terrain[material].textureSource)));
      const textures = new Map<TerrainMaterial, Texture>();
      materials.forEach((material, index) => {
        const texture = loaded[index];
        if (texture) textures.set(material, texture);
      });
      if (textures.size < materials.length) return { destroy: () => {} };
      // A hidden chunk's blocks are given back for the next chunk shown (#94).
      const sprites = createSpritePool();
      // Textures that replace a material's own (the animated water), when a module provides them.
      const surfaces = services.get("terrainSurfaces");

      return {
        showChunk: ({ rect, columns }) => {
          // The neighbours' columns on the `−x` and `−y` edges, which cover the chunk's blocks there.
          const edge: Box[] = [];
          for (let x = rect.minX - 1; x <= rect.maxX; x += 1) {
            const column = columnAt.get(x, rect.minY - 1);
            if (column) edge.push(column);
          }
          for (let y = rect.minY; y <= rect.maxY; y += 1) {
            const column = columnAt.get(rect.minX - 1, y);
            if (column) edge.push(column);
          }
          // Only the blocks the camera sees are created (#96).
          const visible = createVisibleBlocks(
            columns,
            edge,
            DEFAULT_MIN_ELEVATION,
            (material) => (terrain[material].topInset ?? 0) === 0,
          );
          const views: SceneView[] = projectBoxesToIsometric(visible, projection).flatMap((box) =>
            // Typed once by `createVisibleBlocks()`: water, ground, or the column's surface on top.
            createBlockViews({
              texture:
                surfaces?.textureAt(box.box.type, box.box.x, box.box.y, box.box.elevation) ??
                (textures.get(box.box.type) as Texture),
              box,
              metrics,
              tint: getTerrainTint(terrain[box.box.type].tint, box.box.elevation, DEFAULT_MAX_ELEVATION),
              sprites,
            }).map((view) => ({ ...view, layer: SCENE_LAYER.terrain })),
          );
          return { views, keepsViews: true, destroy: () => sprites.give(views.map(({ view }) => view)) };
        },
        destroy: () => sprites.destroy(),
      };
    },
  };
}
