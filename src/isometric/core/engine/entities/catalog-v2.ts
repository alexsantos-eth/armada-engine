import type { EntityBlueprintV2, EntityCatalogV2, EntityDefinition, EntitySurface } from "../../types";

const SURFACES: readonly EntitySurface[] = ["grass", "water", "sand", "ground", "path"];
const SVG_PATH = /^\/.+\.svg$/;

/** Converts the current TypeScript content once into a starting catalog for Armada Engine 2. */
export function exportEntityCatalogV2(definitions: readonly EntityDefinition[]): EntityCatalogV2 {
  return {
    schemaVersion: 1,
    entities: definitions.map((definition): EntityBlueprintV2 => {
      const length = definition.length ?? 1;
      const collision = definition.collision ?? 1;
      return {
        id: definition.id,
        asset: {
          sprite: definition.textureSource,
          ...(definition.reflectionSource === undefined ? {} : { reflection: definition.reflectionSource }),
          ...(definition.colorReplacements === undefined ? {} : { colorReplacements: definition.colorReplacements }),
          ...(definition.sway === undefined ? {} : { sway: definition.sway }),
          ...(definition.contactShadow === undefined ? {} : { contactShadow: definition.contactShadow }),
        },
        shape: {
          height: definition.height,
          length,
          axis: definition.lengthAxis ?? "x",
          collision: Array.from({ length }, (_, index) =>
            typeof collision === "number" ? collision : (collision[index] ?? 1),
          ),
        },
        placement: {
          surfaces: Array.from({ length }, (_, index) => definition.footprintSurfaces?.[index] ?? definition.surface),
        },
      };
    }),
  };
}

/** All configuration errors are reported together so content can be repaired in one pass. */
export class EntityCatalogV2Error extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid version 2 entity catalog:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "EntityCatalogV2Error";
    this.issues = issues;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Validates an external entity catalog before Rust or tools use its data. */
export function validateEntityCatalogV2(value: unknown): EntityCatalogV2 {
  const issues: string[] = [];
  if (!isRecord(value)) throw new EntityCatalogV2Error(["catalog must be an object"]);
  if (value.schemaVersion !== 1) issues.push("schemaVersion must be 1");
  if (!Array.isArray(value.entities)) throw new EntityCatalogV2Error([...issues, "entities must be an array"]);

  const ids = new Set<string>();
  value.entities.forEach((entry: unknown, index) => {
    const label = isRecord(entry) && typeof entry.id === "string" ? entry.id : `entity #${index}`;
    const report = (issue: string) => issues.push(`${label}: ${issue}`);
    if (!isRecord(entry)) {
      report("must be an object");
      return;
    }
    if (typeof entry.id !== "string" || entry.id.trim() === "") report("id must be a nonempty string");
    else if (ids.has(entry.id)) report("id is declared more than once");
    else ids.add(entry.id);

    const asset = entry.asset;
    if (!isRecord(asset) || typeof asset.sprite !== "string" || !SVG_PATH.test(asset.sprite)) {
      report("asset.sprite must be an absolute SVG path");
    }
    if (
      isRecord(asset) &&
      asset.reflection !== undefined &&
      (typeof asset.reflection !== "string" || !SVG_PATH.test(asset.reflection))
    ) {
      report("asset.reflection must be an absolute SVG path");
    }

    const shape = entry.shape;
    if (!isRecord(shape)) {
      report("shape must be an object");
      return;
    }
    if (!Number.isInteger(shape.height) || (shape.height as number) <= 0)
      report("shape.height must be a positive integer");
    if (!Number.isInteger(shape.length) || (shape.length as number) <= 0)
      report("shape.length must be a positive integer");
    if (shape.axis !== "x" && shape.axis !== "y") report("shape.axis must be x or y");
    if (
      !Array.isArray(shape.collision) ||
      shape.collision.length !== shape.length ||
      shape.collision.some(
        (size: unknown) => typeof size !== "number" || !Number.isFinite(size) || size < 0 || size > 1,
      )
    ) {
      report("shape.collision must have one size in [0, 1] per footprint cell");
    }

    const placement = entry.placement;
    if (
      !isRecord(placement) ||
      !Array.isArray(placement.surfaces) ||
      placement.surfaces.length !== shape.length ||
      placement.surfaces.some((surface: unknown) => !SURFACES.includes(surface as EntitySurface))
    ) {
      report("placement.surfaces must have one known surface per footprint cell");
    }
  });

  if (issues.length > 0) throw new EntityCatalogV2Error(issues);
  return value as EntityCatalogV2;
}
