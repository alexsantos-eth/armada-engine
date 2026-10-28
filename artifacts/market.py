# market.py — compact neighborhood market with one green clay awning.
#   python3 market.py → market.svg
from iso_lib import *

a = Asset(tiles=(1, 1))
HU, HV, TOP = a.envelope(.86, .88, .9)

WALL = "#eadfc8"
ROOF = "#aa8f67"
AWNING = "#678d66"
DOOR = tint(WOOD, .78)

PLINTH = 22
a.voxel(0, 0, 0, HU, HV, PLINTH / 2, STONE, r=10)
a.flat(-8, 15, PLINTH, HU - 32, HV - 34, 32, STONE, face="left", zshade=PLINTH)
g = VoxelGrid(a, u=96, gap=7)

HALF = 198
q = HALF / 2
for x in (-q, q):
    for y in (-q, q):
        g.place(x, y, PLINTH + 4, q - 4, q - 4, 84, WALL)

g.place(168, 0, 194, 42, 214, 24, AWNING, r=14)
EAVES, RIDGE = HV - 10, TOP - 42
for side in (-1, 1):
    g.place(0, side * EAVES / 2, 218, EAVES, EAVES / 2 - 3, (RIDGE - 222) / 2, ROOF)
g.place(0, 0, RIDGE, 176, 72, (TOP - RIDGE) / 2, ROOF, r=18)

g.place(HALF - 10, HALF / 2, PLINTH + 4, 12, 38, 78, DOOR, r=9)
for side in (-1, 1):
    g.place(HALF - 10, side * HALF / 2, 118, 12, 36, 34, GLASS, r=9)
    g.place(side * HALF / 2, HALF - 10, 118, 36, 12, 34, GLASS, r=9)

# Two low timber crates beside the entrance.
g.place(188, 104, PLINTH + 4, 30, 26, 28, WOOD, r=9)
g.place(188, -108, PLINTH + 4, 30, 26, 28, WOOD, r=9)
for side in (-1, 1):
    g.place(210, side * 194, 194, 12, 12, 38, AWNING, r=9)
g.draw()

print("ok market.svg top sy =", round(a.save("market.svg"), 1))
