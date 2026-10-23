import { describe, expect, it, vi } from "vitest";
import {
  createSvgColorVariant,
  getSvgResolution,
  releaseSvgColorVariant,
  replaceSvgColors,
  SVG_DETAIL,
  SVG_TILE_WIDTH,
} from "./svg";

/** The SVG text behind a `blob:` URL made by `URL.createObjectURL()` in this test. */
const blobs = new Map<string, Blob>();
const svgOf = (url: string) => (blobs.get(url) as Blob).text();

describe("getSvgResolution", () => {
  it("rasterizes a 1024 px tile canvas at the size it is drawn, with some detail to spare", () => {
    expect(SVG_TILE_WIDTH).toBe(1024);
    expect(SVG_DETAIL).toBe(1.5);
    expect(getSvgResolution(40)).toBeCloseTo((40 * 1.5) / 1024);
  });

  it("scales with the device pixel ratio", () => {
    expect(getSvgResolution(40, 2)).toBeCloseTo(2 * getSvgResolution(40, 1));
  });

  it("never rasterizes above the canvas's own size", () => {
    expect(getSvgResolution(1024, 1)).toBe(1);
    expect(getSvgResolution(2048, 3)).toBe(1);
  });
});

describe("replaceSvgColors", () => {
  it("replaces configured fill and stroke colors while preserving other colors", () => {
    const svg = '<path fill="#9f4b2f" stroke="#B05334"/><path fill="#ffffff"/>';

    expect(
      replaceSvgColors(svg, {
        "#9f4b2f": "#245c4a",
        "#b05334": "#2f735d",
      }),
    ).toBe('<path fill="#245c4a" stroke="#2f735d"/><path fill="#ffffff"/>');
  });

  it("selects a color from each configured variation list", () => {
    const svg = '<path fill="#9f4b2f"/><path fill="#9f4b2f" stroke="#B05334"/>';

    expect(
      replaceSvgColors(
        svg,
        {
          "#9f4b2f": ["#245c4a", "#d6a72c"],
          "#b05334": ["#2f735d", "#efc94c"],
        },
        1,
      ),
    ).toBe('<path fill="#d6a72c"/><path fill="#d6a72c" stroke="#efc94c"/>');
  });

  it("uses the first variation by default and clamps out-of-range indexes", () => {
    const svg = '<path fill="#9f4b2f"/>';
    const replacements = { "#9f4b2f": ["#245c4a", "#d6a72c"] };

    expect(replaceSvgColors(svg, replacements)).toBe('<path fill="#245c4a"/>');
    expect(replaceSvgColors(svg, replacements, 7)).toBe('<path fill="#d6a72c"/>');
    expect(replaceSvgColors(svg, replacements, -3)).toBe('<path fill="#245c4a"/>');
  });

  it("returns an empty replacement for an empty variation list", () => {
    expect(
      replaceSvgColors('<path fill="#9f4b2f"/>', {
        "#9f4b2f": [],
      }),
    ).toBe('<path fill=""/>');
  });

  it("returns the original SVG when no replacements are configured", () => {
    const svg = '<path fill="#9f4b2f"/>';

    expect(replaceSvgColors(svg, {})).toBe(svg);
  });

  const stubFetch = (svg: string) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve(svg) })),
    );
  const stubObjectUrls = () => {
    blobs.clear();
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      const url = `blob:test/${blobs.size}`;
      blobs.set(url, blob as Blob);
      return url;
    });
  };

  it("hands out a short blob: URL of the recolored SVG asset, typed as SVG", async () => {
    stubFetch('<path fill="#9f4b2f"/>');
    stubObjectUrls();

    const url = await createSvgColorVariant("/assets/house/block.svg", { "#9f4b2f": "#245c4a" });

    // Not a data: URL: Pixi parses the URL of every asset it loads, and an SVG of hundreds of
    // kilobytes, encoded in its URL, made each of those passes a scan of the whole SVG.
    expect(url).toBe("blob:test/0");
    expect(blobs.get(url)?.type).toBe("image/svg+xml");
    await expect(svgOf(url)).resolves.toBe('<path fill="#245c4a"/>');

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps the source URL when no color variant is requested", async () => {
    await expect(createSvgColorVariant("/assets/house/block.svg", {})).resolves.toBe("/assets/house/block.svg");
  });

  it("applies the requested variation", async () => {
    stubFetch('<path fill="#9f4b2f"/>');
    stubObjectUrls();

    const url = await createSvgColorVariant("/assets/house/block.svg", { "#9f4b2f": ["#245c4a", "#d6a72c"] }, 1);

    await expect(svgOf(url)).resolves.toBe('<path fill="#d6a72c"/>');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("releases a variant's blob: URL, and leaves any other URL alone", () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    releaseSvgColorVariant("blob:test/0");
    releaseSvgColorVariant("/assets/house/block.svg");

    expect(revoke.mock.calls).toEqual([["blob:test/0"]]);
    vi.restoreAllMocks();
  });

  it("rejects when the SVG asset cannot be fetched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false })),
    );

    await expect(
      createSvgColorVariant("/assets/house/block.svg", {
        "#9f4b2f": "#245c4a",
      }),
    ).rejects.toThrow("Unable to load SVG asset");

    vi.unstubAllGlobals();
  });
});
