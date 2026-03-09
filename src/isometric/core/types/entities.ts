export type BoxType = "EMPTY";

export type BoxMetadata = Record<string, unknown>;

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
