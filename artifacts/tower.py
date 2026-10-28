# tower.py — voxel clay tower house, 1x1 footprint, three blocks tall (ceiling z = 1023).
# Sand plaster walls in three storeys split by stone bands, and a stepped violet
# hipped roof that ends in a small finial at the ceiling.
#   python3 tower.py  → tower.svg
from iso_lib import *

a = Asset(tiles=(1, 1, 3))
HU, HV, TOP = a.envelope(1.0, 1.0, 1.0)        # 254, 254, 1023

WALL = "#ecd3a2"     # sand plaster
BAND = "#b9b2a6"     # warm stone bands
ROOF = "#7a5aa8"     # violet (accent)
DOOR = tint(WOOD, .8)

# 1. stone plinth + cast shadow on it
PLINTH = 30
a.voxel(0, 0, 0, HU, HV, PLINTH / 2, STONE, r=12)
a.flat(-12, 22, PLINTH, HU - 30, HV - 34, 40, STONE, face="left", zshade=PLINTH)

g = VoxelGrid(a, u=100)


def storey(half, z0, z1):
    q = half / 2
    for i in (-1, 1):
        for j in (-1, 1):
            g.place(i * q, j * q, z0, q - 3, q - 3, (z1 - z0) / 2, WALL)


def band(half, z0, z1):
    g.place(0, 0, z0, half, half, (z1 - z0) / 2, BAND, r=12)


def windows(half, zc, hz=40):
    """One window per wall block on both visible faces."""
    for s in (-1, 1):
        g.place(half - 10, s * half / 2, zc - hz, 12, 38, hz, GLASS, r=10)
        g.place(s * half / 2, half - 10, zc - hz, 38, 12, hz, GLASS, r=10)


# 2. three storeys, each a 2x2 of plaster blocks, separated by stone bands
W = 206
S1 = (PLINTH + 4, 270)
S2 = (304, 520)
S3 = (554, 760)
storey(W, *S1)
band(W + 16, S1[1] + 4, S2[0] - 4)
storey(W, *S2)
band(W + 16, S2[1] + 4, S3[0] - 4)
storey(W, *S3)

# 3. stepped hipped roof: three shrinking violet slabs and a finial up to the ceiling
z = S3[1] + 6
for half, h in ((244, 66), (176, 62), (106, 58)):
    g.place(0, 0, z, half, half, h / 2, ROOF, r=24)
    z += h + 4
g.place(0, 0, z, 34, 34, (TOP - z) / 2, ROOF, r=14)

# 4. door on the right face, windows on every storey
g.place(W - 10, W / 2, S1[0], 12, 44, 82, DOOR, r=10)
g.place(W - 10, -W / 2, 120, 12, 38, 40, GLASS, r=10)
for s in (-1, 1):
    g.place(s * W / 2, W - 10, 120, 38, 12, 40, GLASS, r=10)
windows(W, (S2[0] + S2[1]) / 2)
windows(W, (S3[0] + S3[1]) / 2)

g.draw()
print("ok tower.svg top sy =", round(a.save("tower.svg"), 1))
