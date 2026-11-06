import type { ReadonlyCellMap } from "../grid";
import type { Box } from "../terrain";
import type { Affine2D, AffineTarget, TerrainMaterial, TileMetrics, WorldRect } from "../../types";

/**
 * Texels per column side of a reflection map. Reflections are soft: a coarse map keeps it small
 * (a chunk of water is at most 768 × 768 texels) and blurs what it shows like rippled water.
 */
export const REFLECTION_PIXELS_PER_TILE = 24;

/**
 * Columns behind the water (towards `+x` and `+y`) whose terrain and entities may reflect on it:
 * the reflection of something `h` blocks tall falls `h · boxHeight / tileHeight` columns in
 * front of it, so eight columns hold a tall building on a hill.
 */
export const REFLECTION_REACH = 8;

/**
 * Columns to each side that what stands somewhere may reflect on: a sprite wider than its tile
 * spreads its reflection sideways (`+x −y` to the right, `−x +y` to the left), half its width
 * each way, and a long entity (a three-tile pier, a boat) stands on the tiles after its anchor.
 */
export const REFLECTION_SPREAD = 3;

/** A point in the scene and the world: where something stands, to mirror it in the water. */
export type ReflectionFoot = {
  /** World column, fractional for what moves. */
  readonly x: number;
  readonly y: number;
  /** Top elevation of the column it stands on. */
  readonly elevation: number;
  /** The same point in scene pixels. */
  readonly screenX: number;
  readonly screenY: number;
};

/**
 * The water tops of one elevation in a chunk: what one reflection map covers. Texel `(0, 0)` of
 * the map is the `−x −y` corner of column `(rect.minX, rect.minY)`; a column is
 * {@link REFLECTION_PIXELS_PER_TILE} texels square.
 */
export type ReflectionArea = {
  /** Elevation of the water tops: the plane things are mirrored in. */
  readonly level: number;
  /** Smallest rectangle around its columns. */
  readonly rect: WorldRect;
  /** The water columns whose top is at `level`. */
  readonly columns: readonly Box[];
};

/** The water columns of `columns` by the elevation of their tops, lowest level first. */
export function groupWaterLevels(columns: readonly Box[]): ReflectionArea[] {
  const levels = new Map<number, Box[]>();
  for (const column of columns) {
    if (column.type !== "water") continue;
    const level = levels.get(column.elevation);
    if (level) level.push(column);
    else levels.set(column.elevation, [column]);
  }
  return [...levels.entries()]
    .sort(([below], [above]) => below - above)
    .map(([level, list]) => {
      const rect = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      for (const { x, y } of list) {
        rect.minX = Math.min(rect.minX, x);
        rect.minY = Math.min(rect.minY, y);
        rect.maxX = Math.max(rect.maxX, x);
        rect.maxY = Math.max(rect.maxY, y);
      }
      return { level, rect, columns: list };
    });
}

/**
 * Whether something standing at column `(x, y)` may reflect on the water of `area`: behind it
 * within {@link REFLECTION_REACH}, or beside it within {@link REFLECTION_SPREAD}.
 */
export function reflectsOn(area: ReflectionArea, x: number, y: number): boolean {
  const { minX, minY, maxX, maxY } = area.rect;
  const reach = REFLECTION_REACH + REFLECTION_SPREAD;
  return x >= minX - REFLECTION_SPREAD && y >= minY - REFLECTION_SPREAD && x <= maxX + reach && y <= maxY + reach;
}

/** `outer ∘ inner`: the transform that applies `inner` first, then `outer`. */
export function composeInto<T extends AffineTarget>(outer: Affine2D, inner: Affine2D, out: T): T {
  const { a, b, c, d, tx, ty } = inner;
  out.a = outer.a * a + outer.c * b;
  out.b = outer.b * a + outer.d * b;
  out.c = outer.a * c + outer.c * d;
  out.d = outer.b * c + outer.d * d;
  out.tx = outer.a * tx + outer.c * ty + outer.tx;
  out.ty = outer.b * tx + outer.d * ty + outer.ty;
  return out;
}

