import { Rectangle, Texture } from "pixi.js";
import { projectBoxesToIsometric } from "../projection";
import { createBlockViews, createSpritePool } from "../render";
import { SCENE_LAYER, type SceneModule, type SceneView } from "../scene";
import { type Box, createVisibleBlocks, DEFAULT_MAX_ELEVATION, DEFAULT_MIN_ELEVATION } from "../terrain";
import { createNoiseField, type NoiseField } from "../terrain";
import type { TerrainMaterial, TerrainTint } from "../../types";
import { createVariantPicker, type VariantPicker, validateTerrainVariants } from "./variants";

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

/** Multiplies an existing elevation tint by a subtle material color. */
export function applyNoiseTint(base: number | undefined, color: number): number {
  const tint = base ?? 0xffffff;
  const red = Math.round((((tint >> 16) & 0xff) * ((color >> 16) & 0xff)) / 255);
  const green = Math.round((((tint >> 8) & 0xff) * ((color >> 8) & 0xff)) / 255);
  const blue = Math.round(((tint & 0xff) * (color & 0xff)) / 255);
  return (red << 16) | (green << 8) | blue;
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
 * animated water of `surface-bands`), if any, instead of its material's own. The top block of a
 * column whose material has `variants` shows the one `createVariantPicker()` picks for it from the
 * world seed (flowers, leaves, in clumps), if any; the blocks under it keep the material's texture.
 *
 * When a material's SVG cannot be loaded, no terrain is drawn; a variant that cannot be loaded is
 * left out. Invalid `variants` (game content) fail the scene's setup.
 */
export function createTerrainView(): SceneModule {
  return {
    id: "terrain",
    async setup({ world, terrain, projection, metrics, columnAt, assets, services }) {
      const materials = Object.keys(terrain) as TerrainMaterial[];
      materials.forEach((material) => {
        const issues = validateTerrainVariants(terrain[material].variants ?? []);
        if (issues.length > 0) throw new Error(`Terrain "${material}": ${issues.join("; ")}`);
      });
      const [loaded, loadedVariants] = await Promise.all([
        Promise.all(materials.map((material) => assets.loadSvg(terrain[material].textureSource))),
        Promise.all(
          materials.map((material) =>
            Promise.all((terrain[material].variants ?? []).map(({ textureSource }) => assets.loadSvg(textureSource))),
          ),
        ),
      ]);
      const textures = new Map<TerrainMaterial, Texture>();
      materials.forEach((material, index) => {
        const texture = loaded[index];
        if (texture) textures.set(material, texture);
      });
      if (textures.size < materials.length) return { destroy: () => {} };
      // The other looks of each material's top blocks, by the index its picker gives (`undefined`
      // where a variant failed to load: that column keeps the material's texture).
      const variants = new Map<
        TerrainMaterial,
        { readonly pick: VariantPicker; readonly looks: (Texture | undefined)[] }
      >();
      const tintFields = new Map<TerrainMaterial, { readonly field: NoiseField; readonly colors: readonly number[] }>();
      materials.forEach((material, index) => {
        const list = terrain[material].variants ?? [];
        if (list.length > 0) {
          const pick = createVariantPicker(list, world.seed, `terrain-variants:${material}`);
          const atlasWidth = Math.max(...list.map(({ frame }) => (frame?.x ?? 0) + (frame?.width ?? 0)));
          const atlasHeight = Math.max(...list.map(({ frame }) => (frame?.y ?? 0) + (frame?.height ?? 0)));
          const looks = loadedVariants[index].map((sheet, frameIndex) => {
            const frame = list[frameIndex].frame;
            return sheet && frame && sheet.frame
              ? new Texture({
                  source: sheet.source,
                  frame: new Rectangle(
                    sheet.frame.x + (frame.x * sheet.frame.width) / atlasWidth,
                    sheet.frame.y + (frame.y * sheet.frame.height) / atlasHeight,
                    (frame.width * sheet.frame.width) / atlasWidth,
                    (frame.height * sheet.frame.height) / atlasHeight,
                  ),
                })
              : sheet;
          });
          variants.set(material, { pick, looks });
        }
        const noiseTints = terrain[material].noiseTints;
        if (noiseTints && noiseTints.colors.length > 0) {
          tintFields.set(material, {
            field: createNoiseField(world.seed, `terrain-tints:${material}`, { scale: noiseTints.scale }),
            colors: noiseTints.colors,
          });
        }
      });
      const tintOf = (box: Box): number | undefined => {
        const base = getTerrainTint(terrain[box.type].tint, box.elevation, DEFAULT_MAX_ELEVATION);
        const variation = tintFields.get(box.type);
        if (!variation) return base;
        const value = variation.field(box.x, box.y);
        const index = Math.min(variation.colors.length - 1, Math.floor(((value + 1) / 2) * variation.colors.length));
        return applyNoiseTint(base, variation.colors[index]);
      };
      /** The texture of `block` when it is the top of its column and its material has variants. */
      const variantOf = ({ type, x, y, elevation }: Box): Texture | undefined => {
        const material = variants.get(type);
        if (!material || elevation !== Math.floor((columnAt.get(x, y) as Box).elevation)) return undefined;
        const index = material.pick(x, y);
        return index < 0 ? undefined : material.looks[index];
      };
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
                variantOf(box.box) ??
                (textures.get(box.box.type) as Texture),
              box,
              metrics,
              tint: tintOf(box.box),
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
