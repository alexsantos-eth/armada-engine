import type { SvgColorReplacements } from "../../types";

const SVG_COLOR_ATTRIBUTE_PATTERN = /(fill|stroke)\s*=\s*(["'])#([0-9a-fA-F]{3,8})\2/g;

export function replaceSvgColors(
  svg: string,
  replacements: SvgColorReplacements,
  random: () => number = Math.random,
): string {
  const variationIndex = getVariationIndex(replacements, random);
  const normalizedReplacements = new Map(
    Object.entries(replacements).map(([source, target]) => [
      source.toLowerCase(),
      pickColor(target, variationIndex),
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

function getVariationIndex(
  replacements: SvgColorReplacements,
  random: () => number,
): number {
  const variationCount = Object.values(replacements)
    .find((color): color is readonly string[] => Array.isArray(color))?.length ?? 0;
  return variationCount === 0
    ? 0
    : Math.min(variationCount - 1, Math.floor(random() * variationCount));
}

function pickColor(color: string | readonly string[], variationIndex: number): string {
  if (typeof color === "string") return color;

  return color[Math.min(color.length - 1, variationIndex)] ?? "";
}

export async function createSvgColorVariant(
  source: string,
  replacements?: SvgColorReplacements,
  random: () => number = Math.random,
): Promise<string> {
  if (!replacements || Object.keys(replacements).length === 0) return source;

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Unable to load SVG asset: ${source}`);
  }

  const svg = replaceSvgColors(await response.text(), replacements, random);
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}