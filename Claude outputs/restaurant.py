# restaurant.py — warm neighborhood restaurant with a clay awning and chimney.
#   python3 restaurant.py → restaurant.svg
from iso_lib import *

a = Asset(tiles=(1, 1))
HU, HV, TOP = a.envelope(.92, .92, 1.0)

WALL = "#f0d8ae"
ROOF = "#c75d43"
AWNING = "#df744a"
DOOR = tint(WOOD, .78)

PLINTH = 24
a.voxel(0, 0, 0, HU, HV, PLINTH / 2, STONE, r=11)
a.flat(-10, 16, PLINTH, HU - 32, HV - 36, 34, STONE, face="left", zshade=PLINTH)
g = VoxelGrid(a, u=100, gap=7)

HALF, WALL_TOP = 210, 224
q = HALF / 2
for x in (-q, q):
    for y in (-q, q):
        g.place(x, y, PLINTH + 4, q - 4, q - 4, (WALL_TOP - PLINTH - 4) / 2, WALL)

# Deep canopy over the dining-room windows and a gable roof to the ceiling.
g.place(176, 0, 226, 38, 224, 24, AWNING, r=15)
EAVES, RIDGE = HV - 8, 300
for side in (-1, 1):
    g.place(0, side * EAVES / 2, 232, EAVES, EAVES / 2 - 3, (RIDGE - 236) / 2, ROOF)
g.place(0, 0, RIDGE, 184, 76, (TOP - RIDGE) / 2, ROOF, r=18)

g.place(HALF - 10, HALF / 2, PLINTH + 4, 12, 40, 78, DOOR, r=9)
for side in (-1, 1):
    g.place(HALF - 10, side * HALF / 2, 128, 12, 34, 36, GLASS, r=9)
    g.place(side * HALF / 2, HALF - 10, 128, 34, 12, 36, GLASS, r=9)

# A single chimney marks the kitchen without adding text or fine detail.
g.place(-126, -130, 288, 38, 38, (TOP - 288) / 2, STONE, r=15)
g.draw()

print("ok restaurant.svg top sy =", round(a.save("restaurant.svg"), 1))
