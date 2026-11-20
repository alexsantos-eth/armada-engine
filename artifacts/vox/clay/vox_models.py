#!/usr/bin/env python3
# vox_models.py — the game's nature entities assembled from the voxel pieces of vox_prefabs.py.
# (vox_buildings.py assembles the built ones: standing stones, houses and buildings.)
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

from vox_prefabs import MODULE, moved, piece, spun, tile_volume, turned, write

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


def willow():
    """tree_9: a long bare trunk under a wide flat pad; a 2x2 blob sits on the pad and leaf tufts
    hang from its far corners, like weeping branches."""
    c = -6
    out = trunk(0, 0, 5) + layer(RING, c, c, 138, "green", name="leaf_slab", cell=38)
    out += layer(QUAD, c, c, 151, "green", name="leaf_slab", cell=38)
    out += put("leaf_tuft", c - 38, c + 38, 126, "green") + put("leaf_tuft", c + 38, c - 38, 126, "green")
    out += put("leaf_tuft", c - 38, c - 38, 126, "green")
    return out + fruits([(c + 55, c + 6, 141), (c + 6, c + 55, 141)])


def cedar():
    """tree_10: a dark conifer whose flat slab tiers step in toward the top, trunk showing
    between the boughs; a 2x2 of small blocks and one block crown it."""
    c = -5
    out = trunk(0, 0, 2, "brown") + layer(RING, c, c, 56, "dark", name="leaf_slab", cell=38)
    out += layer(PLUS, c, c, 78, "dark", name="leaf_slab", cell=38)
    out += layer([(0, 0)], c, c, 100, "dark", name="leaf_slab", cell=38)
    out += layer(QUAD, c, c, 122, "dark", name="leaf_block_small", cell=22)
    return out + put("leaf_block", c, c, 144, "dark")


def encina():
    """tree_11: a dense dark broadleaf: a low wide slab skirt, then full dark layers closing in
    to a small block at the top."""
    c = -6
    out = trunk(0, 0, 3) + layer(RING, c, c, 80, "dark", name="leaf_slab", cell=38)
    out += layer(FULL, c, c, 93, "dark") + layer(PLUS, c, c, 121, "dark")
    return out + put("leaf_block_small", c, c, 148, "dark")


def cherry():
    """tree_12: a tall bare trunk carrying a blossom crown: ring, full, and a pink cap."""
    c = -6
    out = trunk(0, 0, 3) + layer(RING, c, c, 84, "blossom") + layer(FULL, c, c, 112, "blossom")
    return out + put("leaf_cap", c, c, 140, "blossom")


def golden_poplar():
    """tree_13: the poplar column in autumn gold: three 2x2 layers, a slimmer one and a cap."""
    c = -3
    return (trunk(c, c, 2) + layer(QUAD[:3], c, c, 42, "autumn") + layer(QUAD, c, c, 70, "autumn")
            + layer(QUAD, c, c, 98, "autumn") + layer(QUAD, c, c, 126, "autumn", name="leaf_block_small", cell=22)
            + put("leaf_cap", c, c, 146, "autumn"))


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


def grove_autumn(axis):
    """grove_autumn: a white birch and a big rounded autumn oak over fallen leaves, a stump and
    toadstools, two tiles long along `axis`. Written once along (u, v) from the middle of the
    footprint and laid out for either orientation, never mirrored."""
    def at(u, v):
        return (64 + u, v) if axis == "x" else (v, 64 + u)

    def lay(name, u, v, z, variant="", long=False):
        return put(name, *at(u, v), z, variant, turn=long and axis == "y")

    birch, oak, sap, stump = at(-52, -14), at(30, 14), at(88, -22), at(-82, 46)
    out = trunk(*birch, 3, "birch") + layer(RING, *birch, 84, "autumn") + layer(PLUS, *birch, 112, "autumn")
    out += put("leaf_cap", *birch, 140, "autumn")
    out += trunk(*oak, 2) + layer(RING, *oak, 56, "autumn") + layer(FULL, *oak, 84, "autumn")
    out += layer(PLUS, *oak, 112, "autumn") + put("leaf_cap", *oak, 140, "autumn")
    out += trunk(*sap, 2, name="trunk_thin")
    out += layer(QUAD, *sap, 56, "autumn", name="leaf_block_small", cell=22) + put("leaf_block", *sap, 78, "autumn")
    out += lay("stump", *stump, 0) + lay("fallen_leaf", -6, 42, 0, "ochre") + lay("fallen_leaf", 26, -44, 0, "rust")
    out += lay("fallen_leaf", -88, 26, 0, "ochre") + lay("fallen_leaf", 62, 44, 0, "rust")
    out += lay("mushroom", stump[0] - 12, stump[1] + 7, 0) + lay("mushroom", stump[0] + 10, stump[1] + 12, 0)
    return out + fruits([(oak[0] + 41, oak[1] + 6, 94), (oak[0] - 6, oak[1] - 41, 100),
                         (birch[0] + 41, birch[1] + 4, 92)])


