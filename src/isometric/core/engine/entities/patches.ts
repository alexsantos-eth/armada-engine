import type { EntityPatches, IGridObject } from "../../types";
import { createNoiseField, type NoiseField } from "../terrain";

/** Width of a patch's edge, in noise units above its threshold, over which the chance grows from `outside` to whole. */
export const PATCH_EDGE = 0.15;

/** Spawn chance factor (`0`–`1`) of each of `columns` for an entity with `patches`. */
export type PatchChances = (patches: EntityPatches, columns: readonly IGridObject[]) => Float32Array;

/**
 * Factor of `spawnChance` at a noise value `value` of a patch field: whole from `PATCH_EDGE`
 * above `threshold`, growing linearly from `outside` at the threshold, and `outside` below it.
 */
export function getPatchFactor({ threshold, outside = 0 }: EntityPatches, value: number): number {
  const depth = Math.min(1, Math.max(0, (value - threshold) / PATCH_EDGE));
  return outside + (1 - outside) * depth;
}

/**
 * Spawn chance factors of patches from the world seed: each `field` (and `scale`) is a simplex
 * field of its own stream (`deriveSeed(seed, "entity-patches:<field>")`), sampled at absolute
 * positions, so the same column gets the same factor in any chunk. Each field is created once and
 * samples a list of columns once: definitions that share it reuse the values.
 */
export function createPatchChances(seed: number): PatchChances {
  const fields = new Map<string, NoiseField>();
  const values = new Map<string, { readonly columns: readonly IGridObject[]; readonly values: Float64Array }>();
  return (patches, columns) => {
    const key = `${patches.field}@${patches.scale}`;
    let field = fields.get(key);
    if (!field) {
      field = createNoiseField(seed, `entity-patches:${patches.field}`, { scale: patches.scale });
      fields.set(key, field);
    }
    let cached = values.get(key);
    if (cached?.columns !== columns) {
      const sampled = new Float64Array(columns.length);
      for (let index = 0; index < columns.length; index += 1) {
        sampled[index] = field(columns[index].x, columns[index].y);
      }
      cached = { columns, values: sampled };
      values.set(key, cached);
    }
    const factors = new Float32Array(columns.length);
    for (let index = 0; index < columns.length; index += 1) {
      factors[index] = getPatchFactor(patches, cached.values[index]);
    }
    return factors;
  };
}
