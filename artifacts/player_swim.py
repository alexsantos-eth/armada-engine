# player_swim.py — swim sheet of the player (monkey.py's monkey), one row per facing.
# The facings are the walk sheet's (PLAYER_FACINGS, sixteen by default, PLAYER_FACINGS=8 for the
# historical eight). The columns are: 0 the monkey treading water, upright with its head out and
# its arms sculling; 1..FRAMES one cycle of a crawl, the body lying face down on the water with
# the arms pulling one after the other and the legs fluttering; and the last column the monkey
# under the surface, arms stretched forward, which is what a fall into the water is drawn with
# until the water pushes it back up.
#
# The engine floats the figure: it draws it with its feet at the water's top less the depth the
# body has sunk to (`PlayerSwim::depth`), so a pose only has to lie about its own hips. Every pose
# is a turn of the standing monkey's parts about the joints, like player_climb.py: the whole body
# pitched forward about the hips, the arms about the shoulders, the legs about the hips and the
# hands and feet about wrist and ankle.
#
# A swimmer lies across the tile instead of standing in it, so this sheet needs a wider, shorter
# window than the standing sheets and carries its own `data-cell` (every sheet does; the engine
# reads each one's own). Requires shapely (see iso_lib.py).
import math
import os
import monkey
from player_climb import ANKLE, WRIST
from player_walk import CELL_STYLE, FACINGS, GAP, TOP, Part, draw_parts, facing_yaw, rot_pitch


def rot_roll(p, a):
    """Turns `p` about the figure's forward (x) axis by `a`: positive rolls +y (its left) up."""
    x, y, z = p
    c, s = math.cos(a), math.sin(a)
    return (x, y * c - z * s, y * s + z * c)


class SwimPart(Part):
    """A Part turned by a list of turns, each about its own pivot and axis, the first one first:
    `(axis, px, pz, radians)` with axis `"pitch"` (about the lateral axis, through the point
    `(px, pz)` of the figure's side view) or `"roll"` (about the forward axis, through the same
    point read as `(py, pz)`). A limb is swung about its joint, splayed out to the side and then
    tipped forward with the body."""

    def __init__(self, *args, turns=(), **kwargs):
        super().__init__(*args, **kwargs)
        self.turns = turns

    def world(self, p, yaw, lift):
        x, y, z = p[0] + self.c[0], p[1] + self.c[1], p[2] + self.c[2]
        for axis, pa, pz, a in self.turns:
            if axis == "pitch":
                dx, dy, dz = rot_pitch((x - pa, y, z - pz), a)
                x, y, z = dx + pa, dy, dz + pz
            else:
                dx, dy, dz = rot_roll((x, y - pa, z - pz), a)
                x, y, z = dx, dy + pa, dz + pz
        c, s = math.cos(yaw), math.sin(yaw)
        return (x * c - y * s, x * s + y * c, z + lift)

    def normal(self, n, yaw):
        for axis, _, _, a in self.turns:
            n = rot_pitch(n, a) if axis == "pitch" else rot_roll(n, a)
        c, s = math.cos(yaw), math.sin(yaw)
        return (n[0] * c - n[1] * s, n[0] * s + n[1] * c, n[2])

HIP = monkey.HIP            # pivot of the legs and of the body tipping forward
SHOULDER = monkey.SHOULDER  # pivot of the arms

FRAMES = 8                  # crawl poses per cycle (one pull of each arm)
TREAD_PITCH = 22            # degrees the body leans forward while treading water
CRAWL_PITCH = 58            # degrees it is tipped forward while swimming: lying on the water
DIVE_PITCH = 82             # degrees under the surface: stretched out, head first
HEAD_UP = 34                # degrees the head is held back from the body, so the face stays out
ARM_REACH = -164            # arm swing of an arm stretched out ahead (degrees, negative = ahead)
ARM_PULL = -18              # arm swing of an arm that has finished its pull, back along the body
SPLAY_OUT = 56              # degrees the recovering arm is thrown out to the side, clear of the
SPLAY_IN = 14               # water, and the pulling arm held in against the body
LEG_TRAIL = 26              # degrees the legs are swung back, so they trail along the surface
KICK = 26                   # degrees each leg flutters either side of that
LIFT = 30                   # units the whole figure rises, so the body lies on the waterline
NECK = (0, monkey.HEAD)     # pivot of the head on the body (x forward, z up)

# Window of the tile canvas each cell shows (x from the left, y from the top of the 1024 x 853
# canvas), wide enough for every pose of this sheet at every facing and the same for all of them,
# so the figure does not slide as the poses change. Measured by `python3 player_swim.py --measure`.
CELL = (198, 252, 630, 456)


def ease(u):
    """Half a harmonic cycle from 0 to 1: slow at both ends, fastest midway."""
    return (1 - math.cos(math.pi * min(max(u, 0.0), 1.0))) / 2


def arm_at(p):
    """One arm at `p` (0-1) of its own cycle: the first half pulls from out ahead back along the
    body, the second throws it out to the side and reaches ahead again. Answers its swing about
    the shoulder and how far it is splayed out."""
    u = (p % 1.0) * 2
    if u <= 1:
        return ARM_REACH + (ARM_PULL - ARM_REACH) * ease(u), SPLAY_IN
    swing = ARM_PULL + (ARM_REACH - ARM_PULL) * ease(u - 1)
    # out of the water on the way round, back in as it reaches
    out = math.sin(math.pi * (u - 1))
    return swing, SPLAY_IN + (SPLAY_OUT - SPLAY_IN) * out


