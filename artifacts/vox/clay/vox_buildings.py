#!/usr/bin/env python3
# vox_buildings.py — the game's built entities (standing stones, houses, buildings) assembled
# from the stone and construction pieces of vox_prefabs.py (kits 2 and 3).
#
#   python3 vox_buildings.py                    → ../models/<name>.vox for every model
#   python3 vox_buildings.py --render           → …and each one rendered onto its asset
#   python3 vox_buildings.py --render smithy    only those
#
# Same rules as vox_models.py: positions in voxels, the anchor tile's foot at (0, 0, 0), x down-
# right and y down-left on screen, so the faces the sprite shows are +x (lit) and +y (shaded).
#
# A building is written once with its ridge along x, around (0, 0), and `along` lays it on its
# tiles for either axis. Walls and roofs sit on the 28-voxel module:
#   walls(nu, nv, …)    the perimeter of an nu × nv rectangle of wall or stone cells
#   gable(nu, nv, …)    a pitched roof over it: each course steps 14 in and 12 up
#   pyramid(sizes, …)   square courses, one per entry of `sizes` (cells per side)
#   face_x / face_y     a door, window, shield or rune pressed onto a +x or a +y face
import sys

from vox_models import M, put, run
from vox_prefabs import moved, turned


def cells(n):
    """Centres of n cells of the module, around 0."""
    return [(i - (n - 1) / 2) * M for i in range(n)]


def walls(nu, nv, z, levels, variant, name="wall_block", rise=M, skip=()):
    """The perimeter of an nu × nv rectangle of cells, `levels` courses up from z.
    skip: (i, j) cells left open on every course (a doorway, an open front)."""
    out = []
    for k in range(levels):
        for i, x in enumerate(cells(nu)):
            for j, y in enumerate(cells(nv)):
                edge = i in (0, nu - 1) or j in (0, nv - 1)
                if edge and (i, j) not in skip:
                    out += put(name, x, y, z + k * rise, variant)
    return out


def floor(nu, nv, variant, name="floor_slab", z=0):
    return [b for x in cells(nu) for y in cells(nv) for b in put(name, x, y, z, variant)]


def gable(nu, nv, z, variant, fill=None, ridge="timber", stripes=None):
    """A pitched roof over nu × nv cells, ridge along x, eaves 14 past the walls on every side.
    fill: the wall variant closing the two gable ends (None leaves them open).
    stripes: a second variant alternating with the first along the ridge (an awning)."""
    out, half = [], nv * M / 2
    if fill:
        for k in range(nv):
            for x in (cells(nu)[0], cells(nu)[-1]):
                for y in cells(nv - k):
                    out += put("wall_half", x, y, z + 4 + 12 * k, fill)
    for k in range(nv + 1):
        offset = half + 1 - 14 * k
        for i, x in enumerate(cells(nu + 1)):
            colour = stripes if stripes and i % 2 else variant
            for y in ([offset, -offset] if offset > 7 else [0]):
                out += put("roof_block", x, y, z + 12 * k, colour)
    if ridge:
        for x in cells(nu + 1):
            out += put("ridge", x, 0, z + 12 * (nv + 1), ridge)
    return out


def gable_top(nv, z):
    """Height of the ridge of a gable over nv cells started at z."""
    return z + 12 * (nv + 1) + 6


def pyramid(sizes, z, variant, name="roof_block", rise=12):
    """Square courses stacked from z, `sizes` cells per side from the bottom up. Only the rim of
    a course shows unless the next one is two or more cells smaller, so each is laid whole."""
    out = []
    for k, n in enumerate(sizes):
        for x in cells(n):
            for y in cells(n):
                out += put(name, x, y, z + k * rise, variant)
    return out


def face_x(name, x, y, z, variant=""):
    """A piece pressed onto a +x face whose plane is at x."""
    return put(name, x, y, z, variant)


def face_y(name, x, y, z, variant=""):
    """The same piece on a +y face whose plane is at y."""
    return put(name, x, y, z, variant, turn=True)


def side(n):
    """Where the outer face of n cells is, from their centre."""
    return n * M / 2 - 1


def stack(name, x, y, z, count, variant, rise):
    return [b for k in range(count) for b in put(name, x, y, z + k * rise, variant)]


def along(boxes, axis, tiles=2):
    """Lay a building written along x on a `tiles`-long footprint along x or y."""
    centre = (tiles - 1) * 64
    return moved(boxes, centre, 0, 0) if axis == "x" else moved(turned(boxes), 0, centre, 0)


