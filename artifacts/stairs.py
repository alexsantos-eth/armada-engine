# stairs.py — the four looks of a stairs block: a flight of very old ruined steps that carries a
# path from one elevation up to the next.
#
# Run from artifacts/:  python3 stairs.py ../lib/assets-src/assets/stairs
#
# The block fills its whole cell like a terrain block (`terrain_blocks.py`): square prisms, no
# rounded clay corners, so a column stacks against its neighbours without a groove. It is one
# block tall, and that whole block is the climb: from the plane its downhill neighbour's ground
# sits on (z = 0) the mass rises in four steps of a quarter block each, so the last tread is flush
# with the ground of the tile one level up (z = H). Every band is one tile-quarter deep.
#
# Walked on is a strip sunk into the steps, as wide as the strip of trodden earth a path block
# leaves at its edge (`path_tiles.py`, 2 x HALF_WIDTH) and sunk by the same amount, so a path runs
# onto the stairs and off the other end without a jump in width or a step at the seam. The stone
# is read as very old: the sunk strip frays from step to step, the kerbs along it are broken
# through in places, a column has snapped off at the foot of the flight, rubble lies on the treads
# and moss has taken the joints.
#
# Engine directions on the asset's top plane (the mapping `path_tiles.py` uses): engine +x is -y
# here, +y is -x, -x is +y, -y is +x. One file per direction the flight climbs toward:
# block_px.svg climbs toward engine +x, block_py.svg toward +y, block_nx.svg toward -x,
# block_ny.svg toward -y. Each is generated in its own orientation, never mirrored, so the lit
# right faces and the dark left faces stay correct.
import math
import os
import sys

from iso_lib import *

OUT_DIR = sys.argv[1] if len(sys.argv) > 1 else "../lib/assets-src/assets/stairs"

LOW = 0                       #: the plane the downhill neighbour's ground sits on
HIGH = H                      #: top of the tile the flight ends on, one block up
BANDS = 4                     #: steps in the flight, one per band
DEPTH = TILE / BANDS          #: how deep one band of the flight is (128)
RISE = (HIGH - LOW) / BANDS   #: how much one step climbs (85.25)
HALF = TILE // 2              #: half the cell; every prism reaches it, so the block tiles
HALF_WIDTH = 132              #: half the width of a path strip where it leaves a tile
SINK = 22                     #: how far the walked strip sits under the stone around it
CLEAR = 2 * SINK + 8          #: how far a stone in the sunk strip stays from the edges of the cut
RIM = 14                      #: darker rim inside a top face, as on a terrain block
RIM_SHADE = 0.93

MASS = "#a79e8d"              #: the mass of the steps
MASS_DEEP = "#8f8777"         #: the lowest course, the foundation the flight stands on
TREAD = "#c6bfae"             #: the worn stone of the walked strip
KERB = "#b5ab98"              #: the kerbs, the broken column and the rubble
KERB_PALE = "#cdc5b3"

#: Which way the flight climbs, as (dx, dy) on the asset's top plane, per file.
UPHILL = {"px": (0, -1), "py": (-1, 0), "nx": (0, 1), "ny": (1, 0)}

#: Per band: how much the walked strip is widened or narrowed, and how far it is nudged across.
#: The first and the last band are left alone, so the strip meets a path at its full width.
FRAY = [(0, 0), (-9, 6), (8, -6), (0, 0)]

#: The kerbs along the strip, by band and side: `None` where the wall has fallen away. Nothing
#: may rise over z = HIGH, where the upper tile's own ground starts, so the top band carries none.
KERBS = {
    1: [74, 52, 30, None],
    -1: [86, None, 26, None],
}

#: Loose rubble on the treads: (band, how far across as a fraction of the free width, size, colour).
RUBBLE = [
    (0, 0.38, 24, KERB), (0, -0.40, 15, KERB_PALE), (1, -0.62, 18, KERB_PALE),
    (2, 0.58, 21, KERB), (3, -0.54, 16, KERB_PALE),
]

#: Worn patches in the stone of the walked strip: (band, across as a fraction of its half-width,
#: half-depth, half-width). They are only a shade darker: the stone is worn, not dirty.
WORN = [(0, 0.34, 38, 54), (1, -0.40, 34, 46), (2, 0.30, 36, 50), (3, -0.36, 32, 42)]