def crawl(phase):
    """The crawl at `phase` (0-1) of its cycle. The two arms are half a cycle apart, so one is
    always pulling; the legs flutter at twice that pace, opposite to each other."""
    left, splay_l = arm_at(phase)
    right, splay_r = arm_at(phase + 0.5)
    kick = KICK * math.sin(2 * math.pi * 2 * phase)
    return (CRAWL_PITCH, HEAD_UP, left, right, splay_l, splay_r,
            LEG_TRAIL - kick, LEG_TRAIL + kick, -10, -10, 12, 12)


# The poses of the sheet, in the order the engine reads the columns: treading water, one crawl
# cycle, and the swimmer under the surface. A pose is the body's pitch, how far the head is held
# back, the two arms' swings, how far out each is splayed, the two legs' swings, the bends of the
# hands at the wrists and of the feet at the ankles.
TREAD = (TREAD_PITCH, 12, -96, -72, 40, 40, -16, 16, -24, -24, 8, 8)
DIVE = (DIVE_PITCH, 16, -162, -162, 10, 10, LEG_TRAIL + 6, LEG_TRAIL - 6, -6, -6, 16, 16)
POSES = [TREAD] + [crawl((i + 0.5) / FRAMES) for i in range(FRAMES)] + [DIVE]


def pose(index):
    """The figure's parts in swim pose `index`, each with how far it rises."""
    (pitch, head, arm_l, arm_r, splay_l, splay_r,
     leg_l, leg_r, hand_l, hand_r, foot_l, foot_r) = POSES[index]
    body = ("pitch", *HIP, math.radians(pitch))
    neck = ("pitch", *NECK, math.radians(-head))

    def limb(parts, joint, angle, tip, bend, *after):
        """`parts` of a limb swung `angle` about `joint`, its tip (all but the first part) bent
        `bend` about `tip` first, and then turned by `after`."""
        swung = ("pitch", *joint, math.radians(angle))
        return [
            (
                SwimPart(
                    *p,
                    turns=((("pitch", *tip, math.radians(bend)),) if i else ())
                    + (swung, *after),
                ),
                LIFT,
            )
            for i, p in enumerate(parts)
        ]

    parts = []
    for side, leg, foot in ((-1, leg_l, foot_l), (1, leg_r, foot_r)):
        parts += limb(monkey.leg(side), HIP, leg, ANKLE, foot, body)
    parts += [(SwimPart(*p, turns=(body,)), LIFT) for p in monkey.body() + monkey.tail()]
    parts += [(SwimPart(*p, turns=(neck, body)), LIFT) for p in monkey.head()]
    for side, arm, hand, splay in (
        (-1, arm_l, hand_l, splay_l),
        (1, arm_r, hand_r, splay_r),
    ):
        out = ("roll", 0, SHOULDER[1], math.radians(side * splay))
        parts += limb(monkey.arm(side), SHOULDER, arm, WRIST, hand, out, body)
    return parts


def draw_sheet():
    """Every cell's paths, row by row, and all of their screen points."""
    rows, every = [], []
    for r in range(len(FACINGS)):
        yaw = facing_yaw(r)
        row = []
        for c in range(len(POSES)):
            paths, points = draw_parts(pose(c), yaw)
            row.append(paths)
            every += points
        rows.append(row)
    return rows, every


def main():
    rows, every = draw_sheet()
    xs, ys = [p[0] for p in every], [p[1] for p in every]
    if "--measure" in os.sys.argv:
        print(
            "x %.1f..%.1f (%.1f wide), y %.1f..%.1f (%.1f tall), canvas top %d"
            % (min(xs), max(xs), max(xs) - min(xs), min(ys), max(ys), max(ys) - min(ys), TOP)
        )
        return
    x0, y0c, w, h = CELL
    y0 = y0c + TOP
    # every pose must fit this sheet's window
    assert min(xs) >= x0 and max(xs) <= x0 + w, (min(xs), max(xs))
    assert min(ys) >= y0 and max(ys) <= y0 + h, (min(ys), max(ys))
    cols = len(POSES)
    sheet_w, sheet_h = cols * (w + GAP) - GAP, len(FACINGS) * (h + GAP) - GAP
    body = []
    for r, row in enumerate(rows):
        for c, paths in enumerate(row):
            tx, ty = c * (w + GAP) - x0, r * (h + GAP) - y0
            body.append(
                f'<g id="{FACINGS[r]}-{c}" transform="translate({tx} {ty})" {CELL_STYLE}>\n    '
                + "\n    ".join(paths)
                + "\n  </g>"
            )
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{sheet_w}" height="{sheet_h}" '
        f'viewBox="0 0 {sheet_w} {sheet_h}" data-cell="{x0} {y0c} {w} {h}" data-gap="{GAP}" '
        f'data-frames="{cols}" data-facings="{" ".join(FACINGS)}">\n  '
        + "\n  ".join(body)
        + "\n</svg>\n"
    )
    open("swim.svg", "w").write(svg)
    print(
        f"ok swim.svg {sheet_w}x{sheet_h}, cell x={x0} y={y0c} w={w} h={h}, gap {GAP}, "
        f"{cols} columns x {len(FACINGS)} rows"
    )


if __name__ == "__main__":
    main()
