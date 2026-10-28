# apartments.py — voxel clay apartment block, two tiles long, three blocks tall (ceiling 1023).
# Coral brick-tone walls in three storeys, concrete floor bands, a flat roof with a parapet
# (a pocket) and a water tank on the back of the roof.
#   python3 apartments.py      → apartments_2x1.svg (long along +x)
#   python3 apartments.py y    → apartments_1x2.svg (long along +y)
# Local coordinates (a.local): u along the building, v across it; +u and +v are the visible sides.
import sys
from iso_lib import *

AXIS = sys.argv[1] if len(sys.argv) > 1 else "x"
a = Asset(tiles=(2, 1, 3) if AXIS == "x" else (1, 2, 3))
HU, HV, TOP = a.envelope(1.0, 1.0, 1.0)        # 510, 254, 1023
MX, MY = a.mid

WALL = "#e7a07a"     # coral (accent)
CONC = "#d3d2cc"     # concrete bands and roof
ROOF = "#6f7d8c"     # slate roof slab and parapet (recolourable)
TANK = "#b7c3cc"     # light grey tank
DOOR = tint(WOOD, .8)


def part(g, u, v, z0, hu, hv, hz, color, r=None, **kw):
    cx, cy, hx, hy = a.local(u, v, hu, hv)
    g.place(cx, cy, z0, hx, hy, hz, color, r=r, **kw)


# 1. concrete plinth over the whole footprint + cast shadow on it
PLINTH = 30
cx, cy, hx, hy = a.local(0, 0, HU, HV)
a.voxel(cx, cy, 0, hx, hy, PLINTH / 2, STONE, r=12)
cx, cy, hx, hy = a.local(-10, 0, HU - 34, HV - 34)
a.flat(cx - 12, cy + 22, PLINTH, hx, hy, 40, STONE, face="left", zshade=PLINTH)

g = VoxelGrid(a, u=100)

LU, LV = 476, 218                    # outer half-sizes of the walls
QU, QV = LU / 2, LV / 2
S = [(PLINTH + 4, 270), (304, 520), (554, 770)]

# 2. three storeys of 2 (long) x 2 (across) wall blocks, split by concrete bands
for n, (z0, z1) in enumerate(S):
    for su in (-1, 1):
        for sv in (-1, 1):
            part(g, su * QU, sv * QV, z0, QU - 3, QV - 3, (z1 - z0) / 2, WALL)
    if n < 2:
        part(g, 0, 0, z1 + 4, LU + 14, LV + 14, (S[n + 1][0] - z1 - 8) / 2, CONC, r=12)

# 3. flat roof: slate slab with a parapet carved as a pocket
ROOF_Z0 = S[2][1] + 4
ROOF_H = 90
part(g, 0, 0, ROOF_Z0, LU + 20, LV + 20, ROOF_H / 2, ROOF, r=20,
     pocket=dict(rim=34, depth=56, floor=tint(ROOF, .82)))

# 4. door on the short visible end (+u), windows along the long visible face (+v) and the end
part(g, LU - 10, QV, S[0][0], 12, 46, 84, DOOR, r=10)
part(g, LU - 10, -QV, 110, 12, 40, 40, GLASS, r=10)
for n, (z0, z1) in enumerate(S):
    zc = (z0 + z1) / 2 if n else 150
    for su in (-1, 1):
        part(g, su * QU, LV - 10, zc - 40, 150, 12, 40, GLASS, r=10)     # long window strips
    if n:
        for sv in (-1, 1):
            part(g, LU - 10, sv * QV, zc - 40, 12, 40, 40, GLASS, r=10)

g.draw()

# 5. water tank standing on the roof floor, at the back corner; drawn last, nothing is in front
t = VoxelGrid(a, u=100)
FLOOR_Z = ROOF_Z0 + ROOF_H - 56
part(t, -LU + 150, -LV + 110, FLOOR_Z, 74, 70, (TOP - FLOOR_Z) / 2, TANK, r=30)
t.draw()

name = "apartments_2x1.svg" if AXIS == "x" else "apartments_1x2.svg"
print("ok", name, "top sy =", round(a.save(name), 1))