# ------------------------------------------------------------------------- standing stones

def runestone():
    """runestone: one stone with blue runes on a gravel bed, a small stone and pebbles."""
    return (floor(3, 3, "gravel")
            + put("standing_stone", -8, -10, 3, "grey") + face_x("rune", 3, -10, 34, "blue")
            + face_x("rune", 3, -10, 16, "blue")
            + put("standing_stone_small", 24, 18, 3, "grey") + face_x("rune", 32, 18, 12, "red")
            + put("rock_s", -28, 12, 3) + put("pebble_l", 22, -26, 3) + put("pebble_m", -4, 30, 3)
            + put("moss_patch", 6, 12, 3))


def runestone_tall():
    """runestone_tall: a tall mossy stone with cyan runes, rocks at its foot."""
    return (floor(3, 3, "cobble")
            + put("standing_stone_tall", -6, -6, 3, "grey")
            + face_x("rune", 6, -6, 56, "cyan") + face_x("rune", 6, -6, 38, "cyan")
            + face_x("rune", 6, -6, 20, "cyan")
            + put("moss_patch", -6, 3, 48) + put("moss_patch", -8, -6, 81)
            + put("rock_l", 20, 24, 3) + put("rock_s", -30, 16, 3) + put("pebble_l", 26, -24, 3))


def runestone_pair():
    """runestone_pair: a tall grey stone and a shorter pale one, both with red runes."""
    return (floor(3, 3, "cobble")
            + put("standing_stone_tall", -14, -12, 3, "grey")
            + face_x("rune", -2, -12, 56, "red") + face_x("rune", -2, -12, 36, "red")
            + put("standing_stone", 20, 14, 3, "sand")
            + face_x("rune", 31, 14, 34, "red") + face_x("rune", 31, 14, 14, "red")
            + put("moss_patch", -4, 6, 3) + put("rock_s", -26, 26, 3) + put("pebble_m", 28, -22, 3))


def runestone_circle():
    """runestone_circle: four stones round a bare patch, a low altar stone in the middle."""
    out = floor(4, 4, "dirt")
    out += put("standing_stone", -38, -38, 3, "grey") + put("moss_patch", -38, -36, 57)
    out += put("standing_stone_small", 38, -36, 3, "grey") + face_x("rune", 46, -36, 12, "red")
    out += put("standing_stone_small", -36, 38, 3, "sand") + face_x("rune", -28, 38, 12, "red")
    out += put("standing_stone", 38, 38, 3, "sand") + face_x("rune", 49, 38, 30, "red")
    out += put("moss_patch", 38, 40, 57)
    return out + put("stone_small", 0, 0, 3, "sand") + put("rune_flat", 0, 0, 16, "red")


def runestone_fallen():
    """runestone_fallen: the broken foot of a stone still standing, the rest lying in front
    with its runes up, moss over both."""
    return (floor(3, 3, "gravel")
            + put("standing_stone_small", -16, -20, 3, "sand") + put("moss_patch", -16, -19, 33)
            + put("stone_small", 8, -24, 3, "sand")
            + put("stone_lying", 2, 14, 3, "sand") + put("rune_flat", -10, 14, 12, "blue")
            + put("rune_flat", 10, 14, 12, "blue") + put("moss_patch", 22, 16, 13)
            + put("rock_s", -30, -2, 3) + put("pebble_l", 30, -12, 3) + put("moss_patch", -6, 32, 3))


# --------------------------------------------------------------------------------- houses

def hut_moss():
    """hut_moss: dark plank walls under a turf roof, door in the lit gable, dragon heads."""
    top = 56
    return (walls(3, 3, 0, 2, "timber") + gable(3, 3, top - 4, "turf", fill="timber")
            + face_x("door", side(3), 0, 0) + face_x("shield", side(3), 0, 38, "red")
            + face_y("window", -14, side(3), 24, "lit")
            + put("dragon", 46, 0, gable_top(3, top - 4) - 4, "timber")
            + put("barrel", 50, 30, 0))


def hut_thatch():
    """hut_thatch: a pale stone round-house under a stepped thatch cap."""
    return (walls(3, 3, 0, 1, "sand", name="stone_block") + walls(3, 3, 28, 1, "sand", name="stone_half")
            + pyramid([4, 4, 3, 3, 2, 2, 1], 36, "thatch")
            + put("stone_small", 0, 0, 120, "sand")
            + face_x("door", side(3), 0, 0) + face_y("window", 0, side(3), 14, "dark")
            + put("crate", 52, 32, 0) + put("leaf_tuft", -30, 52, 0, "green"))


