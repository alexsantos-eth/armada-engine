/** How the game draws on a kind of device: what the mobile profile lowers to fit in a phone's memory. */
export type RenderProfile = {
  /** Largest canvas resolution: the device pixel ratio is capped to it. */
  readonly maxResolution: number;
  /** Whether the canvas is antialiased (MSAA, which keeps extra buffers the size of the screen). */
  readonly antialias: boolean;
  /** Extra detail of the rasterized SVGs (the scene's `svgDetail`); the scene's default when unset. */
  readonly svgDetail?: number;
};

/** Desktop: the full device pixel ratio, antialiasing and the scene's SVG detail. */
export const DESKTOP_RENDER: RenderProfile = { maxResolution: Infinity, antialias: true };

/**
 * Phones and tablets, which a tab running out of memory closes: the canvas at most at 2× (a 3×
 * screen draws 2.25 times the pixels for a barely visible difference), no MSAA buffers, and the
 * SVGs rasterized at exactly the size they are drawn at the largest zoom. Together they take
 * about a third of the texture memory of {@link DESKTOP_RENDER} on a 3× phone.
 */
export const MOBILE_RENDER: RenderProfile = { maxResolution: 2, antialias: false, svgDetail: 1 };

/**
 * Whether the window is on a phone or tablet: its main pointer is a finger (coarse) and it cannot
 * hover. A laptop with a touch screen still has a fine pointer that hovers, so it stays desktop.
 */
export function isMobileDevice(window: Pick<Window, "matchMedia">): boolean {
  return window.matchMedia?.("(pointer: coarse) and (hover: none)").matches ?? false;
}

/** The profile to draw with: {@link MOBILE_RENDER} on mobile, {@link DESKTOP_RENDER} otherwise. */
export function resolveRenderProfile(mobile: boolean): RenderProfile {
  return mobile ? MOBILE_RENDER : DESKTOP_RENDER;
}
