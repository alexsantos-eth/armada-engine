import type {
  BoxMetadata,
  EntityData,
  EntityDefinition,
  EntityInstanceOptions,
  EntityLengthAxis,
  IEntity,
  IGridObject,
  ITerrainColumn,
  WorldCoord,
} from "../../types";
import { CellMap, SpatialIndex, type ReadonlyCellMap } from "../grid";
import { createSeededRandom, DEFAULT_WORLD_SEED, deriveSeed, type RandomSource } from "../random";
import { pickFormationOffsets, resolveFormation } from "./formation";
import { pickColorVariation } from "./variants";

function matchesSurfaceElevation(elevation: number, surfaceElevation: EntityDefinition["surfaceElevation"]): boolean {
  if (surfaceElevation === undefined) return true;
  return typeof surfaceElevation === "number" ? elevation === surfaceElevation : surfaceElevation.includes(elevation);
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
      ...(definition.sway ? { sway: definition.sway } : {}),
      ...(definition.collision !== undefined ? { collision: definition.collision } : {}),
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

  get sway(): IEntity["sway"] {
    return this.data.sway;
  }

  get collision(): IEntity["collision"] {
    return this.data.collision;
  }

  collisionAt(x: number, y: number): number {
    const alongX = this.data.lengthAxis !== "y";
    const index = alongX ? x - this.x : y - this.y;
    if ((alongX ? y !== this.y : x !== this.x) || index < 0 || index >= this.data.length) return 0;
    const { collision = 1 } = this.data;
    return typeof collision === "number" ? collision : (collision[index] ?? 1);
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

/**
 * Columns covered by a footprint of `length` blocks anchored at `anchor`, along `lengthAxis`
 * (`"x"` by default), in order from the anchor.
 */
export function getFootprint(anchor: WorldCoord, length = 1, lengthAxis: EntityLengthAxis = "x"): WorldCoord[] {
  // A plain loop: placement asks for a footprint per column and definition, and `Array.from()`
  // with a callback was a third of the time spent generating a chunk.
  const footprint: WorldCoord[] = [];
  for (let index = 0; index < length; index += 1) {
    footprint.push({
      x: lengthAxis === "x" ? anchor.x + index : anchor.x,
      y: lengthAxis === "y" ? anchor.y + index : anchor.y,
    });
  }
  return footprint;
}

/** Columns covered by an entity. */
export function getEntityFootprint(entity: IEntity): WorldCoord[] {
  return getFootprint(entity, entity.length, entity.lengthAxis);
}

/**
 * Builds the spatial index of `entities` over their whole footprints: what occupies each
 * column, for collision, neighbourhood and placement queries. It is derived data — rebuild it
 * from the entities, never serialize it.
 */
export function indexEntities<E extends IEntity>(entities: Iterable<E>): SpatialIndex<E> {
  const index = new SpatialIndex<E>();
  for (const entity of entities) index.insert(entity, getEntityFootprint(entity));
  return index;
}

/** Lookups shared by every placement check of one `createEntitiesFromConfig()` call. */
type PlacementContext = {
  readonly columns: ReadonlyCellMap<ITerrainColumn>;
  /** Entities placed so far, over their whole footprints. */
  readonly placed: SpatialIndex<Entity>;
};

/** A validated position for one entity instance. */
type Placement = {
  readonly box: IGridObject;
  readonly footprint: readonly WorldCoord[];
  readonly elevation: number;
};

type SettlementPath = {
  readonly regionSize: number;
  readonly width: number;
};

const NO_CELLS: ReadonlyCellMap<true> = new CellMap<true>();

/**
 * Creates configured entities on eligible terrain columns.
 *
 * Each column's surface (grass, water or sand) is its `type`, classified once when the
 * terrain was created (`createTerrainColumns()`), so grass entities never spawn on sand. `footprintSurfaces` can require a different surface
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
 * Occupancy and `gap` are answered by a {@link SpatialIndex} of the entities placed so far.
 *
 * Placement is deterministic for a given `random` source: pass one derived from the world
 * seed (`createSeededRandom(deriveSeed(seed, "entities"))`). Without it, a fixed default seed
 * is used; `Math.random()` is never used. `variantRandom` picks each instance's color
 * variation (only for definitions with variation lists) from its own stream, so changing
 * colors never moves entities.
 */
export function createEntitiesFromConfig(
  boxes: readonly ITerrainColumn[],
  definitions: readonly EntityDefinition[],
  random: RandomSource = createSeededRandom(DEFAULT_WORLD_SEED),
  variantRandom: RandomSource = createSeededRandom(deriveSeed(DEFAULT_WORLD_SEED, "entity-color-variants")),
): Entity[] {
  const entities: Entity[] = [];
  const settlementPaths: SettlementPath[] = [];
  definitions.forEach(({ settlementLot }) => {
    if (settlementLot?.reservedPathWidth === undefined) return;
    const { regionSize, reservedPathWidth } = settlementLot;
    if (!settlementPaths.some((path) => path.regionSize === regionSize && path.width === reservedPathWidth)) {
      settlementPaths.push({ regionSize, width: reservedPathWidth });
    }
  });
  const paths = settlementPaths;
  const context: PlacementContext = {
    columns: CellMap.from(boxes, (box) => box),
    placed: new SpatialIndex<Entity>(),
  };

  for (const definition of definitions) {
    const formation = resolveFormation(definition.formation);

    for (const box of boxes) {
      if (definition.settlementLot && !isSettlementLot(box, definition.settlementLot)) continue;
      if (crossesSettlementPath(box, definition, paths)) continue;
      if (!findPlacement(box, definition, context, NO_CELLS)) continue;
      if (random() >= definition.spawnChance) continue;

      // The anchor sits at offset (0, 0), so it is always the first member placed.
      const groupCells = new CellMap<true>();
      const members: Placement[] = [];
      for (const offset of pickFormationOffsets(formation, random)) {
        const memberBox = context.columns.get(box.x + offset.x, box.y + offset.y);
        if (memberBox && crossesSettlementPath(memberBox, definition, paths)) continue;
        const placement = memberBox && findPlacement(memberBox, definition, context, groupCells);
        if (!placement) continue;
        placement.footprint.forEach(({ x, y }) => groupCells.set(x, y, true));
        members.push(placement);
      }
      if (members.length < formation.minMembers) continue;

      members.forEach(({ box: member, elevation, footprint }) => {
        const entity = new Entity(member.x, member.y, definition, elevation, {
          colorVariant: pickColorVariation(definition.colorReplacements, variantRandom),
        });
        context.placed.insert(entity, footprint);
        entities.push(entity);
      });
    }
  }

  return entities;
}

/** Whether any block of this entity footprint intersects a reserved central settlement route. */
function crossesSettlementPath(
  box: ITerrainColumn,
  definition: EntityDefinition,
  paths: readonly SettlementPath[],
): boolean {
  const { length = 1, lengthAxis = "x" } = definition;
  for (let index = 0; index < length; index += 1) {
    const x = box.x + (lengthAxis === "x" ? index : 0);
    const y = box.y + (lengthAxis === "y" ? index : 0);
    for (const { regionSize, width } of paths) {
      const regionX = Math.floor(x / regionSize) * regionSize;
      const regionY = Math.floor(y / regionSize) * regionSize;
      const centerX = regionX + regionSize / 2;
      const centerY = regionY + regionSize / 2;
      const halfWidth = width / 2;
      if (
        (x >= centerX - halfWidth && x < centerX + halfWidth) ||
        (y >= centerY - halfWidth && y < centerY + halfWidth)
      ) {
        return true;
      }
    }
  }
  return false;
}

/** Whether a column is the absolute, region-relative anchor for this settlement lot. */
function isSettlementLot(box: ITerrainColumn, lot: NonNullable<EntityDefinition["settlementLot"]>): boolean {
  const regionX = Math.floor(box.x / lot.regionSize) * lot.regionSize;
  const regionY = Math.floor(box.y / lot.regionSize) * lot.regionSize;
  return box.x === regionX + lot.offset.x && box.y === regionY + lot.offset.y;
}

/** Whether column `(x, y)` is taken: by an entity placed before, or by the current group. */
function isTaken(context: PlacementContext, groupCells: ReadonlyCellMap<true>, x: number, y: number): boolean {
  return context.placed.isOccupied(x, y) || groupCells.has(x, y);
}

/**
 * Validates one instance of `definition` anchored on `box`: footprint inside the map,
 * surfaces, flat elevation, free cells (including those already taken by the current
 * group) and `gap` with previously placed instances of the same entity.
 *
 * It runs for every column and definition, so it checks the footprint block by block and only
 * allocates for a valid placement: allocating on every call made generation stall on garbage
 * collection.
 */
function findPlacement(
  box: ITerrainColumn,
  definition: EntityDefinition,
  context: PlacementContext,
  groupCells: ReadonlyCellMap<true>,
): Placement | undefined {
  const { footprintSurfaces: surfaces, surface: defaultSurface, length = 1, lengthAxis = "x" } = definition;
  // The anchor is the footprint's first block: most columns fail on its surface or because it is
  // taken.
  if (box.type !== (surfaces?.[0] ?? defaultSurface)) return undefined;
  if (isTaken(context, groupCells, box.x, box.y)) return undefined;

  // Blocks that carry the entity: all of them, except the water blocks of a footprint
  // that also stands on land (a pier reaching over the water).
  let water = false;
  let land = false;
  for (let index = 0; index < length; index += 1) {
    if ((surfaces?.[index] ?? defaultSurface) === "water") water = true;
    else land = true;
  }
  const reachesOverWater = water && land;
  const alongX = lengthAxis === "x";
  let elevation: number | undefined;
  for (let index = 0; index < length; index += 1) {
    const x = alongX ? box.x + index : box.x;
    const y = alongX ? box.y : box.y + index;
    const cell = context.columns.get(x, y);
    const required = surfaces?.[index] ?? defaultSurface;
    if (cell === undefined || cell.type !== required || isTaken(context, groupCells, x, y)) return undefined;
    if (reachesOverWater && required === "water") continue;
    // The carrying blocks must share one elevation (the sprite is placed at that height,
    // so a step under them would show) and match `surfaceElevation`.
    elevation ??= cell.elevation;
    if (cell.elevation !== elevation || !matchesSurfaceElevation(cell.elevation, definition.surfaceElevation)) {
      return undefined;
    }
  }
  const last = { x: alongX ? box.x + length - 1 : box.x, y: alongX ? box.y : box.y + length - 1 };
  if (violatesGap(box, last, definition, context.placed)) return undefined;

  return { box, footprint: getFootprint(box, length, lengthAxis), elevation: elevation as number };
}

/**
 * Whether another instance of the same definition is within `gap` columns of the footprint from
 * `first` to `last` (Chebyshev distance, so diagonals count).
 */
function violatesGap(
  first: WorldCoord,
  last: WorldCoord,
  definition: EntityDefinition,
  placed: SpatialIndex<Entity>,
): boolean {
  const gap = Math.max(0, Math.floor(definition.gap ?? 0));
  if (gap === 0) return false;

  return placed.anyInRect(
    { minX: first.x - gap, minY: first.y - gap, maxX: last.x + gap, maxY: last.y + gap },
    ({ type }) => type === definition.id,
  );
}
