# hospital.py — two-storey neighborhood hospital with a rooftop red-cross sign.
#   python3 hospital.py → hospital.svg
from iso_lib import *

a = Asset(tiles=(1, 1, 2))
HU, HV, TOP = a.envelope(.92, .92, 1.0)

WALL = "#eee8d9"
ROOF = "#9aa6a5"
CROSS = "#d94b45"
DOOR = tint(WOOD, .78)

PLINTH = 28
a.voxel(0, 0, 0, HU, HV, PLINTH / 2, STONE, r=12)
a.flat(-10, 18, PLINTH, HU - 34, HV - 38, 38, STONE, face="left", zshade=PLINTH)
g = VoxelGrid(a, u=100, gap=7)


def storey(half, z0, z1):
    q = half / 2
    for x in (-q, q):
        for y in (-q, q):
            g.place(x, y, z0, q - 4, q - 4, (z1 - z0) / 2, WALL)


def windows(half, z, size=34):
    for side in (-1, 1):
        g.place(half - 10, side * half / 2, z, 12, size, size, GLASS, r=9)
        g.place(side * half / 2, half - 10, z, size, 12, size, GLASS, r=9)


storey(210, PLINTH + 5, 290)
g.place(0, 0, 294, 222, 222, 22, STONE, r=10)
storey(218, 320, 578)
g.place(0, 0, 584, HU - 12, HV - 12, 30, ROOF, r=14)

# Entrance, windows, and the red cross together form the hospital's single accent.
g.place(198, 0, PLINTH + 5, 12, 42, 84, DOOR, r=10)
windows(210, 150)
windows(218, 430)
# A raised white sign gives the red cross a high-contrast face above the roof.
g.place(0, 0, 598, 42, 42, (TOP - 598) / 2, WALL, r=14)
g.place(38, 0, 610, 9, 12, 36, CROSS, r=8)
g.place(38, 0, 628, 9, 30, 8, CROSS, r=7)
g.draw()

print("ok hospital.svg top sy =", round(a.save("hospital.svg"), 1))
