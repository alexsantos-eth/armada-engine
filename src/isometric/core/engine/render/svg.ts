import type { SvgColorReplacements } from "../../types";

/** Width in px of the tile in the SVG assets' canvas (a block's diamond spans its full width). */
export const SVG_TILE_WIDTH = 1024;

/**
 * Extra rasterization detail over the on-screen size: keeps edges smooth when a texture is
 * drawn slightly larger or between pixels, without mipmaps.
 */
export const SVG_DETAIL = 1.5;

/**
 * Resolution to rasterize the SVG assets at (`data.resolution` of `Assets.load()`), so their
 * textures match the size they are drawn at instead of their 1024 px canvas: the on-screen tile
 * width × the device pixel ratio × {@link SVG_DETAIL}, relative to {@link SVG_TILE_WIDTH}, and
 * never above `1`. If the tile grows on screen (camera zoom), pass the largest expected width.
 */
export function getSvgResolution(tileWidth: number, deviceResolution = 1): number {
  return Math.min(1, (tileWidth * deviceResolution * SVG_DETAIL) / SVG_TILE_WIDTH);
}

const SVG_COLOR_ATTRIBUTE_PATTERN = /(fill|stroke)\s*=\s*(["'])#([0-9a-fA-F]{3,8})\2/g;

/**
 * Replaces `fill`/`stroke` hex colors of an SVG. Keys mapped to a list use the entry at
 * `variationIndex` (clamped to the list), so every key of one SVG shares the same variation.
 */
export function replaceSvgColors(
  svg: string,
  replacements: SvgColorReplacements,
  variationIndex = 0,
): string {
  const index = Math.max(0, Math.floor(variationIndex));
  const normalizedReplacements = new Map(
    Object.entries(replacements).map(([source, target]) => [
      source.toLowerCase(),
      pickColor(target, index),
    ]),
  );

  return svg.replace(
    SVG_COLOR_ATTRIBUTE_PATTERN,
    (match, attribute: string, quote: string, color: string) => {
      const replacement = normalizedReplacements.get(`#${color.toLowerCase()}`);
      return replacement === undefined
        ? match
        : `${attribute}=${quote}${replacement}${quote}`;
    },
  );
}

function pickColor(color: string | readonly string[], variationIndex: number): string {
  if (typeof color === "string") return color;

  return color[Math.min(color.length - 1, variationIndex)] ?? "";
}

/**
 * Loads an SVG asset and returns a `data:` URL with its colors replaced for
 * `variationIndex`, or `source` unchanged when there is nothing to replace. Callers should
 * create one variant per `(source, variationIndex)` and share its texture between instances.
 */
export async function createSvgColorVariant(
  source: string,
  replacements?: SvgColorReplacements,
  variationIndex = 0,
): Promise<string> {
  if (!replacements || Object.keys(replacements).length === 0) return source;

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Unable to load SVG asset: ${source}`);
  }

  const svg = replaceSvgColors(await response.text(), replacements, variationIndex);
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
