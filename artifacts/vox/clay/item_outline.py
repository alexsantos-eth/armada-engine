#!/usr/bin/env python3
# item_outline.py — the ink outline of the items the world drops: a thick, slightly wobbly black
# line around the sprite, like the cut-out outline of the paper-and-clay UI kit (`--ac-ink`,
# `#ac-wobble` in lib/web/ui/armada-ui.css).
#
#   python3 item_outline.py [wood stone …]   outline those sprites of lib/assets/items/ (all when
#                                            none is named)
#
# vox_items.py --render calls it after every render. It is idempotent: an outlined PNG carries a
# text chunk and is skipped, so running it twice never thickens the line. The sprites are drawn
# small in the middle of a 1024 x 853 canvas and shrunk about three times when the atlas is
# built, so the line is OUTLINE_PX of the source: about three pixels in the atlas.
import math
import os
import sys

import numpy as np
from PIL import Image, ImageFilter, PngImagePlugin

INK = (0x1A, 0x12, 0x0D)  # --ac-ink
OUTLINE_PX = 11.0 # the line's width in the 1024-wide source
WOBBLE_PX = 2.2  # how far the line strays from a true offset curve
WOBBLE_CELL = 26  # the size of one wobble, in source pixels
MARKER = "armada-outline"


def wobble(shape, seed):
    """Smooth noise in [-1, 1] of one wobble per WOBBLE_CELL, the same for the same seed."""
    rng = np.random.default_rng(seed)
    rows, cols = shape[0] // WOBBLE_CELL + 3, shape[1] // WOBBLE_CELL + 3
    coarse = Image.fromarray((rng.random((rows, cols)) * 255).astype(np.uint8))
    big = coarse.resize((cols * WOBBLE_CELL, rows * WOBBLE_CELL), Image.BICUBIC)
    return np.asarray(big, dtype=np.float32)[: shape[0], : shape[1]] / 127.5 - 1.0


def outline(image, seed=7):
    """`image` (RGBA) with the ink line drawn around its opaque part.

    The shape is blurred and cut at the level a straight edge has at OUTLINE_PX from it; moving
    the level with smooth noise makes the line wander WOBBLE_PX either way, like the kit's
    `#ac-wobble` filter.
    """
    rgba = image.convert("RGBA")
    solid = np.asarray(rgba.getchannel("A")) > 8
    sigma = OUTLINE_PX * 0.55
    soft = Image.fromarray((solid * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(sigma))
    field = np.asarray(soft, dtype=np.float32) / 255.0
    # The blurred value of a straight edge at distance d outside the shape is erfc(d / s√2) / 2.
    noise = wobble(field.shape, seed)
    steps = np.linspace(-1.0, 1.0, 65)
    levels = np.array([0.5 * math.erfc((OUTLINE_PX + WOBBLE_PX * n) / (sigma * math.sqrt(2))) for n in steps])
    level = np.interp(noise, steps, levels)
    inked = field > level
    ink = Image.new("RGBA", rgba.size, INK + (0,))
    edge = Image.fromarray((inked * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    ink.putalpha(edge)
    return Image.alpha_composite(ink, rgba)


def outline_file(path):
    """Outlines the PNG at `path` in place; False when it already was."""
    image = Image.open(path)
    if image.info.get(MARKER):
        return False
    text = PngImagePlugin.PngInfo()
    text.add_text(MARKER, "1")
    outline(image).save(path, pnginfo=text, optimize=True)
    return True


def main(names):
    here = os.path.dirname(os.path.abspath(__file__))
    folder = os.path.join(here, "..", "..", "..", "lib", "assets", "items")
    names = names or sorted(f[:-4] for f in os.listdir(folder) if f.endswith(".png"))
    for name in names:
        path = os.path.join(folder, name + ".png")
        print(f"{name}: {'outlined' if outline_file(path) else 'already outlined'}")


if __name__ == "__main__":
    main(sys.argv[1:])