def cottage_tile():
    """cottage_tile: plaster over a stone footing, timber corners, a tile roof and a chimney."""
    top = 12 + 56
    out = walls(3, 3, 0, 1, "grey", name="stone_half") + walls(3, 3, 12, 2, "plaster")
    for x, y in ((41, 41), (41, -41), (-41, 41)):
        out += stack("trunk_thin", x, y, 12, 2, "timber", M)
    out += gable(3, 3, top - 4, "tile", fill="plaster")
    out += stack("stone_small", -28, -22, top + 20, 3, "grey", 14)
    out += face_x("door", side(3), 0, 12) + face_y("window", -14, side(3), 34, "lit")
    return out + face_x("window", side(3), 0, top + 8, "lit")


# ------------------------------------------------------------------------------ buildings

def healer_hut():
    """healer_hut: a stone round-house under a tall turf cone, a cauldron by the door."""
    return (walls(3, 3, 0, 2, "grey", name="stone_block")
            + pyramid([4, 4, 3, 3, 2, 2, 1, 1], 52, "turf")
            + put("trunk_thin", 0, 0, 140, "brown")
            + face_x("door", side(3), 0, 0) + face_y("window", 0, side(3), 26, "lit")
            + put("cauldron", 54, 34, 0) + put("leaf_tuft", 30, 54, 0, "dark"))


def smithy():
    """smithy: an open shed on four posts over flagstones, with the forge, its chimney, the
    anvil and a barrel."""
    out = floor(4, 4, "cobble")
    for x in (-40, 40):
        for y in (-40, 40):
            out += stack("trunk_thin", x, y, 3, 2, "timber", M)
    out += gable(3, 3, 59, "shingle")
    out += put("stone_block", -28, -28, 3, "dark") + put("stone_block", 0, -28, 3, "dark")
    out += put("fire", 0, -28, 29) + stack("stone_small", -28, -28, 29, 6, "grey", 14)
    out += put("anvil", 16, 14, 3) + put("barrel", -26, 34, 3) + put("crate", 34, -8, 3)
    return out


def market_stall():
    """market_stall: a striped awning on four posts over a plank deck, a counter with produce."""
    out = floor(4, 4, "plank")
    for x in (-40, 40):
        for y in (-40, 40):
            out += stack("trunk_thin", x, y, 3, 2, "timber", M)
    for i, x in enumerate(cells(4)):
        for j, y in enumerate(cells(3)):
            out += put("roof_block", x, y - 4, 59 + 4 * (2 - j), "red" if i % 2 == 0 else "white")
    out += put("wall_half", -14, 30, 3, "plank") + put("wall_half", 14, 30, 3, "plank")
    out += put("loaf", -18, 30, 15) + put("fruit", -4, 26, 15) + put("fruit", 4, 33, 15)
    out += put("leaf_tuft", 18, 30, 15, "green")
    return out + put("barrel", 12, -14, 3) + put("crate", -18, -16, 3) + put("crate", 36, 4, 3)


def stone_shrine():
    """stone_shrine: a stepped pyramid of red stone, runes on its courses, a fire on top."""
    out = pyramid([4, 3, 2], 0, "clay", name="stone_block", rise=M)
    out += put("stone_small", 0, 0, 84, "clay") + put("fire", 0, 0, 98)
    for y in (-28, 0, 28):
        out += face_x("rune", side(4), y + 14, 8, "dark")
    for x in (-28, 0, 28):
        out += face_y("rune", x - 14, side(4), 8, "dark")
    out += face_x("rune", side(3), 0, 36, "dark") + face_y("rune", 0, side(3), 36, "dark")
    out += put("moss_patch", 44, -30, 26) + put("moss_patch", -30, 30, 54) + put("moss_patch", -40, 44, 26)
    return out


def watchtower():
    """watchtower: a stone shaft, a plank gallery jutting out on top and a turf-roofed lookout."""
    deck = 5 * M
    out = walls(2, 2, 0, 5, "grey", name="stone_block")
    out += pyramid([4], deck, "plank", name="wall_half")
    out += walls(4, 4, deck + 12, 1, "timber", name="wall_half", skip={(3, 1), (3, 2), (1, 3), (2, 3)})
    out += walls(2, 2, deck + 12, 1, "plank") + gable(2, 2, deck + 36, "turf", fill="plank")
    out += face_x("door", side(2), 0, 0) + face_x("window", side(2), 0, 76, "dark")
    out += face_y("window", 0, side(2), 98, "dark") + face_y("banner", 14, side(4) + 1, deck - 20)
    return out


