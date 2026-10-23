import type { Texture } from "pixi.js";
import type { Entity } from "../entities";
import { projectBoxesToIsometric } from "../projection";
import { createBlockViews, createSvgColorVariant } from "../render";
import { type EntityView, SCENE_LAYER, type SceneModule, type SceneView } from "../scene";

/**
 * Scene module of the entities: the sprites of every `world.entities`, standing on their columns,
 * cut in strips along multi-tile footprints (`createBlockViews()`). It loads one texture per
 * (entity type, colour variation), shared by every instance with that variation; types without
 * `colorReplacements` share their SVG. An entity whose texture cannot be loaded is skipped.
 *
 * Provides `entityViews` (each entity with its views), e.g. for shadows.
 */
export function createEntityView(): SceneModule {
  return {
    id: "entities",
    async setup({ world, projection, metrics, assets }) {
      const keys = new Map<Entity, string>();
      const variants = new Map<string, { entity: Entity; variation: number }>();
      world.entities.forEach((entity) => {
        const variation = entity.colorVariant ?? 0;
        const key = entity.colorReplacements
          ? `${entity.type}:${entity.textureSource}#${variation}`
          : entity.textureSource;
        keys.set(entity, key);
        if (!variants.has(key)) variants.set(key, { entity, variation });
      });
      const textures = new Map<string, Texture | undefined>(
        await Promise.all(
          [...variants].map(async ([key, { entity, variation }]) => {
            const source = await createSvgColorVariant(entity.textureSource, entity.colorReplacements, variation);
            return [key, await assets.loadSvg(source)] as const;
          }),
        ),
      );

      const entityViews: EntityView[] = [];
      projectBoxesToIsometric(world.entities, projection).forEach((entity) => {
        const texture = textures.get(keys.get(entity.box) as string);
        if (!texture) return;
        const views = createBlockViews({
          texture,
          box: entity,
          metrics,
          height: entity.box.height,
          surfaceAligned: true,
          length: entity.box.length,
          debug: entity.box.debug,
          lengthAxis: entity.box.lengthAxis,
        });
        entityViews.push({ entity, views });
      });
      const views: SceneView[] = entityViews.flatMap(({ views: own }) =>
        own.map((view) => ({ ...view, layer: SCENE_LAYER.object })),
      );
      return { views, provides: { entityViews }, destroy: () => {} };
    },
  };
}
