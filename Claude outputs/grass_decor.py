# grass_decor.py — variants of the grass block with small things on its top: flowers, sprouts,
# fallen leaves. The block itself is the original grass block (public/assets/grass/block.svg),
# untouched: the script appends the decoration voxels to its figure, so every variant matches it.
#   python3 grass_decor.py <grass block.svg> <output dir>
#   → block_flowers.svg, block_flowers_2.svg, block_sprouts.svg, block_leaves.svg
# Decorations stay low (≤ ~50 above the top) and inside the flat top (|x|, |y| ≤ 200), so the
# block keeps its silhouette and the ground shadow drawn over the top still covers them.
import os
import re
import sys
from iso_lib import *

BASE_SVG = sys.argv[1] if len(sys.argv) > 1 else "block.svg"
OUT_DIR = sys.argv[2] if len(sys.argv) > 2 else "."
TOP = H                               # the grass slab ends at the ceiling (z = 341)
LEAF = "#6fb81e"                      # a darker green than the grass, so leaves read on it

# (x, y) spots on the top, spread so no two clumps hide each other
SPOTS = [(-120, -110), (90, -140), (-150, 70), (40, 20), (140, 110), (-40, 150)]


def flowers(petal, spots):
    """Clumps of flowers: a low leaf voxel with a flower voxel on top (one accent colour)."""
    def build(g):
        for x, y in spots:
            g.place(x, y, TOP, 34, 34, 9, LEAF, r=13)
            g.place(x, y, TOP + 22, 21, 21, 14, petal, r=9)
    return build


def sprouts(g):
    """Tufts of taller grass: a few slim, darker green voxels standing up."""
    for x, y in [(-130, -90), (100, -130), (-120, 110), (50, 40), (150, 90)]:
        g.place(x, y, TOP, 16, 16, 26, LEAF, r=7)
        g.place(x + 30, y + 6, TOP, 13, 13, 18, LEAF, r=6)
        g.place(x + 4, y + 30, TOP, 12, 12, 15, LEAF, r=6)


def leaves(g):
    """Fallen autumn leaves: thin, flat voxels lying on the top."""
    for (x, y), color in zip(
        [(-140, -100), (60, -150), (-160, 80), (10, 0), (150, 60), (-30, 160), (110, 170)],
        ["#e39b2f", "#c9622c", "#e8b23a", "#c9622c", "#e39b2f", "#e8b23a", "#c9622c"],
    ):
        g.place(x, y, TOP, 30, 22, 4, color, r=4)


VARIANTS = {
    "block_flowers.svg": flowers("#ffd23f", SPOTS[:5]),                     # yellow
    "block_flowers_2.svg": flowers("#f7a8c9", [SPOTS[i] for i in (0, 2, 3, 4, 5)]),   # pink
    "block_sprouts.svg": sprouts,
    "block_leaves.svg": leaves,
}

base = open(BASE_SVG).read()
for name, build in VARIANTS.items():
    a = Asset()
    g = VoxelGrid(a, u=100)
    build(g)
    g.draw()
    a.check_bounds()
    decor = "\n    ".join(a.out)
    svg = re.sub(r"(\s*)</g>\s*</svg>\s*$", lambda m: f"\n    {decor}\n  </g>\n</svg>\n", base)
    assert svg != base
    open(os.path.join(OUT_DIR, name), "w").write(svg)
    print("ok", name)
