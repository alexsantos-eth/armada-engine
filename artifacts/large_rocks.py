# large_rocks.py — three single-tile boulder silhouettes for the game.
# Run from artifacts/: python3 large_rocks.py ../public/assets/rock
import os
import sys
from iso_lib import *

OUT_DIR = sys.argv[1] if len(sys.argv) > 1 else "../public/assets/rock"
os.makedirs(OUT_DIR, exist_ok=True)


def save(name, build):
    asset = Asset()
    grid = VoxelGrid(asset, u=100)
    build(grid)
    grid.draw()
    asset.save(os.path.join(OUT_DIR, name))
    print("ok", name)


def round_boulder(g):
    # Wide, low footing with two offset, progressively smaller ledges.
    g.place(8, 12, 0, 130, 108, 34, "#747c81", r=14, rp=(50, 86, 62, 103))
    g.place(-23, -17, 70, 96, 83, 32, "#92999e", r=13, rp=(40, 74, 57, 82))
    g.place(-49, -37, 136, 58, 53, 29, "#b2b7ba", r=12, rp=(30, 48, 43, 52))
    g.place(-164, 54, 0, 24, 28, 20, "#666e73", r=8)


def split_cluster(g):
    # Two rounded stones of unequal size, with only a shallow crown on the larger one.
    g.place(-40, 0, 0, 95, 80, 40, "#858d92", r=16, rp=(58, 80, 45, 72))
    g.place(-53, -7, 82, 65, 56, 24, "#b0b6b9", r=10, rp=(30, 48, 38, 50))
    g.place(120, -35, 0, 58, 48, 32, "#737b80", r=13, rp=(28, 44, 36, 46))


def shallow_boulder(g):
    # A broad rounded body with one low, nearly centered crown and a single gentle ledge.
    g.place(8, 12, 0, 128, 106, 44, "#7c8489", r=19, rp=(68, 88, 76, 98))
    g.place(-5, 0, 90, 91, 82, 34, "#a5acb0", r=15, rp=(54, 72, 62, 78))


save("block.svg", round_boulder)
save("block_2.svg", split_cluster)
save("block_3.svg", shallow_boulder)
