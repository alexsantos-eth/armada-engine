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
import functools
import json
import math
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
# the bare ground: old bone, cold ash, soot and charcoal, rusted iron, the dry thistle's stalk and
# its faded head, amber ore and the bright steel of a blade or a vein of iron
BONE, ASH, SOOT, RUSTED = "#e6dab8", "#9b968e", "#3b3632", "#9c5a36"
THISTLE, THISTLE_HEAD, AMBER, STEEL = "#8c6b45", "#9a7096", "#eda23a", "#b9bec6"
# the animated entities: candle wax, the pale sinter of a geyser's cone and its hot pool
WAX, SINTER, HOT_WATER = "#f3e6c2", "#d9d0b6", "#5fb8c8"
# the ground's own looks (terrain_clay.py): deep, damp earth and the dark at the bottom of a crack
SOIL_DEEP, SOIL_WET, CRACK = "#8f8a3e", "#7a7536", "#55512a"   # CRACK: unused since the cracked look went
# the dead wood of the bare ground: a trunk long dead, weathered grey
DEADWOOD = "#8e8576"
# the rabbit NPC (artifacts/vox/rabbit/rabbit.py): a pale fawn coat, light enough that every tint
# the game multiplies it by (only ever darker) still reads as fur
FUR = "#dcc6a2"
# the trees of the bare ground: dry olive scrub leaf, and the char of a tree a lightning bolt split
LEAF_DRY, CHAR = "#a39c46", "#4a423c"
COPPER = "#a8532c"                                             # copper ore: the dropped item
FLINT, COPPER_BRIGHT = "#59606b", "#df8c50"                    # the tools: a flint head, a copper edge
HANDLE, NET, BONE_EDGE = "#9a6a3c", "#d9c58a", "#f4ecd2"       # a shaft's wood, the net's cord, a honed bone edge
# the merchant NPC (artifacts/vox/merchant/merchant.py): a gnome with a pale skin and a ruddy nose, a teal tunic; light enough that the tints the game multiplies them by still read
NOSE, SKIN, TUNIC, TUNIC_DARK = "#eba58c", "#f6d9b8", "#52a8b8", "#3c8794"
# New colours go at the end: the indices of the files already written must not move.
PALETTE = [LEAF, LEAF_DARK, LEAF_AUTUMN, ROSETTE, WOOD, BIRCH, BIRCH_MARK, BARK, CUT, MOSS,
           RED, WHITE, YELLOW, PINK, CAP, STEM, DOT, OCHRE, RUST, ROCK, ROCK_DARK,
           STONE_SAND, STONE_CLAY, GRAVEL, DIRT, RUNE_BLUE, RUNE_CYAN, RUNE_DARK,
           PLANK, TIMBER, PLASTER, DOOR, THATCH, TURF, TILE, SHINGLE, SHINGLE_DARK,
           GLOW, IRON, FIRE, BREW, STEP, STEP_DEEP, TREAD,
           PALM_BARK, PALM_RING, COCONUT, DRIFT, FISH, ROPE,
           GRASS_TOP, GRASS_DEEP, SOIL,
           SOIL_DARK, SAND_TOP, SAND_BODY, EARTH, EARTH_DARK,
           PEAT, BOG, REED, CATTAIL, WELL_WATER,
           BONE, ASH, SOOT, RUSTED, THISTLE, THISTLE_HEAD, AMBER, STEEL,
           WAX, SINTER, HOT_WATER,
           SOIL_DEEP, SOIL_WET, CRACK, DEADWOOD, FUR,
           LEAF_DRY, CHAR, COPPER, FLINT, COPPER_BRIGHT, HANDLE, NET, BONE_EDGE,
           NOSE, SKIN, TUNIC, TUNIC_DARK]


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


