import type { TerrainSurface } from "./terrain";

export type BoxType = "EMPTY";

export type BoxMetadata = Record<string, unknown>;

/** Terrain surface an entity can spawn on (the material of a column's top block). */
export type EntitySurface = TerrainSurface;

export type EntityLengthAxis = "x" | "y";

export type SvgColor = string | readonly string[];

export type SvgColorReplacements = Readonly<Record<string, SvgColor>>;

/** Relative position on the grid, in blocks, from a formation's anchor. */
export type GridOffset = {
  /** Offset along the engine `x` axis. */
  readonly x: number;
  /** Offset along the engine `y` axis. */
  readonly y: number;
};

/**
 * Formation map that groups instances of one entity when they spawn.
 *
 * Instead of rolling each column on its own, the factory rolls `spawnChance` once on an
 * anchor column and then tries to place a whole group following `map`.
 */
export type EntityFormation = {
  /**
   * Grid drawn as text: each string is a row along `y` and each character a column along
   * `x`. `"X"` marks a member and `"."` an empty cell. The first `"X"` in reading order is
   * the anchor, placed on the column that wins the spawn roll.
   *
   * @example `["XX", "X."]` groups three instances in an L.
   */
  map: readonly string[];
  /**
   * Minimum number of members that must fit (valid terrain, free cells, `gap` with other
   * groups) for the group to spawn. Members that do not fit are skipped. Defaults to every
   * member of `map`; values are clamped between `1` and that count.
   */
  minMembers?: number;
  /** Rotates each group a random number of quarter turns around its anchor. */
  rotate?: boolean;
};

export type GridObjectData = {
  elevation: number;
  metadata: BoxMetadata;
};

export interface IGridObject {
  readonly x: number;
  readonly y: number;
  readonly elevation: number;
  readonly metadata: BoxMetadata;
}

export type EntityDefinition = {
  id: string;
  textureSource: string;
  height: number;
  length?: number;
  lengthAxis?: EntityLengthAxis;
  spawnChance: number;
  surface: EntitySurface;
  /**
   * Surface required under each block of the footprint, in order from the anchor along
   * `lengthAxis` (e.g. `["grass", "sand", "sand"]` for a pier that starts on land).
   * Blocks it does not list use `surface`.
   */
  footprintSurfaces?: readonly EntitySurface[];
  /**
   * Terrain elevation(s) the entity may stand on. A single number requires that exact
   * elevation; a list accepts any of them. An empty list never matches. Whatever the
   * value, every block of a multi-block footprint must share the same elevation. Defaults to any elevation valid for `surface`.
   */
  surfaceElevation?: number | readonly number[];
  /**
   * Minimum number of free blocks (diagonals included) required between two
   * instances of this same entity. `1` forbids adjacent instances. Defaults to `0`.
   */
  gap?: number;
  /**
   * Groups instances following a formation map (e.g. trees in groves of three). The `gap`
   * applies between groups, not between members of the same group.
   */
  formation?: EntityFormation;
  debug?: boolean;
  colorReplacements?: SvgColorReplacements;
};

export type EntityData = GridObjectData & {
  type: string;
  walkable: boolean;
  height: number;
  length: number;
  lengthAxis?: EntityLengthAxis;
  gap?: number;
  textureSource: string;
  debug?: boolean;
  colorReplacements?: SvgColorReplacements;
};

/**
 * Represents the data structure for a box entity in an isometric environment.
 */
export type BoxData = {
  /**
   * The type/category of the box, which can be used to determine its appearance and behavior in the isometric environment.
   */
  type: BoxType;
  /**
   * Indicates whether the box can be walked on by entities. A value of `true` means that entities can move over this box, while `false` indicates that it is an obstacle or impassable terrain.
   */
  walkable: boolean;
  /**
   * Represents the height or elevation level of the box in the isometric space. This can be used to create a sense of depth and layering in the environment, allowing for features like hills, platforms, or multi-level structures.
   */
  elevation: number;
  /**
   * A flexible object that can hold any additional metadata associated with the box. This can include custom properties, tags, or any other relevant information that may be needed for game logic, rendering, or interactions within the isometric environment.
   */
  metadata: BoxMetadata;
};


export interface IBox {
  /**
   * The x-coordinate of the box in the isometric grid. This represents the horizontal position of the box and is typically used to determine its location within the grid-based layout of the isometric environment.
   */
  readonly x: number;
  /**
   * The y-coordinate of the box in the isometric grid. This represents the vertical position of the box and, together with the x-coordinate, defines its location within the grid-based layout of the isometric environment.
   */
  readonly y: number;
  /**
   * The type/category of the box, which can be used to determine its appearance and behavior in the isometric environment. This property is read-only and is typically set during the initialization of the box.
   */
  readonly type: BoxType;
  /**
   * Indicates whether the box can be walked on by entities. A value of `true` means that entities can move over this box, while `false` indicates that it is an obstacle or impassable terrain. This property is read-only and is typically determined based on the box's type or other characteristics.
   */
  readonly walkable: boolean;
  /**
   * Represents the height or elevation level of the box in the isometric space. This can be used to create a sense of depth and layering in the environment, allowing for features like hills, platforms, or multi-level structures. This property is read-only and is typically determined based on the box's type or other characteristics.
   */
  readonly elevation: number;     
  /**
   * A flexible object that can hold any additional metadata associated with the box. This can include custom properties, tags, or any other relevant information that may be needed for game logic, rendering, or interactions within the isometric environment. This property is read-only and can be accessed to retrieve any additional information about the box.
   */
  readonly metadata: BoxMetadata;
  /**
   * Retrieves the complete data structure of the box, including its type, walkability, elevation, and any associated metadata. This method provides a way to access all relevant information about the box in a single object, which can be useful for game logic, rendering decisions, or interactions within the isometric environment.
   * @returns A `BoxData` object containing the type, walkability, elevation, and metadata of the box.
   */
  getData(): BoxData;
  /**
   * Updates the properties of the box based on the provided partial data. This method allows for modifying the box's characteristics, such as its type, walkability, elevation, or metadata, while ensuring that only the specified properties are changed. The method takes a `Partial<BoxData>` object as an argument, which means that any subset of the box's properties can be updated without affecting the others.
   * @param data A partial object containing any subset of the box's properties (type, walkability, elevation, metadata) that should be updated. Only the properties included in this object will be modified, while the rest will remain unchanged.
   */
  update(data: Partial<BoxData>): void;
}

export interface IEntity extends IGridObject {
  readonly type: string;
  readonly walkable: boolean;
  readonly height: number;
  readonly length: number;
  readonly lengthAxis?: EntityLengthAxis;
  readonly gap?: number;
  readonly textureSource: string;
  readonly debug?: boolean;
  readonly colorReplacements?: SvgColorReplacements;
  getData(): EntityData;
}

