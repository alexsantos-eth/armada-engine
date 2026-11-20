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
# tiles for either axis. No entity brings its own ground (a slab, a deck, a bed of gravel): it
# stands straight on the terrain's. Walls and roofs sit on the 28-voxel module:
#   walls(nu, nv, …)    the perimeter of an nu × nv rectangle of wall or stone cells
#   gable(nu, nv, …)    a pitched roof over it: each course steps 14 in and 12 up
#   pyramid(sizes, …)   square courses, one per entry of `sizes` (cells per side)
#   face_x / face_y     a door, window, shield or rune pressed onto a +x or a +y face
import sys

from vox_models import M, put, run
from vox_prefabs import SOOT, disc, moved, piece, spun, turned


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
    """runestone: one stone with blue runes, a small stone and pebbles."""
    return (put("standing_stone", -8, -10, 0, "grey") + face_x("rune", 3, -10, 31, "blue")
            + face_x("rune", 3, -10, 13, "blue")
            + put("standing_stone_small", 24, 18, 0, "grey") + face_x("rune", 32, 18, 9, "red")
            + put("rock_s", -28, 12, 0) + put("pebble_l", 22, -26, 0) + put("pebble_m", -4, 30, 0)
            + put("moss_patch", 6, 12, 0))


def runestone_tall():
    """runestone_tall: a tall mossy stone with cyan runes, rocks at its foot."""
    return (put("standing_stone_tall", -6, -6, 0, "grey")
            + face_x("rune", 6, -6, 53, "cyan") + face_x("rune", 6, -6, 35, "cyan")
            + face_x("rune", 6, -6, 17, "cyan")
            + put("moss_patch", -6, 3, 45) + put("moss_patch", -8, -6, 78)
            + put("rock_l", 20, 24, 0) + put("rock_s", -30, 16, 0) + put("pebble_l", 26, -24, 0))


def runestone_pair():
    """runestone_pair: a tall grey stone and a shorter pale one, both with red runes."""
    return (put("standing_stone_tall", -14, -12, 0, "grey")
            + face_x("rune", -2, -12, 53, "red") + face_x("rune", -2, -12, 33, "red")
            + put("standing_stone", 20, 14, 0, "sand")
            + face_x("rune", 31, 14, 31, "red") + face_x("rune", 31, 14, 11, "red")
            + put("moss_patch", -4, 6, 0) + put("rock_s", -26, 26, 0) + put("pebble_m", 28, -22, 0))


def runestone_circle():
    """runestone_circle: four stones in a ring, a low altar stone in the middle."""
    out = put("standing_stone", -38, -38, 0, "grey") + put("moss_patch", -38, -36, 54)
    out += put("standing_stone_small", 38, -36, 0, "grey") + face_x("rune", 46, -36, 9, "red")
    out += put("standing_stone_small", -36, 38, 0, "sand") + face_x("rune", -28, 38, 9, "red")
    out += put("standing_stone", 38, 38, 0, "sand") + face_x("rune", 49, 38, 27, "red")
    out += put("moss_patch", 38, 40, 54)
    return out + put("stone_small", 0, 0, 0, "sand") + put("rune_flat", 0, 0, 13, "red")


def runestone_fallen():
    """runestone_fallen: the broken foot of a stone still standing, the rest lying in front
    with its runes up, moss over both."""
    return (put("standing_stone_small", -16, -20, 0, "sand") + put("moss_patch", -16, -19, 30)
            + put("stone_small", 8, -24, 0, "sand")
            + put("stone_lying", 2, 14, 0, "sand") + put("rune_flat", -10, 14, 9, "blue")
            + put("rune_flat", 10, 14, 9, "blue") + put("moss_patch", 22, 16, 10)
            + put("rock_s", -30, -2, 0) + put("pebble_l", 30, -12, 0) + put("moss_patch", -6, 32, 0))


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


def house_thatch():
    """house_thatch: plank walls on a grey footing under a deep thatch gable, a woodpile at
    the lit gable beside the door."""
    top = 12 + 56
    out = walls(3, 3, 0, 1, "grey", name="stone_half") + walls(3, 3, 12, 2, "plank")
    out += gable(3, 3, top - 4, "thatch", fill="plank")
    out += face_x("door", side(3), -8, 12) + face_y("window", 0, side(3), 34, "lit")
    out += put("firewood", 52, 30, 0, turn=True) + put("firewood", 52, 30, 12, turn=True)
    return out + put("leaf_tuft", -24, 54, 0, "green")


def house_stone():
    """house_stone: two courses of grey masonry, timber gable ends under a turf
    roof, a stone chimney at the back and a barrel by the door."""
    top = 2 * M
    out = walls(3, 3, 0, 2, "grey", name="stone_block")
    out += gable(3, 3, top - 4, "turf", fill="timber")
    out += stack("stone_small", -28, -30, top + 16, 4, "dark", 14)
    out += face_x("door", side(3), 0, 0) + face_y("window", -14, side(3), 26, "dark")
    out += put("moss_patch", 30, 42, 52) + put("moss_patch", -42, 20, 26)
    return out + put("barrel", 52, 32, 0) + put("rock_s", 50, -36, 0)


