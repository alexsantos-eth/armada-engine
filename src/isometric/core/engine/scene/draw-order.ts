import { Container } from "pixi.js";
import { TILE_HEIGHT } from "../constants";
import type { SceneLayer, SceneView } from "./module";

/**
 * Depth span of one band of the draw order: one row of tiles. The world container holds a band
 * per span of depths with views in it, and each band holds its views, so adding or taking out a
 * view moves the children of its band (a row of the screen) instead of every view in the world.
 */
export const DRAW_BAND_DEPTH = TILE_HEIGHT / 2;

/** Draw order of two views: by depth, then layer (negative when `a` goes first). */
export function compareViews(a: SceneView, b: SceneView): number {
  return a.depth - b.depth || a.layer - b.layer;
}

/**
 * Index of the first of `entries` that `isAfter` holds for, the entries being sorted so that it
 * holds for none of them up to that one and for every one from it.
 */
export function firstAfter<T>(entries: readonly T[], isAfter: (entry: T) => boolean): number {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (isAfter(entries[middle])) high = middle;
    else low = middle + 1;
  }
  return low;
}

/** The views of the world container, in the order they are drawn. */
export type DrawOrder = {
  /** Adds `views` at their place: after the views of the same depth and layer already in. */
  add(views: readonly SceneView[]): void;
  /** Takes `views` out of the world container, without destroying them. */
  remove(views: readonly SceneView[]): void;
  /** Puts `view` after every view at `depth` or closer to the back, moving it if already in. */
  placeAt(view: Container, depth: number, layer: SceneLayer): void;
};

type Band = {
  readonly index: number;
  readonly container: Container;
  /** The band's views, in the order of its container's children. */
  readonly entries: SceneView[];
};

/**
 * The draw order of `root`: its children are bands of {@link DRAW_BAND_DEPTH} depths, from the
 * back, each holding its views by depth, then layer. Every view of a band is drawn after every
 * view of the bands behind it, so the order is that of all the views sorted at once.
 */
export function createDrawOrder(root: Container): DrawOrder {
  const bands: Band[] = [];
  const bandOf = new Map<Container, Band>();

  const bandFor = (depth: number): Band => {
    const index = Math.floor(depth / DRAW_BAND_DEPTH);
    const at = firstAfter(bands, (band) => band.index >= index);
    if (bands[at]?.index === index) return bands[at];
    const band: Band = { index, container: new Container(), entries: [] };
    bands.splice(at, 0, band);
    root.addChildAt(band.container, at);
    return band;
  };

  const insert = (band: Band, entry: SceneView, at: number) => {
    band.entries.splice(at, 0, entry);
    band.container.addChildAt(entry.view, at);
    bandOf.set(entry.view, band);
  };

  const takeOut = (view: Container) => {
    const band = bandOf.get(view);
    if (!band) return;
    bandOf.delete(view);
    band.entries.splice(
      band.entries.findIndex((entry) => entry.view === view),
      1,
    );
    band.container.removeChild(view);
    if (band.entries.length > 0) return;
    bands.splice(bands.indexOf(band), 1);
    root.removeChild(band.container);
    band.container.destroy();
  };

  return {
    add: (views) =>
      views.forEach((entry) => {
        const band = bandFor(entry.depth);
        insert(
          band,
          entry,
          firstAfter(band.entries, (other) => compareViews(other, entry) > 0),
        );
      }),
    remove: (views) => views.forEach(({ view }) => takeOut(view)),
    placeAt: (view, depth, layer) => {
      takeOut(view);
      const band = bandFor(depth);
      insert(
        band,
        { view, depth, layer },
        firstAfter(band.entries, (other) => other.depth > depth),
      );
    },
  };
}
