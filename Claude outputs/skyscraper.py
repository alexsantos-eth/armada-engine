# skyscraper.py — voxel clay glass skyscraper, 1x1 footprint, six blocks tall (ceiling 2046).
# Stone podium, two set-back glass tiers with white ribbon bands, a gold crown (recolourable)
# and a thin antenna that touches the ceiling.
#   python3 skyscraper.py → skyscraper.svg
from tall_lib import *

a = Asset(tiles=(1, 1, 6))
HU, HV, TOP = a.envelope(1.0, 1.0, 1.0)        # 254, 254, 2046

GLASS_T = "#9fd3e6"   # tower glass
BAND = "#e3e7ea"      # white bands
PODIUM = "#d8cdb9"    # warm stone podium
ROOF = "#c9a43a"      # gold crown (accent, recolourable)
DOOR = tint(WOOD, .8)

g = ground(a, HU, HV)

# 1. podium: two storeys of stone with a glass lobby on top of a stone band
z = ribbon_tier(a, g, 0, 244, 244, PLINTH + 4, 2, 160, GLASS_T, PODIUM, band_h=40, inset=18)
part(a, g, 0, 0, z, 248, 248, 18, PODIUM, r=12)          # podium cap / terrace
z += 40

# 2. main tier and a set-back upper tier
z = ribbon_tier(a, g, 0, 206, 206, z, 7, 146, GLASS_T, BAND)
part(a, g, 0, 0, z, 214, 214, 16, BAND, r=12)            # setback ledge
z += 36
z = ribbon_tier(a, g, 0, 160, 160, z, 3, 140, GLASS_T, BAND)

# 3. gold crown: a wide slab and a smaller cap, then the antenna up to the ceiling
part(a, g, 0, 0, z, 172, 172, 26, ROOF, r=18)
z += 56
part(a, g, 0, 0, z, 110, 110, 24, ROOF, r=18)
z += 52
assert TOP - z > 40, z
part(a, g, 0, 0, z, 14, 14, (TOP - z) / 2, ROOF, r=7)

# 4. entrance on the right face of the podium
part(a, g, 236, 80, PLINTH + 4, 12, 50, 80, DOOR, r=10)

g.draw()
print("ok skyscraper.svg top sy =", round(a.save("skyscraper.svg"), 1))