def house_annex():
    """house_annex: a plaster house two cells deep pushed to the back, a plank lean-to under
    its own lower shingle roof along the shaded side, a lit window in the lean-to."""
    body = walls(3, 2, 0, 1, "grey", name="stone_half") + walls(3, 2, 12, 2, "plaster")
    body += gable(3, 2, 64, "shingle", fill="plaster")
    body += face_x("door", side(3), 0, 12) + face_x("window", side(3), 0, 78, "lit")
    out = moved(body, 0, -14, 0)
    for x in (-28, 0):                                      # the lean-to: two cells along y = +28
        out += put("wall_block", x, 28, 0, "plank") + put("wall_half", x, 28, 28, "plank")
    for x in (-42, -14, 14):                                # its roof steps down toward +y
        out += put("roof_block", x, 28, 40, "shingle") + put("roof_block", x, 42, 28, "shingle")
    out += face_y("window", -14, 41, 10, "lit") + face_x("door", 13, 28, 0)
    return out + put("crate", 30, 32, 0) + put("crate", 30, 32, 12)


def house_twowood():
    """house_twowood: a course of pale plank under a course of dark timber, timber posts at the
    seen corners, a red-brown shingle gable closed in plank and a shield over the door."""
    top = 2 * M
    out = walls(3, 3, 0, 1, "plank") + walls(3, 3, M, 1, "timber")
    for x, y in ((41, 41), (41, -41), (-41, 41)):
        out += stack("trunk_thin", x, y, 0, 2, "timber", M)
    out += gable(3, 3, top - 4, "dark", fill="plank", ridge="plank")
    out += face_x("door", side(3), 0, 0) + face_x("shield", side(3), 0, 40, "white")
    out += face_y("window", 0, side(3), 30, "lit")
    out += put("dragon", 46, 0, gable_top(3, top - 4) - 4, "plank")
    return out + put("barrel", 52, -30, 0)


# ------------------------------------------------------------------------------ buildings

def healer_hut():
    """healer_hut: a stone round-house under a tall turf cone, a cauldron by the door."""
    return (walls(3, 3, 0, 2, "grey", name="stone_block")
            + pyramid([4, 4, 3, 3, 2, 2, 1, 1], 52, "turf")
            + put("trunk_thin", 0, 0, 140, "brown")
            + face_x("door", side(3), 0, 0) + face_y("window", 0, side(3), 26, "lit")
            + put("cauldron", 54, 34, 0) + put("leaf_tuft", 30, 54, 0, "dark"))


def smithy():
    """smithy: an open shed on four posts, with the forge, its chimney, the
    anvil and a barrel."""
    out = []
    for x in (-40, 40):
        for y in (-40, 40):
            out += stack("trunk_thin", x, y, 0, 2, "timber", M)
    out += gable(3, 3, 56, "shingle")
    out += put("stone_block", -28, -28, 0, "dark") + put("stone_block", 0, -28, 0, "dark")
    out += put("fire", 0, -28, 26) + stack("stone_small", -28, -28, 26, 6, "grey", 14)
    out += put("anvil", 16, 14, 0) + put("barrel", -26, 34, 0) + put("crate", 34, -8, 0)
    return out


def market_stall():
    """market_stall: a flat striped awning resting on four posts, a counter with produce."""
    out = []
    for x in (-40, 40):
        for y in (-36, 36):
            out += stack("trunk_thin", x, y, 0, 2, "timber", M)
    for i, x in enumerate(cells(4)):
        for y in cells(4):
            out += put("roof_block", x, y, 2 * M, "red" if i % 2 == 0 else "white")
    out += put("wall_half", -14, 30, 0, "plank") + put("wall_half", 14, 30, 0, "plank")
    out += put("loaf", -18, 30, 12) + put("fruit", -4, 26, 12) + put("fruit", 4, 33, 12)
    out += put("leaf_tuft", 18, 30, 12, "green")
    return out + put("barrel", 12, -14, 0) + put("crate", -18, -16, 0) + put("crate", 36, 4, 0)


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


# ------------------------------------------------------------------------------- the beach

def wreck(axis):
    """wreck: a longship run aground and broken: the hull with its dragon prow, a gap in the
    shaded side where the ribs stand bare, the mast snapped short and the striped sail fallen
    on the sand beside it, a shield and a barrel washed up. Two tiles along `axis`."""
    out = moved(piece("hull_end", "plank"), 82, 0, 0) + moved(spun(piece("hull_end", "plank"), 2), -82, 0, 0)
    for n, x in enumerate(cells(5)):
        if n == 3:                                        # the broken stretch: keel and ribs only
            out += put("hull_mid", x, 0, 0, "timber")[:1]
            out += [b for dx in (-8, 8) for b in put("trunk_thin", x + dx, 12, 4, "timber")]
            out += put("hull_mid", x, 0, 0, "plank")[1:3]  # the far side still stands
        else:
            out += put("hull_mid", x, 0, 0, "plank")
    out += put("dragon", 100, 0, 40, "timber") + put("trunk_thin", -98, 0, 40, "timber")
    out += stack("trunk", -6, 0, 8, 2, "brown", M)        # the mast, snapped at two lengths
    for n in range(7):                                    # the striped sail, fallen on the lit side
        out += put("cloth", -42 + 14 * n, 46, 0, "red" if n % 2 == 0 else "white")
    for x in (-56, -28, 56):                              # shields on the shaded side, off the gap
        out += face_y("shield", x, 28, 7, "red" if x != -28 else "white")
    out += put("barrel", 50, -46, 0) + put("rope_coil", -50, -46, 0)
    return along(out, axis)


