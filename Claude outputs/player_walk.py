# player_walk.py — walk sheet of the voxel clay player (player.py's figure), in 8 facings.
# One row per facing, in the order the engine reads them (PLAYER_FACINGS in content/player.ts):
# east, north-east, north, north-west, west, south-west, south, south-east (screen directions;
# north is up). Column 0 is the figure standing, then FRAMES poses of one walk cycle (two steps).
# Every cell is the same window CELL of a one-tile canvas (1024 x 853, viewBox 0 -341), so the
# figure's feet stay at the tile's centre in every cell. The parts are clay voxels turned towards
# the facing (yaw) and, for legs and arms, swung about the hip or shoulder (pitch): the shading
# follows each facet's turned normal, so the light stays fixed while the figure turns.
# No cast shadow: the engine projects shadows. Requires shapely (see iso_lib.py).
import math
from shapely.geometry import Polygon
from shapely.ops import unary_union
from iso_lib import P, VIEW, fmt, light, tint, falloff, seam

SKIN = "#f2c79b"
SHIRT = "#e8574a"
PANTS = "#4f6aa8"
HAIR = "#6b4a2f"
EYE = "#3a2c2a"

FRAMES = 8              # walk poses per cycle (after the standing one)
LEG_SWING = 30          # degrees the legs swing forward and back at the end of a step
ARM_SWING = 34          # degrees the arms swing, opposite to the legs
BOB = 10                # units the body rises at the passing pose
FOOT_LIFT = 18          # units a leg lifts while it swings forward (seen from the front and back)
SEGMENTS = 16           # facets per quarter of a voxel's rounding
FACINGS = ["east", "north-east", "north", "north-west", "west", "south-west", "south", "south-east"]

# Window of the tile canvas each cell shows (canvas units: x from the left, y from the top of the
# 1024 x 853 canvas), found from the extent of every pose plus a margin; and the gap between cells,
# so mipmaps never mix two cells.
CELL = None             # filled by main()
GAP = 48


def facing_yaw(index):
    """Yaw (radians, in iso_lib's x/y) of facing `index`: screen angle 45° × index, east first."""
    d = math.radians(45 * index)
    right, up = math.cos(d), math.sin(d)
    # iso_lib: screen right = x − y, screen up = −(x + y)
    fx, fy = (right - up) / 2, (-right - up) / 2
    return math.atan2(fy, fx)


def rbox_local(hx, hy, hz, r, k=SEGMENTS):
    """Facets of a rounded box centred on the origin (all of them, unculled): (points, normal)."""
    r = min(r, hx, hy, hz)
    core = (hx - r, hy - r, hz - r)
    lats = [(-90 + 90 * i / k, -1) for i in range(k + 1)] + [(90 * i / k, 1) for i in range(k + 1)]
    quads = [(1, 1), (-1, 1), (-1, -1), (1, -1)]
    lons = [(90 * q + 90 * i / k, quads[q]) for q in range(4) for i in range(k + 1)]

    def vert(lat, lon):
        (t, sz), (p, (sx, sy)) = lat, lon
        t, p = math.radians(t), math.radians(p)
        n = (math.cos(t) * math.cos(p), math.cos(t) * math.sin(p), math.sin(t))
        return (sx * core[0] + r * n[0], sy * core[1] + r * n[1], sz * core[2] + r * n[2]), n

    grid = [[vert(la, lo) for lo in lons] for la in lats]
    out = []
    for i in range(len(lats) - 1):
        for j in range(len(lons)):
            j2 = (j + 1) % len(lons)
            vs = [grid[i][j], grid[i + 1][j], grid[i + 1][j2], grid[i][j2]]
            m = math.sqrt(sum(sum(v[1][a] for v in vs) ** 2 for a in range(3))) or 1
            out.append(([v[0] for v in vs], tuple(sum(v[1][a] for v in vs) / m for a in range(3))))
    top = [(sx * core[0], sy * core[1], hz) for sx, sy in quads]
    out.append((top, (0, 0, 1)))
    out.append((list(reversed([(x, y, -hz) for x, y, _ in top])), (0, 0, -1)))
    return out


def rot_pitch(p, a):
    """Turns `p` about the figure's lateral (y) axis by `a`: positive swings +x (forward) down."""
    x, y, z = p
    c, s = math.cos(a), math.sin(a)
    return (x * c + z * s, y, -x * s + z * c)


def rot_yaw(p, a):
    x, y, z = p
    c, s = math.cos(a), math.sin(a)
    return (x * c - y * s, x * s + y * c, z)


class Part:
    """A clay voxel of the figure, in figure space (+x forward, +y to its side, z up): centre
    (cx, cy, z0 + hz), half sizes, rounding, and an optional swing about a pivot."""

    def __init__(self, cx, cy, z0, hx, hy, hz, color, r, pivot=None, swing=0.0):
        self.c = (cx, cy, z0 + hz)
        self.h = (hx, hy, hz)
        self.color, self.r, self.pivot, self.swing = color, r, pivot, swing
        self.top = z0 + 2 * hz

    def world(self, p, yaw, lift):
        x, y, z = p[0] + self.c[0], p[1] + self.c[1], p[2] + self.c[2]
        if self.pivot is not None and self.swing:
            px, pz = self.pivot
            dx, dy, dz = rot_pitch((x - px, y, z - pz), self.swing)
            x, y, z = dx + px, dy, dz + pz
        x, y, z = rot_yaw((x, y, z), yaw)
        return (x, y, z + lift)

    def normal(self, n, yaw):
        if self.pivot is not None and self.swing:
            n = rot_pitch(n, self.swing)
        return rot_yaw(n, yaw)


