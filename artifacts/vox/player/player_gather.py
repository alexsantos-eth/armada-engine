# player_gather.py — gather sheet of the player (monkey.py's monkey): striking with both hands.
# One row per facing, in the walk sheet's order and count; FRAMES columns of one blow, a loop: the
# figure stands ready with its hands before it, swings both arms up over its head leaning back a
# little, brings them down together onto what is in front of it (the blow lands at STRIKE_AT of the
# cycle, which is HARVEST_STRIKE_AT / HARVEST_STRIKE_TICKS in iso::harvest), follows through
# bent over it, and straightens back to ready. The feet keep still, so the engine draws it with the
# walk sheet's cell and the feet never move.
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
STRIKE_AT = 0.6     # share of the cycle at which the hands land

# (lean, arm l, arm r, hand l, hand r, leg l, leg r, foot l, foot r), as in player_climb.py.
READY = (6, -46, -42, -24, -24, -6, 4, 0, 0)
KEYS = [
    (0.00, READY),                                      # ready, hands before the chest
    (0.38, (-6, -168, -164, 28, 28, -4, 6, 0, 0)),     # wound up, both hands over the head
    (STRIKE_AT, (22, -74, -70, -34, -34, -12, 10, 6, 0)),  # the blow: arms down and forward
    (0.78, (24, -52, -48, -30, -30, -12, 10, 6, 0)),   # following through, bent over it
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
