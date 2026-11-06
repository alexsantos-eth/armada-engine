# terrain_blocks.py — the ground blocks, each one filling its whole cell.
#
# Run from artifacts/:  python3 terrain_blocks.py ../public/assets
#
# A terrain block is a prism of exactly one cell: its top is the cell's own diamond and its two
# drawn sides fall straight to the plane of the block below, so two neighbours meet edge to edge
# and a column stacks without a gap. The rounded clay corners that every other asset keeps are
# what used to leave a groove along each edge of a field — a few percent of a tile of bare
# background — and a shadow laid on the cell showed through it as a lattice of light lines. The
# cell edges are still read, but as a darker rim painted inside the top face instead of as a hole.
#
# Heights are in the same units as everywhere else (`iso_lib`): one tile is 1024 across and one
# block of elevation is H = 341 tall, so a block that reaches exactly H stacks on itself.
import os
import sys

from iso_lib import *

OUT_DIR = sys.argv[1] if len(sys.argv) > 1 else "../public/assets"

#: How far the darker rim reaches in from the edge of a top face, in asset units.
#:
#: Two neighbours each contribute one, so the line between them is twice this: at a tile 280 px
#: wide that is about eight pixels, which reads as the groove the clay corners used to leave
#: without being a hole in the ground.
RIM = 14

#: How much darker that rim is than the face it is painted on.
RIM_SHADE = 0.93

SAND_TOP, SAND_BODY = "#f3dc96", "#dcc07a"

#: Each ground material: how far its top stands over the plane of the block below, how thick its
#: top layer is, and the two colours.
#:
#: Sand is a beach: its top sits half a block under its own cell, which is the inset the view and
#: the player's feet both ask about (`preview_top_inset`). Everything else fills its block.
BLOCKS = {
    "grass/block.svg": (H, 96, GRASS, DIRT),
    "ground/block.svg": (H, 0, DIRT, DIRT),
    "sand/block.svg": (round(H / 2), 60, SAND_TOP, SAND_BODY),
}


def prism(a, z0, z1, color, half=TILE // 2, rim=0):
    """One slab of a block: its top face and the two sides that face the camera.

    The sides are drawn first and the top last, so the top's own anti-aliasing seam lands on the
    ground rather than on the wall below it.
    """
    h = half
    a.poly([(-h, h, z1), (h, h, z1), (h, h, z0), (-h, h, z0)], shade(color, "left", z1))
    a.poly([(h, -h, z1), (h, h, z1), (h, h, z0), (h, -h, z0)], shade(color, "right", z1))
    top = shade(color, "top", z1)
    a.poly([(-h, -h, z1), (h, -h, z1), (h, h, z1), (-h, h, z1)], tint(top, RIM_SHADE) if rim else top)
    if rim:
        i = h - rim
        a.poly([(-i, -i, z1), (i, -i, z1), (i, i, z1), (-i, i, z1)], top)


def build(top_z, slab, top_color, body_color):
    """The block: a body in the material's deep colour and a top layer in its surface colour.

    A material whose two colours are the same, or that asks for no layer, is one prism.
    """
    a = Asset()
    floor = top_z - slab if 0 < slab < top_z else 0
    if floor > 0:
        prism(a, 0, floor, body_color)
    prism(a, floor, top_z, top_color, rim=RIM)
    return a


def main():
    for name, (top_z, slab, top_color, body_color) in BLOCKS.items():
        path = os.path.join(OUT_DIR, name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        build(top_z, slab, top_color, body_color).save(path)
        print("ok", path, "top =", top_z)


if __name__ == "__main__":
    main()
