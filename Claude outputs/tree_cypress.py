# tree_cypress.py — voxel clay cypress, 1x1 footprint, two blocks tall (ceiling z = 682).
# A narrow column: short trunk, five 2x2 layers of dark blue-green clay (the lowest without
# its front cell so the trunk shows) and one rounded tip at the ceiling. No fruit.
#   python3 tree_cypress.py → tree_cypress.svg
from iso_lib import *

a = Asset(tiles=(1, 1, 2))
TOP = a.ceiling                       # 682
CYPRESS = "#3f8f47"

# 1. translucent cast shadow on the floor, toward the lower left (+y)
a.flat(-10, 30, 0, 120, 120, 70, "#1e2a10", alpha=.22)

U, UZ, BASE = 104, 95, 112            # 2x2 column, 6 layers from z = 112 up to 682
g = VoxelGrid(a, u=U, uz=UZ, base=BASE, gap=6, r=22, offset=(-U / 2 - 8, -U / 2 - 8))

# 2. trunk from the floor into the column
g.place(-8, -8, 0, 28, 28, (BASE + 40) / 2, WOOD, r=12)

# 3. column: lowest layer without its front cell, three full layers, a slimmer fourth one
for i, j in [(0, 0), (1, 0), (0, 1)]:
    g.add(i, j, 0, CYPRESS)
for k in (1, 2, 3):
    for i in (0, 1):
        for j in (0, 1):
            g.add(i, j, k, CYPRESS)
for i in (0, 1):
    for j in (0, 1):
        g.add(i, j, 4, CYPRESS, scale=.86)

# 4. rounded tip touching the ceiling
TIP_Z0 = BASE + 5 * UZ + 4
g.place(-8, -8, TIP_Z0, 62, 62, (TOP - TIP_Z0) / 2, CYPRESS, r=26)

g.draw()
print("ok tree_cypress.svg top sy =", round(a.save("tree_cypress.svg"), 1))
