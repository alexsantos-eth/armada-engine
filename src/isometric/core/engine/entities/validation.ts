import type { EntityDefinition, TerrainSurface } from "../../types";
import { parseFormationMap } from "./formation";

const SURFACES: readonly TerrainSurface[] = ["grass", "water", "sand", "ground", "path"];
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
  if (definition.settlementLot) {
    const { regionSize, offset } = definition.settlementLot;
    if (!isPositiveInteger(regionSize))
      report(`settlementLot.regionSize must be a positive integer (got ${regionSize})`);
    if (!Number.isInteger(offset.x) || offset.x < 0 || offset.x >= regionSize) {
      report(`settlementLot.offset.x must be an integer inside the region (got ${offset.x})`);
    }
    if (!Number.isInteger(offset.y) || offset.y < 0 || offset.y >= regionSize) {
      report(`settlementLot.offset.y must be an integer inside the region (got ${offset.y})`);
    }
    const { reservedPathWidth } = definition.settlementLot;
    if (
      reservedPathWidth !== undefined &&
      !(Number.isInteger(reservedPathWidth) && reservedPathWidth > 0 && reservedPathWidth < regionSize)
    ) {
      report(
        `settlementLot.reservedPathWidth must be a positive integer smaller than the region (got ${reservedPathWidth})`,
      );
    }
    const { zone } = definition.settlementLot;
    if (zone) {
      if (zone.field.trim() === "") report("settlementLot.zone.field must not be empty");
      if (!(zone.scale > 0 && Number.isFinite(zone.scale)))
        report(`settlementLot.zone.scale must be a positive number (got ${String(zone.scale)})`);
      if (!(zone.below >= -1 && zone.below <= 1)) {
        report(`settlementLot.zone.below must be between -1 and 1 (got ${String(zone.below)})`);
      }
    }
  }

  if (definition.sway) {
    const { cut, amplitude, period } = definition.sway;
    if (length !== 1) report(`sway is for single-tile entities (got length ${length})`);
    if (!(cut > 0 && cut < 1)) report(`sway.cut must be between 0 and 1, both excluded (got ${String(cut)})`);
    if (!(amplitude >= 0 && Number.isFinite(amplitude))) {
      report(`sway.amplitude must be a non-negative number (got ${String(amplitude)})`);
    }
    if (!(period > 0 && Number.isFinite(period))) {
      report(`sway.period must be a positive number (got ${String(period)})`);
    }
  }

  if (definition.reflectionSource !== undefined) {
    if (length === 1) report("reflectionSource is for entities of several tiles (got length 1)");
    if (!TEXTURE_SOURCE.test(definition.reflectionSource)) {
      report(
        `reflectionSource must be an absolute SVG path such as "/assets/<name>/block_reflection.svg" (got "${definition.reflectionSource}")`,
      );
    }
  }

  if (definition.collision !== undefined) {
    const sizes = typeof definition.collision === "number" ? [definition.collision] : definition.collision;
    if (sizes.length > length) report(`collision lists ${sizes.length} sizes for a footprint of ${length} blocks`);
    sizes.forEach((size, index) => {
      const at = typeof definition.collision === "number" ? "collision" : `collision[${index}]`;
      if (!(size >= 0 && size <= 1)) report(`${at} must be between 0 and 1 (got ${String(size)})`);
    });
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

  if (definition.patches) {
    const { field, scale, threshold, outside } = definition.patches;
    if (field.trim() === "") report("patches.field must not be empty");
    if (!(scale > 0 && Number.isFinite(scale)))
      report(`patches.scale must be a positive number (got ${String(scale)})`);
    if (!(threshold >= -1 && threshold <= 1)) {
      report(`patches.threshold must be between -1 and 1 (got ${String(threshold)})`);
    }
    if (outside !== undefined && !(outside >= 0 && outside <= 1)) {
      report(`patches.outside must be between 0 and 1 (got ${String(outside)})`);
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
 * texture paths, numeric ranges, surfaces, axes, footprints, formations, patches, color replacements,
 * sway and collision.
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
