import type {
  BoxMetadata,
  EntityData,
  EntityDefinition,
  EntityInstanceOptions,
  IEntity,
  IGridObject,
  TerrainSurface,
} from "../../types";
import { createSeededRandom, DEFAULT_WORLD_SEED, deriveSeed, type RandomSource } from "../random";
import { classifyColumnSurfaces } from "../terrain";
import { ENTITY_CONFIG } from "./config";
import { pickFormationOffsets, resolveFormation } from "./formation";
import { pickColorVariation } from "./variants";

function matchesSurfaceElevation(
  elevation: number,
  surfaceElevation: EntityDefinition["surfaceElevation"],
): boolean {
  if (surfaceElevation === undefined) return true;
  return typeof surfaceElevation === "number"
    ? elevation === surfaceElevation
    : surfaceElevation.includes(elevation);
}

/** Builds the default id of an entity spawned with its anchor at `(x, y)`. */
export function createEntityId(type: string, x: number, y: number): string {
  return `${type}@${x},${y}`;
}

/** Represents a configured non-terrain entity in the world grid. */
export class Entity implements IEntity {
  public readonly x: number;
  public readonly y: number;

  private data: EntityData;

  /**
   * @param options Instance identity: `id` defaults to {@link createEntityId} for the spawn
   *   anchor and `colorVariant` to `0`. Use {@link Entity.fromData} to restore a saved entity.
   */
  constructor(
    x: number,
    y: number,
    definition: EntityDefinition,
    elevation: number,
    options: EntityInstanceOptions = {},
  ) {
    this.x = x;
    this.y = y;
    this.data = {
      id: options.id ?? createEntityId(definition.id, x, y),
      type: definition.id,
      walkable: false,
      elevation,
      height: definition.height,
      length: definition.length ?? 1,
      ...(definition.lengthAxis ? { lengthAxis: definition.lengthAxis } : {}),
      ...(definition.gap !== undefined && definition.gap > 0 ? { gap: definition.gap } : {}),
      textureSource: definition.textureSource,
      ...(definition.debug ? { debug: true } : {}),
      ...(definition.colorReplacements
        ? {
            colorReplacements: definition.colorReplacements,
            colorVariant: options.colorVariant ?? 0,
          }
        : {}),
      metadata: {},
    };
  }

  /**
   * Restores an entity from data previously returned by {@link Entity.getData} (e.g. from a
   * save), keeping its id, color variation, walkability and metadata.
   */
  static fromData(x: number, y: number, data: EntityData): Entity {
    const entity = new Entity(
      x,
      y,
      { id: data.type, textureSource: data.textureSource, height: data.height, spawnChance: 0, surface: "grass" },
      data.elevation,
    );
    entity.data = { ...data, metadata: { ...data.metadata } };
    return entity;
  }

  get id(): string {
    return this.data.id;
  }

  get type(): string {
    return this.data.type;
  }

  get walkable(): boolean {
    return this.data.walkable;
  }

  get elevation(): number {
    return this.data.elevation;
  }

  get height(): number {
    return this.data.height;
  }

  get length(): number {
    return this.data.length;
  }

  get lengthAxis(): IEntity["lengthAxis"] {
    return this.data.lengthAxis;
  }

  get gap(): IEntity["gap"] {
    return this.data.gap;
  }

  get textureSource(): string {
    return this.data.textureSource;
  }

  get debug(): IEntity["debug"] {
    return this.data.debug;
  }

  get colorReplacements(): IEntity["colorReplacements"] {
    return this.data.colorReplacements;
  }

  get colorVariant(): IEntity["colorVariant"] {
    return this.data.colorVariant;
  }

  get metadata(): BoxMetadata {
    return this.data.metadata;
  }

  getData(): EntityData {
    return {
      ...this.data,
      metadata: { ...this.data.metadata },
    };
  }
}

/** Lookups shared by every placement check of one `createEntitiesFromConfig()` call. */
type PlacementContext = {
  readonly boxesByPosition: ReadonlyMap<string, IGridObject>;
  readonly surfaces: ReadonlyMap<string, TerrainSurface>;
  readonly occupiedPositions: ReadonlySet<string>;
};

/** A validated position for one entity instance. */
type Placement = {
  readonly box: IGridObject;
  readonly footprintKeys: readonly string[];
  readonly elevation: number;
};

const NO_KEYS: ReadonlySet<string> = new Set();

/**
 * Creates configured entities on eligible terrain columns.
 *
 * Each column's surface (grass, water or sand) comes from `classifyColumnSurfaces()`, so
 * grass entities never spawn on sand. `footprintSurfaces` can require a different surface
 * under each block of the footprint (in order from the anchor along `lengthAxis`).
 *
 * Multi-block footprints must be flat: every block shares one elevation, which becomes the
 * entity's. When a footprint mixes water and other surfaces (a pier), its water blocks are
 * exempt from that rule and from `surfaceElevation`; the land blocks carry the entity.
 *
 * Each definition may declare a `gap`: the minimum number of free blocks
 * (including diagonals) that must separate two instances of the same entity.
 *
 * A definition with a `formation` spawns in groups: `spawnChance` is rolled once on a valid
 * anchor column and then every member of the formation map is validated with the same rules.
 * The group spawns only when at least `minMembers` fit; the `gap` applies between groups.
 *
 * Placement is deterministic for a given `random` source: pass one derived from the world
 * seed (`createSeededRandom(deriveSeed(seed, "entities"))`). Without it, a fixed default seed
 * is used; `Math.random()` is never used. `variantRandom` picks each instance's color
 * variation (only for definitions with variation lists) from its own stream, so changing
 * colors never moves entities.
 */
