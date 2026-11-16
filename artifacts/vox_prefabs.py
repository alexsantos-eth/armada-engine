#!/usr/bin/env python3
# vox_prefabs.py — the voxel prefab kits: small MagicaVoxel pieces (a leaf block, a trunk
# segment, a fruit…) to assemble the game's entities by hand, instead of one model per asset.
#
#   python3 vox_prefabs.py [out_dir]      → one .vox per piece and colour (default: vox/prefabs)
#
# vox_models.py assembles the game's entities from these pieces.
#
# Conventions (see lib/docs or the catalogue): 1 voxel = 4 skill units, so a tile is 128 voxels
# and a block is 85 high. Pieces snap to a 28-voxel module (three modules = one block of
# height) and leave 1 voxel of air per side, so two neighbours show a 2-voxel seam by
# themselves. Every file carries the same palette, flat material colours, no baked light.
# Sizes below are in voxels: (x, y, z0, size x, size y, size z, colour, corner radius).
import os
import sys

import iso_vox

SCALE = 4
MODULE = 28

LEAF, LEAF_DARK, LEAF_AUTUMN = "#80c034", "#4c8f3a", "#f0a830"
ROSETTE = "#6fb81e"
WOOD, BIRCH, BIRCH_MARK, BARK, CUT, MOSS = "#8a5a30", "#f1ece1", "#4a4038", "#7a5a3a", "#d9b98a", "#6f8f4a"
RED, WHITE, YELLOW = "#d9463a", "#f4f1e6", "#f4bd43"
CAP, STEM, DOT = "#b5473a", "#eee8d8", "#fff2dc"
OCHRE, RUST = "#d9a441", "#c9702e"
ROCK, ROCK_DARK = "#9a9a96", "#7c7c7a"
PALETTE = [LEAF, LEAF_DARK, LEAF_AUTUMN, ROSETTE, WOOD, BIRCH, BIRCH_MARK, BARK, CUT, MOSS,
           RED, WHITE, YELLOW, CAP, STEM, DOT, OCHRE, RUST, ROCK, ROCK_DARK]


def box(x, y, z0, sx, sy, sz, color, r):
    """One rounded box in voxels, centred on (x, y), from z0 up. Its edges are snapped to
    whole voxels, so an odd size comes out exactly that many voxels wide."""
    s = SCALE
    x, y = round(x - sx / 2) + sx / 2, round(y - sy / 2) + sy / 2
    return dict(c=(x * s, y * s, (z0 + sz / 2) * s), h=(sx / 2 * s, sy / 2 * s, sz / 2 * s),
                r=min(r, sx / 2, sy / 2, sz / 2) * s, color=color, zs=0, pocket=None)


def leaf(sx, sy, sz, r):
    return lambda color: [box(0, 0, 0, sx, sy, sz, color, r)]


def trunk(color):
    marks = [box(4, 6.5, 8, 5, 2, 2, BIRCH_MARK, 1), box(6.5, -3, 18, 2, 5, 2, BIRCH_MARK, 1)]
    return [box(0, 0, 0, 14, 14, 28, color, 3)] + (marks if color == BIRCH else [])


def wildflower(petal):
    out = [box(0, 0, 0, 3, 3, 11, ROSETTE, 1.2)]
    out += [box(dx, dy, 10, 5, 5, 4, petal, 2) for dx, dy in ((3, 0), (-3, 0), (0, 3), (0, -3))]
    return out + [box(0, 0, 13, 3, 3, 3, YELLOW, 1.2)]


LEAVES = dict(green=LEAF, dark=LEAF_DARK, autumn=LEAF_AUTUMN)
BARKS = dict(brown=WOOD, birch=BIRCH)