def grove_pine(axis):
    """grove_pine: a tiered fir and a slab-boughed cedar over a fallen log, mushrooms and a
    stone, two tiles long along `axis`. Written once along (u, v) from the middle of the
    footprint and laid out for either orientation, never mirrored."""
    def at(u, v):
        return (64 + u, v) if axis == "x" else (v, 64 + u)

    def lay(name, u, v, z, variant="", long=False):
        return put(name, *at(u, v), z, variant, turn=long and axis == "y")

    fir, cedar, log = at(-56, -20), at(52, 0), (-8, 44)
    out = trunk(*fir, 2) + layer(RING, *fir, 48, "dark") + layer(PLUS, *fir, 76, "dark")
    out += layer(QUAD, *fir, 104, "dark") + layer(QUAD, *fir, 132, "dark", name="leaf_block_small", cell=22)
    out += put("leaf_block", *fir, 144, "dark")
    out += trunk(*cedar, 2, "brown") + layer(RING, *cedar, 56, "dark", name="leaf_slab", cell=38)
    out += layer(PLUS, *cedar, 78, "dark", name="leaf_slab", cell=38)
    out += layer([(0, 0)], *cedar, 100, "dark", name="leaf_slab", cell=38)
    out += layer(QUAD, *cedar, 122, "dark", name="leaf_block_small", cell=22)
    out += put("leaf_block", *cedar, 144, "dark")
    out += lay("log", *log, 0, long=True) + lay("rock_s", 78, -36, 0)
    out += lay("mushroom", log[0] - 16, log[1] + 12, 0) + lay("mushroom", log[0] + 12, log[1] - 10, 0)
    return out


def rock_medium():
    """rock_medium: one big slab boulder, moss on its back."""
    return put("rock_l", 0, -2, 0)


def rock_medium_2():
    """rock_medium_2: a boulder settled among a pebble, a small one and moss."""
    return (put("rock_l", -10, 4, 0) + put("pebble_l", 16, -12, 0)
            + put("pebble_m", 2, -16, 0) + put("moss_patch", 12, 14, 0))


def rock_small():
    """rock_small: one loose dark stone, resting off-centre."""
    return put("rock_s", 3, -4, 0)


def rock_small_2():
    """rock_small_2: a stone with a pale pebble, a small one and a dab of moss for company."""
    return (put("rock_s", -12, -2, 0) + put("pebble_l", 10, -10, 0) + put("moss_patch", 12, 10, 0)
            + put("pebble_s", -4, 16, 0))


def rock_small_3():
    """rock_small_3: a low pile of pebbles scattered over the tile."""
    return (put("pebble_l", -9, 5, 0) + put("pebble_m", 11, -7, 0) + put("pebble_s", 4, 15, 0)
            + put("pebble_s", -15, -13, 0))


# ------------------------------------------------------------------- more forest variants

def oak_wide():
    """tree_14: a broad oak: a short trunk under a wide slab skirt, two fuller layers and a cap."""
    c = -5
    return (trunk(0, 0, 3) + layer(FULL, c, c, 58, name="leaf_slab", cell=38)
            + layer(FULL, c, c, 71, name="leaf_slab", cell=38) + layer(PLUS, c, c, 84)
            + layer(PLUS, c, c, 112) + put("leaf_cap", c, c, 140, "green"))


def sapling():
    """tree_15: a young tree: a thin pole of a trunk and a small crown of small blocks."""
    c = -3
    return (trunk(c, c, 4, name="trunk_thin") + layer(QUAD, c, c, 106, name="leaf_block_small", cell=22)
            + put("leaf_block_small", c, c, 126, "green") + put("leaf_block_small", c, c, 146, "green"))


