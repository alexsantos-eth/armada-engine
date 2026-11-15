# viking_runestones.py — more carved standing stones for the viking settlement.
# Four variants of the existing `runestone` (artifacts/viking_village.py): same 1x1 footprint,
# same palette and the same voxel language, only the silhouette and the grouping change.
#   python3 viking_runestones.py <out_dir>  → one SVG per variant
import os
import sys

from viking_village import *          # Build, the village palette and iso_lib

PEBBLE = "#8f8a78"                    # the patch of trodden pebbles the stones stand on
PALE = "#a6a6a2"                      # a second, lighter stone so a group reads as several stones
BLUE = "#3f6f9e"                      # painted runes (the accent of the existing runestone)


def patch(b, hu, hv, high=9, color=PEBBLE, rp=None):
    """The patch of trodden pebbles the stones stand on, rounded in plan."""
    b.g.place(0, 0, 0, hu, hv, high / 2, color, r=high / 2, rp=rp or min(hu, hv) * 0.55)


def loose(b, spots, color=ROCK_D):
    """A few loose stones lying on the patch, so the ground is not a bare slab."""
    for u, v, half in spots:
        b.put(u, v, 8, half, half - 6, half * 0.5, color, r=half - 4)


def rune_rows(b, u, v, z, rows, wide=26, on_v=True, color=BLUE, step=46):
    """Painted rune bands pressed into the front face of a stone."""
    for i in range(rows):
        if on_v:
            b.put(u, v, z + i * step, wide, 6, 11, color, r=6)
        else:
            b.put(u, v, z + i * step, 6, wide, 11, color, r=6)


def runestone_pair():
    """Two tall stones leaning away from each other over a pebble patch, red runes on both."""
    b = Build((1, 1, 1))
    patch(b, 186, 168)
    # the taller stone, set back so the smaller one does not hide it
    b.put(-66, -46, 12, 58, 26, 148, ROCK, r=24)
    b.put(-66, -46, 300, 44, 22, 18, ROCK, r=18)       # rounded crown
    rune_rows(b, -66, -18, 118, 2, wide=26, step=58)
    # the shorter companion toward the front right
    b.put(96, 52, 10, 46, 24, 104, PALE, r=20)
    b.put(96, 52, 214, 34, 20, 14, PALE, r=14)
    rune_rows(b, 96, 74, 92, 2, wide=21, step=52)
    b.put(10, 128, 8, 44, 30, 18, MOSS_A, r=16)        # moss at their feet
    loose(b, [(-146, 86, 24), (54, -118, 19), (150, -50, 15)])
    return b


def runestone_tall():
    """One big slab, almost the full block high, with a long column of blue runes."""
    b = Build((1, 1, 1))
    patch(b, 172, 154, 10)
    b.put(-16, -12, 12, 84, 30, 138, ROCK, r=26)       # the slab
    b.put(-16, -12, 288, 64, 26, 24, ROCK, r=22)       # rounded crown, top at z = 336
    rune_rows(b, -16, 20, 104, 3, wide=32, step=62)
    for u, v, half in ((124, 86, 34), (-132, 92, 28)):  # two kerb stones holding the slab up
        b.put(u, v, 8, half, half - 8, 30, ROCK_D, r=16)
    b.put(96, -94, 8, 40, 30, 14, MOSS_A, r=16)        # moss creeping up the patch
    loose(b, [(-108, -104, 22), (12, 122, 17)])
    return b


def runestone_circle():
    """A thing-site: four tall stones in a ring around the speaker's slab, runes on the front two.
    Four big stones rather than five small ones, so the ring still reads at 128 px."""
    b = Build((1, 1, 1))
    patch(b, 214, 198, rp=196)                         # round patch of trodden earth
    b.g.place(0, 0, 9, 64, 58, 8, ROCK_D, r=8, rp=50)  # the speaker's slab in the middle
    ring = [(-142, -112, 232, ROCK), (152, -118, 192, PALE),
            (-132, 132, 172, ROCK), (138, 122, 148, ROCK_D)]
    for u, v, high, color in ring:
        b.put(u, v, 9, 44, 34, high / 2, color, r=21)
    rune_rows(b, 138, 156, 60, 1, wide=22, color=RED)
    rune_rows(b, -132, 166, 72, 1, wide=22, color=RED)
    loose(b, [(-18, -146, 20), (164, 92, 16), (-170, 40, 18)])
    return b


def runestone_fallen():
    """A toppled stone: the slab lies broken on the ground beside its own stump, both mossy."""
    b = Build((1, 1, 1))
    patch(b, 190, 172)
    b.put(-126, -104, 9, 48, 40, 56, ROCK, r=22)       # the stump that stayed standing
    b.put(-126, -104, 121, 40, 32, 10, ROCK_D, r=14)   # its broken top
    b.put(44, 32, 9, 122, 44, 21, PALE, r=20)          # the fallen slab, lying along u
    b.put(210, 32, 8, 34, 24, 13, PALE, r=14)          # the piece that snapped off the end
    for u in (-36, 26):                                # its runes, now facing the sky
        b.put(u, 32, 51, 8, 24, 6, BLUE, r=5)
    b.put(140, 40, 51, 22, 17, 5, MOSS_A, r=10)        # moss creeping over the stone
    b.put(-142, -118, 141, 20, 16, 5, MOSS_A, r=9)     # and over the broken stump
    loose(b, [(-60, 132, 22), (152, -84, 17)])
    return b


STONES = {
    "building/block_runestone_pair": runestone_pair,
    "building/block_runestone_tall": runestone_tall,
    "building/block_runestone_circle": runestone_circle,
    "building/block_runestone_fallen": runestone_fallen,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    for name, make in STONES.items():
        path = os.path.join(out, name.replace("/", "_") + ".svg")
        print(name, "top sy =", round(make().save(path), 1))