def pose(phase, walking):
    """The figure's parts at `phase` (0–1) of the walk cycle, and how far its body rises."""
    s = math.sin(2 * math.pi * phase) if walking else 0.0
    leg = math.radians(LEG_SWING) * s
    arm = math.radians(ARM_SWING) * s
    lift = BOB * (1 + math.cos(4 * math.pi * phase)) / 2 if walking else 0.0
    parts = []
    # legs, side by side across the body, swinging about the hip (opposite to each other); the
    # body rises at the passing pose, the legs stay on the ground
    for side in (-1, 1):
        # the leg swinging forward (its swing growing) is off the ground
        forward = side * math.cos(2 * math.pi * phase) if walking else 0.0
        raise_by = FOOT_LIFT * max(0.0, forward)
        parts.append((Part(0, side * 38, 0, 34, 32, 48, PANTS, 16, pivot=(0, 96), swing=side * leg), raise_by))
    upper = [
        Part(0, 0, 100, 58, 82, 52, SHIRT, 24),
        Part(0, 0, 208, 66, 66, 46, SKIN, 28),
        Part(-8, 0, 302, 60, 62, 19, HAIR, 16),
    ]
    for side in (-1, 1):
        upper.append(Part(0, side * 110, 110, 24, 24, 46, SHIRT, 11, pivot=(0, 196), swing=-side * arm))
        upper.append(Part(64, side * 24, 246, 8, 10, 13, EYE, 6))
    parts += [(p, lift) for p in upper]
    return parts


def draw_figure(phase, walking, yaw):
    """SVG paths of the figure (relative to the tile canvas) and their screen points."""
    drawn = []
    for part, lift in pose(phase, walking):
        groups = {}
        points = []
        for pts, n in rbox_local(*part.h, part.r):
            nw = part.normal(n, yaw)
            if sum(a * b for a, b in zip(nw, VIEW)) <= 1e-4:
                continue
            sp = [P(*part.world(p, yaw, lift)) for p in pts]
            pg = Polygon(sp)
            if pg.area > 1e-3:
                groups.setdefault(light(nw), []).append(pg.buffer(0))
                points += sp
        centre = part.world((0, 0, 0), yaw, lift)
        depth = sum(centre)
        drawn.append((depth, part, lift, groups, points))
    drawn.sort(key=lambda d: d[0])
    paths, every = [], []
    for _, part, lift, groups, points in drawn:
        every += points
        for level in sorted(groups):
            geom = unary_union(groups[level]).simplify(0.4, preserve_topology=True)
            fill = tint(part.color, level * falloff(part.top + lift))
            for pg in ([geom] if geom.geom_type == "Polygon" else list(getattr(geom, "geoms", []))):
                if pg.is_empty or pg.geom_type != "Polygon":
                    continue
                d = " ".join("M" + " L".join(fmt(p) for p in list(ring.coords)[:-1]) + "Z"
                             for ring in [pg.exterior, *pg.interiors])
                paths.append(f'<path d="{d}" fill="{fill}" fill-rule="evenodd" {seam(fill)}/>')
    return paths, every


def main():
    poses = [(0.0, False)] + [(i / FRAMES, True) for i in range(FRAMES)]
    frames, every = [], []
    for f in range(len(FACINGS)):
        yaw = facing_yaw(f)
        row = []
        for phase, walking in poses:
            paths, pts = draw_figure(phase, walking, yaw)
            row.append(paths)
            every += pts
        frames.append(row)
    # the window every pose fits in, with a margin, in canvas units (the canvas's top is y = −341)
    m = 8
    x0 = math.floor(min(p[0] for p in every) - m)
    x1 = math.ceil(max(p[0] for p in every) + m)
    y0 = math.floor(min(p[1] for p in every) - m)
    y1 = math.ceil(max(p[1] for p in every) + m)
    assert x0 >= 0 and x1 <= 1024 and y0 >= -341 and y1 <= 512, (x0, x1, y0, y1)
    w, h = x1 - x0, y1 - y0
    cols, rows = len(poses), len(FACINGS)
    sheet_w, sheet_h = cols * (w + GAP) - GAP, rows * (h + GAP) - GAP
    body = []
    for r, row in enumerate(frames):
        for c, paths in enumerate(row):
            tx, ty = c * (w + GAP) - x0, r * (h + GAP) - y0
            body.append(f'<g id="{FACINGS[r]}-{c}" transform="translate({tx} {ty})">\n    ' + "\n    ".join(paths) + "\n  </g>")
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{sheet_w}" height="{sheet_h}" '
           f'viewBox="0 0 {sheet_w} {sheet_h}" data-cell="{x0} {y0 + 341} {w} {h}" data-gap="{GAP}" '
           f'data-frames="{cols}" data-facings="{" ".join(FACINGS)}">\n  ' + "\n  ".join(body) + "\n</svg>\n")
    open("walk.svg", "w").write(svg)
    print(f"ok walk.svg {sheet_w}x{sheet_h}, cell x={x0} y={y0 + 341} w={w} h={h}, gap {GAP}, {cols} columns x {rows} rows")


if __name__ == "__main__":
    main()