# ------------------------------------------------------------------- the bare ground (kit 1-3)
def bone(color):
    """A long bone lying along x: a shaft and a double knob at each end. 24 x 7 x 5."""
    return [box(0, 0, 0, 16, 4, 4, color, 1.8)] + [box(dx, dy, 0, 5, 4, 5, color, 2)
                                                   for dx in (-9, 9) for dy in (-1.5, 1.5)]


def rib(color):
    """One rib arching across y over a carcass: short rounded lengths on a half circle, 30 wide
    and 18 high, its feet on the ground."""
    out = []
    for k in range(9):
        a = math.pi * k / 8
        out.append(box(0, -13 * math.cos(a), 13 * math.sin(a), 3, 5, 5, color, 2))
    return out


def skull(color):
    """A skull facing +x: the cranium, the jaw under its front, two dark eye sockets and the nose."""
    return [box(0, 0, 2, 12, 11, 11, color, 5), box(3, 0, 0, 7, 8, 5, color, 2.4),
            box(6, -2.5, 6, 2, 3, 3, SOOT, 1), box(6, 2.5, 6, 2, 3, 3, SOOT, 1), box(6, 0, 3, 2, 2, 2, SOOT, 0.6)]


def skull_horned(color):
    """An ox skull facing +x: a long face narrowing to the muzzle, eye sockets, and two pale horns
    curving out and up."""
    out = [box(-3, 0, 0, 12, 13, 10, color, 4.6), box(5, 0, 0, 10, 9, 7, color, 3.2), box(10, 0, 0, 5, 7, 5, color, 2)]
    out += [box(3, s * 4.5, 5, 2, 3, 3, SOOT, 1) for s in (-1, 1)]
    for s in (-1, 1):
        out += [box(-5, s * 9, 6, 4, 5, 4, CUT, 1.8), box(-5, s * 12, 9, 4, 4, 4, CUT, 1.8),
                box(-5, s * 14, 12, 3, 3, 4, CUT, 1.4)]
    return out


def helmet(color):
    """A round iron helmet, its nose guard toward +x: a dome on a band, the guard hanging 5 below
    the rim. 17 x 17 x 11, its pivot at the rim."""
    return [box(0, 0, 0, 17, 17, 3, color, 1.4), box(0, 0, 1, 15, 15, 10, color, 6.5),
            box(8, 0, -5, 2, 3, 7, color, 0.8), box(0, 0, 9, 3, 11, 3, color, 1.2)]


def sword(color):
    """A sword lying along x, its point toward +x: blade, crossguard, grip and pommel. 50 long."""
    return [box(8, 0, 0, 34, 5, 2, color, 1), box(26, 0, 0, 4, 3, 2, color, 1), box(-10, 0, 0, 3, 12, 3, IRON, 1.2),
            box(-15, 0, 0, 7, 3, 3, TIMBER, 1.2), box(-20, 0, 0, 4, 4, 4, IRON, 1.6)]


def shield_flat(color):
    """A round shield lying face up on the ground: a painted disc and its iron boss."""
    return disc(26, 3, color, "xy", rows=8) + [box(0, 0, 2, 8, 8, 3, IRON, 2.6)]


def link(color):
    """One chain link lying flat along x: an oval ring 12 x 8 x 3 with its hole open."""
    return [box(0, -3, 0, 12, 2, 3, color, 1), box(0, 3, 0, 12, 2, 3, color, 1),
            box(-5, 0, 0, 2, 8, 3, color, 1), box(5, 0, 0, 2, 8, 3, color, 1)]


def link_up(color):
    """The next link of a chain, standing on its edge along x: 12 long, 3 thick, 8 high."""
    return [box(0, 0, 0, 12, 3, 2, color, 1), box(0, 0, 6, 12, 3, 2, color, 1),
            box(-5, 0, 0, 2, 3, 8, color, 1), box(5, 0, 0, 2, 3, 8, color, 1)]