def stave_temple():
    """stave_temple: three dark timber storeys, each under its own shingle skirt, and a spire."""
    out = walls(3, 3, 0, 2, "timber") + pyramid([4, 3], 56, "dark")
    out += walls(2, 2, 80, 1, "timber") + pyramid([3, 2], 108, "dark")
    out += put("wall_block", 0, 0, 132, "timber") + pyramid([2, 1], 160, "dark")
    out += stack("trunk_thin", 0, 0, 184, 2, "timber", M)
    out += put("dragon", 34, 0, 132, "plank") + face_x("door", side(3), 0, 0)
    out += face_y("window", 0, side(3), 26, "lit") + face_x("shield", side(2), 0, 88, "red")
    return out + put("moss_patch", -30, 40, 68) + put("moss_patch", 20, -20, 120)


def mead_hall(axis):
    """mead_hall: a long timber hall on a stone footing, shingle roof, a row of shields down
    the long side, the door in the gable and a dragon head at the ridge."""
    nu, nv, top = 7, 3, 12 + 56
    out = walls(nu, nv, 0, 1, "grey", name="stone_half") + walls(nu, nv, 12, 2, "timber")
    out += gable(nu, nv, top - 4, "shingle", fill="timber", ridge="plank")
    out += face_x("door", side(nu), 0, 12) + face_x("shield", side(nu), 0, top + 6, "red")
    for n, x in enumerate(cells(nu)[1:-1]):
        out += face_y("shield", x, side(nv), 34, "red" if n % 2 == 0 else "white")
    out += put("dragon", side(nu) + 14, 0, gable_top(nv, top - 4) - 6, "plank")
    return along(out, axis)


def boathouse(axis):
    """boathouse: a plank shed under turf, its lit gable open, a boat half out of it and a
    barrel by the wall."""
    nu, nv, top = 6, 3, 56
    out = walls(nu, nv, 0, 2, "plank", skip={(nu - 1, 1)})
    out += gable(nu, nv, top - 4, "turf", fill="timber")
    out += put("boat", side(nu) - 8, 0, 0) + put("barrel", side(nu) + 8, 34, 0)
    for n, x in enumerate(cells(nu)[1:-1:2]):
        out += face_y("window", x, side(nv), 26, "dark")
    return along(out, axis)


# name → (builder, tiles, the asset its render replaces, under lib/assets)
MODELS = {
    "runestone": (runestone, (1, 1, 1), "building/block_runestone.png"),
    "runestone_tall": (runestone_tall, (1, 1, 1), "building/block_runestone_tall.png"),
    "runestone_pair": (runestone_pair, (1, 1, 1), "building/block_runestone_pair.png"),
    "runestone_circle": (runestone_circle, (1, 1, 1), "building/block_runestone_circle.png"),
    "runestone_fallen": (runestone_fallen, (1, 1, 1), "building/block_runestone_fallen.png"),
    "hut_moss": (hut_moss, (1, 1, 2), "house/block_hut_moss.png"),
    "hut_thatch": (hut_thatch, (1, 1, 2), "house/block_hut_thatch.png"),
    "cottage_tile": (cottage_tile, (1, 1, 2), "house/block_cottage_tile.png"),
    "healer_hut": (healer_hut, (1, 1, 2), "building/block_healer_hut.png"),
    "smithy": (smithy, (1, 1, 2), "building/block_smithy.png"),
    "market_stall": (market_stall, (1, 1, 1), "building/block_market_stall.png"),
    "stone_shrine": (stone_shrine, (1, 1, 2), "building/block_stone_shrine.png"),
    "watchtower": (watchtower, (1, 1, 3), "building/block_watchtower.png"),
    "stave_temple": (stave_temple, (1, 1, 3), "building/block_stave_temple.png"),
    "mead_hall_2x1": (lambda: mead_hall("x"), (2, 1, 2), "building/block_mead_hall_2x1.png"),
    "mead_hall_1x2": (lambda: mead_hall("y"), (1, 2, 2), "building/block_mead_hall_1x2.png"),
    "boathouse_2x1": (lambda: boathouse("x"), (2, 1, 2), "building/block_boathouse_2x1.png"),
    "boathouse_1x2": (lambda: boathouse("y"), (1, 2, 2), "building/block_boathouse_1x2.png"),
}

if __name__ == "__main__":
    run(MODELS, sys.argv[1:])