#: Moss in the joints of the strip: (band, how far across, half-depth, half-width). It is kept
#: clear of the rubble and of the fallen drum, so no two stones grow into each other.
MOSSES = [(0, 0.86, 26, 20), (1, 0.70, 22, 15), (2, 0.90, 24, 17), (3, -0.88, 24, 18)]


def frame(uphill):
    """Maps flight coordinates to world ones: u climbs the flight, v crosses it.

    Every part of the flight is written once in (u, v) and comes out in the right orientation for
    each of the four directions, so no sprite is ever a mirror of another.
    """
    dx, dy = uphill
    px, py = -dy, dx

    def local(u, v, hu=0.0, hv=0.0):
        return (u * dx + v * px, u * dy + v * py,
                abs(dx) * hu + abs(px) * hv, abs(dy) * hu + abs(py) * hv)

    return local


def rect(local, u0, u1, v0, v1):
    """The world rectangle (xa, xb, ya, yb) a stretch of the flight covers."""
    xs, ys = [], []
    for u in (u0, u1):
        for v in (v0, v1):
            x, y, _, _ = local(u, v)
            xs.append(x)
            ys.append(y)
    return min(xs), max(xs), min(ys), max(ys)


def prism(a, box, z0, z1, color, rim=0):
    """One square slab of the block: its top face and the two sides that face the camera.

    Prisms are painted from the lowest up; a higher step of the flight is always nested over the
    one below it, so that order is the painter order and never needs a depth sort.
    """
    xa, xb, ya, yb = box
    a.poly([(xa, yb, z1), (xb, yb, z1), (xb, yb, z0), (xa, yb, z0)], shade(color, "left", z1))
    a.poly([(xb, ya, z1), (xb, yb, z1), (xb, yb, z0), (xb, ya, z0)], shade(color, "right", z1))
    top = shade(color, "top", z1)
    a.poly([(xa, ya, z1), (xb, ya, z1), (xb, yb, z1), (xa, yb, z1)],
           tint(top, RIM_SHADE) if rim else top)
    if rim:
        a.poly([(xa + rim, ya + rim, z1), (xb - rim, ya + rim, z1),
                (xb - rim, yb - rim, z1), (xa + rim, yb - rim, z1)], top)


def strip(a, local, k, z):
    """The walked strip sunk into the tread of band `k`: its floor, and the step down into it.

    The floor lies `SINK` under the stone around it, so on the screen it is `SINK` lower than the
    cut it fills and would otherwise hang over the nose of the step. Everything drawn at that
    depth — the floor and the worn patches in it — is cut to the opening, exactly as a path block
    cuts its bed, so nothing of it ever leaves the stone.
    """
    widen, shift = FRAY[k]
    u0, u1 = band(k)[0], min(band(k)[1] + 8, HALF)   # it runs a little under the next step
    hw = HALF_WIDTH + widen
    box = rect(local, u0, u1, shift - hw, shift + hw)
    xa, xb, ya, yb = box
    opening = Polygon([P(xa, ya, z), P(xb, ya, z), P(xb, yb, z), P(xa, yb, z)]).buffer(0)
    a.shape(opening, shade(MASS, "left", z))         # the step down into the cut: its far rim
    floor = Polygon([P(xa, ya, z - SINK), P(xb, ya, z - SINK),
                     P(xb, yb, z - SINK), P(xa, yb, z - SINK)]).buffer(0).intersection(opening)
    a.shape(floor, shade(TREAD, "top", z - SINK))
    for wk, frac, hu, hv in WORN:
        if wk == k:
            cx, cy, hx, hy = local(band(k)[0] + DEPTH * 0.5, shift + frac * hw, hu, hv)
            patch = rounded(cx, cy, z - SINK, hx, hy, min(hx, hy) * 0.45).intersection(floor)
            a.shape(patch, shade(tint(TREAD, 0.945), "top", z - SINK))
    return box


def rounded(cx, cy, z, hx, hy, r, k=12):
    """A flat rounded rectangle on the plane at height `z`, as a screen polygon to cut."""
    pts = []
    for q, (sx, sy) in enumerate(QUADS):
        for i in range(k + 1):
            ang = math.radians(90 * q + 90 * i / k)
            pts.append(P(cx + sx * (hx - r) + r * math.cos(ang),
                         cy + sy * (hy - r) + r * math.sin(ang), z))
    return Polygon(pts).buffer(0)


