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

import vox_lib

SCALE = 4
MODULE = 28

LEAF, LEAF_DARK, LEAF_AUTUMN = "#80c034", "#4c8f3a", "#f0a830"
ROSETTE = "#6fb81e"
WOOD, BIRCH, BIRCH_MARK, BARK, CUT, MOSS = "#8a5a30", "#f1ece1", "#4a4038", "#7a5a3a", "#d9b98a", "#6f8f4a"
RED, WHITE, YELLOW, PINK = "#d9463a", "#f4f1e6", "#f4bd43", "#f7a8c9"
CAP, STEM, DOT = "#b5473a", "#eee8d8", "#fff2dc"
OCHRE, RUST = "#d9a441", "#c9702e"
ROCK, ROCK_DARK = "#9a9a96", "#7c7c7a"
# kit 2 (stone) and kit 3 (construction)
STONE_SAND, STONE_CLAY, GRAVEL, DIRT = "#d8c9a3", "#c8694a", "#b8ae9c", "#a8794f"
RUNE_BLUE, RUNE_CYAN, RUNE_DARK = "#3f8fd9", "#49c8c0", "#8a3a2a"
PLANK, TIMBER, PLASTER, DOOR = "#a8713d", "#5e3d24", "#eadfc4", "#b98345"
THATCH, TURF, TILE, SHINGLE, SHINGLE_DARK = "#e3c56a", "#69a83c", "#d9703a", "#9a5b2e", "#8a3f2c"
GLOW, IRON, FIRE, BREW = "#ffd66b", "#4a4a52", "#f7802a", "#5fd03a"
# New colours go at the end: the indices of the files already written must not move.
PALETTE = [LEAF, LEAF_DARK, LEAF_AUTUMN, ROSETTE, WOOD, BIRCH, BIRCH_MARK, BARK, CUT, MOSS,
           RED, WHITE, YELLOW, PINK, CAP, STEM, DOT, OCHRE, RUST, ROCK, ROCK_DARK,
           STONE_SAND, STONE_CLAY, GRAVEL, DIRT, RUNE_BLUE, RUNE_CYAN, RUNE_DARK,
           PLANK, TIMBER, PLASTER, DOOR, THATCH, TURF, TILE, SHINGLE, SHINGLE_DARK,
           GLOW, IRON, FIRE, BREW]


def box(x, y, z0, sx, sy, sz, color, r):
    """One rounded box in voxels, centred on (x, y), from z0 up. Its edges are snapped to
    whole voxels, so an odd size comes out exactly that many voxels wide."""
    s = SCALE
    x, y = round(x - sx / 2) + sx / 2, round(y - sy / 2) + sy / 2
    return dict(c=(x * s, y * s, (z0 + sz / 2) * s), h=(sx / 2 * s, sy / 2 * s, sz / 2 * s),
                r=min(r, sx / 2, sy / 2, sz / 2) * s, color=color, zs=0, pocket=None)


def leaf(sx, sy, sz, r):
    """One rounded block of the given size: leaves, and the wall and roof cells of kit 3."""
    return lambda color: [box(0, 0, 0, sx, sy, sz, color, r)]


def trunk(color):
    marks = [box(4, 6.5, 8, 5, 2, 2, BIRCH_MARK, 1), box(6.5, -3, 18, 2, 5, 2, BIRCH_MARK, 1)]
    return [box(0, 0, 0, 14, 14, 28, color, 3)] + (marks if color == BIRCH else [])


def wildflower(petal):
    out = [box(0, 0, 0, 3, 3, 11, ROSETTE, 1.2)]
    out += [box(dx, dy, 10, 5, 5, 4, petal, 2) for dx, dy in ((3, 0), (-3, 0), (0, 3), (0, -3))]
    return out + [box(0, 0, 13, 3, 3, 3, YELLOW, 1.2)]


def stone(sx, sy, sz, r, moss=False):
    """A stone that takes any of the stone colours, with an optional slab of moss on top."""
    def build(color):
        cap = [box(-1, 1, sz - 1, sx * .6, sy * .6, 3, MOSS, 1.4)] if moss else []
        return [box(0, 0, 0, sx, sy, sz, color, r)] + cap
    return build


def rune(color):
    """A glyph pressed into a +x face (turn it for a +y face): its pivot is on the face plane."""
    return [box(0, 0, 0, 2, 3, 12, color, 0), box(0, 3, 7, 2, 3, 3, color, 0), box(0, -3, 3, 2, 3, 3, color, 0)]


def rune_flat(color):
    """The same glyph lying on a top face: its pivot sits one voxel under the surface."""
    return [box(0, 0, 0, 12, 3, 2, color, 0), box(3, 3, 0, 3, 3, 2, color, 0), box(-3, -3, 0, 3, 3, 2, color, 0)]


def door(color):
    return [box(0, 0, 0, 3, 20, 32, TIMBER, 1), box(1, 0, 0, 3, 14, 28, color, 1), box(2, 4, 12, 2, 3, 3, YELLOW, 0)]


def window(color):
    return [box(0, 0, 0, 3, 16, 16, TIMBER, 1), box(1, 0, 3, 3, 10, 10, color, 1)]


def shield(color):
    return [box(0, 0, 0, 3, 15, 15, color, 7), box(1, 0, 5, 3, 5, 5, YELLOW, 2)]