def pickaxe(color):
    """A pickaxe leaning toward +x: the handle climbs in short lengths, each further out, up to
    the iron head lying across y. 54 high."""
    out = [box(2.4 * k, 0, 6 * k, 4, 4, 8, color, 1.6) for k in range(8)]
    return out + [box(19, 0, 46, 5, 20, 5, IRON, 1.6), box(19, -12, 47, 4, 6, 3, IRON, 1.2),
                  box(19, 12, 47, 4, 6, 3, IRON, 1.2)]


def thistle(height):
    """A dry thistle `height` high: a stiff stalk, spiny leaves jutting from it in pairs, and three
    prickly heads, their tufts faded to a dry mauve, on short side branches."""
    def build(color):
        out = [box(0, 0, 0, 3, 3, height, color, 1.2)]
        for k, z in enumerate(range(3, height - 12, 7)):
            dx, dy = (1, 0) if k % 2 == 0 else (0, 1)
            for s in (-1, 1):
                for n in range(3):
                    out.append(box(s * dx * (3 + 3 * n), s * dy * (3 + 3 * n), z + 2 * n, 4 if dx else 2,
                                   2 if dx else 4, 2, color, 0.6))
        heads = ((0, 0, height), (7, 0, height - 9), (0, -6, height - 15))
        for x, y, z in heads:
            if (x, y) != (0, 0):
                out.append(box(x / 2, y / 2, z - 3, 2 + abs(x), 2 + abs(y), 2, color, 0.8))
            out += [box(x, y, z - 2, 6, 6, 5, color, 2.4), box(x, y, z + 2, 5, 5, 5, THISTLE_HEAD, 2.2)]
            out += [box(x + sx * 4, y + sy * 4, z - 1 + k, 3, 2, 2, color, 0.5) if sx else
                    box(x, y + sy * 4, z - 1 + k, 2, 3, 2, color, 0.5)
                    for k, (sx, sy) in enumerate(((1, 0), (-1, 0), (0, 1), (0, -1)))]
        return out
    return build


def vein(color):
    """A streak of ore pressed into a +x face (turn it for +y): three lumps stepping up and
    across, its pivot on the face plane. 3 x 20 x 16."""
    return [box(0, -6, 0, 3, 8, 5, color, 1.6), box(0, 0, 5, 3, 9, 5, color, 1.6), box(0, 6, 10, 3, 8, 6, color, 1.6),
            box(1, 1, 6, 2, 3, 3, WHITE, 1)]


def menhir(color):
    """A rough granite menhir about two blocks high: three uneven courses that lean back and narrow
    as they rise, and a blunt top."""
    return [box(0, 0, 0, 32, 22, 62, color, 7), box(-2, 1, 56, 28, 20, 52, color, 7),
            box(-4, 2, 102, 22, 17, 40, color, 6.5), box(-6, 2, 138, 12, 13, 12, color, 4.5)]


def ash(color):
    """A low heap of cold ash with charcoal lumps in it."""
    return [box(0, 0, 0, 22, 18, 4, color, 2), box(-1, 1, 2, 16, 13, 5, color, 3.4), box(-2, 1, 5, 9, 8, 4, color, 3.6),
            box(6, -5, 2, 6, 5, 5, SOOT, 2), box(-7, 5, 1, 5, 6, 5, SOOT, 2), box(2, 6, 4, 4, 4, 4, SOOT, 1.6)]


def pit(color):
    """The floor of a dug pit: a dark earth rim round a darker hollow. 50 x 44, 2 high: a flat
    piece like the puddle, not a floor."""
    return [box(0, 0, 0, 50, 36, 2, color, 1), box(-3, 3, 0, 40, 44, 2, color, 1),
            box(-1, 1, 0, 36, 28, 3, SOOT, 1)]


def torch_cup(color):
    """An iron fire cup for a post's head: a narrow foot, a flaring bowl and glowing coals heaped
    just over its rim. 14 x 14 x 13; the flame itself is drawn by the game."""
    return [box(0, 0, 0, 8, 8, 4, color, 1.6), box(0, 0, 3, 14, 14, 8, color, 3),
            box(0, 0, 9, 10, 10, 3, SOOT, 1.4), box(0, 0, 10, 8, 8, 3, FIRE, 1.6), box(1, -1, 11, 4, 4, 2, YELLOW, 1.2)]


