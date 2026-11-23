# player_gather.py — gather sheet of the player (monkey.py's monkey): throwing punches.
# One row per facing, in the walk sheet's order and count; FRAMES columns of one blow, a loop of a
# one-two: the figure stands in guard, fists up before it, one foot forward; throws a quick left
# jab straight out and pulls it back; then leans in behind a right cross, which is the blow that
# lands (at STRIKE_AT of the cycle, which is HARVEST_STRIKE_AT / HARVEST_STRIKE_TICKS in
# iso::harvest), and comes back to guard. The feet keep still, so the engine draws it with the walk
# sheet's cell and the feet never move.
#
# It reuses the climb's machinery (player_climb.py): a pose is the lean of the body and the swing
# of each arm, hand, leg and foot, eased between key poses.
#
#   python3 player_model.py gather           -> lib/painted/player-16_gather.png
#
# Render it with player_model.py, the textured 3D model every live sheet comes from; player_render.py
# draws the older clay boxes and is only where the poses are looked up.
#
# Requires shapely (see iso_lib.py).
from player_climb import ClimbPart, HIP, SHOULDER, WRIST, ANKLE, ease
import math
import monkey

FRAMES = 8          # columns of one blow
STRIKE_AT = 0.6     # share of the cycle at which the cross lands

# (lean, arm l, arm r, hand l, hand r, leg l, leg r, foot l, foot r), as in player_climb.py; a
# negative arm swing takes the fist forward, -90 straight out at the shoulder's height.
READY = (4, -66, -60, -40, -40, -12, 10, 4, 0)          # guard: fists up, left foot forward
KEYS = [
    (0.00, READY),
    (0.20, (8, -112, -56, 0, -40, -12, 10, 4, 0)),      # the jab: left fist straight out
    (0.40, (-2, -64, -30, -40, -40, -12, 10, 4, 0)),    # jab back, the right drawn back to load
    (STRIKE_AT, (18, -60, -118, -40, 0, -14, 14, 4, 6)),  # the cross lands, leaning in behind it
    (0.80, (8, -64, -80, -40, -20, -12, 12, 4, 2)),     # pulling the right back
    (1.00, READY),
]


def gather_pose(t):
    """The pose at `t` (0–1) of one blow, eased between the key poses around it."""
    for (t0, a), (t1, b) in zip(KEYS, KEYS[1:]):
        if t <= t1:
            u = ease((t - t0) / (t1 - t0))
            return tuple(x + (y - x) * u for x, y in zip(a, b))
    return READY


def pose(index):
    """The figure's parts in gather pose `index`, each with how far it rises (none)."""
    lean, arm_l, arm_r, hand_l, hand_r, leg_l, leg_r, foot_l, foot_r = gather_pose(index / FRAMES)
    body = (*HIP, math.radians(lean))

    def limb(parts, joint, angle, tip, bend, *after):
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
