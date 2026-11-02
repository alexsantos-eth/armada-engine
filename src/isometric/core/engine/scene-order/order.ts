/** Renderer-independent draw depth inputs for a block or an occupied tile. */
export type DrawDepthInput = {
  readonly x: number;
  readonly baseScreenY: number;
  readonly elevation: number;
};

/** The scene draws lower depths first, then lower layers. */
export type DrawKey = { readonly depth: number; readonly layer: number };

/** Draw depth of a block or footprint tile using the current scene convention. */
export function getDrawDepth(input: DrawDepthInput, tileHeight: number, tile = 0, axis: "x" | "y" = "x"): number {
  return (
    input.baseScreenY -
    tile * (tileHeight / 2) +
    input.elevation * 0.001 +
    (input.x + (axis === "x" ? tile : 0)) * 0.0001
  );
}

/** Negative when `a` is drawn before `b`; equal keys retain insertion order. */
export function compareDrawKeys(a: DrawKey, b: DrawKey): number {
  return a.depth - b.depth || a.layer - b.layer;
}
