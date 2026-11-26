#!/usr/bin/env python3
"""Builds the square icons of the items and the tools the UI kit shows, with their ink outline.

The sources are the BARE clay renders of artifacts/vox/icons/<id>.png (artifacts/vox/clay/vox_icons.py:
an item is the voxel piece the game drops for it, a tool its leaned model; each one drawn small in
the middle of a 1024 x 853 canvas). This script crops the icon, fits it to a transparent square and
draws the ink line around it, the same way for every icon, so an item and a tool always carry the
very same outline and changing the line never means rendering anything again:

    OUTLINE  the line's width, in pixels of a SIZE x SIZE icon (the kit's `--ac-line` is 4)
    WOBBLE   how far it strays from a true offset curve (the kit's `#ac-wobble` filter)

The icons are committed (web/ui/items/<id>.png) so build-web.sh stays free of Python; run this
again whenever an icon source or the outline changes, then `node lib/scripts/export-ui.cjs`.

Run from anywhere: python3 lib/scripts/build-ui-icons.py [wood stone_pickaxe …]   (needs Pillow, numpy)
"""

import math
import sys
import zlib
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

SIZE = 128
INK = (0x1A, 0x12, 0x0D)  # --ac-ink
OUTLINE = 4.5
WOBBLE = 0.9
WOBBLE_CELL = 11
SUPER = 2  # the line is drawn at SUPER x SIZE and shrunk, to keep its edge smooth
MARGIN = round(OUTLINE + WOBBLE) + 3  # transparent border kept clear for the line

lib = Path(__file__).resolve().parent.parent
source = lib.parent / "artifacts" / "vox" / "icons"
target = lib / "web" / "ui" / "items"


def wobble(shape, cell, seed):
    """Smooth noise in [-1, 1] of one wobble per `cell` pixels, the same for the same seed."""
    rng = np.random.default_rng(seed)
    rows, cols = shape[0] // cell + 3, shape[1] // cell + 3
    coarse = Image.fromarray((rng.random((rows, cols)) * 255).astype(np.uint8))
    big = coarse.resize((cols * cell, rows * cell), Image.BICUBIC)
    return np.asarray(big, dtype=np.float32)[: shape[0], : shape[1]] / 127.5 - 1.0


def outline(image, width, wander, cell, seed):
    """`image` (RGBA) with an ink line `width` px wide drawn around its opaque part.

    The shape is blurred and cut at the level a straight edge has at `width` from it; moving the
    level with smooth noise makes the line wander `wander` px either way.
    """
    rgba = image.convert("RGBA")
    solid = np.asarray(rgba.getchannel("A")) > 8
    sigma = width * 0.55
    soft = Image.fromarray((solid * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(sigma))
    field = np.asarray(soft, dtype=np.float32) / 255.0
    # The blurred value of a straight edge at distance d outside the shape is erfc(d / s√2) / 2.
    noise = wobble(field.shape, cell, seed)
    steps = np.linspace(-1.0, 1.0, 65)
    levels = np.array([0.5 * math.erfc((width + wander * n) / (sigma * math.sqrt(2))) for n in steps])
    inked = field > np.interp(noise, steps, levels)
    ink = Image.new("RGBA", rgba.size, INK + (0,))
    ink.putalpha(Image.fromarray((inked * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8 * width / 11)))
    return Image.alpha_composite(ink, rgba)


def icon(path):
    """The inked SIZE x SIZE icon of one bare render."""
    image = Image.open(path).convert("RGBA")
    box = image.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    item = image.crop(box)
    inner = (SIZE - 2 * MARGIN) * SUPER
    scale = inner / max(item.size)
    item = item.resize((max(1, round(item.width * scale)), max(1, round(item.height * scale))), Image.LANCZOS)
    square = Image.new("RGBA", (SIZE * SUPER, SIZE * SUPER), (0, 0, 0, 0))
    square.paste(item, ((square.width - item.width) // 2, (square.height - item.height) // 2))
    seed = zlib.crc32(path.stem.encode())
    inked = outline(square, OUTLINE * SUPER, WOBBLE * SUPER, WOBBLE_CELL * SUPER, seed)
    return inked.resize((SIZE, SIZE), Image.LANCZOS)


def main(names):
    target.mkdir(parents=True, exist_ok=True)
    paths = [source / f"{n}.png" for n in names] or sorted(source.glob("*.png"))
    for path in paths:
        icon(path).save(target / path.name, optimize=True)
        print(f"{path.name} -> {SIZE}px")


if __name__ == "__main__":
    main(sys.argv[1:])
