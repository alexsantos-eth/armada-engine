# player_idle.py — idle sheet of the player (monkey.py's monkey, as player_walk.py draws it), in 8 facings:
# the monkey dancing while it stands still.
# One row per facing, in the walk sheet's order (east, north-east, north, north-west, west,
# south-west, south, south-east); FRAMES columns of one cycle, column 0 the walk sheet's standing
# pose, so the figure starts dancing from where it stopped. Every cell is the walk sheet's window
# (CELL, GAP), so the engine draws both sheets with the same cell and the feet never move.
# A cycle is two beats of the engine's dance (PLAYER_DANCE in content/player.ts; the period there is
# two beats): it starts upright between beats; on the first beat its weight lands on the foot on the
# right of the screen and on the second on the left one, while the engine leans and dips the whole
# sprite that way. The free foot taps straight up, the arm on its side lifts out to its side over
# the head and the tail swings away from the foot it stands on. Nothing moves forward and the head
# keeps still, so the figure never seems to bow.
# Requires shapely (see iso_lib.py).
import math
import monkey
from player_walk import CELL, CELL_STYLE, FACINGS, GAP, TOP, Part, draw_parts, facing_yaw

FRAMES = 8              # poses per cycle of two beats (column 0 standing)
FOOT_TAP = 24           # units the free foot lifts on a beat
ARM_PUMP = 150          # degrees the arm on the free foot's side lifts out to its side on a beat
ARM_SWAY = 18           # degrees the other arm lifts out with it
SHOULDER_Y = 58         # how far to each side of the middle the arms lift about
ARM_RISE = 4            # units the pumping arm rises with its shoulder
TAIL_SWAY = 26          # units the tail's tip swings away from the foot it stands on
SNAP = 0.6              # how sharply it moves from beat to beat: 1 smooth, less holds each beat longer


def rot_raise(p, a):
    """Turns `p` about the figure's forward (x) axis by `a`: positive swings a point below the
    origin out to +y and up."""
    x, y, z = p
    c, s = math.cos(a), math.sin(a)
    return (x, y * c - z * s, y * s + z * c)


class IdlePart(Part):
    """A Part that may also raise out to its side about `shoulder` (y, z) by `raise_by` (an arm
    lifted sideways), before the figure turns to its facing."""

    def __init__(self, *args, shoulder=None, raise_by=0.0, **kwargs):
        super().__init__(*args, **kwargs)
        self.shoulder, self.raise_by = shoulder, raise_by

    def world(self, p, yaw, lift):
        x, y, z = p[0] + self.c[0], p[1] + self.c[1], p[2] + self.c[2]
        if self.raise_by:
            sy, sz = self.shoulder
            dx, dy, dz = rot_raise((x, y - sy, z - sz), self.raise_by)
            x, y, z = dx, dy + sy, dz + sz
        c, s = math.cos(yaw), math.sin(yaw)
        return (x * c - y * s, x * s + y * c, z + lift)

    def normal(self, n, yaw):
        if self.raise_by:
            n = rot_raise(n, self.raise_by)
        c, s = math.cos(yaw), math.sin(yaw)
        return (n[0] * c - n[1] * s, n[0] * s + n[1] * c, n[2])


def screen_right(yaw):
    """Which side of the figure (−1 or 1, its −y or +y) is on the right of the screen when it faces
    `yaw`: iso_lib's screen right is x − y. Facing straight across the screen, +y."""
    across = -math.sin(yaw) - math.cos(yaw)
    return -1 if across < -1e-9 else 1


def pose(phase, yaw):
    """The monkey's parts at `phase` of the cycle (two beats), facing `yaw`, each with how far it
    rises. `side` is where its weight is, as the engine leans it: + on the screen's right foot, −
    on the left; 0 (between beats) is the standing pose (same parts, same order)."""
    wave = math.sin(2 * math.pi * phase)
    side = math.copysign(abs(wave) ** SNAP, wave)
    right = screen_right(yaw)

    def free(s):
        """How free the foot on the figure's side `s` is (0–1): the one its weight is not on."""
        return max(0.0, -s * right * side)

    def part(spec, lift=0.0, **kwargs):
        return (IdlePart(*spec, **kwargs), lift)

    parts = []
    for s in (-1, 1):
        f = free(s)
        parts += [part(p, lift=FOOT_TAP * f) for p in monkey.leg(s)]
    parts += [part(p) for p in monkey.body()]
    parts += [part(p) for p in monkey.head()]
    parts += [part(p) for p in monkey.tail(-TAIL_SWAY * right * side)]
    for s in (-1, 1):
        f, other = free(s), free(-s)
        out = s * math.radians(ARM_PUMP * f + ARM_SWAY * other)
        joint = (s * SHOULDER_Y, monkey.SHOULDER[1])
        parts += [part(p, shoulder=joint, raise_by=out, lift=ARM_RISE * f) for p in monkey.arm(s)]
    return parts


def main():
    x0, y0c, w, h = CELL
    y0 = y0c + TOP
    body, every = [], []
    for r, facing in enumerate(FACINGS):
        yaw = facing_yaw(r)
        for c in range(FRAMES):
            paths, points = draw_parts(pose(c / FRAMES, yaw), yaw)
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
    open("idle.svg", "w").write(svg)
    print(f"ok idle.svg {sheet_w}x{sheet_h}, cell x={x0} y={y0c} w={w} h={h}, gap {GAP}, {FRAMES} columns x {len(FACINGS)} rows")


if __name__ == "__main__":
    main()
