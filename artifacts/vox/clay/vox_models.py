#!/usr/bin/env python3
# vox_models.py — the game's nature entities assembled from the voxel pieces of vox_prefabs.py.
#
#   python3 vox_models.py                → ../models/<name>.vox for every model
#   python3 vox_models.py --render       → …and each one rendered onto its asset with vox_render.py
#   python3 vox_models.py --render tree_3 bush     only those
#
# Rendering needs Blender: the `blender` on the PATH, or the `bpy` pip module in this Python.
# A model fills the whole volume of its footprint (128 voxels per tile, 85 per block of
# height), the anchor tile's foot at (0, 0, 0): x runs down-right on screen, y down-left.
# Positions below are in voxels. Leaf blocks sit on the 28-voxel module.
import os
import shutil
import subprocess
import sys

from vox_prefabs import MODULE, moved, piece, tile_volume, turned, write

M = MODULE
RING = [(-1, -1), (0, -1), (1, -1), (-1, 0), (0, 0), (1, 0), (-1, 1), (0, 1)]   # 3x3 without the front cell
FULL = RING + [(1, 1)]
PLUS = [(0, 0), (-1, 0), (1, 0), (0, -1), (0, 1)]
QUAD = [(-.5, -.5), (.5, -.5), (-.5, .5), (.5, .5)]                            # 2x2


def put(name, x, y, z, variant="", turn=False):
    boxes = piece(name, variant)
    return moved(turned(boxes) if turn else boxes, x, y, z)


def layer(cells, x, y, z, variant="green", name="leaf_block", cell=M):
    """Leaf pieces on the cells of one layer, around (x, y)."""
    return [b for i, j in cells for b in put(name, x + i * cell, y + j * cell, z, variant)]


def trunk(x, y, pieces, variant="brown", name="trunk"):
    return [b for k in range(pieces) for b in put(name, x, y, k * M, variant)]


def fruits(spots):
    return [b for x, y, z in spots for b in put("fruit", x, y, z)]


def fruit_tree():
    """tree: a tall trunk and a dome (3x3 without the front block, a plus, one block), with fruit."""
    c = -6                                              # the crown sits toward the back
    return (trunk(0, 0, 3) + layer(RING, c, c, 84) + layer(PLUS, c, c, 112) + layer([(0, 0)], c, c, 140)
            + fruits([(35, 1, 94), (-11, 35, 101), (2, 35, 89), (7, 23, 126)]))


def leafy():
    """tree_2: a short trunk under a big round crown, three layers and a cap."""
    c = -5
    return (trunk(0, 0, 2) + layer(RING, c, c, 56) + layer(FULL, c, c, 84) + layer(PLUS, c, c, 112)
            + put("leaf_cap", c, c, 140, "green"))


def pine():
    """tree_3: a dark cone stepping in tier by tier down to a single block at the top."""
    c = -5
    return (trunk(0, 0, 2) + layer(RING, c, c, 40, "dark") + layer(PLUS, c, c, 68, "dark")
            + layer(QUAD, c, c, 96, "dark") + layer(QUAD, c, c, 124, "dark", "leaf_block_small", 22)
            + put("leaf_block", c, c, 144, "dark"))


def acacia():
    """tree_4: a bare trunk up to a wide flat canopy, and a side branch with a low pad."""
    c, cell = -6, 38
    return (trunk(c, c, 5) + layer(RING, c, c, 142, name="leaf_slab", cell=cell)
            + layer(PLUS, c, c, 155, name="leaf_slab", cell=cell)
            + put("branch", c + 20, c, 59, "brown") + put("trunk_thin", c + 30, c, 59, "brown")
            + layer(QUAD, c + 30, c, 82, name="leaf_tuft", cell=21))


def poplar():
    """tree_5: a slim column on a long trunk: three layers, a slimmer one and a cap."""
    c = -3
    return (trunk(c, c, 2) + layer(QUAD[:3], c, c, 42) + layer(QUAD, c, c, 70) + layer(QUAD, c, c, 98)
            + layer(QUAD, c, c, 126, name="leaf_block_small", cell=22) + put("leaf_cap", c, c, 146, "green"))


def fork():
    """tree_6: a short trunk in front that forks toward the back into a big high crown and a
    small low one, fruit in both."""
    tx, ty = 15, 15
    bx, by = tx - 30, ty                                # the big crown, over the branch toward −x
    sx, sy = tx, ty - 30                                # the small one, over the branch toward −y
    return (trunk(tx, ty, 2)
            + put("branch", tx - 17, ty, 50, "brown") + put("trunk_thin", bx, by, 50, "brown")
            + put("trunk_thin", bx, by, 78, "brown")
            + put("branch", tx, ty - 17, 45, "brown", turn=True) + put("trunk_thin", sx, sy, 45, "brown")
            + layer(QUAD, bx, by, 90) + layer(QUAD, bx, by, 118) + put("leaf_cap", bx, by, 146, "green")
            + layer(QUAD, sx, sy, 73, name="leaf_block_small", cell=22) + put("leaf_block_small", sx, sy, 95, "green")
            + fruits([(bx + 27, by + 6, 98), (bx - 8, by + 27, 126), (sx + 21, sy + 4, 80)]))


