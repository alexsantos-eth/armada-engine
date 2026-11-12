# player_flip.py — front flip sheet of the player (monkey.py's monkey), one row per facing.
# One row per facing, in the walk sheet's order and count (PLAYER_FACINGS, sixteen by default);
# FRAMES columns of one whole somersault forward, the figure turning a full 360° about its own
# middle. Column 0 is the take-off, upright; the ones after it carry the body over head first, in
# equal steps of the turn. This is why the flip is drawn and not rotated on screen: a screen turn
# is a cartwheel sideways, the same for every facing, while this pitches the figure about its own
# lateral axis before the yaw of the facing, so someone walking towards the camera goes over
# towards the camera.
#
# The monkey tucks for the turn: the legs come up in front, the arms close in, and it opens out
# again for the landing. The engine lifts the feet (the jump's height in the simulation), so the
# cell only holds the turn.
#
# The window is the walk sheet's one, opened out to fit the turn (FLIP_CELL): a figure going over
# reaches further across and higher than one standing. The sheet carries its own `data-cell`, so
# the client places it on its own, and the feet of column 0 land where the walk sheet's do.
#
# Run it as the other sheets are run (sixteen facings by default):
#
#   python3 player_flip.py                  -> lib/assets-src/assets/player-16/flip.svg
#
# Requires shapely (see iso_lib.py).
import math
import monkey
from player_walk import CELL, CELL_STYLE, FACINGS, GAP, TOP, draw_parts, facing_yaw
from player_climb import HIP, SHOULDER, ClimbPart, ease

FRAMES = 12                 # columns of one whole turn, 30° of the somersault apart
CENTRE = (0, 120)           # what the figure turns about: its own middle (x forward, z up)
TUCK_SHARE = 0.22           # share of the turn spent closing into the tuck, and opening out of it
LEG_TUCK = -98              # degrees the legs come up in front at the tightest of the tuck
ARM_TUCK = -62              # degrees the arms close in
TAIL_TUCK = -26             # units the tail's tip swings while the body is closed
SQUASH_TUCK = 6             # units the body flattens in the tuck


def tuck_at(share):
    """How closed the tuck is (0 to 1) `share` of the way through the turn: closing at the start,
    held through the middle, opening again for the landing."""
    return ease(min(1.0, share / TUCK_SHARE, (1.0 - share) / TUCK_SHARE))


def pose(index):
    """The figure's parts in flip pose `index`: every part turned about CENTRE by its share of the
    somersault, the limbs tucked in first."""
    share = index / FRAMES
    turn = (*CENTRE, 2 * math.pi * share)
    closed = tuck_at(share)
    leg = math.radians(LEG_TUCK) * closed
    arm = math.radians(ARM_TUCK) * closed
    parts = []
    for side in (-1, 1):
        parts += [(ClimbPart(*p, turns=((*HIP, leg), turn)), 0.0) for p in monkey.leg(side)]
    upper = monkey.body(squash=SQUASH_TUCK * closed) + monkey.head(-2 * SQUASH_TUCK * closed)
    upper += monkey.tail(TAIL_TUCK * closed)
    parts += [(ClimbPart(*p, turns=(turn,)), 0.0) for p in upper]
    for side in (-1, 1):
        parts += [(ClimbPart(*p, turns=((*SHOULDER, arm), turn)), 0.0) for p in monkey.arm(side)]
    return parts


def window(points):
    """The walk sheet's window opened out, by whole units, to hold every point of the turn."""
    x0, y0c, w, h = CELL
    y0 = y0c + TOP
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    left, right = math.floor(min(min(xs), x0)), math.ceil(max(max(xs), x0 + w))
    top, bottom = math.floor(min(min(ys), y0)), math.ceil(max(max(ys), y0 + h))
    return left, top - TOP, right - left, bottom - top


def main():
    cells, every = [], []
    for r, facing in enumerate(FACINGS):
        yaw = facing_yaw(r)
        for c in range(FRAMES):
            paths, points = draw_parts(pose(c), yaw)
            every += points
            cells.append((facing, c, paths))
    x0, y0c, w, h = window(every)
    y0 = y0c + TOP
    body = []
    for facing, c, paths in cells:
        r = FACINGS.index(facing)
        tx, ty = c * (w + GAP) - x0, r * (h + GAP) - y0
        body.append(f'<g id="{facing}-{c}" transform="translate({tx} {ty})" {CELL_STYLE}>\n    '
                    + "\n    ".join(paths) + "\n  </g>")
    sheet_w, sheet_h = FRAMES * (w + GAP) - GAP, len(FACINGS) * (h + GAP) - GAP
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{sheet_w}" height="{sheet_h}" '
           f'viewBox="0 0 {sheet_w} {sheet_h}" data-cell="{x0} {y0c} {w} {h}" data-gap="{GAP}" '
           f'data-frames="{FRAMES}" data-facings="{" ".join(FACINGS)}">\n  '
           + "\n  ".join(body) + "\n</svg>\n")
    open("flip.svg", "w").write(svg)
    print(f"ok flip.svg {sheet_w}x{sheet_h}, cell x={x0} y={y0c} w={w} h={h}, gap {GAP}, "
          f"{FRAMES} columns x {len(FACINGS)} rows")


if __name__ == "__main__":
    main()