def spruce_slim():
    """tree_16: a tall slim dark conifer: a long bare pole, then five narrow tiers closing to a point."""
    c = -3
    out = trunk(c, c, 2, name="trunk_thin") + layer(QUAD[:3], c, c, 50, "dark", "leaf_block_small", 22)
    for z in (70, 90, 110):
        out += layer(QUAD, c, c, z, "dark", "leaf_block_small", 22)
    return out + put("leaf_block_small", c, c, 130, "dark") + put("leaf_block_small", c, c, 150, "dark")


def windswept():
    """tree_17: a crown blown toward the back: each layer shifted a half block further."""
    return (trunk(0, 0, 3) + layer(RING, -4, -4, 84) + layer(PLUS, -12, -12, 112)
            + put("leaf_cap", -18, -18, 140, "green") + put("leaf_block", -8, 24, 100, "green")
            + put("leaf_tuft", 20, -22, 92, "green"))


def birch_green():
    """tree_18: a white trunk under a green crown, a side branch with a clump."""
    c = -6
    return (trunk(-2, -2, 3, "birch") + layer(RING, c, c, 84) + layer(PLUS, c, c, 112)
            + put("leaf_cap", c, c, 140, "green")
            + put("branch", 15, -2, 50, "birch") + put("leaf_block", 38, -4, 42, "green"))


def sparse_oak():
    """tree_19: an old thin-crowned tree: the layers have gaps, so the sky and the boughs show."""
    c = -6
    return (trunk(0, 0, 3) + layer([(-1, -1), (0, -1), (0, 0), (-1, 1), (0, 1)], c, c, 84)
            + layer([(0, 0), (0, 1), (-1, 1)], c, c, 112) + put("leaf_cap", c, c, 140, "green")
            + put("branch", 15, 2, 56, "brown") + put("leaf_tuft", 36, 2, 58, "green"))


def maple():
    """tree_20: a round autumn maple: three full layers and a cap, red leaves on the face."""
    c = -5
    return (trunk(0, 0, 2) + layer(RING, c, c, 56, "autumn") + layer(FULL, c, c, 84, "autumn")
            + layer(PLUS, c, c, 112, "autumn") + put("leaf_cap", c, c, 140, "autumn")
            + fruits([(c + 41, c + 4, 94), (c - 4, c + 41, 66)]))


def fir_broad():
    """tree_21: a broad dark fir: a full skirt closing in tier by tier to a single block."""
    c = -5
    return (trunk(0, 0, 2) + layer(RING, c, c, 38, "dark") + layer(FULL, c, c, 66, "dark")
            + layer(PLUS, c, c, 94, "dark") + layer(QUAD, c, c, 122, "dark", "leaf_block_small", 22)
            + put("leaf_block", c, c, 144, "dark"))


def acacia_low():
    """tree_22: a wide umbrella on a long trunk, a leaning branch with a pad on the other side."""
    c, cell = -6, 38
    return (trunk(c, c, 5) + layer(PLUS, c, c, 142, name="leaf_slab", cell=cell)
            + layer([(0, 0)], c, c, 155, name="leaf_slab", cell=cell)
            + put("branch", c - 10, c + 20, 66, "brown", turn=True) + put("trunk_thin", c - 6, c + 30, 66, "brown")
            + layer(QUAD, c - 6, c + 30, 94, name="leaf_tuft", cell=21))


def column_tree():
    """tree_24: a bunch of tall leaf columns standing up from a short trunk, a dome between them."""
    c = -4
    return (trunk(0, 0, 2) + layer(QUAD, c, c, 50, name="leaf_column", cell=20)
            + layer(PLUS, c, c, 86, name="leaf_column", cell=20) + put("leaf_column", c, c, 114, "green")
            + put("leaf_dome", c, c, 150, "green"))


def beam_oak():
    """tree_25: a stout trunk carrying crossed boughs, a block layer and a cap."""
    c = -5
    return (trunk(0, 0, 3, name="trunk_thick")
            + put("leaf_beam", c, c - 14, 84, "green") + put("leaf_beam", c, c + 14, 84, "green")
            + put("leaf_beam", c - 14, c, 100, "green", turn=True) + put("leaf_beam", c + 14, c, 100, "green", turn=True)
            + layer(PLUS, c, c, 116) + put("leaf_cap", c, c, 142, "green"))


