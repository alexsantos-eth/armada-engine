# house.py — voxel clay one-storey house, 1x1 footprint, one block tall (ceiling z = 341).
# The walls take most of the block (almost the ground floor of the two-storey houses) and a
# low gable roof fills the rest, so the whole house fits in one block.
# Cream plaster walls, terracotta gable roof (ridge along y).
#   python3 house.py  → house.svg
from iso_lib import *

a = Asset(tiles=(1, 1))
HU, HV, TOP = a.envelope(1.0, 1.0, 1.0)        # 254, 254, 341

WALL = "#e4d6b6"     # cream plaster
ROOF = "#d4643f"     # terracotta (recoloured by HOUSE_COLOR_REPLACEMENTS)
DOOR = tint(WOOD, .8)

# 1. stone plinth over the whole footprint + cast shadow on it
PLINTH = 30
a.voxel(0, 0, 0, HU, HV, PLINTH / 2, STONE, r=12)
a.flat(-12, 22, PLINTH, HU - 30, HV - 34, 40, STONE, face="left", zshade=PLINTH)

g = VoxelGrid(a, u=100)

# 2. the storey: 2x2 plaster blocks
F1, F1_Z0, F1_TOP = 214, PLINTH + 4, 258
hx = F1 / 2
for cx in (-hx, hx):
    for cy in (-hx, hx):
        g.place(cx, cy, F1_Z0, hx - 3, hx - 3, (F1_TOP - F1_Z0) / 2, WALL)

# 3. low gable roof with its ridge along y, overhanging the walls, up to the block's ceiling
EAVES_Z0, RIDGE_Z0, ROOF_TOP = F1_TOP + 6, 304, TOP
RX0, RX1, EAVE = -248, 248, 248
RQ = (RX1 - RX0) / 4
for cx in (RX0 + RQ, RX1 - RQ):
    g.place(cx, 0, EAVES_Z0, RQ - 3, EAVE, (RIDGE_Z0 - 4 - EAVES_Z0) / 2, ROOF)
g.place(0, 0, RIDGE_Z0, 80, EAVE - 18, (ROOF_TOP - RIDGE_Z0) / 2, ROOF)

# 4. door (left face) and windows on both visible faces
g.place(F1 / 2, F1 - 10, F1_Z0, 44, 12, 76, DOOR, r=10)
g.place(-F1 / 2, F1 - 10, 140, 46, 12, 38, GLASS, r=10)
for s in (-1, 1):
    g.place(F1 - 10, s * F1 / 2, 140, 12, 40, 38, GLASS, r=10)

g.draw()
print("ok house.svg top sy =", round(a.save("house.svg"), 1))
