# house_balcony.py — voxel clay house, 1x1 footprint, two blocks tall (ceiling z = 682).
# Peach plaster walls, slate-blue gable roof (ridge along y), and a wooden balcony on the
# right face of the upper storey, sheltered by the roof overhang.
#   python3 house_balcony.py  → house_balcony.svg
from iso_lib import *

a = Asset(tiles=(1, 1, 2))
HU, HV, TOP = a.envelope(1.0, 1.0, 1.0)        # 254, 254, 682

WALL = "#f3c6a5"     # peach plaster
ROOF = "#4f78b0"     # slate blue (accent)
DOOR = tint(WOOD, .8)

# 1. stone plinth over the whole footprint + cast shadow on it
PLINTH = 30
a.voxel(0, 0, 0, HU, HV, PLINTH / 2, STONE, r=12)
a.flat(-12, 22, PLINTH, HU - 30, HV - 34, 40, STONE, face="left", zshade=PLINTH)

g = VoxelGrid(a, u=100)


def walls(xa, xb, ya, yb, z0, z1):
    """One storey: 2x2 plaster blocks filling [xa, xb] x [ya, yb]."""
    hx, hy = (xb - xa) / 4, (yb - ya) / 4
    for cx in (xa + hx, xb - hx):
        for cy in (ya + hy, yb - hy):
            g.place(cx, cy, z0, hx - 3, hy - 3, (z1 - z0) / 2, WALL)


# 2. ground floor
F1, F1_Z0, F1_TOP = 214, PLINTH + 4, 290
walls(-F1, F1, -F1, F1, F1_Z0, F1_TOP)

# 3. wooden floor band; it reaches further toward +x to become the balcony floor
BAND_Z0, BAND_TOP = F1_TOP + 4, 326
g.place(10, 0, BAND_Z0, 236, 230, (BAND_TOP - BAND_Z0) / 2, WOOD)

# 4. upper floor, set back on +x to leave room for the balcony
F2_XB, F2_Z0, F2_TOP = 120, BAND_TOP + 4, 566
walls(-F1, F2_XB, -F1, F1, F2_Z0, F2_TOP)

# 5. balcony railing: one long wooden rail along the edge, plus two posts at the ends
RAIL_X = 226
g.place(RAIL_X, 0, BAND_TOP + 50, 10, 214, 14, WOOD, r=8)
for cy in (-204, 0, 204):
    g.place(RAIL_X, cy, BAND_TOP + 4, 10, 10, 37, WOOD, r=7)

# 6. gable roof with its ridge along y, covering only the upper storey (the balcony stays open)
EAVES_Z0, RIDGE_Z0 = F2_TOP + 6, 624
RX0, RX1, EAVE = -248, F2_XB + 34, 248
RQ = (RX1 - RX0) / 4
for cx in (RX0 + RQ, RX1 - RQ):
    g.place(cx, 0, EAVES_Z0, RQ - 3, EAVE, (RIDGE_Z0 - 4 - EAVES_Z0) / 2, ROOF)
g.place((RX0 + RX1) / 2, 0, RIDGE_Z0, 80, EAVE - 18, (TOP - RIDGE_Z0) / 2, ROOF)

# 7. door (left face, ground floor), windows, and a glass door onto the balcony
g.place(F1 / 2, F1 - 10, F1_Z0, 44, 12, 82, DOOR, r=10)
g.place(-F1 / 2, F1 - 10, 150, 46, 12, 40, GLASS, r=10)
for s in (-1, 1):
    g.place(F1 - 10, s * F1 / 2, 150, 12, 40, 40, GLASS, r=10)          # ground floor, right face
g.place(F2_XB - 10, -F1 / 2, F2_Z0, 12, 46, 88, GLASS, r=10)           # balcony door
g.place(F2_XB - 10, F1 / 2, 410, 12, 40, 44, GLASS, r=10)
for cx in (-128, 34):                                                  # upper floor, left face
    g.place(cx, F1 - 10, 410, 40, 12, 44, GLASS, r=10)

g.draw()
print("ok house_balcony.svg top sy =", round(a.save("house_balcony.svg"), 1))