def bowl(color):
    """A brazier's wide iron bowl: a narrow base flaring out to a thick rim, heaped with coals
    that glow in two places. 38 x 38 x 15; the flames are drawn by the game."""
    return [box(0, 0, 0, 20, 20, 5, color, 2), box(0, 0, 4, 30, 30, 6, color, 2.6),
            box(0, 0, 8, 38, 38, 5, color, 2.2), box(0, 0, 11, 30, 30, 3, SOOT, 1.4),
            box(-4, 3, 12, 11, 11, 3, FIRE, 2.4), box(6, -4, 12, 10, 10, 3, FIRE, 2.4),
            box(1, 6, 13, 7, 7, 2, YELLOW, 1.6), box(-6, -6, 12, 6, 6, 3, SOOT, 1.6)]


def candle(h):
    """A church candle h voxels high with a drip of wax down its lit side and a black wick on
    top; the flame is drawn by the game."""
    def build(color):
        return [box(0, 0, 0, 7, 7, h, color, 2.8), box(4, 1, h - 7, 2, 3, 6, color, 1),
                box(0, 0, h, 2, 2, 3, SOOT, 0.8)]
    return build


def sinter(sx, sy, sz):
    """A ledge of the mineral crust a geyser builds round its mouth: a flat, irregular slab."""
    def build(color):
        return [box(0, 0, 0, sx, sy, sz, color, 3.2), box(-2, 3, sz - 2, sx * .6, sy * .55, 3, color, 1.4)]
    return build


def fish_flat(color):
    """A dead fish lying on its side along x: body, head and a fanned tail. 22 x 9 x 4."""
    return [box(0, 0, 0, 14, 8, 4, color, 1.8), box(-8, 0, 0, 5, 7, 4, color, 1.8),
            box(9, 0, 0, 4, 9, 3, color, 1), box(-9, 2, 2, 2, 2, 2, SOOT, 0)]


LEAVES = dict(green=LEAF, dark=LEAF_DARK, autumn=LEAF_AUTUMN, blossom=PINK, dry=LEAF_DRY)
BARKS = dict(brown=WOOD, birch=BIRCH, timber=TIMBER, dead=DEADWOOD, char=CHAR)
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
                          box(1, 7, 0, 6, 6, 7, c, 3)], {"": ROSETTE, "dry": THATCH, "straw": REED}),
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
    # the bare ground
    "bone": (bone, {"": BONE}),
    "rib": (rib, {"": BONE}),
    "skull": (skull, {"": BONE}),
    "skull_horned": (skull_horned, {"": BONE}),
    "helmet": (helmet, dict(iron=IRON, rusted=RUSTED)),
    "sword": (sword, {"": STEEL}),
    "shield_flat": (shield_flat, dict(red=RED, white=WHITE)),
    "link": (link, dict(rusted=RUSTED, iron=IRON)),
    "link_up": (link_up, dict(rusted=RUSTED, iron=IRON)),
    "pickaxe": (pickaxe, {"": TIMBER}),
    "thistle": (thistle(44), {"": THISTLE}),
    "thistle_short": (thistle(30), {"": THISTLE}),
    "vein": (vein, dict(iron=STEEL, amber=AMBER)),
    "ore": (lambda c: [box(0, 0, 0, 8, 7, 5, ROCK_DARK, 2.4), box(1, 0, 3, 5, 4, 3, c, 1.4)], dict(iron=STEEL, amber=AMBER, copper=COPPER)),
    "flat_stone": (stone(32, 26, 8, 3.5), STONES),            # a cairn's slab
    "flat_stone_small": (stone(22, 18, 8, 3), STONES),
    "menhir": (menhir, dict(grey=ROCK, sand=STONE_SAND)),
    "ash": (ash, {"": ASH}),
    "pit": (pit, {"": PEAT}),
    "mouth": (lambda c: [box(0, 0, 0, 6, 30, 54, c, 2)], {"": SOOT}),   # the dark of a doorway
    # the animated entities (their flames, lanterns and particles are drawn by the game)
    "torch_cup": (torch_cup, {"": IRON}),
    "bowl": (bowl, {"": IRON}),
    "rod": (lambda c: [box(0, 0, 0, 4, 4, 21, c, 1.4)], {"": IRON}),          # stacks every 21
    "candle": (candle(16), dict(wax=WAX, red=RED)),
    "candle_tall": (candle(25), dict(wax=WAX, red=RED)),
    "candle_short": (candle(10), dict(wax=WAX, red=RED)),
    "wax": (lambda c: [box(0, 0, 0, 12, 10, 2, c, 1)], {"": WAX}),
    "sinter": (sinter(30, 24, 8), dict(sinter=SINTER, grey=ROCK)),
    "sinter_small": (sinter(22, 18, 8), dict(sinter=SINTER, grey=ROCK)),
    "hot_pool": (lambda c: disc(26, 3, c, "xy", rows=6), {"": HOT_WATER}),
    "fish_flat": (fish_flat, {"": FISH}),
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


