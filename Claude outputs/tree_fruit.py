# tree_fruit.py — voxel clay fruit tree, 1x1 footprint, two blocks tall (ceiling z = 682).
# The original round fruit tree raised to two blocks: a tall trunk and a broad, dome-shaped
# crown (3x3 minus the front cell, 3x3 minus the corners, a rounded top at the ceiling).
# Accent: red fruit pressed into the front faces of the crown.
#   python3 tree_fruit.py → tree_fruit.svg  (public/assets/tree/block.svg)
from iso_lib import *

a = Asset(tiles=(1, 1, 2))
TOP = a.ceiling                       # 682

# No cast shadow: the game draws a dynamic shadow that follows the sun.

U, UZ = 112, 120
BASE = TOP - 3 * UZ                   # crown from z = 322 up to the ceiling
g = VoxelGrid(a, u=U, uz=UZ, base=BASE, gap=6, r=24, offset=(-22, -22))

# 1. trunk from the floor into the crown (the crown's empty front cell keeps it visible)
g.place(0, 0, 0, 30, 30, (BASE + 50) / 2, WOOD, r=14)

# 2. crown: 3x3 minus the front cell, a plus, a rounded top voxel touching the ceiling
for i, j in [(-1, -1), (0, -1), (1, -1), (-1, 0), (0, 0), (1, 0), (-1, 1), (0, 1)]:
    g.add(i, j, 0, FOLIAGE)
for i, j in [(0, 0), (-1, 0), (0, -1), (1, 0), (0, 1)]:
    g.add(i, j, 1, FOLIAGE)
g.add(0, 0, 2, FOLIAGE, scale=.9, dz=UZ * .05)

# 3. accent: fruit pressed into the front faces of the crown
for cx, cy, z in [(146, 4, BASE + 40), (-44, 146, BASE + 70), (8, 146, BASE + 20), (34, 92, BASE + 170)]:
    g.place(cx, cy, z, 14, 14, 14, FRUIT, r=10)

g.draw()
print("ok tree_fruit.svg top sy =", round(a.save("tree_fruit.svg"), 1))
