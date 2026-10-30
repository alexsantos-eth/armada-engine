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
 * width × the device pixel ratio × `detail` ({@link SVG_DETAIL} by default; `1` for exactly the
 * drawn size, which saves memory), relative to {@link SVG_TILE_WIDTH}, and never above `1`. If the
 * tile grows on screen (camera zoom), pass the largest expected width.
 */
export function getSvgResolution(tileWidth: number, deviceResolution = 1, detail = SVG_DETAIL): number {
  return Math.min(1, (tileWidth * deviceResolution * detail) / SVG_TILE_WIDTH);
}

const SVG_COLOR_ATTRIBUTE_PATTERN = /(fill|stroke)\s*=\s*(["'])#([0-9a-fA-F]{3,8})\2/g;

/**
 * Replaces `fill`/`stroke` hex colors of an SVG. Keys mapped to a list use the entry at
 * `variationIndex` (clamped to the list), so every key of one SVG shares the same variation.
 */
export function replaceSvgColors(svg: string, replacements: SvgColorReplacements, variationIndex = 0): string {
  const index = Math.max(0, Math.floor(variationIndex));
  const normalizedReplacements = new Map(
    Object.entries(replacements).map(([source, target]) => [source.toLowerCase(), pickColor(target, index)]),
  );

  return svg.replace(SVG_COLOR_ATTRIBUTE_PATTERN, (match, attribute: string, quote: string, color: string) => {
    const replacement = normalizedReplacements.get(`#${color.toLowerCase()}`);
    return replacement === undefined ? match : `${attribute}=${quote}${replacement}${quote}`;
  });
}

function pickColor(color: string | readonly string[], variationIndex: number): string {
  if (typeof color === "string") return color;

  return color[Math.min(color.length - 1, variationIndex)] ?? "";
}

/**
 * Loads an SVG asset and returns a `blob:` URL of it with its colors replaced for
 * `variationIndex`, or `source` unchanged when there is nothing to replace. Not a `data:` URL:
 * Pixi parses the URL of every asset it loads several times (resolving, picking the parser,
 * caching), and with an SVG of hundreds of kilobytes encoded in it each pass scanned the whole
 * SVG. A `blob:` URL has no extension, so load it with Pixi's `svg` parser, and give it back
 * with {@link releaseSvgColorVariant} once loaded. Callers should create one variant per
 * `(source, variationIndex)` and share its texture between instances.
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
  return URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
}

/**
 * Frees the `blob:` URL {@link createSvgColorVariant} made, once its texture is loaded (the
 * texture keeps its own pixels). Any other URL, such as an unchanged source, is left alone.
 */
export function releaseSvgColorVariant(url: string): void {
  if (url.startsWith("blob:")) URL.revokeObjectURL(url);
}