def band(k):
    """The stretch of the flight band `k` covers, and the height its tread sits at."""
    u0 = -HALF + k * DEPTH
    return u0, u0 + DEPTH, LOW + (k + 1) * RISE


def ruins(a, local):
    """The stones standing on the flight: the kerbs, a fallen drum, rubble and moss.

    Everything here rests on the stone under it — a kerb on the tread, a stone that has come to
    rest on the sunk strip one `SINK` lower — so nothing is left hanging in the air.
    """
    g = VoxelGrid(a, u=100)

    def part(u, v, z0, hu, hv, hz, color, r=None):
        cx, cy, hx, hy = local(u, v, hu, hv)
        g.place(cx, cy, z0, hx, hy, hz, color, r=r)

    def lying(k, u, v, hu, hv):
        """Check a stone lying in the sunk strip of band `k` stays `CLEAR` inside the cut.

        A stone nearer than that to an edge hangs over the nose of the step below, and which
        edges face the camera changes with the direction the flight climbs, so every edge of the
        cut keeps the same clearance.
        """
        hw, shift = free(k)
        u0, u1 = band(k)[0], band(k)[1]
        assert u - hu >= u0 + CLEAR and u + hu <= u1 - 6, (k, u, hu)
        assert abs(v - shift) + hv <= hw - CLEAR, (k, v, hv)

    def free(k):
        """Where the kerb of band `k` starts: just outside the walked strip."""
        widen, shift = FRAY[k]
        return HALF_WIDTH + widen, shift

    for side, heights in KERBS.items():
        for k, rise in enumerate(heights):
            if rise is None:
                continue                  # the kerb has fallen through here
            hw, shift = free(k)
            top = band(k)[2]
            rise = min(rise, HIGH - top)
            if rise < 12:
                continue
            hv = 28
            part(band(k)[0] + DEPTH / 2, shift + side * (hw + 8 + hv), top,
                 DEPTH / 2 - 5, hv, rise / 2, KERB if k % 2 else MASS, r=13)
            if k in (0, 2):                   # moss has taken the crown of the oldest kerbs
                part(band(k)[0] + DEPTH / 2, shift + side * (hw + 8 + hv), top + rise,
                     DEPTH / 2 - 16, hv - 8, 4, MOSS, r=9)

    # The drum of a column that snapped off, lying where it fell in the lowest tread.
    hw, shift = free(0)
    drum = (band(0)[0] + DEPTH * 0.68, shift - (hw - CLEAR - 32), 30, 24)
    lying(0, *drum)
    part(drum[0], drum[1], band(0)[2] - SINK, drum[2], drum[3], 20, KERB_PALE, r=16)

    for k, frac, size, color in RUBBLE:
        hw, shift = free(k)
        u, v = band(k)[0] + DEPTH * 0.68, shift + frac * (hw - CLEAR - size)
        lying(k, u, v, size * 1.2, size)
        part(u, v, band(k)[2] - SINK, size * 1.2, size, size * 0.6, color, r=size * 0.4)

    for k, frac, hu, hv in MOSSES:
        hw, shift = free(k)
        u, v = band(k)[0] + DEPTH * 0.68, shift + frac * (hw - CLEAR - hv)
        lying(k, u, v, hu, hv)
        part(u, v, band(k)[2] - SINK, hu, hv, 4, MOSS, r=10)

    g.draw()


def build(uphill):
    a = Asset()
    local = frame(uphill)
    for k in range(BANDS):            # the steps, each one nested over the last, lowest painted first
        u0, _, top = band(k)
        prism(a, rect(local, u0, HALF, -HALF, HALF), top - RISE, top,
              MASS_DEEP if k == 0 else MASS, rim=RIM)
        strip(a, local, k, top)
    ruins(a, local)
    a.check_bounds()
    return a


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, uphill in UPHILL.items():
        path = os.path.join(OUT_DIR, "block_%s.svg" % name)
        print("ok", path, "top sy =", round(build(uphill).save(path), 1))


if __name__ == "__main__":
    main()