def weeping():
    """tree_26: a weeping tree: slab tiers on a trunk, strands hanging round the skirt."""
    c = -6
    out = trunk(0, 0, 4) + layer(RING, c, c, 112, name="leaf_slab", cell=38)
    out += layer(FULL, c, c, 125, name="leaf_slab", cell=38) + layer(PLUS, c, c, 138)
    for i, j in ((-1, -1), (0, -1), (1, -1), (-1, 0), (-1, 1), (0, 1)):
        out += put("leaf_drop", c + i * 38 + (-6 if i < 0 else 6 if i > 0 else 0), c + j * 38, 92, "green")
    return out


def elder_oak():
    """tree_27: a squat old oak: a flared root, a stout trunk and three wide layers under a dome."""
    c = -5
    out = put("trunk_root", 0, 0, 0, "brown") + [b for k in range(2) for b in put("trunk_thick", 0, 0, 10 + k * 28, "brown")]
    return (out + layer(RING, c, c, 66) + layer(FULL, c, c, 94) + layer(PLUS, c, c, 122)
            + put("leaf_dome", c, c, 148, "green") + put("branch_long", 20, 0, 52, "brown"))


def grove_birch(axis):
    """grove_birch: a green birch, a sparse oak and a sapling over a stump, a bush, fallen leaves
    and toadstools, two tiles long along `axis`. Laid out for either orientation, never mirrored."""
    def at(u, v):
        return (64 + u, v) if axis == "x" else (v, 64 + u)

    def lay(name, u, v, z, variant="", long=False):
        return put(name, *at(u, v), z, variant, turn=long and axis == "y")

    birch, oak, sap = at(-74, 10), at(40, -10), at(104, 34)
    out = trunk(*birch, 3, "birch") + layer(RING, *birch, 84) + layer(PLUS, *birch, 112)
    out += put("leaf_cap", *birch, 140, "green")
    out += trunk(*oak, 3) + layer([(-1, -1), (0, -1), (0, 0), (-1, 1), (0, 1)], *oak, 86)
    out += layer([(0, 0), (0, 1), (-1, 1)], *oak, 114) + put("leaf_cap", *oak, 142, "green")
    out += trunk(*sap, 3, name="trunk_thin") + layer(QUAD, *sap, 70, name="leaf_block_small", cell=22)
    out += put("leaf_block_small", *sap, 92, "green")
    out += lay("stump", -20, 46, 0) + lay("fallen_leaf", 50, 40, 0, "ochre") + lay("fallen_leaf", -90, -34, 0, "rust")
    out += lay("mushroom", -30, 40, 0) + lay("mushroom", -12, 52, 0)
    return out + lay("rock_s", 8, 40, 0, long=True)


# ---------------------------------------------------------------------------------- the beach

def crown(x, y, z, variant="green"):
    """A palm crown at the top of its trunk (x, y, z): seven fronds hanging out around a tuft,
    one small block on top. The frond toward the front (+x +y) is left out, like the front
    block of a tree's lowest layer, so the coconuts and the top of the trunk show."""
    out = put("leaf_tuft", x, y, z - 6, variant)
    for q in range(4):
        out += moved(spun(piece("frond", variant), q), x, y, z)
        if q:
            out += moved(spun(piece("frond_diag", variant), q), x, y, z)
    return out + put("leaf_block_small", x, y, z + 4, variant)


def palm_trunk(base, top, segments, bend=2.0):
    """`segments` ringed segments from `base` (x, y) to `top`, the lean growing toward the top
    (bend 1 is straight lines, 2 a palm's curve). Returns the boxes and the top of the trunk."""
    out = []
    for k in range(segments):
        t = (k / max(segments - 1, 1)) ** bend
        x = base[0] + (top[0] - base[0]) * t
        y = base[1] + (top[1] - base[1]) * t
        out += put("palm_trunk", x, y, k * 14)
    return out, segments * 14


def coconuts(x, y, z):
    """Three coconuts hanging under a crown, on its lit and its shaded side."""
    return (put("coconut", x + 11, y + 3, z) + put("coconut", x + 3, y + 11, z - 1)
            + put("coconut", x + 10, y + 10, z - 8))


def palm_tall():
    """palm_tall: three blocks: a long ringed trunk leaning gently back, the crown and coconuts."""
    top = (-8, -8)
    trunk_boxes, h = palm_trunk((2, 2), top, 16)
    return trunk_boxes + crown(*top, h + 4) + coconuts(*top, h - 8)


