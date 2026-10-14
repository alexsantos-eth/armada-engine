# tree_birch.py — voxel clay autumn birch, 1x1 footprint, two blocks tall (ceiling z = 682).
# A tall white trunk with one side branch, and a high orange crown (3x3 minus the front
# cell, a plus, a tip at the ceiling) with a small clump on the branch. Accent: a few
# red leaves pressed into the crown.
#   python3 tree_birch.py → tree_birch.svg
from iso_lib import *

a = Asset(tiles=(1, 1, 2))
TOP = a.ceiling                       # 682
BARK = "#f1ece1"                      # near-white birch bark
LEAVES = "#f0a830"                    # autumn orange
RED = "#d9532c"                       # accent leaves

# 1. translucent cast shadow on the floor, toward the lower left (+y)
a.flat(-14, 30, 0, 160, 160, 90, "#1e2a10", alpha=.22)

U, UZ = 112, 116
BASE = TOP - 3 * UZ                   # crown from z = 334 up to the ceiling
g = VoxelGrid(a, u=U, uz=UZ, base=BASE, gap=6, r=24, offset=(-24, -24))

# 2. tall trunk into the crown, and a short branch toward +x carrying a low clump
g.place(-6, -6, 0, 26, 26, (BASE + 40) / 2, BARK, r=12)
g.place(60, -6, 200, 50, 14, 14, BARK, r=10)
g.place(150, -16, 168, 62, 62, 52, LEAVES, r=26)

# 3. crown: 3x3 minus the front cell, a plus on top, a tip to the ceiling
for i, j in [(-1, -1), (0, -1), (1, -1), (-1, 0), (0, 0), (1, 0), (-1, 1), (0, 1)]:
    g.add(i, j, 0, LEAVES)
for i, j in [(0, 0), (-1, 0), (0, -1), (1, 0), (0, 1)]:
    g.add(i, j, 1, LEAVES)
g.add(0, 0, 2, LEAVES, scale=.8, dz=UZ * .1)

# 4. accent: red leaves pressed into the front faces of the crown and the clump
for cx, cy, z in [(140, -10, 400), (-40, 120, 380), (60, 34, 520), (212, -10, 210)]:
    g.place(cx, cy, z, 14, 14, 14, RED, r=10)

g.draw()
print("ok tree_birch.svg top sy =", round(a.save("tree_birch.svg"), 1))
