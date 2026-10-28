# player_climb.py — climb sheet of the voxel clay player (player_walk.py's figure), in 8 facings.
# One row per facing, in the walk sheet's order (east, north-east, north, north-west, west,
# south-west, south, south-east); FRAMES columns of one climb onto a block one higher, from
# reaching up to standing on top. The engine raises the feet (the climb's height in the
# simulation), so every pose keeps its feet where the walk sheet's are: the figure reaches up with
# both arms, pulls itself up leaning in, puts a knee on the top, pushes on its hands and stands up.
# Every cell is the walk sheet's window (CELL, GAP), so the engine draws all the sheets with the same
# cell and the feet never move. Requires shapely (see iso_lib.py).
import math
from player_walk import FACINGS, GAP, Part, draw_parts, facing_yaw, rot_pitch, PANTS, SHIRT, SKIN, HAIR, EYE

# The walk sheet's window (data-cell of walk.svg, canvas units from the top of the 1024 x 853
# canvas) and the canvas's top in the figure's units.
CELL = (312, 186, 400, 462)
TOP = -341

HIP = (0, 96)           # pivot of the legs and of the body leaning in (x forward, z up)
SHOULDER = (0, 196)     # pivot of the arms

# Poses of one climb, in order (degrees; a negative swing takes a limb forward, a positive lean
# takes the body forward): (lean, left arm, right arm, left leg, right leg).
POSES = [
    (4, -165, -150, 0, 0),        # reaching up the side of the block
    (6, -168, -158, 10, 4),       # hands on the top, pulling
    (8, -172, -165, 14, -12),     # pulled up, elbows over the edge
    (14, -22, -18, 14, -50),      # a knee on the top
    (12, -18, -22, 16, -35),      # pushing up on its hands
    (6, -8, 6, -6, 4),            # standing up on the top
]
FRAMES = len(POSES)


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
    lean, arm_l, arm_r, leg_l, leg_r = POSES[index]
    body = (*HIP, math.radians(lean))

    def turned(*args, swing=None):
        turns = ((*swing[0], math.radians(swing[1])), body) if swing else (body,)
        return (ClimbPart(*args, turns=turns), 0.0)

    parts = []
    for side, leg in ((-1, leg_l), (1, leg_r)):
        parts.append((ClimbPart(0, side * 38, 0, 34, 32, 48, PANTS, 16, turns=((*HIP, math.radians(leg)),)), 0.0))
    parts.append(turned(0, 0, 100, 58, 82, 52, SHIRT, 24))
    parts.append(turned(0, 0, 208, 66, 66, 46, SKIN, 28))
    parts.append(turned(-8, 0, 302, 60, 62, 19, HAIR, 16))
    for side, arm in ((-1, arm_l), (1, arm_r)):
        parts.append(turned(0, side * 110, 110, 24, 24, 46, SHIRT, 11, swing=(SHOULDER, arm)))
        parts.append(turned(64, side * 24, 246, 8, 10, 13, EYE, 6))
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
            body.append(f'<g id="{facing}-{c}" transform="translate({tx} {ty})">\n    ' + "\n    ".join(paths) + "\n  </g>")
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
