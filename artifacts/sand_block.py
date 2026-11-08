# sand_block.py — terrain block in the same two-layer style as the grass block
# (a body voxel with a top slab), at full block height.
#   python3 sand_block.py sand/block.svg                 → sand block, full height
#   python3 sand_block.py sand/grass_rebuilt.svg grass   → grass rebuild (to validate geometry)
import sys
from iso_lib import *

OUT = sys.argv[1] if len(sys.argv) > 1 else "sand_block.svg"
KIND = sys.argv[2] if len(sys.argv) > 2 else "sand"

TOP_COLOR, BODY_COLOR = (GRASS, DIRT) if KIND == "grass" else ("#f3dc96", "#dcc07a")

a = Asset()
TOP = H            # 341 at full height: the block fills its cell, like every other ground block
SLAB = 96          # top layer thickness, the same the grass block carries
GAP = 6
SLAB_H, BODY_H = 248, 239            # plan half-sizes measured on the grass block
BODY_R, SLAB_R = 44, 30

g = VoxelGrid(a, u=100)
body_top = TOP - SLAB - GAP
g.place(0, 0, 0, BODY_H, BODY_H, body_top / 2, BODY_COLOR, r=min(BODY_R, body_top / 2 * .9))
g.place(0, 0, body_top + GAP, SLAB_H, SLAB_H, SLAB / 2, TOP_COLOR, r=min(SLAB_R, SLAB / 2 * .9))
g.draw()

print("ok", OUT, "top =", TOP, "sy =", round(a.save(OUT), 1))
