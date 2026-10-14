# pier.py — voxel clay wooden pier, three tiles long (grass + two sand blocks).
# The deck starts at grass level on the land tile and runs over the two sand tiles, which
# are half a block lower (sand top at z = -171 in entity space), resting on pairs of posts.
# The water end has two bollards and a small lamp post (accent).
#   python3 pier.py <axis> <land>
#     axis: x → asset 1x3 (engine lengthAxis "x"), y → asset 3x1 (engine lengthAxis "y")
#     land: front → the land tile is the anchor (nearest the viewer); back → farthest
# Local coordinates (a.local): u along the pier, +u is the end nearest the viewer.
import sys
from iso_lib import *

AXIS = sys.argv[1] if len(sys.argv) > 1 else "x"
LAND = sys.argv[2] if len(sys.argv) > 2 else "front"
SAND_DROP = 171                       # sand block top below the grass top
a = Asset(tiles=(1, 3) if AXIS == "x" else (3, 1), below=SAND_DROP + 8)
HU, HV, _ = a.envelope(1.0, 1.0, 1.0)  # 766, 254

PLANK = "#b98a55"                     # light deck wood
POST = tint(WOOD, .85)                # darker posts
LAMP_POST = "#5c5f6a"

S = 1 if LAND == "front" else -1      # u sign of the land end
TILE_U = 512                          # one tile along u
land_u = S * TILE_U                   # centre of the land tile
water_u = -S * TILE_U                 # centre of the far sand tile

DECK_HV = 150
DECK_Z0, DECK_T = 4, 36               # deck just above the grass top

g = VoxelGrid(a, u=100)

# 1. translucent shadow of the deck on the sand, toward the lower left
cx, cy, hx, hy = a.local(-S * 240, 0, 500, DECK_HV - 10)
a.flat(cx - 10, cy + 26, -SAND_DROP, hx, hy, 40, "#1e2a10", alpha=.2)


def part(u, v, z0, hu, hv, hz, color, r=None):
    cx, cy, hx, hy = a.local(u, v, hu, hv)
    g.place(cx, cy, z0, hx, hy, hz, color, r=r)


# 2. posts under the deck over both sand tiles (z-separated from the deck)
for u in (0, water_u - S * 40, water_u + S * 200):
    for v in (-DECK_HV + 30, DECK_HV - 30):
        part(u, v, -SAND_DROP, 22, 22, (SAND_DROP + DECK_Z0 - 4) / 2, POST, r=10)

# 3. deck: four planks along the pier, separated by thin seams
SEG = (2 * HU - 40) / 4
start = -HU + 20
for n in range(4):
    u0 = start + n * SEG
    part(u0 + SEG / 2, 0, DECK_Z0, SEG / 2 - 4, DECK_HV, DECK_T / 2, PLANK, r=12)

# 4. water end: two bollards and a lamp post
END_U = -S * (HU - 60)
for v in (-DECK_HV + 34, DECK_HV - 34):
    part(END_U, v, DECK_Z0 + DECK_T + 4, 22, 22, 26, POST, r=12)
part(END_U + S * 120, -DECK_HV + 30, DECK_Z0 + DECK_T + 4, 12, 12, 110, LAMP_POST, r=6)
part(END_U + S * 120, -DECK_HV + 30, DECK_Z0 + DECK_T + 228, 26, 26, 22, LAMP, r=12)

g.draw()

name = f"pier_{'1x3' if AXIS == 'x' else '3x1'}_{LAND}.svg"
print("ok", name, "top sy =", round(a.save(name), 1))
