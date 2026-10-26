import type { Texture } from "pixi.js";
import type { SceneModule } from "../scene";
import { isDeepSurface, validateTerrainBands } from "../waves";
import { type BandAtlas, createBandAtlas } from "./band-atlas";
import type { TerrainBands, TerrainMaterial } from "../../types";

/**
 * Real milliseconds between two redraws of the bands (20 Hz): a band drifts a few hundredths of a
 * tile in that time, and each redraw is one render to texture per material.
 */
export const BAND_REFRESH_MS = 50;

/**
 * Scene module of the light on the terrain: every material whose appearance has `bands` (the
 * water) gets a {@link BandAtlas} of its block, redrawn every {@link BAND_REFRESH_MS} with the bands
 * drifted by the real time elapsed, and provided as the `terrainSurfaces` service, which
 * `terrain-view` draws its blocks with. Animating the shared texture moves every block of the
 * material at once without touching a sprite. Must come before `terrain-view`; without it the
 * blocks keep their still texture. Invalid `bands` (game content) fail the scene's setup.
 */
export function createSurfaceBands(): SceneModule {
  return {
    id: "surface-bands",
    async setup({ app, terrain, metrics, assets, profile }) {
      const materials = (Object.keys(terrain) as TerrainMaterial[]).filter((material) => terrain[material].bands);
      materials.forEach((material) => {
        const issues = validateTerrainBands(terrain[material].bands as TerrainBands);
        if (issues.length > 0) throw new Error(`Terrain "${material}": ${issues.join("; ")}`);
      });
      const blocks = await Promise.all(materials.map((material) => assets.loadSvg(terrain[material].textureSource)));
      const atlases = new Map<TerrainMaterial, { readonly atlas: BandAtlas; readonly bands: TerrainBands }>();
      materials.forEach((material, index) => {
        const block = blocks[index];
        const bands = terrain[material].bands as TerrainBands;
        if (block) atlases.set(material, { atlas: createBandAtlas(app.renderer, block, bands, metrics), bands });
      });
      if (atlases.size === 0) return { destroy: () => {} };

      let timeMs = 0;
      let sinceMs = 0;
      const draw = () => atlases.forEach(({ atlas }) => atlas.draw(timeMs));
      draw();
      return {
        provides: {
          terrainSurfaces: {
            textureAt: (material, x, _y, elevation): Texture | undefined => {
              const animated = atlases.get(material);
              return animated?.atlas.textureAt(x, isDeepSurface(animated.bands, elevation));
            },
          },
        },
        update: ({ elapsedMs }) => {
          timeMs += elapsedMs;
          sinceMs += elapsedMs;
          if (sinceMs < BAND_REFRESH_MS) return;
          sinceMs = 0;
          profile("surface-bands:draw", draw);
        },
        destroy: () => atlases.forEach(({ atlas }) => atlas.destroy()),
      };
    },
  };
}
