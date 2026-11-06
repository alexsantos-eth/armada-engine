import type { Rgb } from "../../types";

const toByte = (channel: number) => Math.round(Math.min(Math.max(channel, 0), 1) * 255);

/**
 * Converts a light color with channels in `[0, 1]` (e.g. the sun's ambient light) to a Pixi
 * tint (`0xRRGGBB`). Channels outside the range are clamped.
 */
export function rgbToTint({ r, g, b }: Rgb): number {
  return (toByte(r) << 16) | (toByte(g) << 8) | toByte(b);
}
