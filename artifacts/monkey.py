# monkey.py — the player character: a chunky toon monkey of voxel clay (design approved 2026-10-29:
# brown fur, light face mask, two big oval eyes with a white dot, a red scarf). Every player sheet
# (player.py, player_walk.py, player_idle.py, player_jump.py, player_climb.py) builds its poses from
# these parts, so the monkey looks the same in all of them.
# Figure space: +x forward (the face), +y to its side, z up from the feet; one tile spans ±256.
# A part is (cx, cy, z0, hx, hy, hz, color, r): centre x/y, bottom z, half sizes and rounding.

FUR = "#8a5a3b"
DARK = "#66402a"        # tail tip
FACE = "#f1cb9f"        # face mask, ear lobes, belly, hands and feet
SHADE = "#d9a878"       # toes and knuckles
EYE = "#1f1614"
SHINE = "#ffffff"
SCARF = "#e8574a"       # the accent: red reads well on grass and sand

HIP = (0, 48)           # pivot of the legs (x forward, z up)
SHOULDER = (0, 132)     # pivot of the arms
HEAD = 118              # bottom of the head


def leg(side):
    """A leg on `side` (−1 or 1): thigh, foot and toes, swinging about HIP."""
    return [
        (4, side * 38, 8, 30, 30, 26, FUR, 24),
        (22, side * 40, 0, 38, 29, 13, FACE, 13),
        (54, side * 40, 2, 8, 24, 8, SHADE, 7),
    ]


def arm(side):
    """An arm on `side`: arm, hand, thumb and knuckles, swinging about SHOULDER."""
    return [
        (0, side * 80, 56, 22, 22, 42, FUR, 20),
        (6, side * 82, 30, 24, 22, 22, FACE, 20),
        (26, side * 66, 46, 9, 8, 11, FACE, 7),
        (26, side * 82, 30, 6, 18, 4, SHADE, 3),
    ]


def body(breath=0.0, squash=0.0):
    """Body, belly and scarf. `breath` swells the chest; `squash` flattens it (keeping its feet)."""
    b, s = breath, squash
    return [
        (-4, 0, 40, 58 + b + s, 66 + b + s, 50 + b / 2 - s, FUR, 44),
        (28, 0, 46, 32 + b, 50 + b, 44 - s, FACE, 30),
        (0, 0, 110 - 2 * s, 56, 64, 13, SCARF, 13),
        (50, 26, 92 - 2 * s, 14, 16, 14, SCARF, 10),
        (60, 32, 58 - 2 * s, 7, 12, 24, SCARF, 6),
    ]


def head(rise=0.0):
    """Head (one voxel), face mask (one voxel), two big eyes with a white dot, ears with lobes;
    `rise` lifts it all."""
    z = HEAD + rise
    parts = [
        (2, 0, z, 76, 84, 66, FUR, 56),
        (54, 0, z + 6, 30, 62, 54, FACE, 28),
    ]
    for side in (-1, 1):
        parts += [
            (72, side * 27, z + 56, 14, 17, 26, EYE, 14),
            (84, side * 27 - 6, z + 88, 4, 5.5, 6.5, SHINE, 4),
            (-2, side * 90, z + 40, 18, 28, 36, FUR, 18),
            (12, side * 96, z + 48, 8, 19, 26, FACE, 8),
        ]
    return parts


def tail(sway=0.0):
    """Five beads curling up behind the back; `sway` swings the tip sideways (y)."""
    beads = [(-62, 62), (-92, 82), (-108, 116), (-102, 150), (-78, 168)]
    parts = []
    for i, (x, z) in enumerate(beads):
        k = i / (len(beads) - 1)
        size = 18 - 4 * k
        parts.append((x, sway * k * k, z - size, size, size, size, DARK if i == len(beads) - 1 else FUR, size - 1))
    return parts
