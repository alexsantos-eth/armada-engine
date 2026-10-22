import type { SvgColorReplacements } from "../../types";
import type { RandomSource } from "../random";

/**
 * Number of color variations declared by `replacements`: the length of its first list, or
 * `0` when every key maps to a single color.
 */
export function getColorVariationCount(replacements: SvgColorReplacements | undefined): number {
  if (!replacements) return 0;
  return Object.values(replacements)
    .find((color): color is readonly string[] => Array.isArray(color))?.length ?? 0;
}

/**
 * Picks the color variation of one instance. Only consumes `random` when `replacements`
 * declares variation lists, so entities without them never shift a seeded sequence.
 */
export function pickColorVariation(
  replacements: SvgColorReplacements | undefined,
  random: RandomSource,
): number {
  const count = getColorVariationCount(replacements);
  return count === 0 ? 0 : Math.min(count - 1, Math.floor(random() * count));
}
