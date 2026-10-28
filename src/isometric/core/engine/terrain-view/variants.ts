import { createNoiseField } from "../terrain";
import type { TerrainVariant } from "../../types";

/** Size of a clump of variants, in columns: where the plants grow together. */
export const VARIANT_PATCH_SCALE = 6;
/** Size of a zone where the clumps are of one kind (a meadow of yellow flowers, a corner of leaves). */
export const VARIANT_KIND_SCALE = 24;
/** Share of the columns inside a clump that show a variant: clumps are dense but not solid. */
export const VARIANT_PATCH_FILL = 0.7;
/** Side, in samples, of the grid the fields are measured on to turn chances into thresholds. */
const CALIBRATION_SIDE = 96;
/** Columns between two calibration samples, so the grid spans many clumps and zones. */
const CALIBRATION_STEP = 5;

/** The problems of a material's `variants` (game content), one message each; none when they can be drawn. */
export function validateTerrainVariants(variants: readonly TerrainVariant[]): string[] {
  const issues: string[] = [];
  let total = 0;
  variants.forEach(({ textureSource, chance }, index) => {
    if (!/^\/.+\.svg$/.test(textureSource)) {
      issues.push(`variants[${index}].textureSource must be an absolute SVG path (got "${textureSource}")`);
    }
    const frame = variants[index].frame;
    if (frame && (!(frame.x >= 0) || !(frame.y >= 0) || !(frame.width > 0) || !(frame.height > 0))) {
      issues.push(`variants[${index}].frame must have non-negative coordinates and positive dimensions`);
    }
    if (!(chance >= 0 && chance <= 1))
      issues.push(`variants[${index}].chance must be in [0, 1] (got ${String(chance)})`);
    total += chance;
  });
  if (total > 1 + 1e-9) issues.push(`the chances of the variants add up to more than 1 (got ${String(total)})`);
  return issues;
}

/**
 * A number in `[0, 1)` for column `(x, y)` of the world of `seed`: the same column always gets the
 * same number, whatever the order chunks are shown in, and neighbouring columns get unrelated ones.
 */
export function hashColumn(seed: number, x: number, y: number): number {
  let hash = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  hash = Math.imul(hash ^ x ^ (hash >>> 15), 0xc2b2ae35);
  hash = Math.imul(hash ^ y ^ (hash >>> 13), 0x27d4eb2f);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0x100000000;
}

/** Which variant the top block of column `(x, y)` shows (its index), or `-1` for the material's own. */
export type VariantPicker = (x: number, y: number) => number;

/** The value of `sorted` (ascending) below which `fraction` of it lies. */
function quantile(sorted: readonly number[], fraction: number): number {
  if (fraction <= 0) return -Infinity;
  if (fraction >= 1) return Infinity;
  return sorted[Math.floor(fraction * sorted.length)];
}

/**
 * Picks the variant of each column of the world of `seed` in groups rather than one by one: two
 * noise fields with their own streams (`"<label>:patches"`, `"<label>:kinds"`). Columns where the
 * patch field is high form clumps ({@link VARIANT_PATCH_SCALE}), and {@link VARIANT_PATCH_FILL} of
 * a clump's columns (by {@link hashColumn}) show a variant; the slower kind field
 * ({@link VARIANT_KIND_SCALE}) decides which, so neighbouring clumps are of the same kind. The
 * thresholds are measured once on a fixed grid of the fields, so each variant still covers about its
 * `chance` of the columns. Deterministic, and the same in any chunk order.
 */
export function createVariantPicker(variants: readonly TerrainVariant[], seed: number, label: string): VariantPicker {
  const total = variants.reduce((sum, { chance }) => sum + chance, 0);
  if (total <= 0) return () => -1;
  const patches = createNoiseField(seed, `${label}:patches`, { scale: VARIANT_PATCH_SCALE, detail: 0.35 });
  const kinds = createNoiseField(seed, `${label}:kinds`, { scale: VARIANT_KIND_SCALE });
  const patchSamples: number[] = [];
  const kindSamples: number[] = [];
  for (let i = 0; i < CALIBRATION_SIDE; i += 1) {
    for (let j = 0; j < CALIBRATION_SIDE; j += 1) {
      patchSamples.push(patches(i * CALIBRATION_STEP, j * CALIBRATION_STEP));
      kindSamples.push(kinds(i * CALIBRATION_STEP, j * CALIBRATION_STEP));
    }
  }
  patchSamples.sort((a, b) => a - b);
  kindSamples.sort((a, b) => a - b);
  // Clumps cover `total / FILL` of the columns, so that FILL of them shows `total`.
  const patchAbove = quantile(patchSamples, 1 - total / VARIANT_PATCH_FILL);
  let below = 0;
  const kindBelow = variants.map(({ chance }) => quantile(kindSamples, (below += chance) / total));
  // The last variant that shows at all takes the rest, whatever the rounding of the sums.
  let last = variants.length - 1;
  while (variants[last].chance <= 0) last -= 1;
  kindBelow[last] = Infinity;

  return (x, y) => {
    if (patches(x, y) <= patchAbove || hashColumn(seed, x, y) >= VARIANT_PATCH_FILL) return -1;
    const kind = kinds(x, y);
    return kindBelow.findIndex((limit) => kind < limit);
  };
}
