# hotel.py — voxel clay hotel, two tiles long, four blocks tall (ceiling 1364).
# Six storeys of warm white masonry split by grey bands, windows on both visible faces,
# an entrance awning and a flat roof with a parapet; roof and awning are terracotta (recolourable).
#   python3 hotel.py      → hotel_2x1.svg (long along +x)
#   python3 hotel.py y    → hotel_1x2.svg (long along +y)
import sys
from tall_lib import *

AXIS = sys.argv[1] if len(sys.argv) > 1 else "x"
a = Asset(tiles=(2, 1, 4) if AXIS == "x" else (1, 2, 4))
HU, HV, TOP = a.envelope(1.0, 1.0, 1.0)        # 510, 254, 1364

WALL = "#f4ece0"      # warm white
BAND = "#8e99a4"      # grey bands
ROOF = "#c4553c"      # terracotta roof and awning (accent, recolourable)
DOOR = tint(WOOD, .8)

g = ground(a, HU, HV)

LU, LV = 476, 220
QU = LU / 2
STOREY, WALL_H = 208, 170
z = PLINTH + 4
for n in range(6):
    for su in (-1, 1):                                         # two long wall blocks per storey
        part(a, g, su * QU, 0, z, QU - 3, LV, WALL_H / 2, WALL)
    zc = z + WALL_H / 2
    if n:                                                      # windows: 4 on the long face, 2 on the end
        for u in (-360, -120, 120, 360):
            part(a, g, u, LV - 10, zc - 36, 50, 12, 36, GLASS, r=10)
        for v in (-110, 110):
            part(a, g, LU - 10, v, zc - 36, 12, 46, 36, GLASS, r=10)
    else:                                                      # ground floor: lobby glass on the long face
        for u in (-300, 0, 300):
            part(a, g, u, LV - 10, z + 30, 90, 12, 50, GLASS, r=10)
    z += WALL_H + 4
    if n < 5:
        part(a, g, 0, 0, z, LU + 14, LV + 14, 15, BAND, r=12)
        z += 34

# entrance on the short visible end, under a terracotta awning
part(a, g, LU - 10, 0, PLINTH + 4, 12, 56, 84, DOOR, r=10)
part(a, g, LU + 16, 0, 214, 16, 110, 12, ROOF, r=10)

# flat roof with a parapet, carved as a pocket
part(a, g, 0, 0, z, LU + 20, LV + 20, (TOP - z) / 2, ROOF, r=20,
     pocket=dict(rim=34, depth=50, floor=tint(ROOF, .82)))

g.draw()
name = "hotel_2x1.svg" if AXIS == "x" else "hotel_1x2.svg"
print("ok", name, "z =", z, "top sy =", round(a.save(name), 1))
