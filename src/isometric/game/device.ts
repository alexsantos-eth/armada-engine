/** How the game runs on a kind of device: what the mobile profile lowers to fit in a phone's memory. */
export type DeviceProfile = {
  /** Largest canvas resolution: the device pixel ratio is capped to it. */
  readonly maxResolution: number;
  /** Whether the canvas is antialiased (MSAA, which keeps extra buffers the size of the screen). */
  readonly antialias: boolean;
  /** Extra detail of the rasterized SVGs (the scene's `svgDetail`); the scene's default when unset. */
  readonly svgDetail?: number;
  /**
   * Whether each SVG's pixels are freed once on the GPU (the scene's `releaseSvgPixels`); the
   * game then reloads the page if the WebGL context is lost and restored.
   */
  readonly releaseSvgPixels: boolean;
  /** Chunks kept loaded around each focus (`stream()`'s `keepRadius`); the world's default when unset. */
  readonly chunkKeepRadius?: number;
};

/** Desktop: the full device pixel ratio, antialiasing, and the scene's and world's defaults. */
export const DESKTOP_PROFILE: DeviceProfile = { maxResolution: Infinity, antialias: true, releaseSvgPixels: false };

/**
 * Phones and tablets, which close a tab that runs out of memory: the canvas at most at 2× (a 3×
 * screen draws 2.25 times the pixels for a barely visible difference), no MSAA buffers, the SVGs
 * rasterized at exactly the size they are drawn at the largest zoom and kept only on the GPU, and
 * the chunks kept loaded only as far as those loaded ahead (2, not 3: about half as many).
 */
export const MOBILE_PROFILE: DeviceProfile = {
  maxResolution: 2,
  antialias: false,
  svgDetail: 1,
  releaseSvgPixels: true,
  chunkKeepRadius: 2,
};

/**
 * Whether the window is on a phone or tablet: its main pointer is a finger (coarse) and it cannot
 * hover. A laptop with a touch screen still has a fine pointer that hovers, so it stays desktop.
 */
export function isMobileDevice(window: Pick<Window, "matchMedia">): boolean {
  return window.matchMedia?.("(pointer: coarse) and (hover: none)").matches ?? false;
}

/** The profile to run with: {@link MOBILE_PROFILE} on mobile, {@link DESKTOP_PROFILE} otherwise. */
export function resolveDeviceProfile(mobile: boolean): DeviceProfile {
  return mobile ? MOBILE_PROFILE : DESKTOP_PROFILE;
}
