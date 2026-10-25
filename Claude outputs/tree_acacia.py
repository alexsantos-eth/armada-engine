# tree_acacia.py — voxel clay acacia (umbrella tree), 1x1 footprint, two blocks tall.
# A tall trunk is the feature: it rises to a wide, thin canopy at the ceiling
# (3x3 minus the front cell, a plus on top) and sends one side branch toward +x
# that carries a second, smaller flat pad halfway up. No fruit.
#   python3 tree_acacia.py → tree_acacia.svg  (public/assets/tree/block_4.svg)
from iso_lib import *

a = Asset(tiles=(1, 1, 2))
TOP = a.ceiling                       # 682

# No cast shadow: the game draws a dynamic shadow that follows the sun.

U, UZ = 148, 50
BASE = TOP - 2 * UZ                   # top canopy from z = 582 up to the ceiling
g = VoxelGrid(a, u=U, uz=UZ, base=BASE, gap=6, r=18, offset=(-24, -24))

# 1. tall trunk into the top canopy, and a branch toward +x (down-right)
g.place(-24, -24, 0, 28, 28, (BASE + 24) / 2, WOOD, r=13)
g.place(36, -24, 236, 46, 16, 16, WOOD, r=10)                 # branch arm off the trunk
g.place(96, -24, 236, 16, 16, 40, WOOD, r=10)                 # branch rising to the pad

# 2. second, smaller flat pad on the branch end
for i, j in [(0, 0), (1, 0), (0, -1), (1, -1)]:
    g.place(54 + i * 84, 18 + j * 84, 320, 39, 39, 22, FOLIAGE, r=16)

# 3. top canopy: wide and thin, 3x3 minus the front cell, a plus on top
for i, j in [(-1, -1), (0, -1), (1, -1), (-1, 0), (0, 0), (1, 0), (-1, 1), (0, 1)]:
    g.add(i, j, 0, FOLIAGE)
for i, j in [(0, 0), (-1, 0), (0, -1), (1, 0), (0, 1)]:
    g.add(i, j, 1, FOLIAGE)

g.draw()
print("ok tree_acacia.svg top sy =", round(a.save("tree_acacia.svg"), 1))
