/** A function returning pseudo-random numbers in the `[0, 1)` range. */
export type RandomSource = () => number;

/**
 * Seed used when no world seed is provided. Keeps tests and tools reproducible; the app
 * chooses a real seed at its entry point and passes it down.
 */
export const DEFAULT_WORLD_SEED = 1337;

/**
 * Creates a deterministic pseudo-random generator (mulberry32). The same seed always yields
 * the same sequence, which keeps world generation reproducible for saves and tests.
 *
 * Domain and generation code must take a {@link RandomSource} built from a seed instead of
 * calling `Math.random()`.
 *
 * @param seed Any number; it is truncated to an unsigned 32-bit integer.
 */
export function createSeededRandom(seed: number): RandomSource {
  let value = Math.trunc(seed) >>> 0;

  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Derives an independent sub-seed from a world seed and a label (FNV-1a hash), e.g.
 * `deriveSeed(seed, "entities")` or `deriveSeed(seed, "chunk:3:-2")`. Each system draws from
 * its own stream, so adding random calls to one system never changes what another generates.
 *
 * @returns An unsigned 32-bit integer.
 */
export function deriveSeed(seed: number, label: string): number {
  let hash = 0x811c9dc5 ^ (Math.trunc(seed) >>> 0);

  for (let index = 0; index < label.length; index += 1) {
    hash ^= label.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

/**
 * Resolves the world seed at the app's entry point: the `seed` query parameter when it is a
 * valid integer (so a world can be shared or reproduced with `?seed=123`), otherwise a fresh
 * one from `random`. This is the only place where a non-seeded source may be used.
 *
 * @param search A URL query string such as `location.search`.
 * @param random Source for a new seed; the entry point passes `Math.random`.
 */
export function resolveWorldSeed(search: string, random: RandomSource): number {
  const requested = new URLSearchParams(search).get("seed");
  if (requested !== null && /^-?\d+$/.test(requested.trim())) {
    return Number(requested.trim()) >>> 0;
  }
  return Math.floor(random() * 4294967296) >>> 0;
}