def dragon(color):
    """The carved head that ends a ridge: a neck rising outward along +x and a snout."""
    return [box(0, 0, 0, 6, 6, 14, color, 2), box(4, 0, 10, 6, 6, 10, color, 2), box(9, 0, 15, 8, 5, 5, color, 2)]


LEAVES = dict(green=LEAF, dark=LEAF_DARK, autumn=LEAF_AUTUMN, blossom=PINK)
BARKS = dict(brown=WOOD, birch=BIRCH, timber=TIMBER)
STONES = dict(grey=ROCK, dark=ROCK_DARK, sand=STONE_SAND, clay=STONE_CLAY)
WALLS = dict(plank=PLANK, timber=TIMBER, plaster=PLASTER)
ROOFS = dict(thatch=THATCH, turf=TURF, tile=TILE, shingle=SHINGLE, dark=SHINGLE_DARK, red=RED, white=WHITE)
FLOORS = dict(gravel=GRAVEL, dirt=DIRT, cobble=ROCK_DARK, plank=PLANK)
RUNES = dict(blue=RUNE_BLUE, cyan=RUNE_CYAN, red=RED, dark=RUNE_DARK)

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
                   dict(white=WHITE, red=RED, yellow=YELLOW, pink=PINK)),
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

    # ---- kit 2: stone -------------------------------------------------------------------
    "stone_block": (stone(26, 26, 26, 5), STONES),             # masonry: one cell of the module
    "stone_half": (stone(26, 26, 12, 4), STONES),              # footing, step, low wall
    "stone_small": (stone(14, 14, 14, 3.5), STONES),           # chimney course, plinth, brazier
    "floor_slab": (stone(26, 26, 3, 1.2), FLOORS),             # the ground an entity stands on
    "standing_stone": (stone(22, 16, 54, 7), dict(grey=ROCK, sand=STONE_SAND)),
    "standing_stone_tall": (stone(24, 17, 78, 7.5), dict(grey=ROCK, sand=STONE_SAND)),
    "standing_stone_small": (stone(16, 13, 30, 5.5), dict(grey=ROCK, sand=STONE_SAND)),
    "stone_lying": (stone(54, 20, 10, 4), dict(grey=ROCK, sand=STONE_SAND)),
    "moss_patch": (lambda c: [box(0, 0, 0, 10, 8, 3, c, 1.4)], {"": MOSS}),
    "rune": (rune, RUNES),
    "rune_flat": (rune_flat, RUNES),

    # ---- kit 3: construction ------------------------------------------------------------
    "wall_block": (leaf(26, 26, 26, 4), WALLS),                # one cell of wall, like stone_block
    "wall_half": (leaf(26, 26, 12, 3.5), WALLS),               # gable fill, counter, deck
    "roof_block": (leaf(26, 26, 12, 4.5), ROOFS),              # a roof course: steps 14 in, 12 up
    "ridge": (lambda c: [box(0, 0, 0, 26, 8, 6, c, 2.5)], dict(timber=TIMBER, plank=PLANK)),
    "door": (door, {"": DOOR}),
    "window": (window, dict(lit=GLOW, dark=BIRCH_MARK)),
    "shield": (shield, dict(red=RED, white=WHITE)),
    "dragon": (dragon, dict(timber=TIMBER, plank=PLANK)),
    "banner": (lambda c: [box(0, 0, 0, 2, 12, 18, c, 0), box(1, 0, 7, 2, 4, 4, YELLOW, 0)], {"": RED}),
    "barrel": (lambda c: [box(0, 0, 0, 12, 12, 15, c, 4), box(0, 0, 3, 13, 13, 2, IRON, 1),
                          box(0, 0, 10, 13, 13, 2, IRON, 1)], {"": PLANK}),
    "crate": (lambda c: [box(0, 0, 0, 13, 13, 12, c, 1.5), box(0, 0, 11, 9, 9, 2, CUT, 0.5)], {"": SHINGLE}),
    "loaf": (lambda c: [box(0, 0, 0, 10, 7, 5, c, 2.4)], {"": OCHRE}),
    "anvil": (lambda c: [box(0, 0, 0, 8, 8, 6, c, 1.5), box(1, 0, 6, 14, 7, 5, c, 1.5)], {"": IRON}),
    "fire": (lambda c: [box(0, 0, 0, 10, 10, 6, c, 3), box(0, 0, 5, 6, 6, 7, YELLOW, 2.6)], {"": FIRE}),
    "cauldron": (lambda c: [box(0, 0, 0, 14, 14, 11, c, 4.5), box(0, 0, 10, 10, 10, 2, BREW, 1)], {"": IRON}),
    "boat": (lambda c: [box(0, 0, 0, 44, 14, 8, c, 4), box(0, 0, 6, 36, 8, 2, CUT, 1),
                        box(21, 0, 4, 5, 5, 10, c, 2)], {"": SHINGLE}),
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
    cells = vox_lib.shell(vox_lib.voxelise(boxes, SCALE, bake=False))
    size, count, _ = vox_lib.write_vox(path, cells, palette=PALETTE, bounds=bounds)
    print(f"{os.path.basename(path):34} {size[0]:3} x {size[1]:3} x {size[2]:3}  {count:6} voxels")


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "prefabs")
    os.makedirs(out, exist_ok=True)
    for name, (build, variants) in PIECES.items():
        for variant, color in variants.items():
            write(os.path.join(out, name + ("_" + variant if variant else "") + ".vox"), build(color))



if __name__ == "__main__":
    main()