def rowboat():
    """rowboat: a small longship-built boat pulled up on the sand (the hull pieces: a bow, one
    module, a stern), its two oars across the gunwales, a crate and a rope beside it."""
    out = (moved(piece("hull_end", "timber"), 28, -8, 0) + put("hull_mid", 0, -8, 0, "plank")
           + moved(spun(piece("hull_end", "plank"), 2), -28, -8, 0))
    out += put("branch", 6, -8, 26, "timber", turn=True) + put("branch", -14, -8, 26, "timber", turn=True)
    return out + put("crate", -30, 40, 0) + put("rope_coil", 30, 36, 0)


def anchor_rest():
    """anchor: a great iron anchor stood on its crown, its rope coiled at the foot, a stone."""
    return (put("anchor", -8, -8, 0) + put("rope_coil", 22, 20, 0) + put("rope_coil", 22, 20, 4)
            + put("stone_small", -30, 22, 0, "grey") + put("pebble_m", 26, -24, 0))


def flag_post():
    """flag_post: a tall pole with a red striped flag, a dragon at the top and a cairn at its foot."""
    out = stack("trunk_thin", -6, -6, 0, 5, "timber", M)
    out += face_x("flag", -1, -6, 100, "red") + put("dragon", -6, -6, 140, "timber")
    out += face_x("shield", -1, -6, 30, "white")
    return (out + put("stone_small", -26, 8, 0, "grey") + put("stone_small", 12, -22, 0, "sand")
            + put("stone_small", -12, 14, 0, "grey") + put("pebble_l", 20, 18, 0))


def fish_rack():
    """fish_rack: a drying rack of stockfish: two posts, a long bar along y and the fish hanging,
    with a barrel at its foot."""
    out = stack("trunk_thin", 0, -40, 0, 2, "timber", M) + stack("trunk_thin", 0, 40, 0, 2, "timber", M)
    out += [b for y in (-27, 0, 27) for b in put("branch", 0, y, 56, "brown", turn=True)]
    out += [b for y in (-24, -12, 0, 12, 24) for b in put("fish", 0, y, 40)]
    return out + put("barrel", 30, 28, 0) + put("fish", 24, -30, 0)


def gull_post():
    """gull_post: two mooring posts, a rope round the tall one and a gull standing on it."""
    out = stack("trunk", -8, -8, 0, 2, "brown", M) + put("trunk", 22, 14, 0, "brown")
    out += put("rope_coil", -8, -8, 36) + put("gull", -8, -8, 56)
    return out + put("pebble_l", 30, -20, 0) + put("shell", -28, 26, 0, "white")


def campfire():
    """campfire: a ring of stones round a bed of coals, three logs crossed over it. The flames
    and the smoke are drawn by the game, so the model keeps the fire itself low and dark."""
    out = []
    for n, (x, y) in enumerate(((30, 0), (21, 21), (0, 30), (-21, 21), (-30, 0), (-21, -21), (0, -30), (21, -21))):
        out += put("stone_small", x, y, 0, "dark" if n % 3 == 1 else "grey")
    out += put("fire", 6, 0, 0) + put("fire", -8, 6, 0)
    out += put("firewood", -2, -15, 0) + put("firewood", -2, 15, 0) + put("firewood", -12, 0, 12, turn=True)
    return out + put("pebble_m", 38, -22, 0) + put("pebble_s", -34, -26, 0)


# ------------------------------------------------------------- ruins and relics of the field

def burial_mound(axis):
    """burial_mound: a long grassy barrow closing in course by course, a runestone on its crown
    and a timber door between two stone posts in its lit end. Two tiles along `axis`."""
    out = []
    for k, (nu, nv) in enumerate(((7, 3), (5, 2), (3, 1), (1, 1))):
        for i, x in enumerate(cells(nu)):
            for j, y in enumerate(cells(nv)):
                out += put("turf_block", x, y, k * M, "moss" if (i + j + k) % 4 == 3 else "turf")
    out += put("standing_stone", 0, 0, 4 * M, "grey") + face_x("rune", 11, 0, 4 * M + 26, "red")
    out += face_x("door", side(7), 0, 0)
    for y in (-19, 19):
        out += stack("stone_small", 104, y, 0, 3, "grey", 14)
    out += put("stone_lying", 104, 0, 42, "grey", turn=True)
    out += put("flower_big", -56, 42, 0, "white") + put("flower_big", 30, 44, 0, "yellow")
    return along(out + put("grass_tuft", 70, 46, 0, "dry") + put("rock_s", -104, -30, 0), axis)


