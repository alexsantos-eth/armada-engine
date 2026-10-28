# townhall.py — two-storey civic hall with a copper clock tower.
#   python3 townhall.py → townhall.svg
from iso_lib import *

a = Asset(tiles=(1, 1, 2))
HU, HV, TOP = a.envelope(.94, .92, 1.0)

WALL = "#ddd0b4"
ROOF = "#668a79"
COPPER = "#c18a43"
DOOR = tint(WOOD, .78)

PLINTH = 30
a.voxel(0, 0, 0, HU, HV, PLINTH / 2, STONE, r=12)
a.flat(-10, 18, PLINTH, HU - 32, HV - 38, 38, STONE, face="left", zshade=PLINTH)
g = VoxelGrid(a, u=100, gap=7)


def storey(half, z0, z1):
    q = half / 2
    for x in (-q, q):
        for y in (-q, q):
            g.place(x, y, z0, q - 4, q - 4, (z1 - z0) / 2, WALL)


storey(214, PLINTH + 5, 282)
g.place(0, 0, 286, 224, 224, 22, STONE, r=10)
storey(222, 312, 560)

# A green roof and raised central tower give the town hall its civic silhouette.
g.place(0, 0, 566, HU - 10, HV - 10, 28, ROOF, r=14)
g.place(-10, -10, 594, 116, 116, 68, WALL, r=20)
g.place(-10, -10, 662, 124, 124, 20, ROOF, r=16)

g.place(202, 0, PLINTH + 5, 12, 44, 88, DOOR, r=10)
for side in (-1, 1):
    g.place(214, side * 108, 146, 12, 32, 34, GLASS, r=9)
    g.place(side * 108, 214, 146, 32, 12, 34, GLASS, r=9)
    g.place(222, side * 110, 432, 12, 30, 34, GLASS, r=9)
    g.place(side * 110, 222, 432, 30, 12, 34, GLASS, r=9)
g.place(106, -10, 620, 14, 34, 34, COPPER, r=13)
g.place(118, -10, 620, 3, 4, 22, WOOD, r=3)
g.place(118, -2, 620, 3, 14, 3, WOOD, r=3)
g.draw()

print("ok townhall.svg top sy =", round(a.save("townhall.svg"), 1))
