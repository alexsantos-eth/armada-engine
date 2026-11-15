# grass_clutter.py — additional top-of-grass appearances, generated from the base grass SVG.
# Run from artifacts/: python3 grass_clutter.py ../web/public/assets/grass/block.svg ../web/public/assets/grass
# Writes the individual SVGs used as the terrain's grass tops.
# The terrain remains one grass block; only its top decoration changes, so no entities,
# collision, extra footprints or per-instance shadows are added.
import os
import re
import sys
from iso_lib import *

BASE_SVG = sys.argv[1] if len(sys.argv) > 1 else "../web/public/assets/grass/block.svg"
OUT_DIR = sys.argv[2] if len(sys.argv) > 2 else "../web/public/assets/grass"
TOP = H
LEAF = "#6fb81e"
SPOTS = [(-120, -110), (90, -140), (-150, 70), (40, 20), (140, 110), (-40, 150)]


def flowers(petal, spots):
    def build(g):
        for x, y in spots:
            # A leafy base supports a short stem and a raised, five-lobed flower head.
            g.place(x - 8, y + 3, TOP, 25, 20, 8, LEAF, r=9)
            g.place(x + 12, y - 4, TOP, 19, 18, 7, tint(LEAF, 1.12), r=8)
            g.place(x, y, TOP + 15, 6, 6, 20, tint(LEAF, 0.88), r=4)
            for dx, dy in [(-13, 0), (13, 0), (0, -13), (0, 13), (0, 0)]:
                g.place(x + dx, y + dy, TOP + 42, 11, 10, 9, petal, r=8)
            g.place(x, y, TOP + 53, 6, 6, 6, "#f4bd43", r=5)

    return build


def pebbles(g):
    for x, y, hx, hy, hz, color in [
        (-110, -42, 26, 20, 10, "#92989c"),
        (-30, 34, 34, 24, 12, "#a8adb0"),
        (80, -34, 22, 18, 9, "#777f84"),
        (142, 105, 20, 17, 8, "#b7bbbd"),
    ]:
        g.place(x, y, TOP, hx, hy, hz, color, r=hz * 0.75)


def mushrooms(g):
    for x, y, scale in [(-84, -30, 1), (55, 52, 0.8)]:
        g.place(x, y, TOP, 7 * scale, 7 * scale, 17 * scale, "#eee8d8", r=5 * scale)
        g.place(x, y, TOP + 16 * scale, 20 * scale, 17 * scale, 10 * scale, "#b5473a", r=8 * scale)
        g.place(x - 7 * scale, y, TOP + 25 * scale, 3 * scale, 3 * scale, 2 * scale, "#fff2dc", r=2 * scale)


def bushes(g):
    for x, y in [(-92, -32), (8, 30), (100, -48)]:
        g.place(x - 22, y + 2, TOP, 24, 21, 13, "#527a1f", r=10)
        g.place(x + 12, y - 3, TOP, 24, 22, 16, "#6b9829", r=12)
        g.place(x + 39, y + 5, TOP, 19, 18, 11, "#47721c", r=9)


def sprouts(g):
    for x, y in [(-130, -90), (100, -130), (-120, 110), (50, 40), (150, 90)]:
        g.place(x, y, TOP, 16, 16, 26, LEAF, r=7)
        g.place(x + 30, y + 6, TOP, 13, 13, 18, LEAF, r=6)
        g.place(x + 4, y + 30, TOP, 12, 12, 15, LEAF, r=6)


def leaves(g):
    for (x, y), color in zip(
        [(-140, -100), (60, -150), (-160, 80), (10, 0), (150, 60), (-30, 160), (110, 170)],
        ["#e39b2f", "#c9622c", "#e8b23a", "#c9622c", "#e39b2f", "#e8b23a", "#c9622c"],
    ):
        g.place(x, y, TOP, 30, 22, 4, color, r=4)


VARIANTS = {
    "block_flowers.svg": flowers("#ffd23f", SPOTS[:3]),
    "block_flowers_2.svg": flowers("#f7a8c9", [SPOTS[i] for i in (0, 2, 4)]),
    "block_wildflowers_red.svg": flowers("#e35b4f", [SPOTS[i] for i in (0, 2, 4)]),
    "block_wildflowers_white.svg": flowers("#fff0d8", [SPOTS[i] for i in (0, 1, 5)]),
    "block_sprouts.svg": sprouts,
    "block_leaves.svg": leaves,
    "block_pebbles.svg": pebbles,
    "block_mushrooms.svg": mushrooms,
    "block_bushes.svg": bushes,
}

with open(BASE_SVG, encoding="utf8") as base_file:
    base = base_file.read()

os.makedirs(OUT_DIR, exist_ok=True)
for name, build in VARIANTS.items():
    asset = Asset()
    grid = VoxelGrid(asset, u=100)
    build(grid)
    grid.draw()
    asset.check_bounds()
    decor = "\n    ".join(asset.out)
    svg = re.sub(r"(\s*)</g>\s*</svg>\s*$", lambda match: f"\n    {decor}\n  </g>\n</svg>\n", base)
    assert svg != base
    with open(os.path.join(OUT_DIR, name), "w", encoding="utf8") as output_file:
        output_file.write(svg)
    print("ok", name)