def collapsed_wall():
    """collapsed_wall: what is left of a stone wall, stepping down course by course, its fallen
    blocks lying in front of it and moss over the stones."""
    out = put("stone_block", -22, -28, 0, "grey") + put("stone_block", -22, 0, 0, "dark")
    out += put("stone_block", -22, 28, 0, "grey") + put("stone_block", -22, -28, M, "grey")
    out += put("stone_block", -22, 0, M, "grey") + put("stone_block", -22, -28, 2 * M, "dark")
    out += put("moss_patch", -22, -27, 3 * M - 2) + put("moss_patch", -21, 1, 2 * M) + put("moss_patch", -21, 29, M)
    out += put("stone_block", 16, 18, 0, "grey") + put("stone_half", 22, -20, 0, "dark")
    out += put("stone_small", 42, 2, 0, "grey") + put("stone_small", 4, 44, 0, "dark")
    return out + put("moss_patch", 16, 19, 26) + put("grass_tuft", -44, 44, 0, "green") + put("pebble_l", 40, 36, 0)


def old_well():
    """old_well: a round of mossy stone round dark water, two posts carrying the winding beam
    with its rope, and the bucket left on the rim."""
    out = walls(3, 3, 0, 2, "grey", name="stone_half", rise=12) + put("well_water", 0, 0, 16)
    out += put("moss_patch", 28, 28, 24) + put("moss_patch", -28, 28, 24)
    for y in (-48, 48):
        out += stack("trunk_thin", 0, y, 0, 2, "timber", M)
    out += put("branch_long", 0, -22, 56, "timber", turn=True) + put("branch_long", 0, 22, 56, "timber", turn=True)
    out += put("rope_coil", 0, 0, 54) + put("bucket", 30, 28, 24)
    return out + put("grass_tuft", 40, -38, 0, "green") + put("grass_tuft", -42, 42, 0, "dry")


def shield_grave():
    """shield_grave: a warrior's grave: a cairn of stones, a spear stuck in the ground behind it
    and a red shield leant against its lit side, a white flower left in front."""
    out = [b for x, y, v in ((-18, -14, "grey"), (8, -14, "dark"), (-18, 12, "dark"), (8, 12, "grey"))
           for b in put("stone_half", x, y, 0, v)]
    out += put("stone_small", -12, -8, 12, "grey") + put("stone_small", 4, -6, 12, "dark")
    out += put("stone_small", -10, 8, 12, "dark") + put("stone_small", 2, 8, 12, "grey")
    out += put("stone_small", -4, 0, 26, "grey") + put("moss_patch", -4, 0, 40)
    out += face_x("shield", 22, 0, 12, "red") + put("spear", -34, -30, 0)
    out += put("wildflower", 34, 26, 0, "white") + put("grass_tuft", -38, 36, 0, "green")
    return out + put("grass_tuft", 38, -34, 0, "dry") + put("pebble_m", 16, 42, 0)


def abandoned_cart(axis):
    """abandoned_cart: a cart left in the field: a plank bed on one axle, the near wheel still on,
    the other lying in the grass, its shafts dropped to the ground and sacks and a barrel still
    aboard. Written along x and laid on two tiles along `axis`."""
    out = [b for x in cells(4) for y in cells(2) for b in put("wall_half", x, y, 16, "plank")]
    out += [b for x in cells(4) for y in (-31, 31) for b in put("branch", x, y, 28, "timber")]
    out += put("branch", -60, 0, 28, "timber", turn=True)
    out += put("wheel", -14, 38, 0) + put("stone_small", -14, -34, 0, "grey") + put("stone_small", 48, 0, 0, "grey")
    out += put("branch_long", 80, -18, 0, "timber") + put("branch_long", 80, 18, 0, "timber")
    out += put("sack", -32, 0, 28) + put("sack", -8, -10, 28) + put("barrel", 22, 8, 28)
    out += put("wheel_flat", -84, 40, 0) + put("crate", -106, -28, 0) + put("sack", 104, 40, 0)
    return along(out + put("grass_tuft", 104, -30, 0, "green") + put("grass_tuft", -104, 12, 0, "dry"), axis)


def buried_chest():
    """buried_chest: a chest half dug out of the ground, clods of earth round it, gold coins
    spilled on the lit side and the shovel left stuck in the spoil."""
    out = put("chest", -6, -6, 0)
    for x, y, v in ((15, -6, "earth"), (-27, -6, "dark"), (-6, 11, "earth"), (-6, -23, "dark"),
                    (12, 10, "dark"), (-24, 10, "earth"), (12, -22, "earth"), (-24, -22, "earth")):
        out += put("clod", x, y, 0, v)
    out += put("clod", -36, -34, 0, "earth") + put("clod", -26, -42, 0, "dark") + put("shovel", -36, -34, 7)
    out += put("coin", 26, 14, 0) + put("coin", 32, 4, 0) + put("coin", 16, 12, 7) + put("coin", 22, 26, 0)
    return out + put("grass_tuft", 34, -30, 0, "green") + put("pebble_l", -34, 26, 0)


def totem_stub():
    """totem_stub: a weathered totem pole: three carved faces stacked, wings jutting out under
    the top one and a dragon head crowning it, stones and grass at its foot."""
    out = put("totem", -6, -6, 0, "wood") + put("totem", -6, -6, M, "plank") + put("totem", -6, -6, 2 * M, "wood")
    out += put("branch", -6, -26, 70, "timber", turn=True) + put("branch", -6, 14, 70, "timber", turn=True)
    out += put("dragon", -6, -6, 3 * M, "timber") + put("moss_patch", -6, -6, 3 * M - 2)
    out += put("stone_small", 18, 18, 0, "grey") + put("rock_s", -30, 20, 0)
    return out + put("grass_tuft", 22, -24, 0, "dry") + put("grass_tuft", -28, -30, 0, "green")


