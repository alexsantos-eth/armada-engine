# player_gather.py — gather sheet of the player (monkey.py's monkey): a punch.
# One row per facing, in the walk sheet's order and count; FRAMES columns of one blow, a loop. The
# blow is Mixamo's "Standing Melee Punch" (a left hook from a crouched guard), read off its rig by
# player_punch_extract.py into player_punch.json: per frame, the chest's and the head's turn, the
# direction of each arm (shoulder to hand) and leg (hip to ankle), and how far the hips sank. The
# player model has no rig, only the parts monkey.py's boxes stand for, so each box takes the turn
# of what it stands for; the clip is timed so its impact (the hand reaching furthest) lands at
# STRIKE_AT of each blow, which is HARVEST_STRIKE_AT / HARVEST_STRIKE_TICKS in iso::harvest. The
# sheet holds two blows, left hook then right hook (the clip mirrored), and the engine alternates
# them (lib/src/game/scene.rs, by the parity of the blow). The
# feet stay where they stand, so the engine draws it with the walk sheet's cell.
#
#   python3 player_model.py gather           -> lib/painted/player-16_gather.png
#
# Render it with player_model.py, the textured 3D model every live sheet comes from; player_render.py
# draws the older clay boxes and is only where the poses are looked up.
#
# Requires shapely (see iso_lib.py).
import json
import math
import os

import monkey
from player_walk import Part

HERE = os.path.dirname(os.path.abspath(__file__))
CLIP = os.path.join(HERE, "player_punch.json")

BLOW = 8            # columns of one blow
FRAMES = 2 * BLOW   # the sheet holds two: the clip's left hook, then the same hook mirrored onto
                    # the right fist; the engine plays odd blows from the second half
STRIKE_AT = 0.6     # share of the cycle at which the punch lands
LEG_DAMP = 0.5      # how much of the clip's leg spread is kept: its stance is wider than the
                    # monkey's short legs can stand
BODY_DAMP = 0.45   # and of the chest's and head's turn: the clip hunches far forward, which on a
                    # monkey with a head this big hides the face
NECK = (0, 0, monkey.HEAD)
HIP = (0, 0, monkey.HIP[1])

_clip = None


def clip():
    global _clip
    if _clip is None:
        with open(CLIP, encoding="utf-8") as file:
            _clip = json.load(file)
    return _clip


def mat_vec(m, v):
    return tuple(sum(m[i][k] * v[k] for k in range(3)) for i in range(3))


def mat_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def aim(d):
    """The turn taking straight down (0, 0, -1) to direction `d` by the shortest way."""
    x, y, z = d
    n = math.sqrt(x * x + y * y + z * z)
    x, y, z = x / n, y / n, z / n
    # Rodrigues about axis (down x d) = (y, -x, 0), by the angle between them.
    c = -z
    ax, ay = y, -x
    s = math.sqrt(ax * ax + ay * ay)
    if s < 1e-9:
        return [[1, 0, 0], [0, 1, 0], [0, 0, 1]] if c > 0 else [[1, 0, 0], [0, -1, 0], [0, 0, -1]]
    ax, ay = ax / s, ay / s
    t = 1 - c
    return [[c + ax * ax * t, ax * ay * t, ay * s],
            [ax * ay * t, c + ay * ay * t, -ax * s],
            [-ay * s, ax * s, c]]


class TurnedPart(Part):
    """A Part turned by a matrix about a pivot, then carried to where the pivot went."""

    def __init__(self, *args, turn, pivot, to=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.turn, self.pivot, self.to = turn, pivot, to if to is not None else pivot

    def world(self, p, yaw, lift):
        q = tuple(p[i] + self.c[i] - self.pivot[i] for i in range(3))
        x, y, z = (a + b for a, b in zip(mat_vec(self.turn, q), self.to))
        c, s = math.cos(yaw), math.sin(yaw)
        return (x * c - y * s, x * s + y * c, z + lift)

    def normal(self, n, yaw):
        x, y, z = mat_vec(self.turn, n)
        c, s = math.cos(yaw), math.sin(yaw)
        return (x * c - y * s, x * s + y * c, z)


def damp(m, k):
    """The turn `m` with its angle scaled by `k`, about the same axis."""
    c = max(-1.0, min(1.0, (m[0][0] + m[1][1] + m[2][2] - 1) / 2))
    angle = math.acos(c)
    if angle < 1e-6:
        return [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
    ax = (m[2][1] - m[1][2], m[0][2] - m[2][0], m[1][0] - m[0][1])
    n = math.sqrt(sum(a * a for a in ax))
    x, y, z = (a / n for a in ax)
    a = angle * k
    c, s, t = math.cos(a), math.sin(a), 1 - math.cos(a)
    return [[c + x * x * t, x * y * t - z * s, x * z * t + y * s],
            [y * x * t + z * s, c + y * y * t, y * z * t - x * s],
            [z * x * t - y * s, z * y * t + x * s, c + z * z * t]]


def mirrored(f):
    """Frame `f` with left and right swapped: the figure's y turned over."""
    flip = lambda m: [[m[i][j] * (-1 if (i == 1) != (j == 1) else 1) for j in range(3)] for i in range(3)]
    over = lambda d: [d[0], -d[1], d[2]]
    return {"body": flip(f["body"]), "head": flip(f["head"]), "lift": f["lift"],
            "arm+1": over(f["arm-1"]), "arm-1": over(f["arm+1"]),
            "leg+1": over(f["leg-1"]), "leg-1": over(f["leg+1"])}


def frame_at(index):
    """The clip's frame for column `index`: in each blow the impact lands at STRIKE_AT of it,
    and the second blow is the first one mirrored."""
    blow, index = divmod(index, BLOW)
    count, impact = len(clip()["frames"]), clip()["impact"]
    t = index / BLOW
    if t <= STRIKE_AT:
        f = impact * t / STRIKE_AT
    else:
        f = impact + (count - impact) * (t - STRIKE_AT) / (1 - STRIKE_AT)
    frame = clip()["frames"][round(f) % count]
    return mirrored(frame) if blow else frame


def pose(index):
    """The figure's parts in gather pose `index`, each with how far it rises."""
    f = frame_at(index)
    body = damp(f["body"], BODY_DAMP)
    head = damp(f["head"], BODY_DAMP)
    lift = f["lift"] * HIP[2] * BODY_DAMP

    def carried(point):
        """Where a point of the standing figure goes with the body (turned about the hips)."""
        q = tuple(point[i] - HIP[i] for i in range(3))
        return tuple(a + b for a, b in zip(mat_vec(body, q), HIP))

    parts = []
    for side in (-1, 1):
        dx, dy, dz = f["leg%+d" % side]
        spread = (dx * LEG_DAMP, dy * LEG_DAMP, dz - (1 - LEG_DAMP))
        hip = (0, side * 38, HIP[2])
        parts += [(TurnedPart(*p, turn=aim(spread), pivot=hip), 0.0) for p in monkey.leg(side)]
    parts += [(TurnedPart(*p, turn=body, pivot=HIP), lift) for p in monkey.body() + monkey.tail()]
    parts += [(TurnedPart(*p, turn=head, pivot=NECK, to=carried(NECK)), lift) for p in monkey.head()]
    for side in (-1, 1):
        shoulder = (0, side * 58, monkey.SHOULDER[1])
        turn = aim(f["arm%+d" % side])
        parts += [(TurnedPart(*p, turn=turn, pivot=shoulder, to=carried(shoulder)), lift)
                  for p in monkey.arm(side)]
    return parts
