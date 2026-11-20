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
STEP, STEP_DEEP, TREAD = "#a79e8d", "#8f8777", "#c6bfae"       # the stairs block (vox_stairs.py)
# the beach: palm bark and its rings, coconut husk, sun-bleached driftwood, stockfish, rope
PALM_BARK, PALM_RING, COCONUT = "#b08a5a", "#80603c", "#6b4528"
DRIFT, FISH, ROPE = "#cbbfa6", "#b9c6c8", "#cfae6e"
# the grass block (terrain_clay.py): the terrain's lime turf, a deeper green for its tufts, and
# the soil under it (the same top and soil colours as the flat terrain blocks)
GRASS_TOP, GRASS_DEEP, SOIL = "#a4de00", "#8cc400", "#bcb857"
# the other clay terrain (terrain_clay.py): clods on bare ground, the sand's crust and body, the
# trodden earth of a path and its darker patches (the colours of the flat blocks they replace)
SOIL_DARK, SAND_TOP, SAND_BODY, EARTH, EARTH_DARK = "#a39f47", "#f3dc96", "#dcc07a", "#c08a4e", "#a8743d"
# the open field: peat and its murky water, reeds and their cattails, the dark water of a well
PEAT, BOG, REED, CATTAIL, WELL_WATER = "#5b4532", "#4f6b5c", "#b3a85a", "#73472a", "#2f5470"
# New colours go at the end: the indices of the files already written must not move.
PALETTE = [LEAF, LEAF_DARK, LEAF_AUTUMN, ROSETTE, WOOD, BIRCH, BIRCH_MARK, BARK, CUT, MOSS,
           RED, WHITE, YELLOW, PINK, CAP, STEM, DOT, OCHRE, RUST, ROCK, ROCK_DARK,
           STONE_SAND, STONE_CLAY, GRAVEL, DIRT, RUNE_BLUE, RUNE_CYAN, RUNE_DARK,
           PLANK, TIMBER, PLASTER, DOOR, THATCH, TURF, TILE, SHINGLE, SHINGLE_DARK,
           GLOW, IRON, FIRE, BREW, STEP, STEP_DEEP, TREAD,
           PALM_BARK, PALM_RING, COCONUT, DRIFT, FISH, ROPE,
           GRASS_TOP, GRASS_DEEP, SOIL,
           SOIL_DARK, SAND_TOP, SAND_BODY, EARTH, EARTH_DARK,
           PEAT, BOG, REED, CATTAIL, WELL_WATER]


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


def palm_trunk(color):
    """One ringed segment of a palm trunk: stacked every 14 the rings read as the bark scars."""
    return [box(0, 0, 0, 11, 11, 13, color, 4), box(0, 0, 11, 13, 13, 3, PALM_RING, 1.4)]


def frond(color):
    """One palm frond hanging out along +x from the crown: five leaf pads, each further out and
    lower, overlapping so the frond reads as one leaf. Its pivot is the crown, so it reaches 21
    below it; spin it for the other sides."""
    return [box(9, 0, -2, 18, 15, 7, color, 3), box(22, 0, -6, 16, 14, 7, color, 3),
            box(34, 0, -11, 14, 12, 7, color, 2.8), box(44, 0, -16, 11, 10, 7, color, 2.4),
            box(51, 0, -21, 7, 7, 6, color, 2)]


def frond_diag(color):
    """The same frond hanging out along the diagonal between +x and +y."""
    return [box(6, 6, -2, 15, 15, 7, color, 3), box(16, 16, -6, 13, 13, 7, color, 3),
            box(24, 24, -11, 11, 11, 7, color, 2.8), box(31, 31, -16, 9, 9, 7, color, 2.4),
            box(36, 36, -21, 6, 6, 6, color, 2)]


def frond_short(color):
    """A short, stout frond along +x: three pads, for dense or young crowns."""
    return [box(8, 0, -1, 16, 14, 7, color, 3), box(19, 0, -4, 13, 12, 7, color, 3),
            box(28, 0, -8, 9, 9, 6, color, 2.4)]