# ---------------------------------------------------------- stones and relics of the bare ground

def ore_vein(variant):
    """ore_vein: a knot of bedrock breaking through the bare ground, streaks of ore (iron or amber)
    in its lit faces and a few loose nuggets broken off at its foot."""
    out = put("stone_block", -14, -14, 0, "grey") + put("stone_block", 14, -14, 0, "dark")
    out += put("stone_block", -14, 14, 0, "dark") + put("stone_half", 14, 14, 0, "grey")
    out += put("stone_block", -12, -12, M, "grey") + put("stone_small", 12, -14, M, "dark")
    out += face_x("vein", 27, -14, 5, variant) + face_x("vein", 3, -12, M + 5, variant)
    out += face_y("vein", -14, 27, 4, variant) + put("ore", 14, 14, 12, variant)
    out += put("ore", 38, 30, 0, variant) + put("ore", 30, 42, 0, variant) + put("pebble_l", 42, -28, 0)
    return out + put("rock_s", -38, 38, 0) + put("pebble_s", 38, 8, 0)


def cairn():
    """cairn: a waymark of flat stones stacked four high, each turned against the one under it,
    a rounded stone on top and pebbles round its foot."""
    out = put("flat_stone", -6, -6, 0, "grey") + put("flat_stone", -4, -8, 9, "dark", turn=True)
    out += put("flat_stone_small", -7, -5, 18, "grey") + put("flat_stone_small", -5, -7, 27, "sand", turn=True)
    out += put("stone_small", -6, -6, 36, "grey") + put("moss_patch", -9, -4, 9 + 8)
    out += put("pebble_l", 26, 18, 0) + put("pebble_m", 14, 30, 0) + put("pebble_s", 30, -14, 0)
    return out + put("rock_s", -32, 28, 0) + put("pebble_m", -34, -30, 0)


def menhir():
    """menhir: a lone standing stone of rough granite about two blocks high, lichen on its lit
    face and stones at its foot."""
    out = put("menhir", -6, -4, 0, "grey")
    out += put("moss_patch", 11, -6, 30) + put("moss_patch", 5, 7, 84)
    out += face_x("rune", 11, 2, 60, "dark")
    return out + put("rock_s", 26, 22, 0) + put("pebble_l", -30, 28, 0) + put("pebble_m", 30, -26, 0)


def barrow_entrance(axis):
    """barrow_entrance: a low earthen barrow with the stone doorway of its passage in the lit end:
    two posts, a lintel across them and the dark mouth between. Two tiles along `axis`."""
    out = []
    for k, (nu, nv) in enumerate(((7, 3), (5, 2), (3, 1))):
        for i, x in enumerate(cells(nu)):
            for j, y in enumerate(cells(nv)):
                if k == 0 and i == nu - 1:
                    continue
                out += put("turf_block", x, y, k * M, "moss" if (i + j + k) % 4 == 3 else "turf")
    for y in (-28, 28):
        out += stack("stone_block", 84, y, 0, 2, "dark", M)
    out += put("stone_lying", 84, 0, 2 * M, "grey", turn=True)
    out += put("mouth", 74, 0, 0) + put("pit", 92, 0, 0)
    out += put("moss_patch", 84, -28, 2 * M + 10) + face_x("rune", 97, 28, 22, "red")
    out += put("stone_small", 110, -40, 0, "grey") + put("pebble_l", 112, 30, 0)
    return along(out + put("rock_s", -100, 36, 0) + put("pebble_m", -60, -48, 0), axis)


def ruined_forge():
    """ruined_forge: a smithy's stone hearth fallen in: three blocks of its bed and a stub of the
    chimney still standing, cold ash and charcoal on it and spilled round, the fourth block and
    the anvil lying in the dirt."""
    out = put("stone_block", -20, -20, 0, "grey") + put("stone_block", 8, -20, 0, "dark")
    out += put("stone_block", -20, 8, 0, "dark") + put("stone_block", -20, -20, M, "grey")
    out += put("stone_small", -22, -22, 2 * M, "dark") + put("ash", -2, -4, M - 1)
    out += put("stone_half", 34, 26, 0, "grey") + put("anvil", 32, -30, 0)
    out += put("ash", 14, 20, 0) + put("ash", -26, 36, 0)
    out += put("branch_long", 4, 44, 0, "timber") + put("branch", 36, 6, 0, "timber", turn=True)
    return out + put("stone_small", 40, 0, 0, "dark") + put("pebble_m", -40, 30, 0)


def excavation_pit():
    """excavation_pit: a hole dug in the bare ground, its spoil heaped behind it, a pickaxe leant on
    the heap and a stone hauled out of it."""
    out = put("pit", 6, 6, 0)
    for x, y, z, v in ((-30, -24, 0, "earth"), (-30, -8, 0, "dark"), (-30, 8, 0, "earth"), (-24, 24, 0, "dark"),
                       (-14, -30, 0, "dark"), (2, -32, 0, "earth"), (18, -30, 0, "dark"),
                       (-34, -16, 6, "dark"), (-32, 2, 6, "earth"), (-20, -32, 6, "earth"),
                       (-38, -32, 0, "earth"), (-28, -28, 10, "dark")):
        out += put("clod", x, y, z, v)
    out += moved(spun(piece("pickaxe"), 2), -2, -26, 0)
    out += put("rock_s", 38, 34, 0) + put("clod", 36, 18, 0, "earth") + put("clod", 20, 38, 0, "dark")
    return out + put("pebble_m", 40, -12, 0)


