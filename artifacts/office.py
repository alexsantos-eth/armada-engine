# office.py — voxel clay office block, three tiles long, five blocks tall (ceiling 1705).
# A four-storey glass podium over the whole footprint with a green-copper terrace roof, and a
# five-storey glass tower set back over the rear two tiles, capped by a copper roof and a
# rooftop plant room. Copper is the accent (recolourable).
#   python3 office.py      → office_3x1.svg (long along +x)
#   python3 office.py y    → office_1x3.svg (long along +y)
import sys
from tall_lib import *

AXIS = sys.argv[1] if len(sys.argv) > 1 else "x"
a = Asset(tiles=(3, 1, 5) if AXIS == "x" else (1, 3, 5))
HU, HV, TOP = a.envelope(1.0, 1.0, 1.0)        # 766, 254, 1705

GLASS_O = "#86b8d2"   # blue office glass
BAND = "#eceee9"      # white bands
ROOF = "#4e8f78"      # green copper (accent, recolourable)
PLANT = "#c9ccc6"     # rooftop plant room
DOOR = tint(WOOD, .8)

g = ground(a, HU, HV)

# 1. podium over the whole footprint
z = ribbon_tier(a, g, 0, 742, 236, PLINTH + 4, 4, 168, GLASS_O, BAND)
part(a, g, 0, 0, z, 752, 244, 20, ROOF, r=14)           # copper terrace roof
z += 44

# 2. tower over the rear two tiles (−u side), set back on the visible sides
TU0, TU1 = -742, 230
TUC, THU = (TU0 + TU1) / 2, (TU1 - TU0) / 2
z = ribbon_tier(a, g, TUC, THU, 200, z, 5, 168, GLASS_O, BAND)

# 3. copper roof slab, plant room up to the ceiling
part(a, g, TUC, 0, z, THU + 8, 208, 22, ROOF, r=14)
z += 48
part(a, g, TUC - 120, -40, z, 220, 110, (TOP - z) / 2, PLANT, r=24)

# 4. entrance on the short visible end of the podium
part(a, g, 734, 0, PLINTH + 4 + 38, 12, 70, 70, DOOR, r=10)

g.draw()
name = "office_3x1.svg" if AXIS == "x" else "office_1x3.svg"
print("ok", name, "top sy =", round(a.save(name), 1))
