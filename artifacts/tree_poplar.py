# tree_poplar.py — voxel clay poplar, 1x1 footprint, two blocks tall (ceiling z = 682).
# A slim, egg-shaped column of bright green clay on a short trunk: a 2x2 column whose
# lowest layer has no front cell (so the trunk shows), wider in the middle, tapering to one
# rounded tip at the ceiling. Lighter and rounder than the dark cypress. No fruit.
#   python3 tree_poplar.py → tree_poplar.svg  (public/assets/tree/block_5.svg)
from iso_lib import *

a = Asset(tiles=(1, 1, 2))
TOP = a.ceiling                       # 682

# No cast shadow: the game draws a dynamic shadow that follows the sun.

U, UZ, BASE = 104, 104, 166           # 2x2 column, 4 layers from z = 166, then the tip
g = VoxelGrid(a, u=U, uz=UZ, base=BASE, gap=6, r=22, offset=(-U / 2 - 10, -U / 2 - 10))

# 1. trunk from the floor into the column
g.place(-10, -10, 0, 26, 26, (BASE + 40) / 2, WOOD, r=12)

# 2. column: the lowest layer without its front cell, two full layers, a slimmer fourth one
for i, j in [(0, 0), (1, 0), (0, 1)]:
    g.add(i, j, 0, FOLIAGE)
for k, s in [(1, 1.0), (2, 1.0), (3, .86)]:
    for i in (0, 1):
        for j in (0, 1):
            g.add(i, j, k, FOLIAGE, scale=s)

# 3. rounded tip touching the ceiling
TIP_Z0 = BASE + 4 * UZ + 4
g.place(-10, -10, TIP_Z0, 60, 60, (TOP - TIP_Z0) / 2, FOLIAGE, r=24)

g.draw()
print("ok tree_poplar.svg top sy =", round(a.save("tree_poplar.svg"), 1))