def rusty_chain():
    """rusty_chain: a length of rusted chain lying in the dirt, flat and standing links in turn,
    one end still on the iron ring of a stake, the other broken off."""
    out = put("trunk_thin", -36, -36, 0, "timber") + put("link_up", -36, -28, 18, "rusted", turn=True)
    path = [(-36, -26 + 9 * k, "y") for k in range(1, 4)]
    path += [(-34 + 9 * k, 4, "x") for k in range(1, 6)]
    path += [(14, 4 + 9 * k, "y") for k in range(1, 4)]
    path += [(14 + 9 * k, 34, "x") for k in range(1, 3)]
    for n, (x, y, a) in enumerate(path):
        out += put("link" if n % 2 == 0 else "link_up", x, y, 0, "rusted", turn=a == "y")
    return out + put("rock_s", 34, -18, 0) + put("pebble_m", -12, 34, 0) + put("grass_tuft", 30, -40, 0, "dry")


def skull_helmet():
    """skull_helmet: a fallen warrior: a skull in the dirt with its iron helmet still on, a red
    shield lying face up behind it, a sword dropped beside them and a bone."""
    out = put("skull", 6, 2, 0) + put("helmet", 1, 2, 10, "iron")
    out += put("shield_flat", -22, 20, 0, "red") + put("sword", -2, -28, 0)
    out += put("bone", 28, 28, 0, turn=True) + put("bone", -32, -10, 0)
    return out + put("pebble_m", 36, -8, 0) + put("pebble_s", -10, 40, 0)


def rubble():
    """rubble: the tumbled stones of something long fallen: a block and its half, a lintel lying
    across the dirt, small stones spilled round them."""
    out = put("stone_half", -16, -14, 0, "grey") + put("stone_small", -14, -12, 12, "dark")
    out += put("stone_block", 14, -22, 0, "dark") + put("stone_lying", 4, 18, 0, "grey")
    out += put("flat_stone_small", -30, 22, 0, "sand") + put("stone_small", 30, 4, 0, "grey")
    out += put("moss_patch", 12, -24, 26) + put("pebble_l", 36, 34, 0) + put("pebble_m", -38, -36, 0)
    return out + put("pebble_s", -4, 40, 0) + put("rock_s", 40, -36, 0)


def battle_spears():
    """battle_spears: where a fight was lost: three spears still stuck in the dirt, a white shield
    face up, a rusted helmet and an old bone."""
    out = put("spear", -22, -18, 0) + put("spear", -4, -28, 0) + put("spear", -28, 4, 0)
    out += put("shield_flat", 16, 8, 0, "white") + put("helmet", 22, 34, 5, "rusted")
    out += put("bone", -24, 34, 0) + put("sword", 22, -30, 0)
    return out + put("pebble_m", 42, -8, 0) + put("pebble_s", -40, -36, 0)


def burrow():
    """burrow: a heap of dug earth over the dark mouth of an animal's den, loose clods spilled in
    front of it."""
    out = []
    for x, y, z, v in ((-22, -20, 0, "dark"), (-22, -4, 0, "earth"), (-22, 12, 0, "dark"), (-8, -24, 0, "earth"),
                       (8, -22, 0, "dark"), (-8, 16, 0, "earth"), (8, 16, 0, "dark"),
                       (-16, -12, 6, "earth"), (-16, 6, 6, "dark"), (0, -16, 6, "dark"), (0, 10, 6, "earth"),
                       (-10, -4, 12, "earth"), (2, -4, 12, "dark")):
        out += put("clod", x, y, z, v)
    out += moved(disc(16, 3, SOOT, "yz"), 12, -4, 0)
    out += put("clod", 28, -10, 0, "earth") + put("clod", 30, 8, 0, "dark") + put("clod", 40, -2, 0, "earth")
    return out + put("grass_tuft", -38, 34, 0, "dry") + put("pebble_m", 36, 36, 0)


def skull_pole():
    """skull_pole: a timber stake with a horned ox skull set on its head, a warning at the edge
    of the waste, wedged at its foot with stones, a bone dropped beside it."""
    out = stack("trunk_thin", -6, -6, 0, 3, "timber", M) + put("skull_horned", -4, -6, 3 * M)
    out += put("stone_small", 8, -8, 0, "grey") + put("stone_small", -18, 6, 0, "dark")
    out += put("bone", 22, 22, 0) + put("pebble_m", -32, -30, 0)
    return out + put("grass_tuft", 30, -32, 0, "dry") + put("rock_s", -34, 34, 0)


# ------------------------------------------------------------- animated entities (lib/assets/animated)
# The game animates these: flames, the lantern, flies, steam and leaves are drawn by
# src/effects/emitters.rs, so the models keep only what stands still. The anchors the game
# needs (the cup, the bowl, the hook, the wicks, the geyser's mouth) are written next to each
# model and mirrored in emitters.rs; move one and move the other.

