# grass_clutter.py — additional top-of-grass appearances, generated from the base grass SVG.
# Run from artifacts/: python3 grass_clutter.py ../public/assets/grass/block.svg ../public/assets/grass
# The terrain remains one grass block; only its top decoration changes, so no entities,
# collision, extra footprints or per-instance shadows are added.
import os
import re
import sys
from iso_lib import *

BASE_SVG = sys.argv[1] if len(sys.argv) > 1 else "../public/assets/grass/block.svg"
OUT_DIR = sys.argv[2] if len(sys.argv) > 2 else "../public/assets/grass"
TOP = H
LEAF = "#6fb81e"
SPOTS = [(-120, -110), (90, -140), (-150, 70), (40, 20), (140, 110), (-40, 150)]


def flowers(petal, spots):
    def build(g):
        for x, y in spots:
            g.place(x, y, TOP, 34, 34, 9, LEAF, r=13)
            g.place(x, y, TOP + 22, 21, 21, 14, petal, r=9)

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


VARIANTS = {
    "block_wildflowers_red.svg": flowers("#e35b4f", [SPOTS[i] for i in (0, 2, 3, 4)]),
    "block_wildflowers_white.svg": flowers("#fff0d8", [SPOTS[i] for i in (0, 1, 3, 5)]),
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