# name → (builder, {variant: colour}); a single unnamed variant writes `<name>.vox`.
PIECES = {
    "leaf_block": (leaf(26, 26, 26, 6), LEAVES),
    "leaf_block_small": (leaf(20, 20, 20, 5), LEAVES),
    "leaf_cap": (leaf(32, 32, 24, 7), LEAVES),
    "leaf_slab": (leaf(36, 36, 12, 5), LEAVES),
    "leaf_tuft": (leaf(20, 20, 11, 4.5), LEAVES),
    "trunk": (trunk, BARKS),
    "trunk_thin": (lambda c: [box(0, 0, 0, 9, 9, 28, c, 2)], BARKS),
    "branch": (lambda c: [box(0, 0, 0, 26, 8, 8, c, 2.5)], BARKS),
    "stump": (lambda c: [box(0, 0, 0, 16, 16, 14, c, 3), box(0, 0, 12, 11, 11, 2, CUT, 1)], {"": WOOD}),
    "log": (lambda c: [box(0, 0, 0, 30, 12, 12, c, 4), box(14, 0, 2, 2, 8, 8, CUT, 1),
                       box(-14, 0, 2, 2, 8, 8, CUT, 1), box(-3, 0, 10, 14, 10, 3, MOSS, 1.4)], {"": BARK}),
    "fruit": (lambda c: [box(0, 0, 0, 7, 7, 7, c, 3)], {"": RED}),
    "flower_big": (lambda c: [box(0, 0, 0, 17, 17, 4, ROSETTE, 2), box(0, 0, 4, 10, 10, 7, c, 3.5)],
                   dict(white=WHITE, red=RED, yellow=YELLOW)),
    "wildflower": (wildflower, dict(red=RED, white=WHITE)),
    "mushroom": (lambda c: [box(0, 0, 0, 4, 4, 8, STEM, 1.5), box(0, 0, 5, 10, 9, 5, c, 2.4),
                            box(-2, 1, 9, 2, 2, 2, DOT, 0.9)], {"": CAP}),
    "sprout": (lambda c: [box(0, 0, 0, 8, 8, 13, c, 3.5), box(7, 2, 0, 6, 6, 9, c, 3),
                          box(1, 7, 0, 6, 6, 7, c, 3)], {"": ROSETTE}),
    "fallen_leaf": (lambda c: [box(0, 0, 0, 15, 11, 2, c, 1)], dict(ochre=OCHRE, rust=RUST)),
    "pebble_s": (lambda c: [box(0, 0, 0, 6, 5, 3, c, 1.2)], {"": ROCK}),
    "pebble_m": (lambda c: [box(0, 0, 0, 9, 8, 4, c, 1.6)], {"": ROCK_DARK}),
    "pebble_l": (lambda c: [box(0, 0, 0, 12, 10, 6, c, 2.4)], {"": ROCK}),
    "rock_s": (lambda c: [box(0, 0, 0, 14, 12, 8, c, 3.4)], {"": ROCK_DARK}),
    "rock_l": (lambda c: [box(0, 0, 0, 30, 26, 18, c, 7), box(-2, -1, 16, 20, 16, 3, MOSS, 1.4)], {"": ROCK}),
}


def moved(boxes, x, y, z):
    """The same boxes shifted by whole voxels: how a piece is placed when assembling."""
    x, y, z = round(x), round(y), round(z)
    return [dict(b, c=(b["c"][0] + x * SCALE, b["c"][1] + y * SCALE, b["c"][2] + z * SCALE)) for b in boxes]


def turned(boxes):
    """The same boxes turned a quarter: what ran along x now runs along y."""
    return [dict(b, c=(b["c"][1], b["c"][0], b["c"][2]), h=(b["h"][1], b["h"][0], b["h"][2])) for b in boxes]


def piece(name, variant=""):
    """The boxes of a piece of the kit, in one of its colours."""
    build, variants = PIECES[name]
    return build(variants[variant])


def tile_volume(tiles):
    """((x0, y0, z0), size) in voxels of a footprint; the anchor tile is centred on (0, 0)."""
    nx, ny, nz = tiles
    return (-64, -64, 0), (128 * nx, 128 * ny, 85 * nz)


def write(path, boxes, bounds=None):
    cells = iso_vox.shell(iso_vox.voxelise(boxes, SCALE, bake=False))
    size, count, _ = iso_vox.write_vox(path, cells, palette=PALETTE, bounds=bounds)
    print(f"{os.path.basename(path):34} {size[0]:3} x {size[1]:3} x {size[2]:3}  {count:6} voxels")


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "vox", "prefabs")
    os.makedirs(out, exist_ok=True)
    for name, (build, variants) in PIECES.items():
        for variant, color in variants.items():
            write(os.path.join(out, name + ("_" + variant if variant else "") + ".vox"), build(color))



if __name__ == "__main__":
    main()
