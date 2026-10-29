# player_jump.py — jump sheet of the voxel clay player (player_walk.py's figure), in 8 facings.
# One row per facing, in the walk sheet's order (east, north-east, north, north-west, west,
# south-west, south, south-east); one column per part of a jump, in the order of POSES: taking off
# (crouched, arms back), rising (stretched, arms up), at the apex (legs tucked forward), falling
# (arms up, legs reaching down) and landing (crouched, arms forward). The engine lifts the feet (the
# jump's height in the simulation), so every pose keeps its feet where the walk sheet's are; a
# crouch lowers the body onto the legs instead. Every cell is the walk sheet's window (CELL, GAP), so
# the engine draws all the sheets with the same cell. Requires shapely (see iso_lib.py).
import math
from player_walk import FACINGS, GAP, draw_parts, facing_yaw, PANTS, SHIRT, SKIN, HAIR, EYE
from player_climb import CELL, TOP, HIP, SHOULDER, ClimbPart

# Poses of a jump, in order (degrees; a negative swing takes a limb forward, a positive lean takes
# the body forward; `drop` lowers the body onto the legs, in the figure's units):
# (name, lean, left arm, right arm, left leg, right leg, drop).
POSES = [
    ("takeoff", 12, 38, 30, 18, 6, 14),       # crouched, pushing off, arms swung back
    ("rise", -2, -150, -140, 14, 24, -4),     # stretched up, arms reaching, legs trailing
    ("apex", 4, -36, -30, -26, -14, 0),       # legs tucked forward, arms out in front
    ("fall", -4, -150, -140, -8, 12, 0),      # arms up for balance, legs reaching for the ground
    ("landing", 10, -26, -32, -12, 8, 18),    # crouched on landing, arms forward
]
FRAMES = len(POSES)


def pose(index):
    """The figure's parts in jump pose `index`, each with how far it rises (the body drops in a crouch)."""
    _, lean, arm_l, arm_r, leg_l, leg_r, drop = POSES[index]
    body = (*HIP, math.radians(lean))

    def turned(*args, swing=None):
        turns = ((*swing[0], math.radians(swing[1])), body) if swing else (body,)
        return (ClimbPart(*args, turns=turns), -drop)

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
            body.append(f'<g id="{facing}-{POSES[c][0]}" transform="translate({tx} {ty})">\n    ' + "\n    ".join(paths) + "\n  </g>")
    # every pose must fit the walk sheet's window
    xs, ys = [p[0] for p in every], [p[1] for p in every]
    assert min(xs) >= x0 and max(xs) <= x0 + w, (min(xs), max(xs))
    assert min(ys) >= y0 and max(ys) <= y0 + h, (min(ys), max(ys))
    sheet_w, sheet_h = FRAMES * (w + GAP) - GAP, len(FACINGS) * (h + GAP) - GAP
    names = " ".join(name for name, *_ in POSES)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{sheet_w}" height="{sheet_h}" '
           f'viewBox="0 0 {sheet_w} {sheet_h}" data-cell="{x0} {y0c} {w} {h}" data-gap="{GAP}" '
           f'data-frames="{FRAMES}" data-poses="{names}" data-facings="{" ".join(FACINGS)}">\n  '
           + "\n  ".join(body) + "\n</svg>\n")
    open("jump.svg", "w").write(svg)
    print(f"ok jump.svg {sheet_w}x{sheet_h}, cell x={x0} y={y0c} w={w} h={h}, gap {GAP}, {FRAMES} columns x {len(FACINGS)} rows")


if __name__ == "__main__":
    main()
