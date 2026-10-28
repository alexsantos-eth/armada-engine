# tree_fork.py — voxel clay forked tree with two canopies, 1x1 footprint, two blocks tall.
# A short trunk in front forks into two branches that both run toward the back, so the
# fork stays visible: a big, high canopy toward the left (a 2x2 block, a 2x2 layer and one
# big voxel up to the ceiling) and a small, low canopy toward the right on its branch end.
# Accent: red fruit in both canopies.
#   python3 tree_fork.py → tree_fork.svg  (public/assets/tree/block_6.svg)
from iso_lib import *

a = Asset(tiles=(1, 1, 2))
TOP = a.ceiling                       # 682

# No cast shadow: the game draws a dynamic shadow that follows the sun.

g = VoxelGrid(a, u=100)

# 1. trunk up to the fork
TX, TY, FORK = 60, 60, 200
g.place(TX, TY, 0, 30, 30, (FORK + 30) / 2, WOOD, r=14)

# 2. left branch: an arm toward −x (back-left on screen), then up into the big canopy
g.place(TX - 66, TY, FORK, 52, 17, 17, WOOD, r=10)
g.place(TX - 118, TY, FORK, 19, 19, 100, WOOD, r=10)

# 3. right branch: an arm toward −y (back-right on screen), then up into the small canopy
g.place(TX, TY - 66, FORK - 20, 17, 52, 17, WOOD, r=10)
g.place(TX, TY - 118, FORK - 20, 19, 19, 54, WOOD, r=10)

# 4. big high canopy over the left branch: 2x2 block, 2x2 layer, one big voxel to the ceiling
CU, CZ0, CX, CY = 108, FORK + 196, TX - 118, TY + 4
for k, s in [(0, 1.0), (1, .92)]:
    for i in (-1, 1):
        for j in (-1, 1):
            h = CU / 2 * s - 3
            g.place(CX + i * CU / 2, CY + j * CU / 2, CZ0 + k * CU, h, h, CU / 2 - 3, FOLIAGE, r=24)
TIPZ = CZ0 + 2 * CU + 4
g.place(CX, CY, TIPZ, 78, 78, (TOP - TIPZ) / 2, FOLIAGE, r=30)

# 5. small low canopy on the right branch end: 2x2 and one voxel on top
SU, SZ0, SX, SY = 88, FORK + 92, TX + 6, TY - 124
for i in (-1, 1):
    for j in (-1, 1):
        g.place(SX + i * SU / 2, SY + j * SU / 2, SZ0, SU / 2 - 3, SU / 2 - 3, SU / 2 - 3, FOLIAGE, r=19)
g.place(SX, SY, SZ0 + SU + 4, SU / 2 - 3, SU / 2 - 3, SU / 2 - 3, FOLIAGE, r=19)

# 6. accent: fruit pressed into the front faces of both canopies
for cx, cy, z in [(CX + CU - 2, CY + 20, CZ0 + 60), (CX - 30, CY + CU - 2, CZ0 + 130),
                  (SX + SU - 2, SY + 10, SZ0 + 40)]:
    g.place(cx, cy, z, 14, 14, 14, FRUIT, r=10)

g.draw()
print("ok tree_fork.svg top sy =", round(a.save("tree_fork.svg"), 1))
