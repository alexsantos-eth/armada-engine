/** A point or a distance in screen pixels (PixiJS: `x` right, `y` down). */
export type ScreenPoint = {
  readonly x: number;
  readonly y: number;
};

/** Size of the viewport in screen pixels. */
export type ScreenSize = {
  readonly width: number;
  readonly height: number;
};

/**
 * What the camera looks at. `x`/`y` are the ground point (elevation `0`, in world columns,
 * fractional) shown at the centre of the viewport, so the camera says which part of the world
 * (and, later, which chunks) is in view; `zoom` is how many screen pixels a scene pixel takes.
 * View state: it is not part of the `World` and is not saved.
 */
export type Camera = {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
};

/** Where the camera may go: its zoom range and the ground rectangle its centre stays in. */
export type CameraLimits = {
  readonly minZoom: number;
  readonly maxZoom: number;
  /** Inclusive ground rectangle, in world columns, that holds the camera centre. */
  readonly bounds: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
};

/** Position and scale of the world container that show the scene as the camera sees it. */
export type CameraTransform = {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
};

/**
 * What two fingers did between two frames: the move of their midpoint (a pan), how much they
 * spread apart (a zoom factor) and where they are now (the zoom anchor), all on screen.
 */
export type PinchGesture = {
  readonly pan: ScreenPoint;
  readonly factor: number;
  readonly anchor: ScreenPoint;
};
