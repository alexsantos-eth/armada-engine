# pier.py — voxel clay wooden pier, three tiles long (grass + two sand blocks, or over the water).
# The deck starts at grass level on the land tile and runs over the two sand tiles, which
# are half a block lower (sand top at z = -171 in entity space), resting on pairs of posts.
# The water end has two bollards and a small lamp post (accent).
#   python3 pier.py <axis> <land> [water] [reflection]
#     axis: x → asset 1x3 (engine lengthAxis "x"), y → asset 3x1 (engine lengthAxis "y")
#     land: front → the land tile is the anchor (nearest the viewer); back → farthest
#     water: the pier over the water (block_*_over_water.svg): a shorter deck of one plank per
#       tile from the land tile out, and the posts of the water tiles down to the water top,
#       one block under the grass (z = -341)
#     reflection: the same pier mirrored about the water top (z = -341), as the water shows it,
#       on the same canvas grown downward: the game draws it in the water under the pier
#       (EntityDefinition.reflectionSource) instead of flipping the sprite
# Local coordinates (a.local): u along the pier, +u is the end nearest the viewer.
import sys
from iso_lib import *

AXIS = sys.argv[1] if len(sys.argv) > 1 else "x"
LAND = sys.argv[2] if len(sys.argv) > 2 else "front"
WATER = "water" in sys.argv[3:]
REFLECTION = "reflection" in sys.argv[3:]
SAND_DROP = 171                       # sand block top below the grass top
WATER_Z = -H                          # water top: one block under the grass top
LAMP_TOP = 316                        # highest point of the pier (the lamp)
below = (2 * -WATER_Z + LAMP_TOP + 8) if REFLECTION else (-WATER_Z + 8 if WATER else SAND_DROP + 8)
a = Asset(tiles=(1, 3) if AXIS == "x" else (3, 1), below=below)
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

# No cast shadow: the game draws a dynamic shadow that follows the sun.


def part(u, v, z0, hu, hv, hz, color, r=None):
    if REFLECTION:
        z0 = 2 * WATER_Z - (z0 + 2 * hz)   # mirrored about the water top
    cx, cy, hx, hy = a.local(u, v, hu, hv)
    g.place(cx, cy, z0, hx, hy, hz, color, r=r)


# 2. posts under the deck over both sand tiles (z-separated from the deck); over the water, the
#    posts of the far tile reach the water top
for u in (0, water_u - S * 40, water_u + S * 200):
    foot = WATER_Z if WATER and u != 0 else -SAND_DROP
    for v in (-DECK_HV + 30, DECK_HV - 30):
        part(u, v, foot, 22, 22, (-foot + DECK_Z0 - 4) / 2, POST, r=10)

# 3. deck: planks along the pier, separated by thin seams. Over the water, one plank per tile
#    from a little into the land tile out to the water end; otherwise four over the whole length.
if WATER:
    DECK_FROM, DECK_TO, PLANKS = S * 376, -S * (HU - 20), 3
else:
    DECK_FROM, DECK_TO, PLANKS = -HU + 20, HU - 20, 4
SEG = (DECK_TO - DECK_FROM) / PLANKS
for n in range(PLANKS):
    u0 = DECK_FROM + n * SEG
    part(u0 + SEG / 2, 0, DECK_Z0, abs(SEG) / 2 - 4, DECK_HV, DECK_T / 2, PLANK, r=12)

# 4. water end: two bollards and a lamp post
END_U = -S * (HU - 60)
for v in (-DECK_HV + 34, DECK_HV - 34):
    part(END_U, v, DECK_Z0 + DECK_T + 4, 22, 22, 26, POST, r=12)
part(END_U + S * 120, -DECK_HV + 30, DECK_Z0 + DECK_T + 4, 12, 12, 110, LAMP_POST, r=6)
part(END_U + S * 120, -DECK_HV + 30, DECK_Z0 + DECK_T + 228, 26, 26, 22, LAMP, r=12)

g.draw()

name = f"pier_{'1x3' if AXIS == 'x' else '3x1'}_{LAND}{'_water' if WATER else ''}{'_reflection' if REFLECTION else ''}.svg"
print("ok", name, "top sy =", round(a.save(name), 1))