def frond_short_diag(color):
    """The short frond along the diagonal between +x and +y."""
    return [box(6, 6, -1, 14, 14, 7, color, 3), box(14, 14, -4, 11, 11, 7, color, 3),
            box(20, 20, -8, 8, 8, 6, color, 2.4)]


def frond_up(color):
    """A frond rising along +x like a young palm's: four pads climbing and leaning out."""
    return [box(6, 0, 1, 14, 12, 7, color, 3), box(12, 0, 7, 12, 10, 7, color, 3),
            box(16, 0, 14, 10, 9, 7, color, 2.6), box(18, 0, 21, 7, 7, 6, color, 2.2)]


def frond_up_diag(color):
    """The rising frond along the diagonal between +x and +y."""
    return [box(4, 4, 1, 12, 12, 7, color, 3), box(9, 9, 7, 10, 10, 7, color, 3),
            box(12, 12, 14, 9, 9, 7, color, 2.6), box(13, 13, 21, 6, 6, 6, color, 2.2)]


def hull_mid(color):
    """One module of a longship hull, along x: a bottom as wide as the hull, two side strakes
    standing on it from z = 0 and the dark gunwales, open on top. 60 wide and 26 high."""
    return ([box(0, 0, 0, 26, 50, 8, color, 3)]
            + [b for s in (-1, 1) for b in (box(0, s * 24, 0, 26, 8, 22, color, 3),
                                             box(0, s * 27, 18, 26, 6, 8, TIMBER, 2.4))])


def hull_end(color):
    """The bow of a longship hull, closing toward +x in three steps up to the tall stem post
    (spin it twice for the stern). Each step's bottom reaches out under its side strakes, so the
    sides stand on it instead of floating beside a narrow keel."""
    out = [box(-7, 0, 0, 12, 46, 8, color, 3), box(4, 0, 0, 12, 34, 8, color, 3),
           box(12, 0, 0, 8, 20, 8, color, 3), box(16, 0, 0, 8, 8, 40, TIMBER, 2.4)]
    for s in (-1, 1):
        out += [box(-7, s * 20, 0, 12, 8, 22, color, 3), box(4, s * 14, 0, 12, 8, 24, color, 3),
                box(12, s * 7, 0, 8, 7, 26, color, 2.6),
                box(-7, s * 23, 18, 12, 6, 8, TIMBER, 2.4), box(4, s * 17, 20, 12, 6, 8, TIMBER, 2.4)]
    return out


def anchor(color):
    """An iron anchor stood on its crown: arms on the sand along x, shank, stock along y, ring."""
    return [box(0, 0, 0, 40, 7, 7, color, 2.6), box(18, 0, 0, 7, 7, 16, color, 2.6),
            box(-18, 0, 0, 7, 7, 16, color, 2.6), box(0, 0, 3, 7, 7, 50, color, 2.6),
            box(0, 0, 42, 7, 32, 7, color, 2.6), box(0, 0, 52, 4, 11, 10, color, 1.6)]


def flag(color):
    """A striped flag on a +x face, flying toward +y from its pole: its pivot is on the face."""
    out = [box(0, 20, 0, 2, 40, 28, color, 0.6)]
    return out + [box(1, 20, z, 2, 40, 5, WHITE, 0) for z in (6, 17)]


def rope_coil(color):
    """A coil of rope: a low ring of four rounded lengths around a hollow middle."""
    return [box(0, 5, 0, 14, 4, 4, color, 1.8), box(0, -5, 0, 14, 4, 4, color, 1.8),
            box(5, 0, 0, 4, 6, 4, color, 1.8), box(-5, 0, 0, 4, 6, 4, color, 1.8),
            box(0, 0, 3, 10, 3, 3, color, 1.4)]


def crab(color):
    """A beach crab facing +x: body, two claws, legs and eyes."""
    out = [box(0, 0, 2, 16, 19, 7, color, 3.2), box(12, 7, 1, 8, 7, 5, color, 2.2), box(12, -7, 1, 8, 7, 5, color, 2.2)]
    out += [box(dx, s * 11, 0, 3, 5, 3, color, 1.2) for s in (-1, 1) for dx in (-5, 2)]
    return out + [box(6, s * 3, 8, 3, 3, 3, BIRCH_MARK, 1.2) for s in (-1, 1)]


