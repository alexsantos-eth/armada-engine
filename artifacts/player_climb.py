# player_climb.py — climb sheet of the player (monkey.py's monkey), in 8 facings.
# One row per facing, in the walk sheet's order (east, north-east, north, north-west, west,
# south-west, south, south-east); FRAMES columns of one climb onto a block one higher, from
# reaching up to standing on top. The engine raises the feet (the climb's height in the
# simulation), so every pose keeps its feet where the walk sheet's are: the figure grabs the edge
# of the block with both hands, hooked over it, and hangs from them, feet down; pulls itself up
# with its chest to the edge; brings its hands down to the middle of its body, flat on the top, and
# pushes itself up on them, a knee over the top while the other foot pushes off; and stands up.
# Hands bend at the wrists and feet at the ankles.
# Every cell is the walk sheet's window (CELL, GAP), so the engine draws all the sheets with the same
# cell and the feet never move. Requires shapely (see iso_lib.py).
import math
import monkey
from player_walk import CELL, CELL_STYLE, FACINGS, GAP, TOP, Part, draw_parts, facing_yaw, rot_pitch

HIP = monkey.HIP            # pivot of the legs and of the body leaning in (x forward, z up)
SHOULDER = monkey.SHOULDER  # pivot of the arms

FRAMES = 9                  # the most columns under the 4 096 px a GPU texture may measure
WRIST = (0, 64)             # pivot of the hand on the arm, before the arm swings (x forward, z up)
ANKLE = (4, 16)             # pivot of the foot on the leg, before the leg swings

# A pose: lean of the body; swing of the left and right arm, of the left and right hand at the
# wrist, of the left and right leg and of the left and right foot at the ankle (degrees; a negative
# swing takes a limb forward, a positive lean takes the body forward, a positive turn of a hand or
# a foot takes its tip back, so a hanging foot points its toes down).
STAND = (6, -8, 6, 0, 0, -6, 4, 0, 0)   # the walk sheet's standing pose

# Key poses of one climb and the share of it each is reached at; between two, eased in and out.
KEYS = [
    (0.00, (4, -150, -150, 20, 20, 0, 0, 8, 8)),        # reaching up for the edge
    (0.12, (2, -172, -168, 30, 30, 0, 0, 12, 12)),      # both hands hooked over it, hanging
    (0.49, (10, -160, -156, 30, 30, -14, -8, 14, 12)),  # pulled up, chest to the edge
    (0.60, (12, -30, -26, -55, -55, -10, -4, 10, 14)),  # hands to the middle of the body, flat
    (0.78, (8, -14, -10, -40, -40, -30, 10, -8, 18)),   # pushing up on them, a knee over the top
    (1.00, STAND),                                      # standing on the top
]


def ease(u):
    """Half a harmonic cycle from 0 to 1 (`u` from 0 to 1): slow at both ends, fastest midway."""
    return (1 - math.cos(math.pi * min(max(u, 0.0), 1.0))) / 2


def climb_pose(t):
    """The pose at `t` (0–1) of a climb: between the two key poses around it, eased."""
    for (t0, a), (t1, b) in zip(KEYS, KEYS[1:]):
        if t <= t1:
            u = ease((t - t0) / (t1 - t0))
            return tuple(x + (y - x) * u for x, y in zip(a, b))
    return STAND


# Poses of one climb, in order: each frame at the middle of its share of the climb.
POSES = [climb_pose((i + 0.5) / FRAMES) for i in range(FRAMES)]


class ClimbPart(Part):
    """A Part turned by a list of pitches, each about its own pivot (`(px, pz, radians)`, the first
    one first): a limb swung about its joint and then leaned in with the body about the hips."""

    def __init__(self, *args, turns=(), **kwargs):
        super().__init__(*args, **kwargs)
        self.turns = turns

    def world(self, p, yaw, lift):
        x, y, z = p[0] + self.c[0], p[1] + self.c[1], p[2] + self.c[2]
        for px, pz, a in self.turns:
            dx, dy, dz = rot_pitch((x - px, y, z - pz), a)
            x, y, z = dx + px, dy, dz + pz
        c, s = math.cos(yaw), math.sin(yaw)
        return (x * c - y * s, x * s + y * c, z + lift)

    def normal(self, n, yaw):
        for _, _, a in self.turns:
            n = rot_pitch(n, a)
        c, s = math.cos(yaw), math.sin(yaw)
        return (n[0] * c - n[1] * s, n[0] * s + n[1] * c, n[2])


def pose(index):
    """The figure's parts in climb pose `index`, each with how far it rises (none: the engine
    raises the feet)."""
    lean, arm_l, arm_r, hand_l, hand_r, leg_l, leg_r, foot_l, foot_r = POSES[index]
    body = (*HIP, math.radians(lean))

    def limb(parts, joint, angle, tip, bend, *after):
        """`parts` of a limb swung `angle` about `joint`, its tip (all but the first part) first
        bent `bend` about `tip`, and then turned by `after`."""
        swung = (*joint, math.radians(angle))
        return [(ClimbPart(*p, turns=(((*tip, math.radians(bend)),) if i else ()) + (swung, *after)), 0.0)
                for i, p in enumerate(parts)]

    parts = []
    for side, leg, foot in ((-1, leg_l, foot_l), (1, leg_r, foot_r)):
        parts += limb(monkey.leg(side), HIP, leg, ANKLE, foot)
    parts += [(ClimbPart(*p, turns=(body,)), 0.0) for p in monkey.body() + monkey.head() + monkey.tail()]
    for side, arm, hand in ((-1, arm_l, hand_l), (1, arm_r, hand_r)):
        parts += limb(monkey.arm(side), SHOULDER, arm, WRIST, hand, body)
    return parts


def main():
    x0, y0c, w, h = CELL
    y0 = y0c + TOP
    body, every = [], []
    for r, facing in enumerate(FACINGS):
        yaw = facing_yaw(r)
        for c in range(FRAMES):
            paths, points = draw_parts(pose(c), yaw)
            every += points
            tx, ty = c * (w + GAP) - x0, r * (h + GAP) - y0
            body.append(f'<g id="{facing}-{c}" transform="translate({tx} {ty})" {CELL_STYLE}>\n    ' + "\n    ".join(paths) + "\n  </g>")
    # every pose must fit the walk sheet's window
    xs, ys = [p[0] for p in every], [p[1] for p in every]
    assert min(xs) >= x0 and max(xs) <= x0 + w, (min(xs), max(xs))
    assert min(ys) >= y0 and max(ys) <= y0 + h, (min(ys), max(ys))
    sheet_w, sheet_h = FRAMES * (w + GAP) - GAP, len(FACINGS) * (h + GAP) - GAP
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{sheet_w}" height="{sheet_h}" '
           f'viewBox="0 0 {sheet_w} {sheet_h}" data-cell="{x0} {y0c} {w} {h}" data-gap="{GAP}" '
           f'data-frames="{FRAMES}" data-facings="{" ".join(FACINGS)}">\n  ' + "\n  ".join(body) + "\n</svg>\n")
    open("climb.svg", "w").write(svg)
    print(f"ok climb.svg {sheet_w}x{sheet_h}, cell x={x0} y={y0c} w={w} h={h}, gap {GAP}, {FRAMES} columns x {len(FACINGS)} rows")


if __name__ == "__main__":
    main()