_PLACED = {}


@functools.lru_cache(maxsize=None)
def _collectable():
    """The pieces some item of items.json is made of: the ones a piece of an entity is collectable
    as by default."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "lib", "content", "json", "items.json")
    with open(path) as source:
        return {name for item in json.load(source)["items"] for name in item.get("pieces", [])}


def piece(name, variant="", collect=None):
    """The boxes of a piece of the kit, in one of its colours. Each call is one instance, and its
    boxes carry that instance's number (`part`), so `parts_of` can tell the pieces an entity was
    assembled from once `moved`, `turned` and `spun` have put them in place. `collect` says whether
    the piece stays floating as an item to pick up when the entity is gathered (written to its
    `.parts.json`); by default it does when some item is made of that piece."""
    build, variants = PIECES[name]
    _PLACED[len(_PLACED) + 1] = (name, variant, collect)
    return [dict(b, part=len(_PLACED)) for b in build(variants[variant])]


def _voxels(value):
    """A length in skill units as voxels, to a tenth."""
    return round(value / SCALE * 10) / 10


def parts_of(boxes):
    """How an entity is built, from the boxes `piece`, `moved`, `turned` and `spun` put in place:
    its pieces in assembly order, each with its kit name and colour variant, the voxel where it
    stands (`at`: the middle of its footprint, on its lowest point) and its boxes around that
    point (centre `c`, half sizes `h` and corner radius `r`, in voxels, and `color`). Loose boxes the model drew
    without a piece each stand as a piece named `box`. Lengths are in voxels from the anchor
    tile's foot, the unit `.vox` files use."""
    order, loose = [], 0
    groups = {}
    for b in boxes:
        key = b.get("part")
        if key is None:
            loose += 1
            key = -loose
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(b)
    parts = []
    for key in order:
        group = groups[key]
        lo = [min(b["c"][a] - b["h"][a] for b in group) for a in range(3)]
        hi = [max(b["c"][a] + b["h"][a] for b in group) for a in range(2)]
        at = ((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2])
        name, variant, collect = _PLACED[key] if key > 0 else ("box", "", None)
        parts.append(dict(
            piece=name, variant=variant, collect=(name in _collectable()) if collect is None else collect, at=[_voxels(v) for v in at],
            boxes=[dict(c=[_voxels(b["c"][a] - at[a]) for a in range(3)],
                        h=[_voxels(b["h"][a]) for a in range(3)],
                        r=_voxels(b["r"]),
                        color=b["color"].lstrip("#"))
                   for b in group]))
    return parts


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
