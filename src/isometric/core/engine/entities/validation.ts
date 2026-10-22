import type { EntityDefinition, TerrainSurface } from "../../types";
import { parseFormationMap } from "./formation";

const SURFACES: readonly TerrainSurface[] = ["grass", "water", "sand"];
const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const TEXTURE_SOURCE = /^\/.+\.svg$/;

/** Thrown by {@link validateEntityDefinitions}; `issues` lists every problem found. */
export class EntityConfigError extends Error {
  /** One readable line per problem, prefixed with the entity id. */
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid entity configuration:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "EntityConfigError";
    this.issues = issues;
  }
}

const isPositiveInteger = (value: number) => Number.isInteger(value) && value > 0;
const isSurface = (value: string): value is TerrainSurface => (SURFACES as readonly string[]).includes(value);

function checkDefinition(definition: EntityDefinition, report: (issue: string) => void): void {
  const length = definition.length ?? 1;

  if (!TEXTURE_SOURCE.test(definition.textureSource)) {
    report(
      `textureSource must be an absolute SVG path such as "/assets/<name>/block.svg" (got "${definition.textureSource}")`,
    );
  }
  if (!isPositiveInteger(definition.height)) {
    report(`height must be a positive integer (got ${String(definition.height)})`);
  }
  if (!isPositiveInteger(length)) report(`length must be a positive integer (got ${String(length)})`);
  if (!(definition.spawnChance >= 0 && definition.spawnChance <= 1)) {
    report(`spawnChance must be between 0 and 1 (got ${String(definition.spawnChance)})`);
  }
  if (!isSurface(definition.surface)) {
    report(`surface must be one of ${SURFACES.join(", ")} (got "${String(definition.surface)}")`);
  }
  if (definition.lengthAxis !== undefined && definition.lengthAxis !== "x" && definition.lengthAxis !== "y") {
    report(`lengthAxis must be "x" or "y" (got "${String(definition.lengthAxis)}")`);
  }
  if (definition.gap !== undefined && !(Number.isInteger(definition.gap) && definition.gap >= 0)) {
    report(`gap must be a non-negative integer (got ${String(definition.gap)})`);
  }

  const footprintSurfaces = definition.footprintSurfaces ?? [];
  if (footprintSurfaces.length > length) {
    report(`footprintSurfaces lists ${footprintSurfaces.length} surfaces for a footprint of ${length} blocks`);
  }
  footprintSurfaces.forEach((surface, index) => {
    if (!isSurface(surface)) {
      report(`footprintSurfaces[${index}] must be one of ${SURFACES.join(", ")} (got "${String(surface)}")`);
    }
  });

  const elevations =
    definition.surfaceElevation === undefined ? [] : ([] as number[]).concat(definition.surfaceElevation);
  elevations
    .filter((elevation) => !Number.isInteger(elevation))
    .forEach((elevation) => {
      report(`surfaceElevation must contain integers (got ${elevation})`);
    });

  if (definition.formation) {
    try {
      const members = parseFormationMap(definition.formation.map).length;
      const { minMembers } = definition.formation;
      if (minMembers !== undefined && !(Number.isInteger(minMembers) && minMembers >= 1 && minMembers <= members)) {
        report(`formation.minMembers must be an integer between 1 and ${members} (got ${minMembers})`);
      }
    } catch (error) {
      report(`formation: ${(error as Error).message}`);
    }
  }

  const variationLengths = new Set<number>();
  Object.entries(definition.colorReplacements ?? {}).forEach(([source, target]) => {
    if (!HEX_COLOR.test(source)) report(`colorReplacements key "${source}" must be a hex color`);
    const targets = typeof target === "string" ? [target] : target;
    if (typeof target !== "string") {
      if (target.length === 0) report(`colorReplacements["${source}"] must not be an empty list`);
      else variationLengths.add(target.length);
    }
    const invalid = targets.filter((color) => !HEX_COLOR.test(color));
    if (invalid.length > 0) {
      report(
        `colorReplacements["${source}"] must be hex colors (got ${invalid.map((color) => `"${color}"`).join(", ")})`,
      );
    }
  });
  if (variationLengths.size > 1) {
    report(`colorReplacements variation lists must all have the same length (got ${[...variationLengths].join(", ")})`);
  }
}

/**
 * Validates entity definitions when content is loaded, so a typo in the data fails early
 * with a clear message instead of silently spawning nothing (or garbage). Checks ids,
 * texture paths, numeric ranges, surfaces, axes, footprints, formations and color
 * replacements.
 *
 * @throws {@link EntityConfigError} listing every issue found.
 */
export function validateEntityDefinitions(definitions: readonly EntityDefinition[]): void {
  const issues: string[] = [];
  const seen = new Set<string>();

  definitions.forEach((definition, index) => {
    const label = definition.id.trim() === "" ? `entity #${index}` : definition.id;
    const report = (issue: string) => issues.push(`${label}: ${issue}`);

    if (definition.id.trim() === "") report("id must not be empty");
    else if (seen.has(definition.id)) report(`id "${definition.id}" is declared more than once`);
    seen.add(definition.id);

    checkDefinition(definition, report);
  });

  if (issues.length > 0) throw new EntityConfigError(issues);
}