def palm():
    """palm: the medium palm, two blocks, a straighter trunk under a darker crown."""
    top = (-4, -4)
    trunk_boxes, h = palm_trunk((2, 2), top, 10)
    return trunk_boxes + crown(*top, h + 4, "dark") + coconuts(*top, h - 8)


def palm_bent():
    """palm_bent: two blocks; the trunk bows out toward the sea (up-right on screen), coconuts
    fallen at its foot."""
    top = (-6, -8)
    trunk_boxes, h = palm_trunk((12, 28), top, 10, bend=1.6)
    return (trunk_boxes + crown(*top, h + 4) + coconuts(*top, h - 8)
            + put("coconut", 30, 30, 0) + put("coconut_half", 40, 18, 0))


def coconut_pile():
    """coconuts: a heap of coconuts fallen on the sand, one split open, and two shells."""
    return (put("coconut", -10, -6, 0) + put("coconut", 3, -12, 0) + put("coconut", -4, 7, 0)
            + put("coconut", 9, 2, 0) + put("coconut", -3, -4, 10) + put("coconut_half", 22, 14, 0)
            + put("coconut_half", -22, 22, 0) + put("shell", -26, -22, 0, "pink") + put("shell", 30, -16, 0, "white"))


def driftwood():
    """driftwood: two bleached logs washed up across each other, a rock and a shell."""
    return (put("driftwood", -6, -8, 0) + put("driftwood", 4, 2, 12, turn=True)
            + put("rock_s", -30, 26, 0) + put("shell", 30, 22, 0, "pink"))


def beach_rocks():
    """beach_rocks: a big sand boulder, a grey one behind it, a small stone, pebbles and a crab."""
    return (put("beach_rock", -18, -6, 0, "sand") + put("beach_rock", 28, -30, 0, "grey")
            + put("stone_block", -28, 34, 0, "sand") + put("pebble_l", 36, 14, 0)
            + put("pebble_m", 4, 34, 0) + put("crab", 22, 20, 0))


def palm_grove(axis):
    """palm_grove: a tall palm, a medium one, a young one and a palm bowing out toward the
    front, over coconuts, a bleached log and a rock, two tiles long along `axis`. Written once
    along (u, v) from the middle of the footprint and laid out for either orientation; the
    crowns step down from the back to the front so each one shows."""
    def at(u, v):
        return (64 + u, v) if axis == "x" else (v, 64 + u)

    def lay(name, u, v, z, variant="", long=False):
        return put(name, *at(u, v), z, variant, turn=long and axis == "y")

    def palm_at(base, top, segments, variant, bend=2.0):
        boxes, h = palm_trunk(at(*base), at(*top), segments, bend)
        return boxes + crown(*at(*top), h + 4, variant) + coconuts(*at(*top), h - 8)

    out = palm_at((-66, -4), (-72, -8), 16, "green")                 # the tall one, at the back
    out += palm_at((-4, 6), (-8, 2), 10, "dark")                      # the medium one
    out += palm_at((44, -14), (68, -6), 9, "green", bend=1.6)         # bowing out toward +u
    out += palm_at((14, 10), (14, 8), 6, "dark")                     # a young one in front
    out += lay("driftwood", 20, 36, 0, long=True) + lay("rock_s", 96, 34, 0)
    out += lay("coconut", -20, 18, 0) + lay("coconut", -12, 24, 0) + lay("coconut_half", 84, 14, 0)
    return out + lay("coconut", 4, 40, 12) + lay("shell", -96, 30, 0, "pink")


def palm_young():
    """palm_young: a short young palm, two blocks, a pale crown on a slender straight trunk."""
    top = (-2, -2)
    trunk_boxes, h = palm_trunk((2, 2), top, 8, bend=1.2)
    return trunk_boxes + crown(*top, h + 4, "green")


def palm_lean():
    """palm_lean: a palm leaning hard toward the back, its coconuts bunched under the crown."""
    top = (-8, -6)
    trunk_boxes, h = palm_trunk((16, 14), top, 10, bend=1.5)
    return trunk_boxes + crown(*top, h + 4, "green") + coconuts(*top, h - 8)


def palm_slim():
    """palm_slim: three blocks, a very tall straight slim palm under a dark crown."""
    top = (-2, -2)
    trunk_boxes, h = palm_trunk((2, 2), top, 16, bend=1.3)
    return trunk_boxes + crown(*top, h + 4, "dark") + coconuts(*top, h - 8)