def gull(color):
    """A gull standing and looking toward +x: body, grey wing, head, yellow beak and legs."""
    return [box(-1, 0, 0, 3, 6, 5, YELLOW, 1), box(0, 0, 5, 20, 11, 11, color, 4.5),
            box(-3, 0, 13, 16, 12, 4, ROCK, 1.8), box(-13, 0, 10, 8, 6, 3, ROCK_DARK, 1.2),
            box(9, 0, 13, 9, 9, 9, color, 3.8), box(15, 0, 16, 6, 3, 3, YELLOW, 1)]


# ------------------------------------------------------------------ the open field (kit 1-3)
def toadstool(color):
    """A big toadstool: a pale stem under a wide cap, three white dots on the cap."""
    return ([box(0, 0, 0, 9, 9, 19, STEM, 3.6), box(0, 0, 15, 27, 25, 12, color, 5.4)]
            + [box(dx, dy, 25, 4, 4, 3, DOT, 1.4) for dx, dy in ((6, -4), (-4, 6), (-6, -6), (7, 7))])


def grass_tuft(color):
    """A tuft of tall grass: blades fanning out of a low clump like a fountain, each a column of
    five overlapping lengths that thin to a point and bend further out as they rise. Up to 34
    high."""
    out = [box(0, 0, 0, 12, 12, 7, color, 3.5)]
    blades = (((0, 0), 34), ((1.2, 0), 28), ((0, 1.2), 30), ((-1.2, 0), 25), ((0, -1.2), 26),
              ((1, 1), 24), ((-1, 1), 22), ((1, -1), 23), ((-1, -1), 20))
    for (dx, dy), h in blades:
        for k, w in enumerate((6, 5, 4, 3, 2)):
            out.append(box(dx * (2 + 3 * k), dy * (2 + 3 * k), k * h // 5, w, w, h // 5 + 3, color, w / 2))
    return out


def reed(color):
    """A reed: a thin stalk with its brown cattail near the top and a blade beside it."""
    return [box(0, 0, 0, 3, 3, 36, color, 1.2), box(0, 0, 22, 5, 5, 10, CATTAIL, 2.2),
            box(3, 1, 0, 3, 3, 22, color, 1.2)]


def puddle(color):
    """A peat puddle lying on the ground: an uneven rim of wet peat round murky water. 52 x 40,
    4 high: a flat piece, like a fallen leaf or a cloth, not a floor."""
    return [box(0, 0, 0, 52, 32, 3, PEAT, 1.4), box(-6, 4, 0, 40, 40, 3, PEAT, 1.4),
            box(8, -6, 0, 30, 30, 3, PEAT, 1.4),
            box(0, 1, 1, 40, 22, 3, color, 1), box(-5, 4, 1, 28, 30, 3, color, 1)]


def log_long(color):
    """A long fallen trunk along x with pale cut ends and moss on its back: 150 x 20 x 19."""
    return [box(0, 0, 0, 150, 20, 19, color, 7), box(75, 0, 3, 2, 14, 13, CUT, 1.4),
            box(-75, 0, 3, 2, 14, 13, CUT, 1.4), box(-30, -2, 17, 36, 12, 3, MOSS, 1.4),
            box(32, -1, 17, 20, 10, 3, MOSS, 1.4)]


def disc(d, t, color, plane, z0=0, rows=6):
    """A round disc of diameter d and thickness t from rows of boxes (a box's corner radius is
    capped by its thinnest side, so one box can never be round). plane: "xz" stands facing +y,
    "yz" stands facing +x, "xy" lies flat. Its pivot is the centre of its base."""
    out, step = [], d / rows
    for i in range(rows):
        c = -d / 2 + (i + .5) * step
        w = max(4, round(2 * ((d / 2) ** 2 - c ** 2) ** .5))
        if plane == "xy":
            out.append(box(0, c, z0, w, step + 1, t, color, 1.4))
        elif plane == "xz":
            out.append(box(0, 0, z0 + d / 2 + c - step / 2, w, t, step + 1, color, 1.4))
        else:
            out.append(box(0, 0, z0 + d / 2 + c - step / 2, t, w, step + 1, color, 1.4))
    return out


def root_plate(color):
    """The torn-up root plate at a fallen trunk's foot: a round disc standing across x, earth
    still caught in its face and roots reaching out of its rim."""
    out = disc(46, 10, color, "yz", rows=8) + [box(1, 0, 10, 10, 26, 26, EARTH_DARK, 4)]
    return out + [box(0, 25, 6, 8, 12, 7, color, 3), box(0, -25, 12, 8, 12, 7, color, 3),
                  box(0, 10, 44, 8, 8, 10, color, 3), box(0, -14, 40, 8, 8, 9, color, 3)]


def wheel(color):
    """A cart wheel standing on its rim, its face toward +y: a timber rim, a plank face and an
    iron hub."""
    return disc(32, 5, color, "xz", rows=8) + disc(22, 7, PLANK, "xz", z0=5, rows=6) + [
        box(0, 0, 12, 8, 10, 8, IRON, 3)]


def wheel_flat(color):
    """The same wheel lying on the ground, its hub up."""
    return disc(32, 5, color, "xy", rows=8) + disc(22, 6, PLANK, "xy", rows=6) + [box(0, 0, 4, 8, 8, 5, IRON, 2)]


def spear(color):
    """A spear stuck upright in the ground: a long shaft and an iron head. 80 high."""
    return [box(0, 0, 0, 3, 3, 68, color, 1.2), box(0, 0, 66, 5, 5, 4, IRON, 1.4),
            box(0, 0, 68, 4, 4, 10, IRON, 1.6), box(0, 0, 77, 2, 2, 3, IRON, 0.8)]


def chest(color):
    """A treasure chest closed (34 x 24 x 25), facing +x: the body, a rounded lid, two iron bands and the gold
    lock on its front."""
    out = [box(0, 0, 0, 34, 24, 16, color, 3), box(0, 0, 15, 34, 24, 10, color, 4.6)]
    out += [box(dx, 0, 0, 4, 25, 25, IRON, 1.6) for dx in (-10, 10)]
    return out + [box(17, 0, 12, 2, 7, 7, YELLOW, 1.4)]


def totem(color):
    """One carved section of a totem pole, its face toward +x: a heavy brow, two eyes, a nose and
    a red mouth. 22 x 22 x 28, stacked every 28 like a trunk."""
    return [box(0, 0, 0, 22, 22, 26, color, 5), box(11, 0, 18, 3, 20, 4, color, 1.4),
            box(12, 5, 13, 2, 5, 4, BIRCH_MARK, 1), box(12, -5, 13, 2, 5, 4, BIRCH_MARK, 1),
            box(12, 0, 7, 4, 5, 8, color, 1.6), box(12, 0, 2, 2, 10, 3, RED, 1)]


def bucket(color):
    return [box(0, 0, 0, 9, 9, 10, color, 2.4), box(0, 0, 6, 10, 10, 2, IRON, 1)]


def sack(color):
    """A tied grain sack: a fat body and its knotted neck."""
    return [box(0, 0, 0, 13, 11, 13, color, 5), box(0, 0, 12, 5, 5, 4, color, 2)]


LEAVES = dict(green=LEAF, dark=LEAF_DARK, autumn=LEAF_AUTUMN, blossom=PINK)
BARKS = dict(brown=WOOD, birch=BIRCH, timber=TIMBER)
STONES = dict(grey=ROCK, dark=ROCK_DARK, sand=STONE_SAND, clay=STONE_CLAY)
WALLS = dict(plank=PLANK, timber=TIMBER, plaster=PLASTER)
ROOFS = dict(thatch=THATCH, turf=TURF, tile=TILE, shingle=SHINGLE, dark=SHINGLE_DARK, red=RED, white=WHITE)
RUNES = dict(blue=RUNE_BLUE, cyan=RUNE_CYAN, red=RED, dark=RUNE_DARK)

# name → (builder, {variant: colour}); a single unnamed variant writes `<name>.vox`.
PIECES = {
    "leaf_block": (leaf(26, 26, 26, 6), LEAVES),
    "leaf_block_small": (leaf(20, 20, 20, 5), LEAVES),
    "leaf_cap": (leaf(32, 32, 24, 7), LEAVES),
    "leaf_slab": (leaf(36, 36, 12, 5), LEAVES),
    "leaf_tuft": (leaf(20, 20, 11, 4.5), LEAVES),
    "leaf_dome": (leaf(30, 30, 18, 8), LEAVES),                 # a low rounded cap
    "leaf_column": (leaf(18, 18, 36, 8), LEAVES),               # a tall narrow clump (cell 20)
    "leaf_beam": (leaf(54, 26, 16, 6), LEAVES),                 # a long bough of leaves along x
    "leaf_drop": (leaf(12, 12, 22, 5), LEAVES),                 # a hanging strand (willow)
    "trunk": (trunk, BARKS),
    "trunk_thick": (lambda c: [box(0, 0, 0, 20, 20, 28, c, 4.5)], BARKS),   # an old, stout trunk
    "trunk_root": (lambda c: [box(0, 0, 0, 28, 28, 10, c, 6)], BARKS),      # the flare at a trunk's foot
    "branch_long": (lambda c: [box(0, 0, 0, 40, 9, 9, c, 3)], BARKS),
    "trunk_thin": (lambda c: [box(0, 0, 0, 9, 9, 28, c, 2)], BARKS),
    "branch": (lambda c: [box(0, 0, 0, 26, 8, 8, c, 2.5)], BARKS),
    "stump": (lambda c: [box(0, 0, 0, 16, 16, 14, c, 3), box(0, 0, 12, 11, 11, 2, CUT, 1)], {"": WOOD}),
    "log": (lambda c: [box(0, 0, 0, 30, 12, 12, c, 4), box(14, 0, 2, 2, 8, 8, CUT, 1),
                       box(-14, 0, 2, 2, 8, 8, CUT, 1), box(-3, 0, 10, 14, 10, 3, MOSS, 1.4)], {"": BARK}),
    "firewood": (lambda c: [box(0, 0, 0, 30, 12, 12, c, 4), box(14, 0, 2, 2, 8, 8, CUT, 1),
                            box(-14, 0, 2, 2, 8, 8, CUT, 1)], {"": WOOD}),
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
    # ---- the beach (kits 1 and 3) ---------------------------------------------------------
    "palm_trunk": (palm_trunk, {"": PALM_BARK}),                # stacked every 14
    "frond": (frond, dict(green=LEAF, dark=LEAF_DARK)),
    "frond_short": (frond_short, dict(green=LEAF, dark=LEAF_DARK)),
    "frond_short_diag": (frond_short_diag, dict(green=LEAF, dark=LEAF_DARK)),
    "frond_up": (frond_up, dict(green=LEAF, dark=LEAF_DARK)),
    "frond_up_diag": (frond_up_diag, dict(green=LEAF, dark=LEAF_DARK)),
    "frond_diag": (frond_diag, dict(green=LEAF, dark=LEAF_DARK)),
    "coconut": (lambda c: [box(0, 0, 0, 11, 11, 11, c, 4.8)], {"": COCONUT}),
    "coconut_half": (lambda c: [box(0, 0, 0, 12, 12, 6, c, 2.6), box(0, 0, 5, 8, 8, 2, WHITE, 1.2)], {"": COCONUT}),
    "driftwood": (lambda c: [box(0, 0, 0, 58, 14, 13, c, 5.5), box(29, 0, 2, 2, 10, 10, CUT, 1.4),
                             box(-10, 9, 5, 7, 14, 7, c, 2.8), box(12, -8, 6, 6, 10, 6, c, 2.5)], {"": DRIFT}),
    "beach_rock": (stone(46, 38, 26, 10), dict(grey=ROCK, sand=STONE_SAND)),
    "shell": (lambda c: [box(0, 0, 0, 9, 8, 4, c, 2), box(0, 0, 3, 6, 4, 2, WHITE, 1)], dict(pink=PINK, white=PLASTER)),
    "crab": (crab, {"": RED}),
    "gull": (gull, {"": WHITE}),
    "hull_mid": (hull_mid, dict(plank=PLANK, timber=TIMBER)),
    "hull_end": (hull_end, dict(plank=PLANK, timber=TIMBER)),
    "anchor": (anchor, {"": IRON}),
    "flag": (flag, dict(red=RED, blue=RUNE_BLUE)),
    "rope_coil": (rope_coil, {"": ROPE}),
    "cloth": (lambda c: [box(0, 0, 0, 14, 26, 3, c, 1.2)], dict(red=RED, white=WHITE)),
    "fish": (lambda c: [box(0, 0, 5, 4, 8, 16, c, 1.8), box(0, 0, 0, 3, 10, 6, c, 1.2)], {"": FISH}),
    "boat": (lambda c: [box(0, 0, 0, 44, 14, 8, c, 4), box(0, 0, 6, 36, 8, 2, CUT, 1),
                        box(21, 0, 4, 5, 5, 10, c, 2)], {"": SHINGLE}),
    # the open field
    "toadstool": (toadstool, dict(red=CAP, tan=OCHRE)),
    "grass_tuft": (grass_tuft, dict(green=GRASS_DEEP, light=ROSETTE, dry=THATCH)),
    "reed": (reed, {"": REED}),
    "puddle": (puddle, {"": BOG}),
    "log_long": (log_long, {"": BARK}),
    "root_plate": (root_plate, {"": BARK}),
    "turf_block": (leaf(26, 26, 26, 9), dict(turf=TURF, moss=MOSS)),   # a cell of a grassy mound
    "wheel": (wheel, {"": TIMBER}),
    "wheel_flat": (wheel_flat, {"": TIMBER}),
    "spear": (spear, {"": TIMBER}),
    "chest": (chest, {"": PLANK}),
    "coin": (lambda c: [box(0, 0, 0, 5, 5, 2, c, 1)], {"": YELLOW}),
    "clod": (lambda c: [box(0, 0, 0, 14, 12, 7, c, 3.4)], dict(earth=EARTH, dark=EARTH_DARK)),
    "totem": (totem, dict(timber=TIMBER, wood=WOOD, plank=PLANK)),
    "bucket": (bucket, {"": PLANK}),
    "sack": (sack, {"": PLASTER}),
    "well_water": (lambda c: [box(0, 0, 0, 30, 30, 3, c, 1)], {"": WELL_WATER}),
    "shovel": (lambda c: [box(0, 0, 0, 3, 11, 13, IRON, 1.2), box(0, 0, 12, 3, 3, 40, c, 1.2),
                          box(0, 0, 50, 3, 9, 3, c, 1.2)], {"": TIMBER}),
}


def moved(boxes, x, y, z):
    """The same boxes shifted by whole voxels: how a piece is placed when assembling."""
    x, y, z = round(x), round(y), round(z)
    return [dict(b, c=(b["c"][0] + x * SCALE, b["c"][1] + y * SCALE, b["c"][2] + z * SCALE)) for b in boxes]


def turned(boxes):
    """The same boxes turned a quarter: what ran along x now runs along y."""
    return [dict(b, c=(b["c"][1], b["c"][0], b["c"][2]), h=(b["h"][1], b["h"][0], b["h"][2])) for b in boxes]


def spun(boxes, quarters):
    """The same boxes spun a quarter turn at a time around z: +x goes to +y, then −x, then −y.
    Unlike `turned`, which swaps the axes (a mirror), this keeps a piece's handedness."""
    for _ in range(quarters % 4):
        boxes = [dict(b, c=(-b["c"][1], b["c"][0], b["c"][2]), h=(b["h"][1], b["h"][0], b["h"][2])) for b in boxes]
    return boxes


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