export function createEntitiesFromConfig(
  boxes: IGridObject[],
  definitions: EntityDefinition[] = ENTITY_CONFIG,
  random: RandomSource = createSeededRandom(DEFAULT_WORLD_SEED),
  variantRandom: RandomSource = createSeededRandom(
    deriveSeed(DEFAULT_WORLD_SEED, "entity-color-variants"),
  ),
): Entity[] {
  const entities: Entity[] = [];
  const occupiedPositions = new Set<string>();
  const positionsByType = new Map<string, Set<string>>();
  const context: PlacementContext = {
    boxesByPosition: new Map(boxes.map((box) => [`${box.x}:${box.y}`, box])),
    surfaces: classifyColumnSurfaces(boxes),
    occupiedPositions,
  };

  for (const definition of definitions) {
    const formation = resolveFormation(definition.formation);
    const sameTypePositions = positionsByType.get(definition.id) ?? new Set<string>();
    positionsByType.set(definition.id, sameTypePositions);

    for (const box of boxes) {
      if (!findPlacement(box, definition, context, sameTypePositions, NO_KEYS)) continue;
      if (random() >= definition.spawnChance) continue;

      // The anchor sits at offset (0, 0), so it is always the first member placed.
      const groupKeys = new Set<string>();
      const members: Placement[] = [];
      for (const offset of pickFormationOffsets(formation, random)) {
        const memberBox = context.boxesByPosition.get(`${box.x + offset.x}:${box.y + offset.y}`);
        const placement = memberBox &&
          findPlacement(memberBox, definition, context, sameTypePositions, groupKeys);
        if (!placement) continue;
        placement.footprintKeys.forEach((key) => groupKeys.add(key));
        members.push(placement);
      }
      if (members.length < formation.minMembers) continue;

      groupKeys.forEach((key) => {
        occupiedPositions.add(key);
        sameTypePositions.add(key);
      });
      members.forEach(({ box: member, elevation }) => {
        entities.push(new Entity(member.x, member.y, definition, elevation, {
          colorVariant: pickColorVariation(definition.colorReplacements, variantRandom),
        }));
      });
    }
  }

  return entities;
}

/**
 * Validates one instance of `definition` anchored on `box`: footprint inside the map,
 * surfaces, flat elevation, free cells (including those already taken by the current
 * group) and `gap` with previously placed instances of the same entity.
 */
function findPlacement(
  box: IGridObject,
  definition: EntityDefinition,
  context: PlacementContext,
  sameTypePositions: ReadonlySet<string>,
  groupKeys: ReadonlySet<string>,
): Placement | undefined {
  const footprintKeys = getFootprintKeys(box, definition);
  const footprintBoxes = footprintKeys.map((key) => context.boxesByPosition.get(key));
  if (footprintBoxes.some((footprintBox) => footprintBox === undefined)) return undefined;
  const cells = footprintBoxes as IGridObject[];
  const required = cells.map((_, index) =>
    definition.footprintSurfaces?.[index] ?? definition.surface,
  );
  if (cells.some((cell, index) =>
    context.surfaces.get(`${cell.x}:${cell.y}`) !== required[index],
  )) {
    return undefined;
  }
  // Blocks that carry the entity: all of them, except the water blocks of a footprint
  // that also stands on land (a pier reaching over the water).
  const reachesOverWater = required.includes("water") &&
    required.some((surface) => surface !== "water");
  const grounded = cells.filter((_, index) =>
    !reachesOverWater || required[index] !== "water",
  );
  // The carrying blocks must share one elevation (the sprite is placed at that height,
  // so a step under them would show) and match `surfaceElevation`.
  const elevation = grounded[0].elevation;
  if (grounded.some((cell) =>
    cell.elevation !== elevation ||
    !matchesSurfaceElevation(cell.elevation, definition.surfaceElevation),
  )) return undefined;
  if (footprintKeys.some((key) =>
    context.occupiedPositions.has(key) || groupKeys.has(key),
  )) return undefined;
  if (violatesGap(box, definition, sameTypePositions)) return undefined;

  return { box, footprintKeys, elevation };
}

function getFootprintKeys(box: IGridObject, definition: EntityDefinition): string[] {
  const length = definition.length ?? 1;
  const lengthAxis = definition.lengthAxis ?? "x";

  return Array.from({ length }, (_, index) => {
    const x = lengthAxis === "x" ? box.x + index : box.x;
    const y = lengthAxis === "y" ? box.y + index : box.y;
    return `${x}:${y}`;
  });
}

function violatesGap(
  box: IGridObject,
  definition: EntityDefinition,
  sameTypePositions: ReadonlySet<string>,
): boolean {
  const gap = Math.max(0, Math.floor(definition.gap ?? 0));
  if (gap === 0) return false;

  const length = definition.length ?? 1;
  const isXAxis = (definition.lengthAxis ?? "x") === "x";
  const maxX = box.x + (isXAxis ? length - 1 : 0);
  const maxY = box.y + (isXAxis ? 0 : length - 1);

  for (let x = box.x - gap; x <= maxX + gap; x++) {
    for (let y = box.y - gap; y <= maxY + gap; y++) {
      if (sameTypePositions.has(`${x}:${y}`)) return true;
    }
  }

  return false;
}