def crown_short(x, y, z, variant="green", rising=False):
    """A dense crown of short fronds (or young, rising ones) around a tuft; the front one left out."""
    name = "frond_up" if rising else "frond_short"
    out = put("leaf_tuft", x, y, z - 6, variant)
    for q in range(4):
        out += moved(spun(piece(name, variant), q), x, y, z)
        if q:
            out += moved(spun(piece(name + "_diag", variant), q), x, y, z)
    return out + put("leaf_block_small", x, y, z + 4, variant)


def palm_fan():
    """palm_fan: a mid palm with a dense crown of short fronds on a straight trunk."""
    top = (-4, -4)
    trunk_boxes, h = palm_trunk((2, 2), top, 10, bend=1.3)
    return trunk_boxes + crown_short(*top, h + 4, "green") + coconuts(*top, h - 8)


def palm_sprout():
    """palm_sprout: a young palm with its fronds still standing up."""
    top = (-2, -2)
    trunk_boxes, h = palm_trunk((2, 2), top, 7, bend=1.2)
    return trunk_boxes + crown_short(*top, h + 4, "green", rising=True)


def palm_cluster():
    """palm_cluster: three young palms in one tile, of different heights."""
    parts = [((-18, 14), (-22, 10), 6, "green"), ((16, -10), (12, -14), 9, "dark"), ((20, 24), (22, 20), 4, "green")]
    out = []
    for base, top, n, v in parts:
        boxes, h = palm_trunk(base, top, n, 1.3)
        out += boxes + crown_short(*top, h + 4, v, rising=True)
    return out


def palm_grove_2(axis):
    """palm_grove_2: a leaning pair at the back, a slim palm, a bowing one at the front and a
    young one, over coconuts, a shell and a rock, two tiles long along `axis`."""
    def at(u, v):
        return (64 + u, v) if axis == "x" else (v, 64 + u)

    def lay(name, u, v, z, variant="", long=False):
        return put(name, *at(u, v), z, variant, turn=long and axis == "y")

    def palm_at(base, top, segments, variant, bend=2.0):
        boxes, h = palm_trunk(at(*base), at(*top), segments, bend)
        return boxes + crown(*at(*top), h + 4, variant) + coconuts(*at(*top), h - 8)

    def palm_sprout_at(u, v, segments):
        boxes, h = palm_trunk(at(u + 2, v + 2), at(u, v), segments, 1.2)
        return boxes + crown_short(*at(u, v), h + 4, "dark", rising=True)

    out = palm_sprout_at(-34, 8, 5)                                    # young ones sit low, clear of the big crowns
    out += palm_sprout_at(36, -8, 4)
    out += palm_at((-68, -2), (-70, -6), 15, "green")                   # the tall slim one, at the back
    out += palm_at((2, 6), (2, 4), 10, "dark")                          # the medium one
    out += palm_at((64, -2), (70, -4), 12, "green", bend=1.5)           # bowing out toward +u
    out += lay("coconut", 22, 38, 0) + lay("coconut_half", 32, 30, 0) + lay("rock_s", -50, 38, 0)
    return out + lay("shell", 8, -40, 0, "white") + lay("driftwood", 92, 36, 0, long=True)


# ------------------------------------------------------------------------ the open field
def mushrooms():
    """mushrooms: three clumps of toadstools and small mushrooms on moss, low enough to walk over."""
    out = put("toadstool", -22, -20, 0, "red") + put("mushroom", -4, -32, 0) + put("mushroom", -36, -4, 0)
    out += put("moss_patch", -20, -2, 0) + put("toadstool", -34, -36, 0, "red")
    out += put("toadstool", 26, -8, 0, "tan") + put("mushroom", 38, 10, 0) + put("mushroom", 16, -26, 0)
    out += put("toadstool", 4, 26, 0, "red") + put("mushroom", -12, 36, 0) + put("mushroom", 18, 38, 0)
    return out + put("fallen_leaf", 34, 34, 0, "ochre") + put("fallen_leaf", -38, 24, 0, "rust")


def tall_grass():
    """tall_grass: a patch of tall grass tufts, green and fresh, with one red wildflower."""
    spots = [(-26, -24, "green"), (4, -32, "light"), (30, -8, "green"), (-32, 10, "light"),
             (-4, 2, "green"), (22, 22, "light"), (-12, 32, "green"), (36, 40, "green")]
    return [b for x, y, v in spots for b in put("grass_tuft", x, y, 0, v)] + put("wildflower", 12, 8, 0, "red")