def torch_post():
    """torch_post: a timber post with an iron fire cup on its head, wedged with stones at its
    foot. The cup's coals are at (−6, −6, 66)."""
    out = stack("trunk_thin", -6, -6, 0, 2, "timber", M) + put("torch_cup", -6, -6, 2 * M)
    out += put("stone_small", 8, -8, 0, "grey") + put("pebble_m", -18, 8, 0) + put("pebble_s", 6, 10, 0)
    return out + put("rock_s", 30, 26, 0) + put("grass_tuft", 30, -34, 0, "dry")


def brazier():
    """brazier: a wide iron bowl of coals on four iron legs, ash spilled under it. The coals are
    at (−4, −4, 57)."""
    out = []
    for x, y in ((-11, -11), (3, -11), (-11, 3), (3, 3)):        # under the bowl's foot
        out += stack("rod", x, y, 0, 2, "", 21)
    out += put("bowl", -4, -4, 42) + put("ash", 22, 20, 0) + put("ash", -24, 26, 0)
    return out + put("pebble_m", 34, -18, 0) + put("stone_small", -32, -30, 0, "dark")


def hanging_lantern():
    """hanging_lantern: a timber post with an arm reaching toward the viewer and an iron hook at
    its tip. The lantern hangs from the hook at (4, 0, 62); the game swings it."""
    out = stack("trunk_thin", -34, 0, 0, 3, "timber", M)
    out += put("branch_long", -14, 0, 70, "timber") + put("branch", -24, 0, 60, "timber")
    out += put("link_up", 4, 0, 62, "iron", turn=True)
    out += put("stone_small", -20, 12, 0, "grey") + put("stone_small", -46, -12, 0, "dark")
    return out + put("pebble_m", 30, 30, 0) + put("grass_tuft", -40, 30, 0, "green")


def fly_swarm():
    """fly_swarm: a stinking peat puddle with a gnawed bone in it; the game hovers the flies."""
    out = put("puddle", 0, 0, 0) + put("bone", 6, 4, 3) + put("bone", -14, -10, 0, turn=True)
    return out + put("pebble_s", 30, -20, 0) + put("grass_tuft", -32, 30, 0, "green")


def fly_swarm_bones():
    """fly_swarm_bones: the ribs of a carcass in the dirt under its horned skull; flies hover."""
    out = [b for y in (-18, -6, 6) for b in put("rib", -10, y, 0)]
    out += put("skull_horned", 18, 2, 0) + put("bone", -30, 22, 0) + put("ash", -32, -26, 0)
    return out + put("pebble_m", 30, -30, 0)


def fly_swarm_sand():
    """fly_swarm_sand: dead fish washed up by a bit of driftwood; flies hover."""
    out = put("fish_flat", 0, -4, 0) + put("fish_flat", -6, 12, 0, turn=True) + put("fish_flat", 16, 18, 0)
    out += put("driftwood", -28, -24, 0)
    return out + put("pebble_s", 32, -16, 0)


def geyser():
    """geyser: a low cone of pale sinter ledges round a hot turquoise pool, stained ochre where
    the water spills. The mouth is at (−4, −4, 18); the game blows the jet."""
    out = []
    for n, (x, y) in enumerate(((30, 0), (21, 21), (0, 30), (-21, 21), (-30, 0), (-21, -21), (0, -30), (21, -21))):
        out += put("sinter", x - 4, y - 4, 0, "grey" if n % 3 == 2 else "sinter", turn=n % 2 == 1)
    for n, (x, y) in enumerate(((15, 0), (8, 13), (-8, 13), (-15, 0), (-8, -13), (8, -13))):
        out += put("sinter_small", x - 4, y - 4, 8, "sinter", turn=n % 2 == 0)
    out += put("hot_pool", -4, -4, 15)
    out += put("ore", 30, 20, 0, "amber") + put("moss_patch", -36, 20, 0)
    return out + put("pebble_m", 40, -24, 0) + put("rock_s", -38, -38, 0)


def leaf_emitter():
    """leaf_emitter: fallen leaves under a tree, ochre and rust; the game drops more on them."""
    out = []
    for n, (x, y) in enumerate(((-24, -16), (-4, -30), (16, -8), (-10, 6), (26, 18), (-30, 22), (6, 30), (34, -26))):
        out += put("fallen_leaf", x, y, 0, "rust" if n % 3 == 1 else "ochre", turn=n % 2 == 0)
    return out + put("sprout", -26, -34, 0) + put("pebble_s", 38, 4, 0)


def ritual_candles():
    """ritual_candles: candles on a flat altar stone and two more on the ground before it, wax
    pooled round their feet and a red glyph on the stone. The wicks are written in WICKS."""
    out = put("flat_stone", -10, -10, 0, "dark") + put("rune_flat", -2, -18, 7, "red")
    for (x, y, z), (name, variant) in zip(WICKS, CANDLES):
        out += put(name, x, y, z, variant)
    out += put("wax", -16, -4, 8) + put("wax", 22, 22, 0)
    return out + put("pebble_m", 36, -26, 0) + put("moss_patch", -34, 28, 0)


