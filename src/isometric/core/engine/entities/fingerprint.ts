import type { EntityDefinition } from "../../types";
import { deriveSeed } from "../random";

/**
 * Fingerprint of a list of entity definitions: a hash (FNV-1a) of their JSON, as eight hex
 * digits. A world snapshot stores the one it was generated with (`contentFingerprint`), so
 * restoring it knows whether the untouched chunks will come out as they were.
 *
 * Any change to a definition changes it, and so does their order (the first definition that
 * claims a column keeps it). Fields left `undefined` do not count. Reordering the keys of a
 * definition also changes it: harmless, since the world is only regenerated with the same result.
 */
export function fingerprintEntityDefinitions(definitions: readonly EntityDefinition[]): string {
  return deriveSeed(0, JSON.stringify(definitions)).toString(16).padStart(8, "0");
}