/**
 * Transform from scene pixels to texels of `area`'s map that mirrors in its water something drawn
 * upright on `foot` (a sprite facing the camera: every pixel of it is taken to stand on `foot`,
 * at the height its offset above the foot says), so it shows flipped upside down under the water
 * below `foot`, as wide as it is and straight down. A point `z` blocks above the water shows
 * `z · boxHeight` pixels below the water under it, which on the water's plane is
 * `z · boxHeight / tileHeight` columns towards `−x` and `−y`. Written into `out`.
 */
export function getReflectionMatrix<T extends AffineTarget>(
  foot: ReflectionFoot,
  area: ReflectionArea,
  metrics: TileMetrics,
  out: T,
  pixelsPerTile = REFLECTION_PIXELS_PER_TILE,
): T {
  const { tileWidth, tileHeight, boxHeight } = metrics;
  const lift = ((foot.elevation - area.level) * boxHeight) / tileHeight;
  const across = foot.screenX / tileWidth;
  const down = foot.screenY / tileHeight;
  out.a = pixelsPerTile / tileWidth;
  out.b = -pixelsPerTile / tileWidth;
  out.c = pixelsPerTile / tileHeight;
  out.d = pixelsPerTile / tileHeight;
  out.tx = pixelsPerTile * (foot.x - across - down - lift - (area.rect.minX - 0.5));
  out.ty = pixelsPerTile * (foot.y + across - down - lift - (area.rect.minY - 0.5));
  return out;
}

/**
 * Transform from scene pixels to texels of `area`'s map for something already drawn as the water
 * shows it (an entity's `reflectionSource`): each pixel is taken to lie on the water's plane, so it
 * lands in the map where it is on screen, with no flip. Written into `out`.
 */
export function getWaterPlaneMatrix<T extends AffineTarget>(
  area: ReflectionArea,
  metrics: TileMetrics,
  out: T,
  pixelsPerTile = REFLECTION_PIXELS_PER_TILE,
): T {
  const { tileWidth, tileHeight, boxHeight } = metrics;
  const sunk = (area.level * boxHeight) / tileHeight;
  out.a = pixelsPerTile / tileWidth;
  out.b = -pixelsPerTile / tileWidth;
  out.c = -pixelsPerTile / tileHeight;
  out.d = -pixelsPerTile / tileHeight;
  out.tx = pixelsPerTile * (-sunk - (area.rect.minX - 0.5));
  out.ty = pixelsPerTile * (-sunk - (area.rect.minY - 0.5));
  return out;
}

/**
 * Transform that lays a column's square of a reflection map (`pixelsPerTile` texels, `+x` right
 * and `+y` down in the map) on the column's top diamond, centred on `tileTop` (scene pixels):
 * texel `(0, 0)` on its bottom corner, `+x` of the map along `+x` of the world.
 */
export function getWaterTopMatrix<T extends AffineTarget>(
  tileTop: { readonly x: number; readonly y: number },
  metrics: TileMetrics,
  out: T,
  pixelsPerTile = REFLECTION_PIXELS_PER_TILE,
): T {
  out.a = metrics.tileWidth / (2 * pixelsPerTile);
  out.b = -metrics.tileHeight / (2 * pixelsPerTile);
  out.c = -metrics.tileWidth / (2 * pixelsPerTile);
  out.d = -metrics.tileHeight / (2 * pixelsPerTile);
  out.tx = tileTop.x;
  out.ty = tileTop.y + metrics.tileHeight / 2;
  return out;
}

/** The side of a block that faces the camera: `left` faces `−x`, `right` faces `−y`. */
export type BlockSide = "left" | "right";

/**
 * A side of one terrain block mirrored in the water: its corners in texels of the map, top left,
 * top right, bottom right and bottom left as the block's texture draws them, and the band of the
 * side they show (`cut`: from its top, `0` its top edge and `1` its bottom edge).
 */
export type ReflectedFace = {
  readonly material: TerrainMaterial;
  readonly side: BlockSide;
  readonly corners: readonly [number, number, number, number, number, number, number, number];
  readonly cut: readonly [number, number];
  /** The column of the block. */
  readonly x: number;
  readonly y: number;
  /** How far its top and bottom edges stand above the water, in blocks. */
  readonly heights: readonly [number, number];
};

