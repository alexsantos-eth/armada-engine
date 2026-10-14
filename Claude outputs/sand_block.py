# sand_block.py — terrain block in the same two-layer style as the grass block
# (a body voxel with a top slab), at a fraction of the full block height.
#   python3 sand_block.py 0.5 sand/block_50.svg            → sand block, half height
#   python3 sand_block.py 1.0 sand/grass_rebuilt.svg grass → grass rebuild (to validate geometry)
import sys
from iso_lib import *

FRACTION = float(sys.argv[1]) if len(sys.argv) > 1 else 0.5
OUT = sys.argv[2] if len(sys.argv) > 2 else "sand_block.svg"
KIND = sys.argv[3] if len(sys.argv) > 3 else "sand"

TOP_COLOR, BODY_COLOR = (GRASS, DIRT) if KIND == "grass" else ("#f3dc96", "#dcc07a")

a = Asset()
TOP = round(H * FRACTION)            # 341 at full height
SLAB = round(96 * min(1.0, FRACTION / 0.6))   # top layer thickness (thinner on very low blocks)
GAP = 6
SLAB_H, BODY_H = 248, 239            # plan half-sizes measured on the grass block
BODY_R, SLAB_R = 44, 30

g = VoxelGrid(a, u=100)
body_top = TOP - SLAB - GAP
g.place(0, 0, 0, BODY_H, BODY_H, body_top / 2, BODY_COLOR, r=min(BODY_R, body_top / 2 * .9))
g.place(0, 0, body_top + GAP, SLAB_H, SLAB_H, SLAB / 2, TOP_COLOR, r=min(SLAB_R, SLAB / 2 * .9))
g.draw()

print("ok", OUT, "top =", TOP, "sy =", round(a.save(OUT), 1))
