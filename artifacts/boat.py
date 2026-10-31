# boat.py — voxel clay rowboat, 2x1, no water of its own (public/assets/boat/block_2.svg).
# Proportions follow the user's reference image: ~68 % of the length, ~85 % of the width, ~55 % high.
# One orange clay piece with a rounded bow toward the back (upper left) and a flat stern toward the
# viewer, a hollow carved into its top with a thick rim, a darker floor and one bench across.
#   python3 boat.py              → boat.svg
#   python3 boat.py reflection   → boat_reflection.svg: the hull mirrored about the water top (z = 0,
#     where the boat floats), as the water shows it, on the same canvas grown downward. The game
#     draws it in the water under the boat (EntityDefinition.reflectionSource). From below the
#     hollow and the bench don't show: only the hull.
import sys
from iso_lib import *

REFLECTION = "reflection" in sys.argv[1:]
a = Asset(tiles=(2, 1))
HU, HV, TOP = a.envelope(.68, .85, .55)       # → 347, 216, 188
MX, MY = a.mid
if REFLECTION:
    a = Asset(tiles=(2, 1), below=TOP + 8)

BOAT = "#ea8549"                  # orange clay, the only material
INSIDE = tint(BOAT, .74)          # floor of the hollow, clearly darker (reads as depth)

BOW_R, STERN_R = 190, 64          # plan radii: rounded bow (−x corners), almost square stern (+x)
RIM, DEPTH = 46, 116              # wall thickness around the hollow, depth of the hollow

g = VoxelGrid(a, u=100)
HULL_RP = (STERN_R, BOW_R, BOW_R, STERN_R)    # QUADS order: +x+y, −x+y, −x−y, +x−y

if REFLECTION:
    # The hull upside down under the water top.
    g.place(MX, MY, -TOP, HU, HV, TOP / 2, BOAT, r=38, rp=HULL_RP)
else:
    # No cast shadow: the game draws a dynamic shadow that follows the sun.
    # 1. bench across the hollow, standing on its floor (cut to the opening when drawn)
    FLOOR_Z = TOP - DEPTH
    bench = (MX + 50, MY, FLOOR_Z, 66, HV - RIM, (TOP - 30 - FLOOR_Z) / 2, BOAT, 18)
    # 2. the hull: one rounded clay voxel, with the hollow carved into its top
    g.place(MX, MY, 0, HU, HV, TOP / 2, BOAT, r=38, rp=HULL_RP,
            pocket=dict(rim=RIM, depth=DEPTH, floor=INSIDE, inside=[bench]))

g.draw()

name = "boat_reflection.svg" if REFLECTION else "boat.svg"
print("ok", name, "top sy =", round(a.save(name), 1))