/**
 * The sides of the terrain blocks that mirror in `area`'s water, the furthest first (the nearer
 * ones cover them): the `−x` and `−y` sides of the land columns behind the water (within
 * {@link REFLECTION_REACH}), between the water (or the top of the neighbour that hides their
 * foot) and the top of their column, block by block. A top sunk by `topInsetAt` (sand) shows a
 * shorter side and hides less of the side behind it. A side's top block shows its column's
 * surface; the blocks under it are `ground`.
 */
export function getReflectedFaces(
  area: ReflectionArea,
  columnAt: Pick<ReadonlyCellMap<Box>, "get">,
  metrics: TileMetrics,
  topInsetAt: (x: number, y: number) => number = () => 0,
  pixelsPerTile = REFLECTION_PIXELS_PER_TILE,
): ReflectedFace[] {
  const { level, rect } = area;
  const sink = metrics.boxHeight / metrics.tileHeight;
  const toTexel = (x: number, y: number, height: number, out: number[]) =>
    out.push(
      (x - height * sink - (rect.minX - 0.5)) * pixelsPerTile,
      (y - height * sink - (rect.minY - 0.5)) * pixelsPerTile,
    );
  const faces: Array<ReflectedFace & { readonly order: number }> = [];
  const addSide = (column: Box, side: BlockSide, neighbour: Box | undefined) => {
    const { x, y, elevation } = column;
    const top = elevation - topInsetAt(x, y);
    const hidden = neighbour ? neighbour.elevation - topInsetAt(neighbour.x, neighbour.y) : level;
    const from = Math.max(level, hidden);
    // The side's two edges on the ground: `left` runs along `x − ½`, `right` along `y − ½`.
    const start = side === "left" ? [x - 0.5, y + 0.5] : [x - 0.5, y - 0.5];
    const end = side === "left" ? [x - 0.5, y - 0.5] : [x + 0.5, y - 0.5];
    for (let block = Math.floor(from) + 1; block <= elevation; block += 1) {
      const high = Math.min(block, top);
      const low = Math.max(block - 1, from);
      if (high <= low) continue;
      const corners: number[] = [];
      toTexel(start[0], start[1], high - level, corners);
      toTexel(end[0], end[1], high - level, corners);
      toTexel(end[0], end[1], low - level, corners);
      toTexel(start[0], start[1], low - level, corners);
      faces.push({
        material: block === elevation ? column.type : "ground",
        side,
        corners: corners as unknown as ReflectedFace["corners"],
        cut: [block - high, block - low],
        x,
        y,
        heights: [high - level, low - level],
        order: x + y,
      });
    }
  };
  for (let x = rect.minX; x <= rect.maxX + REFLECTION_REACH; x += 1) {
    for (let y = rect.minY; y <= rect.maxY + REFLECTION_REACH; y += 1) {
      const column = columnAt.get(x, y);
      if (!column || column.type === "water" || column.elevation <= level) continue;
      addSide(column, "left", columnAt.get(x - 1, y));
      addSide(column, "right", columnAt.get(x, y - 1));
    }
  }
  return faces.sort((behind, front) => front.order - behind.order).map(({ order: _order, ...face }) => face);
}

/**
 * The corners of a block's `side` in its texture, in texture coordinates (`0` to `1`), in the
 * order of {@link ReflectedFace.corners}, for the band `cut` of it (from its top: `[0, 1]` is the
 * whole side). A block texture is as wide as its top diamond, whose height is `tileHeight` to
 * `tileWidth` of it, with the sides `boxHeight` tall under it.
 */
export function getFaceUvs(
  side: BlockSide,
  texture: { readonly width: number; readonly height: number },
  metrics: TileMetrics,
  cut: readonly [number, number] = [0, 1],
): readonly [number, number, number, number, number, number, number, number] {
  const scale = texture.width / metrics.tileWidth / texture.height;
  const top = metrics.tileHeight * scale;
  const tall = metrics.boxHeight * scale;
  const [upper, lower] = cut.map((row) => row * tall);
  return side === "left"
    ? [0, top / 2 + upper, 0.5, top + upper, 0.5, top + lower, 0, top / 2 + lower]
    : [0.5, top + upper, 1, top / 2 + upper, 1, top / 2 + lower, 0.5, top + lower];
}
