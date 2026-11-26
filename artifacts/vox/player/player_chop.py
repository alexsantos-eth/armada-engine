# player_chop.py — chop sheet of the player: the monkey swings a tool held in its right hand
# over its head and brings it down on what is in front of it (a tree, a rock, a patch of grass).
# One row per facing, in the walk sheet's order and count; FRAMES columns of one blow, a loop.
# The blow lands at the engine's strike (iso::harvest: HARVEST_STRIKE_AT of HARVEST_STRIKE_TICKS,
# half way round the cycle), which is the start of column IMPACT, so every blow is read as:
#
#   0 lifts the tool   1 overhead   2 cocked behind the head   3 coming down fast
#   4 IMPACT           5 follows through   6, 7 straighten up for the next blow
#
# The sheet only poses the figure (this module is the pose source, read by player_rig_poses.py);
# the tool is a separate mesh the rig renderer (player_rig.py) puts in the right hand. Each cell
# therefore also says where the tool points (`tool_dir`, in the figure's frame, x forward and z
# up), and the right hand is turned half way from the arm to it so the fist wraps the handle.
# One sheet per tool, `chop_<tool id>`, all with these poses; the feet stay where they stand,
# so the engine draws it with the walk sheet's cell, like the gather sheet.
#
#   python3 player_rig_poses.py chop        -> player_rig/poses.json gets the chop poses
#   python3 player_rig.py chop_flint_axe    -> lib/painted/player-16_chop_flint_axe.png
#
# Requires shapely (see iso_lib.py).
import math

import monkey
from player_gather import TurnedPart, aim, mat_mul, mat_vec

FRAMES = 8
IMPACT = 4
NECK = (0, 0, monkey.HEAD)
HIP = (0, 0, monkey.HIP[1])

# Per column: the right arm's angle from straight up toward the front (degrees, 180 hangs), the
# tool's angle the same way, the body's lean forward and twist (the right shoulder goes back for
# positive), how far the body sinks, the left arm's angle from hanging down toward the front,
# and the legs' reach (the right leg forward, the left back, as a share of a stride).
KEYS = [
    # arm  tool  lean twist  sink  left  stride
    (100,   80,    5,   10,   0.0,   10,   0.00),
    (20,   -20,    0,   22,   2.0,  -10,  -0.10),
    (-30,  -65,   -6,   30,   3.0,  -28,  -0.18),
    (45,    35,   14,    4,  -2.0,    8,   0.10),
    (100,  100,   28,  -18, -10.0,   38,   0.32),
    (118,  112,   25,  -16,  -9.0,   35,   0.32),
    (135,  120,   18,   -8,  -5.0,   25,   0.20),
    (145,  122,   10,    2,  -1.0,   15,   0.08),
]
ARM_OUT = 0.22      # how far the right arm stands out from the side (share of its length)
HAND_SHARE = 0.5    # how far the hand turns from the arm toward the tool
TILT = 0.4          # the head follows the body's lean this much (it keeps looking at the target)


def rot_y(deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return [[c, 0, s], [0, 1, 0], [-s, 0, c]]


def rot_z(deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return [[c, -s, 0], [s, c, 0], [0, 0, 1]]


def unit(v):
    n = math.sqrt(sum(a * a for a in v))
    return tuple(a / n for a in v)


def in_plane(deg, side=0.0):
    """The direction `deg` from straight up toward the front, leaning `side` out to the y side."""
    a = math.radians(deg)
    return unit((math.sin(a), side, math.cos(a)))


def tool_dir(index):
    """Where the tool held in the right hand points in cell `index`, in the figure's frame."""
    return in_plane(KEYS[index][1])


def hand_dir(index):
    arm, tool = in_plane(KEYS[index][0], ARM_OUT), tool_dir(index)
    return unit(tuple(a * (1 - HAND_SHARE) + t * HAND_SHARE for a, t in zip(arm, tool)))


def pose(index):
    """The figure's parts in chop pose `index`, each with how far it rises."""
    arm_deg, _, lean, twist, sink, left, stride = KEYS[index % FRAMES]
    body = mat_mul(rot_z(twist), rot_y(lean))
    head = mat_mul(rot_z(twist * 0.3), rot_y(lean * TILT))

    def carried(point):
        q = tuple(point[i] - HIP[i] for i in range(3))
        return tuple(a + b for a, b in zip(mat_vec(body, q), HIP))

    parts = []
    for side in (-1, 1):
        reach = stride if side == 1 else -stride * 0.8
        spread = (reach, side * 0.12, -1.0)
        hip = (0, side * 38, HIP[2])
        parts += [(TurnedPart(*p, turn=aim(spread), pivot=hip), 0.0) for p in monkey.leg(side)]
    parts += [(TurnedPart(*p, turn=body, pivot=HIP), sink) for p in monkey.body() + monkey.tail()]
    parts += [(TurnedPart(*p, turn=head, pivot=NECK, to=carried(NECK)), sink) for p in monkey.head()]
    for side in (-1, 1):
        shoulder = (0, side * 58, monkey.SHOULDER[1])
        if side == 1:
            arm_turn, hand_turn = aim(in_plane(arm_deg, ARM_OUT)), aim(hand_dir(index % FRAMES))
        else:
            arm_turn = hand_turn = aim(in_plane(180 - left, -ARM_OUT))
        for k, p in enumerate(monkey.arm(side)):
            parts.append((TurnedPart(*p, turn=arm_turn if k == 0 else hand_turn, pivot=shoulder,
                                     to=carried(shoulder)), sink))
    return parts
