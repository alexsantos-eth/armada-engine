# player_jump.py — jump sheet of the player (monkey.py's monkey), in 8 facings.
# One row per facing, in the walk sheet's order (east, north-east, north, north-west, west,
# south-west, south, south-east); one column per part of a jump, in the order of POSES: taking off
# (crouched, arms back), rising (stretched, arms up), at the apex (legs tucked forward, arms up and out), falling
# (arms up, legs reaching down) and landing (crouched, arms forward). The engine lifts the feet (the
# jump's height in the simulation), so every pose keeps its feet where the walk sheet's are; a
# crouch lowers the body onto the legs and squashes it, a stretch makes it taller, and the tail
# swings. Every cell is the walk sheet's window (CELL, GAP), so the engine draws all the sheets with
# the same cell. Requires shapely (see iso_lib.py).
import math
import monkey
from player_walk import CELL, CELL_STYLE, FACINGS, GAP, TOP, draw_parts, facing_yaw
from player_climb import HIP, SHOULDER, ClimbPart

# Poses of a jump, in order (degrees; a negative swing takes a limb forward, a positive lean takes
# the body forward; `drop` lowers the body onto the legs and `squash` flattens it, a negative one
# stretching it, in the figure's units; `tail` swings the tail's tip):
# (name, lean, left arm, right arm, left leg, right leg, drop, squash, tail).
POSES = [
    ("takeoff", 12, 44, 38, 18, 10, 9, 8, -12),        # crouched, pushing off, arms swung back
    ("rise", -2, -160, -150, 18, 28, -3, -5, 12),      # stretched up, arms reaching, legs trailing
    ("apex", 4, -130, -120, -28, -18, 0, 0, 26),       # legs tucked forward, arms up and out
    ("fall", -4, -165, -155, -8, 14, 0, -3, -18),      # arms up for balance, legs reaching down
    ("landing", 10, -30, -36, -14, 8, 11, 10, 6),      # crouched on landing, arms forward
]
FRAMES = len(POSES)


def pose(index):
    """The figure's parts in jump pose `index`, each with how far it rises (the body drops in a crouch)."""
    _, lean, arm_l, arm_r, leg_l, leg_r, drop, squash, sway = POSES[index]
    body = (*HIP, math.radians(lean))

    def turned(*args, swing=None):
        turns = ((*swing[0], math.radians(swing[1])), body) if swing else (body,)
        return (ClimbPart(*args, turns=turns), -drop)

    parts = []
    for side, leg in ((-1, leg_l), (1, leg_r)):
        parts += [(ClimbPart(*p, turns=((*HIP, math.radians(leg)),)), 0.0) for p in monkey.leg(side)]
    parts += [turned(*p) for p in monkey.body(squash=squash) + monkey.head(-2 * squash) + monkey.tail(sway)]
    for side, arm in ((-1, arm_l), (1, arm_r)):
        parts += [turned(*p, swing=(SHOULDER, arm)) for p in monkey.arm(side)]
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
            body.append(f'<g id="{facing}-{POSES[c][0]}" transform="translate({tx} {ty})" {CELL_STYLE}>\n    ' + "\n    ".join(paths) + "\n  </g>")
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