# where each candle of ritual_candles stands (its foot), and which candle it is
WICKS = [(-20, -18, 8), (-2, -4, 8), (-20, 2, 8), (24, 14, 0), (12, 30, 0)]
CANDLES = [("candle_tall", "wax"), ("candle", "red"), ("candle_short", "wax"), ("candle", "wax"),
           ("candle_short", "wax")]


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
    "house_thatch": (house_thatch, (1, 1, 2), "house/block_house_thatch.png"),
    "house_stone": (house_stone, (1, 1, 2), "house/block_house_stone.png"),
    "house_annex": (house_annex, (1, 1, 2), "house/block_house_annex.png"),
    "house_twowood": (house_twowood, (1, 1, 2), "house/block_house_twowood.png"),
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
    "wreck_2x1": (lambda: wreck("x"), (2, 1, 1), "beach/block_wreck_2x1.png"),
    "wreck_1x2": (lambda: wreck("y"), (1, 2, 1), "beach/block_wreck_1x2.png"),
    "rowboat": (rowboat, (1, 1, 1), "beach/block_rowboat.png"),
    "anchor": (anchor_rest, (1, 1, 1), "beach/block_anchor.png"),
    "flag_post": (flag_post, (1, 1, 2), "beach/block_flag_post.png"),
    "fish_rack": (fish_rack, (1, 1, 1), "beach/block_fish_rack.png"),
    "gull_post": (gull_post, (1, 1, 1), "beach/block_gull_post.png"),
    "campfire": (campfire, (1, 1, 1), "building/block_campfire.png"),
    "burial_mound_2x1": (lambda: burial_mound("x"), (2, 1, 2), "field/block_burial_mound_2x1.png"),
    "burial_mound_1x2": (lambda: burial_mound("y"), (1, 2, 2), "field/block_burial_mound_1x2.png"),
    "collapsed_wall": (collapsed_wall, (1, 1, 1), "field/block_collapsed_wall.png"),
    "old_well": (old_well, (1, 1, 1), "field/block_old_well.png"),
    "shield_grave": (shield_grave, (1, 1, 1), "field/block_shield_grave.png"),
    "abandoned_cart_2x1": (lambda: abandoned_cart("x"), (2, 1, 1), "field/block_abandoned_cart_2x1.png"),
    "abandoned_cart_1x2": (lambda: abandoned_cart("y"), (1, 2, 1), "field/block_abandoned_cart_1x2.png"),
    "buried_chest": (buried_chest, (1, 1, 1), "field/block_buried_chest.png"),
    "totem_stub": (totem_stub, (1, 1, 2), "field/block_totem_stub.png"),
    "ore_vein": (lambda: ore_vein("iron"), (1, 1, 1), "barren/block_ore_vein.png"),
    "ore_vein_amber": (lambda: ore_vein("amber"), (1, 1, 1), "barren/block_ore_vein_amber.png"),
    "cairn": (cairn, (1, 1, 1), "barren/block_cairn.png"),
    "menhir": (menhir, (1, 1, 2), "barren/block_menhir.png"),
    "barrow_entrance_2x1": (lambda: barrow_entrance("x"), (2, 1, 1), "barren/block_barrow_entrance_2x1.png"),
    "barrow_entrance_1x2": (lambda: barrow_entrance("y"), (1, 2, 1), "barren/block_barrow_entrance_1x2.png"),
    "ruined_forge": (ruined_forge, (1, 1, 1), "barren/block_ruined_forge.png"),
    "excavation_pit": (excavation_pit, (1, 1, 1), "barren/block_excavation_pit.png"),
    "rusty_chain": (rusty_chain, (1, 1, 1), "barren/block_rusty_chain.png"),
    "skull_helmet": (skull_helmet, (1, 1, 1), "barren/block_skull_helmet.png"),
    "rubble": (rubble, (1, 1, 1), "barren/block_rubble.png"),
    "battle_spears": (battle_spears, (1, 1, 1), "barren/block_battle_spears.png"),
    "burrow": (burrow, (1, 1, 1), "barren/block_burrow.png"),
    "skull_pole": (skull_pole, (1, 1, 2), "barren/block_skull_pole.png"),
    "torch_post": (torch_post, (1, 1, 1), "animated/block_torch_post.png"),
    "brazier": (brazier, (1, 1, 1), "animated/block_brazier.png"),
    "hanging_lantern": (hanging_lantern, (1, 1, 1), "animated/block_hanging_lantern.png"),
    "fly_swarm": (fly_swarm, (1, 1, 1), "animated/block_fly_swarm.png"),
    "fly_swarm_bones": (fly_swarm_bones, (1, 1, 1), "animated/block_fly_swarm_bones.png"),
    "fly_swarm_sand": (fly_swarm_sand, (1, 1, 1), "animated/block_fly_swarm_sand.png"),
    "geyser": (geyser, (1, 1, 1), "animated/block_geyser.png"),
    "leaf_emitter": (leaf_emitter, (1, 1, 1), "animated/block_leaf_emitter.png"),
    "ritual_candles": (ritual_candles, (1, 1, 1), "animated/block_ritual_candles.png"),
}

if __name__ == "__main__":
    run(MODELS, sys.argv[1:])
