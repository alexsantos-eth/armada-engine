#!/usr/bin/env python3
"""Rasterize the cloud shadows' pattern, whole, soft and seamless.

The pattern is not an atlas sprite: the packer trims every sprite's transparent border, and a
trimmed pattern no longer repeats (see ``src/cloud_shadows.rs``). It is drawn here on its own, at
one texel per SVG unit, so a copy is 1920 x 960 and spans the twelve tiles the pattern repeats
over.

Two things the SVG cannot do for this client. **cairosvg ignores `feGaussianBlur`**, so the PNG
came out with the hard diamond edges the browser never shows — the TypeScript client gets the
filter from the browser's own renderer. The blur is applied here instead, over the wrapped
image, so the soft edge crosses the pattern's seam like every other edge. And the **colour is
forced to black**: the client tints the pattern anyway, so only the alpha matters, and an RGB
that is not black leaks its own hue into the half-transparent edge.

Usage: cloud_pattern.py <cloud-shadow.svg> <out.png> [width] [height] [blur]
"""
import os
import re
import sys

# cairosvg is imported through the Rust client's rasterizer, which lives beside the atlas build
# and knows how to find the package when it is not on the import path. This script sits in
# artifacts/ with the other generators, a sibling of lib/.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib", "scripts"))
from rasterize import cairosvg  # noqa: E402  (it looks for the package off the import path)

# One texel per SVG unit, which is the pattern's own size.
WIDTH, HEIGHT = 1920, 960


def blur_radius(svg):
    """The `stdDeviation` the artwork asks for, in SVG units, or 0 if it asks for none."""
    found = re.search(r'stdDeviation="([0-9.]+)"', svg)
    return float(found.group(1)) if found else 0.0


def soften(png_bytes, radius):
    """`png_bytes` blurred by `radius`, wrapping at its edges, as black with that alpha.

    Returns the bytes unchanged if NumPy or Pillow are missing: a hard-edged pattern is worse
    than no atlas at all would be, so it is a warning and not a failure.
    """
    try:
        import io

        import numpy
        from PIL import Image, ImageFilter
    except ImportError:
        print("warning: no numpy/Pillow, so the cloud pattern keeps its hard edges", file=sys.stderr)
        return png_bytes
    alpha = Image.open(io.BytesIO(png_bytes)).convert("RGBA").split()[3]
    width, height = alpha.size
    # Blurring the image on its own would fade its four edges into nothing and break the
    # repeat, so it is blurred as the middle of its own 3 x 3 tiling.
    tiled = Image.new("L", (width * 3, height * 3))
    for column in range(3):
        for row in range(3):
            tiled.paste(alpha, (column * width, row * height))
    tiled = tiled.filter(ImageFilter.GaussianBlur(radius))
    alpha = tiled.crop((width, height, width * 2, height * 2))
    out = numpy.zeros((height, width, 4), dtype=numpy.uint8)
    out[:, :, 3] = numpy.asarray(alpha)
    buffer = io.BytesIO()
    Image.fromarray(out, "RGBA").save(buffer, format="PNG")
    return buffer.getvalue()


def main():
    source, out = sys.argv[1], sys.argv[2]
    width = int(sys.argv[3]) if len(sys.argv) > 3 else WIDTH
    height = int(sys.argv[4]) if len(sys.argv) > 4 else HEIGHT
    svg = open(source, encoding="utf-8").read()
    radius = float(sys.argv[5]) if len(sys.argv) > 5 else blur_radius(svg) * width / WIDTH
    png = cairosvg.svg2png(url=source, output_width=width, output_height=height)
    open(out, "wb").write(soften(png, radius))
    print("Rasterized the cloud pattern to %s at %d x %d, blurred by %g." % (out, width, height, radius))


if __name__ == "__main__":
    main()