def birch():
    """tree_8: a white trunk, an autumn crown, a side branch with its own clump and red leaves."""
    c = -6
    return (trunk(-2, -2, 3, "birch") + layer(RING, c, c, 84, "autumn") + layer(PLUS, c, c, 112, "autumn")
            + put("leaf_cap", c, c, 140, "autumn")
            + put("branch", 15, -2, 50, "birch") + put("leaf_block", 38, -4, 42, "autumn")
            + fruits([(35, -3, 100), (-10, 35, 95), (15, 7, 121), (51, -3, 52)]))


def cypress():
    """tree_7: a narrow column: a short trunk, four layers of 2x2 (the lowest without its
    front block, so the trunk shows) and a cap at the ceiling."""
    c, foot = -2, 34
    out = trunk(c, c, 2) + layer(QUAD[:3], c, c, foot)
    for k in (1, 2, 3):
        out += layer(QUAD, c, c, foot + k * M)
    return out + put("leaf_cap", c, c, foot + 4 * M, "green")


def bush():
    """bush: no trunk, a low mound of leaf blocks with berries."""
    c = -4
    return (layer(RING, c, c, 0) + layer(PLUS, c, c, 28)
            + fruits([(c + 41, c + 4, 10), (c - 24, c + 41, 8), (c + 13, c + 30, 40)]))


def grove(axis):
    """grove: an oak, a dark fir and a sapling over a fallen log, a stump, two bushes, two rocks
    and toadstools, two tiles long along `axis`. Written once along (u, v) from the middle of
    the footprint and laid out for either orientation, never mirrored."""
    def at(u, v):
        return (64 + u, v) if axis == "x" else (v, 64 + u)

    def lay(name, u, v, z, variant="", long=False):
        return put(name, *at(u, v), z, variant, turn=long and axis == "y")

    oak, fir, sap, log = at(-49, -10), at(36, 18), at(94, -22), (-6, 45)
    out = trunk(*oak, 3) + layer(RING, *oak, 86) + layer(QUAD, *oak, 114) + put("leaf_cap", *oak, 142, "green")
    out += trunk(*fir, 2) + layer(RING, *fir, 62, "dark") + layer(PLUS, *fir, 90, "dark")
    out += put("leaf_cap", *fir, 118, "dark")
    out += trunk(*sap, 2, name="trunk_thin") + layer(QUAD, *sap, 55, name="leaf_block_small", cell=22)
    out += put("leaf_block", *sap, 77, "green")
    out += lay("log", *log, 0, long=True) + lay("stump", -75, 48, 0)
    out += lay("leaf_block_small", 76, 40, 0, "green") + lay("leaf_tuft", -99, 35, 0, "dark")
    out += lay("rock_l", -2, -49, 0, long=True) + lay("rock_s", 45, -42, 0, long=True)
    out += lay("mushroom", log[0] - 14, log[1] + 9, 0) + lay("mushroom", log[0] - 24, log[1] - 9, 0)
    return out + fruits([(oak[0] + 41, oak[1] + 5, 94), (oak[0] - 6, oak[1] + 41, 100),
                         (fir[0] + 41, fir[1] + 3, 72), (sap[0] + 21, sap[1] + 8, 62)])


# name → (builder, tiles, the asset its render replaces, under lib/assets)
MODELS = {
    "tree": (fruit_tree, (1, 1, 2), "tree/block.png"),
    "tree_2": (leafy, (1, 1, 2), "tree/block_2.png"),
    "tree_3": (pine, (1, 1, 2), "tree/block_3.png"),
    "tree_4": (acacia, (1, 1, 2), "tree/block_4.png"),
    "tree_5": (poplar, (1, 1, 2), "tree/block_5.png"),
    "tree_6": (fork, (1, 1, 2), "tree/block_6.png"),
    "tree_7": (cypress, (1, 1, 2), "tree/block_7.png"),
    "tree_8": (birch, (1, 1, 2), "tree/block_8.png"),
    "bush": (bush, (1, 1, 1), "bush/block.png"),
    "grove_2x1": (lambda: grove("x"), (2, 1, 2), "tree/block_grove_2x1.png"),
    "grove_1x2": (lambda: grove("y"), (1, 2, 2), "tree/block_grove_1x2.png"),
}


def render(model, sprite):
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vox_render.py")
    blender = shutil.which("blender")
    command = [blender, "-b", "-P", script, "--", model, sprite] if blender else [sys.executable, script, model, sprite]
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL)
    print("  rendered", os.path.relpath(sprite))


def main():
    args = sys.argv[1:]
    rendering = "--render" in args
    names = [a for a in args if a != "--render"] or list(MODELS)
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, "..", "models")
    assets = os.path.join(here, "..", "..", "..", "lib", "assets")
    os.makedirs(out, exist_ok=True)
    for name in names:
        build, tiles, asset = MODELS[name]
        path = os.path.join(out, name + ".vox")
        write(path, build(), bounds=tile_volume(tiles))
        if rendering:
            render(path, os.path.join(assets, asset))


if __name__ == "__main__":
    main()
