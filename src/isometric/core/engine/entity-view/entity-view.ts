import type { Texture } from "pixi.js";
import type { Entity } from "../entities";
import { projectBoxesToIsometric } from "../projection";
import { createBlockViews, createSvgColorVariant } from "../render";
import { type EntityView, SCENE_LAYER, type SceneModule, type SceneView } from "../scene";
import type { ChunkKey } from "../../types";

/** The colour variation an entity is drawn with. */
const variationOf = (entity: Entity) => entity.colorVariant ?? 0;

/** Key of the texture of an entity: one per (type, colour variation), or its SVG when it has no colours to vary. */
function textureKey(entity: Entity): string {
  return entity.colorReplacements
    ? `${entity.type}:${entity.textureSource}#${variationOf(entity)}`
    : entity.textureSource;
}

/**
 * Scene module of the entities, chunk by chunk: the sprites of the entities of every shown chunk,
 * standing on their columns, cut in strips along multi-tile footprints (`createBlockViews()`). It
 * loads one texture per (entity type, colour variation) the first time a chunk needs it, shared by
 * every instance with that variation in every chunk; types without `colorReplacements` share
 * their SVG. An entity whose texture cannot be loaded is skipped.
 *
 * Provides `entityViews` (the entities of each shown chunk with their views), e.g. for shadows.
 */
export function createEntityView(): SceneModule {
  return {
    id: "entities",
    setup({ projection, metrics, assets }) {
      const textures = new Map<string, Promise<Texture | undefined>>();
      const textureOf = (entity: Entity) => {
        const key = textureKey(entity);
        const known = textures.get(key);
        if (known) return known;
        const loading = createSvgColorVariant(entity.textureSource, entity.colorReplacements, variationOf(entity)).then(
          (source) => assets.loadSvg(source),
        );
        textures.set(key, loading);
        return loading;
      };
      const entityViews = new Map<ChunkKey, readonly EntityView[]>();

      return {
        provides: { entityViews },
        showChunk: async ({ key, entities }) => {
          const loaded = await Promise.all(entities.map(textureOf));
          const own: EntityView[] = [];
          projectBoxesToIsometric(entities, projection).forEach((entity, index) => {
            const texture = loaded[index];
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
            own.push({ entity, views });
          });
          entityViews.set(key, own);
          const views: SceneView[] = own.flatMap(({ views: drawn }) =>
            drawn.map((view) => ({ ...view, layer: SCENE_LAYER.object })),
          );
          return {
            views,
            destroy: () => {
              entityViews.delete(key);
            },
          };
        },
        destroy: () => {},
      };
    },
  };
}
