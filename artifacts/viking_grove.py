# viking_grove.py — a small grove: three trees in one multi-block entity, two blocks tall.
# One entity instead of three single-tile trees, so the wood reads as a clump and not as a
# grid: every trunk sits at an intermediate position inside the footprint (never on a tile
# centre), the three trees differ in species and height, and a log, two bushes and a mossy
# rock fill the gaps between them.
# Written in local coordinates (a.local): u along the long axis, v across it, so both
# orientations come out of the same code.
#   python3 viking_grove.py [out_dir] [layout]   layout: 2x1 (default) | 1x2 | 2x2
import os
import sys

from iso_lib import *

PINE = "#5fa83c"                      # the darker conifer
ROCK = "#9a9a96"                      # the village stone, not the lighter iso_lib STONE
BARK = "#7a5a3a"                      # fallen log, a shade darker than WOOD

TILES = {"2x1": (2, 1, 2), "1x2": (1, 2, 2), "2x2": (2, 2, 2)}

# Trunks and props in (u, v), deliberately off the tile centres. The two-tile strip and the
# square have their own table because the room across the entity is not the same.
STRIP = dict(oak=(-196, -40), fir=(144, 70), sap=(376, -90),
             log=(-26, 180), bush_a=(304, 160), bush_b=(-396, 140),
             rock=(-6, -200), rock_b=(180, -170), stump=(-300, 196))
SQUARE = dict(oak=(-136, 304), fir=(-126, -216), sap=(364, 74),
              log=(164, 304), bush_a=(364, -196), bush_b=(-376, 184),
              rock=(444, 264), rock_b=(120, -60), stump=(-20, 230))

LAYOUT = sys.argv[2] if len(sys.argv) > 2 else "2x1"
POS = SQUARE if LAYOUT == "2x2" else STRIP
a = Asset(tiles=TILES[LAYOUT])
TOP = a.ceiling                       # 682


def part(g, u, v, z0, hu, hv, hz, color, r=None):
    cx, cy, hx, hy = a.local(u, v, hu, hv)
    g.place(cx, cy, z0, hx, hy, hz, color, r=r)


# No cast shadows: the game bakes the shadows, so the asset must not carry its own.

g = VoxelGrid(a, u=100)               # one shared painter order for the whole grove


def crown(key, cell, uz, base, steps, color, r):
    """One tree crown: `steps` are (i, j, k) offsets of `cell`/`uz` around the trunk."""
    u, v = POS[key]
    h = cell / 2 - 3
    for i, j, k in steps:
        part(g, u + i * cell, v + j * cell, base + k * uz, h, h, uz / 2 - 3, color, r=r)


def tip(key, z0, half, top, color, r):
    """The rounded top voxel of a tree, ending exactly at `top`."""
    part(g, *POS[key], z0, half, half, (top - z0) / 2, color, r=r)


RING = [(-1, -1), (0, -1), (1, -1), (-1, 0), (0, 0), (1, 0), (-1, 1), (0, 1)]   # 3x3, no front cell
QUAD = [(-.5, -.5), (.5, -.5), (-.5, .5), (.5, .5)]                            # 2x2
PLUS = [(0, 0), (-1, 0), (1, 0), (0, -1), (0, 1)]                              # a plus

# 2. the oak: a long visible trunk, a wide crown layer, a 2x2 over it, a tip at the ceiling
OAK_C = 118 if LAYOUT == "2x2" else 108
part(g, *POS["oak"], 0, 31, 31, 205, WOOD, r=15)
crown("oak", OAK_C, 112, 388, [(i, j, 0) for i, j in RING], FOLIAGE, 26)
crown("oak", OAK_C, 112, 388, [(i, j, 1) for i, j in QUAD], FOLIAGE, 26)
tip("oak", 616, 74, TOP, FOLIAGE, 29)

# 3. the fir: a darker cone, its tiers stepping in (3x3, a plus, a tip) on a shorter trunk
FIR_C = 104 if LAYOUT == "2x2" else 96
part(g, *POS["fir"], 0, 26, 26, 168, WOOD, r=13)
crown("fir", FIR_C, 100, 300, [(i, j, 0) for i, j in RING], PINE, 23)
crown("fir", FIR_C, 100, 300, [(i, j, 1) for i, j in PLUS], PINE, 23)
tip("fir", 504, 58, 610, PINE, 24)

# 4. the sapling: half the height, so the two big crowns stay visible behind it
part(g, *POS["sap"], 0, 21, 21, 118, WOOD, r=11)
crown("sap", 88, 88, 220, [(i, j, 0) for i, j in QUAD], FOLIAGE, 21)
tip("sap", 312, 64, 452, FOLIAGE, 24)

# 5. the forest floor between the trunks: a fallen log, a cut stump, two bushes and two rocks
part(g, *POS["log"], 0, 92, 27, 24, BARK, r=20)              # log lying along the long axis
part(g, POS["log"][0] + 80, POS["log"][1], 48, 20, 16, 9, MOSS, r=8)
part(g, *POS["stump"], 0, 32, 32, 26, BARK, r=14)            # a cut stump beside it
part(g, *POS["stump"], 52, 26, 26, 5, WOOD, r=11)            # its pale sawn top
part(g, *POS["bush_a"], 0, 58, 58, 39, FOLIAGE, r=25)
part(g, *POS["bush_b"], 0, 52, 52, 34, PINE, r=23)
part(g, *POS["rock"], 0, 56, 44, 30, ROCK, r=22)
part(g, *POS["rock"], 60, 42, 32, 8, MOSS, r=14)
part(g, *POS["rock_b"], 0, 38, 30, 20, ROCK, r=16)           # a smaller stone half sunk

# 6. accent: a few red berries pressed into the front faces of the crowns
for key, du, dv, z in (("oak", 130, 22, 470), ("oak", -24, 138, 428),
                       ("fir", 138, 13, 356), ("sap", 58, 53, 300)):
    part(g, POS[key][0] + du, POS[key][1] + dv, z, 14, 14, 14, FRUIT, r=10)
for du, dv in ((-56, 34), (-30, -30)):                       # toadstools at the foot of the log
    part(g, POS["log"][0] + du, POS["log"][1] + dv, 0, 11, 11, 13, FRUIT, r=9)

g.draw()
out = sys.argv[1] if len(sys.argv) > 1 else "."
path = os.path.join(out, f"tree_block_grove_{LAYOUT}.svg")
print("ok", path, "top sy =", round(a.save(path), 1))