def tall_grass_2():
    """tall_grass_2: a denser, half-dry meadow patch: straw-coloured tufts among green ones."""
    spots = [(-30, -30, "dry"), (-4, -28, "green"), (24, -26, "dry"), (-28, -4, "green"),
             (0, -2, "dry"), (28, 2, "green"), (-30, 24, "dry"), (-2, 26, "green"), (26, 30, "dry")]
    return ([b for x, y, v in spots for b in put("grass_tuft", x, y, 0, v)]
            + put("wildflower", 14, 14, 0, "white") + put("sprout", -16, 12, 0))


def fallen_log(axis):
    """fallen_log: an old trunk fallen along `axis`, two tiles long: its torn root plate at the
    back end, a broken bough standing up, moss and toadstools on it and grass round it."""
    def at(u, v):
        return (64 + u, v) if axis == "x" else (v, 64 + u)

    def lay(name, u, v, z, variant="", long=False):
        return put(name, *at(u, v), z, variant, turn=long and axis == "y")

    out = lay("log_long", 10, -4, 0, long=True) + lay("root_plate", -72, -4, 0, long=True)
    out += lay("trunk_thin", 44, -4, 19, "brown") + lay("leaf_tuft", 60, -2, 19, "green")
    out += lay("mushroom", -36, -2, 19) + lay("mushroom", -24, 2, 19)
    out += lay("toadstool", -10, 22, 0, "tan") + lay("mushroom", 4, 24, 0)
    out += lay("grass_tuft", 96, 26, 0, "green") + lay("grass_tuft", -104, -34, 0, "dry")
    return out + lay("grass_tuft", 40, 30, 0, "light") + lay("rock_s", -40, 34, 0)


