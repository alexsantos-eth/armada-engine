# player_idle.py — idle sheet of the voxel clay player (player_walk.py's figure), in 8 facings.
# One row per facing, in the walk sheet's order (east, north-east, north, north-west, west,
# south-west, south, south-east); FRAMES columns of one cycle, column 0 the walk sheet's standing
# pose, so the figure starts breathing from where it stopped. Every cell is the walk sheet's window
# (CELL, GAP), so the engine draws both sheets with the same cell and the feet never move.
# Each cycle the figure breathes twice (the chest grows taller, the head and arms rise with it, the
# arms swinging a little forward) and looks to one side and then the other, leaning a little that way. Requires shapely (see iso_lib.py).
import math
from player_walk import FACINGS, GAP, Part, draw_parts, facing_yaw, rot_pitch, PANTS, SHIRT, SKIN, HAIR, EYE

FRAMES = 8              # poses per cycle (column 0 standing)
BREATH = 15             # units the chest grows (and the head rises) at the top of a breath
BREATHS = 2             # breaths per cycle
ARM_RISE = 0.7          # how much of the chest's rise the arms follow
ARM_SWAY = 7            # degrees the arms swing forward at the top of a breath
LOOK = 24               # degrees the head turns to each side (about its vertical axis), once per cycle
LEAN = 2                # degrees the figure leans to the side it looks at, from its feet

# The walk sheet's window (data-cell of walk.svg, canvas units from the top of the 1024 x 853
# canvas) and the canvas's top in the figure's units.
CELL = (312, 186, 400, 462)
TOP = -341


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
    """The figure's parts at `phase` of the cycle, each with how far it rises. Over one cycle it
    breathes BREATHS times and looks to one side and then the other, leaning a little with its
    look; everything is at rest at phase 0, the walk sheet's standing pose."""
    breath = rise(BREATHS * phase)
    side = math.sin(2 * math.pi * phase)
    chest = BREATH * breath
    arms = BREATH * ARM_RISE * breath
    sway = math.radians(ARM_SWAY) * breath
    look = math.radians(LOOK) * side
    lean = math.radians(LEAN) * side

    def part(*args, lift=0.0, turn=0.0, **kwargs):
        p = IdlePart(*args, turn=turn, lean=lean, **kwargs)
        return (p, lift)

    parts = [part(0, s * 38, 0, 34, 32, 48, PANTS, 16) for s in (-1, 1)]
    # the chest grows taller from the hips, so it never parts from the legs
    parts.append(part(0, 0, 100, 58, 82, 52 + chest / 2, SHIRT, 24))
    # the head, hair and eyes turn together about the head's centre
    head = [(0, 0, 208, 66, 66, 46, SKIN, 28), (-8, 0, 302, 60, 62, 19, HAIR, 16)]
    head += [(64, s * 24, 246, 8, 10, 13, EYE, 6) for s in (-1, 1)]
    for args in head:
        parts.append(part(*args, lift=chest, turn=look))
    for s in (-1, 1):
        parts.append(part(0, s * 110, 110, 24, 24, 46, SHIRT, 11, pivot=(0, 196), swing=-sway, lift=arms))
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
            body.append(f'<g id="{facing}-{c}" transform="translate({tx} {ty})">\n    ' + "\n    ".join(paths) + "\n  </g>")
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
