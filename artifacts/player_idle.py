# player_idle.py — idle sheet of the player (monkey.py's monkey, as player_walk.py draws it), in 8 facings.
# One row per facing, in the walk sheet's order (east, north-east, north, north-west, west,
# south-west, south, south-east); FRAMES columns of one cycle, column 0 the walk sheet's standing
# pose, so the figure starts breathing from where it stopped. Every cell is the walk sheet's window
# (CELL, GAP), so the engine draws both sheets with the same cell and the feet never move.
# Each cycle the monkey breathes twice (the body swells, the head and arms rise with it, the arms
# swinging a little forward) and looks to one side and then the other, leaning a little that way
# while its tail swings the other way. Requires shapely (see iso_lib.py).
import math
import monkey
from player_walk import CELL, CELL_STYLE, FACINGS, GAP, TOP, Part, draw_parts, facing_yaw, rot_pitch

FRAMES = 8              # poses per cycle (column 0 standing)
BREATH = 5              # units the body swells at the top of a breath
BREATHS = 2             # breaths per cycle
HEAD_RISE = 4           # units the head rises at the top of a breath
ARM_RISE = 3            # units the arms rise at the top of a breath
ARM_SWAY = 6            # degrees the arms swing forward at the top of a breath
LOOK = 24               # degrees the head turns to each side (about its vertical axis), once per cycle
LEAN = 2                # degrees the figure leans to the side it looks at, from its feet
TAIL_SWAY = 16          # units the tail's tip swings away from the side it looks at


def rot_roll(p, a):
    """Turns `p` about the figure's forward (x) axis by `a`: positive leans its top towards +y."""
    x, y, z = p
    c, s = math.cos(a), math.sin(a)
    return (x, y * c + z * s, -y * s + z * c)


class IdlePart(Part):
    """A Part that may also turn about the head's vertical axis (`turn`) and leans with the figure
    about its feet (`lean`), both before the figure turns to its facing."""

    def __init__(self, *args, turn=0.0, lean=0.0, **kwargs):
        super().__init__(*args, **kwargs)
        self.turn, self.lean = turn, lean

    def world(self, p, yaw, lift):
        x, y, z = p[0] + self.c[0], p[1] + self.c[1], p[2] + self.c[2]
        if self.pivot is not None and self.swing:
            px, pz = self.pivot
            dx, dy, dz = rot_pitch((x - px, y, z - pz), self.swing)
            x, y, z = dx + px, dy, dz + pz
        z += lift
        if self.turn:
            c, s = math.cos(self.turn), math.sin(self.turn)
            x, y = x * c - y * s, x * s + y * c
        if self.lean:
            x, y, z = rot_roll((x, y, z), self.lean)
        c, s = math.cos(yaw), math.sin(yaw)
        return (x * c - y * s, x * s + y * c, z)

    def normal(self, n, yaw):
        if self.pivot is not None and self.swing:
            n = rot_pitch(n, self.swing)
        if self.turn:
            c, s = math.cos(self.turn), math.sin(self.turn)
            n = (n[0] * c - n[1] * s, n[0] * s + n[1] * c, n[2])
        if self.lean:
            n = rot_roll(n, self.lean)
        c, s = math.cos(yaw), math.sin(yaw)
        return (n[0] * c - n[1] * s, n[0] * s + n[1] * c, n[2])


def rise(phase):
    """How far through a breath the chest is risen at `phase` (0–1): 0 at the start, 1 halfway."""
    return (1 - math.cos(2 * math.pi * phase)) / 2


def pose(phase):
    """The monkey's parts at `phase` of the cycle, each with how far it rises. Over one cycle it
    breathes BREATHS times and looks to one side and then the other, leaning a little with its
    look; everything is at rest at phase 0, the walk sheet's standing pose (same parts, same order)."""
    breath = rise(BREATHS * phase)
    side = math.sin(2 * math.pi * phase)
    sway = math.radians(ARM_SWAY) * breath
    look = math.radians(LOOK) * side
    lean = math.radians(LEAN) * side

    def part(spec, lift=0.0, turn=0.0, **kwargs):
        return (IdlePart(*spec, turn=turn, lean=lean, **kwargs), lift)

    parts = []
    for s in (-1, 1):
        parts += [part(p) for p in monkey.leg(s)]
    parts += [part(p) for p in monkey.body(breath=BREATH * breath)]
    # the head, face, eyes and ears turn together about the head's vertical axis
    parts += [part(p, lift=HEAD_RISE * breath, turn=look) for p in monkey.head()]
    parts += [part(p) for p in monkey.tail(-TAIL_SWAY * side)]
    for s in (-1, 1):
        parts += [part(p, pivot=monkey.SHOULDER, swing=-sway, lift=ARM_RISE * breath) for p in monkey.arm(s)]
    return parts


def main():
    x0, y0c, w, h = CELL
    y0 = y0c + TOP
    body, every = [], []
    for r, facing in enumerate(FACINGS):
        yaw = facing_yaw(r)
        for c in range(FRAMES):
            paths, points = draw_parts(pose(c / FRAMES), yaw)
            every += points
            tx, ty = c * (w + GAP) - x0, r * (h + GAP) - y0
            body.append(f'<g id="{facing}-{c}" transform="translate({tx} {ty})" {CELL_STYLE}>\n    ' + "\n    ".join(paths) + "\n  </g>")
    # every pose must fit the walk sheet's window
    assert min(p[0] for p in every) >= x0 and max(p[0] for p in every) <= x0 + w
    assert min(p[1] for p in every) >= y0 and max(p[1] for p in every) <= y0 + h
    sheet_w, sheet_h = FRAMES * (w + GAP) - GAP, len(FACINGS) * (h + GAP) - GAP
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{sheet_w}" height="{sheet_h}" '
           f'viewBox="0 0 {sheet_w} {sheet_h}" data-cell="{x0} {y0c} {w} {h}" data-gap="{GAP}" '
           f'data-frames="{FRAMES}" data-facings="{" ".join(FACINGS)}">\n  ' + "\n  ".join(body) + "\n</svg>\n")
    open("idle.svg", "w").write(svg)
    print(f"ok idle.svg {sheet_w}x{sheet_h}, cell x={x0} y={y0c} w={w} h={h}, gap {GAP}, {FRAMES} columns x {len(FACINGS)} rows")


if __name__ == "__main__":
    main()