def peat_puddle():
    """peat_puddle: two pools of murky water in wet peat, reeds with cattails at the back."""
    out = put("puddle", -6, -4, 0) + put("puddle", 22, 22, 0)
    for x, y in ((-34, -30), (-24, -36), (-40, -18), (-18, -28), (-30, -8), (8, -36)):
        out += put("reed", x, y, 0)
    return out + put("grass_tuft", -44, 30, 0, "dry") + put("rock_s", 40, -16, 0) + put("moss_patch", 30, -30, 0)


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
    "rock_small": (rock_small, (1, 1, 1), "rock/block.png"),
    "rock_small_2": (rock_small_2, (1, 1, 1), "rock/block_2.png"),
    "rock_small_3": (rock_small_3, (1, 1, 1), "rock/block_3.png"),
    "rock_medium": (rock_medium, (1, 1, 1), "rock/block_4.png"),
    "rock_medium_2": (rock_medium_2, (1, 1, 1), "rock/block_5.png"),
    "grove_2x1": (lambda: grove("x"), (2, 1, 2), "tree/block_grove_2x1.png"),
    "grove_1x2": (lambda: grove("y"), (1, 2, 2), "tree/block_grove_1x2.png"),
    "tree_9": (willow, (1, 1, 2), "tree/block_9.png"),
    "tree_10": (cedar, (1, 1, 2), "tree/block_10.png"),
    "tree_11": (encina, (1, 1, 2), "tree/block_11.png"),
    "tree_12": (cherry, (1, 1, 2), "tree/block_12.png"),
    "tree_13": (golden_poplar, (1, 1, 2), "tree/block_13.png"),
    "grove_autumn_2x1": (lambda: grove_autumn("x"), (2, 1, 2), "tree/block_grove_autumn_2x1.png"),
    "grove_autumn_1x2": (lambda: grove_autumn("y"), (1, 2, 2), "tree/block_grove_autumn_1x2.png"),
    "grove_pine_2x1": (lambda: grove_pine("x"), (2, 1, 2), "tree/block_grove_pine_2x1.png"),
    "grove_pine_1x2": (lambda: grove_pine("y"), (1, 2, 2), "tree/block_grove_pine_1x2.png"),
    "palm_tall": (palm_tall, (1, 1, 3), "beach/block_palm_tall.png"),
    "palm": (palm, (1, 1, 2), "beach/block_palm.png"),
    "palm_bent": (palm_bent, (1, 1, 2), "beach/block_palm_bent.png"),
    "coconuts": (coconut_pile, (1, 1, 1), "beach/block_coconuts.png"),
    "driftwood": (driftwood, (1, 1, 1), "beach/block_driftwood.png"),
    "beach_rocks": (beach_rocks, (1, 1, 1), "beach/block_beach_rocks.png"),
    "palm_grove_2x1": (lambda: palm_grove("x"), (2, 1, 3), "beach/block_palm_grove_2x1.png"),
    "palm_grove_1x2": (lambda: palm_grove("y"), (1, 2, 3), "beach/block_palm_grove_1x2.png"),
    "tree_14": (oak_wide, (1, 1, 2), "tree/block_14.png"),
    "tree_15": (sapling, (1, 1, 2), "tree/block_15.png"),
    "tree_16": (spruce_slim, (1, 1, 2), "tree/block_16.png"),
    "tree_17": (windswept, (1, 1, 2), "tree/block_17.png"),
    "tree_18": (birch_green, (1, 1, 2), "tree/block_18.png"),
    "tree_19": (sparse_oak, (1, 1, 2), "tree/block_19.png"),
    "tree_20": (maple, (1, 1, 2), "tree/block_20.png"),
    "tree_21": (fir_broad, (1, 1, 2), "tree/block_21.png"),
    "tree_22": (acacia_low, (1, 1, 2), "tree/block_22.png"),
    "tree_24": (column_tree, (1, 1, 2), "tree/block_24.png"),
    "tree_25": (beam_oak, (1, 1, 2), "tree/block_25.png"),
    "tree_26": (weeping, (1, 1, 2), "tree/block_26.png"),
    "tree_27": (elder_oak, (1, 1, 2), "tree/block_27.png"),
    "palm_fan": (palm_fan, (1, 1, 2), "beach/block_palm_fan.png"),
    "palm_sprout": (palm_sprout, (1, 1, 2), "beach/block_palm_sprout.png"),
    "palm_cluster": (palm_cluster, (1, 1, 2), "beach/block_palm_cluster.png"),
    "grove_birch_2x1": (lambda: grove_birch("x"), (2, 1, 2), "tree/block_grove_birch_2x1.png"),
    "grove_birch_1x2": (lambda: grove_birch("y"), (1, 2, 2), "tree/block_grove_birch_1x2.png"),
    "palm_young": (palm_young, (1, 1, 2), "beach/block_palm_young.png"),
    "palm_lean": (palm_lean, (1, 1, 2), "beach/block_palm_lean.png"),
    "palm_slim": (palm_slim, (1, 1, 3), "beach/block_palm_slim.png"),
    "palm_grove_2_2x1": (lambda: palm_grove_2("x"), (2, 1, 3), "beach/block_palm_grove_2_2x1.png"),
    "palm_grove_2_1x2": (lambda: palm_grove_2("y"), (1, 2, 3), "beach/block_palm_grove_2_1x2.png"),
    "mushrooms": (mushrooms, (1, 1, 1), "field/block_mushrooms.png"),
    "tall_grass": (tall_grass, (1, 1, 1), "field/block_tall_grass.png"),
    "tall_grass_2": (tall_grass_2, (1, 1, 1), "field/block_tall_grass_2.png"),
    "fallen_log_2x1": (lambda: fallen_log("x"), (2, 1, 1), "field/block_fallen_log_2x1.png"),
    "fallen_log_1x2": (lambda: fallen_log("y"), (1, 2, 1), "field/block_fallen_log_1x2.png"),
    "peat_puddle": (peat_puddle, (1, 1, 1), "field/block_peat_puddle.png"),
}


def render(model, sprite):
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vox_render.py")
    blender = shutil.which("blender")
    command = [blender, "-b", "-P", script, "--", model, sprite] if blender else [sys.executable, script, model, sprite]
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL)
    print("  rendered", os.path.relpath(sprite))


def run(models, args):
    """Write (and with --render, render) the named models of `models`, or all of them."""
    rendering = "--render" in args
    names = [a for a in args if a != "--render"] or list(models)
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, "..", "models")
    assets = os.path.join(here, "..", "..", "..", "lib", "assets")
    os.makedirs(out, exist_ok=True)
    for name in names:
        build, tiles, asset = models[name]
        path = os.path.join(out, name + ".vox")
        write(path, build(), bounds=tile_volume(tiles))
        if rendering:
            os.makedirs(os.path.dirname(os.path.join(assets, asset)), exist_ok=True)
            render(path, os.path.join(assets, asset))


if __name__ == "__main__":
    run(MODELS, sys.argv[1:])
