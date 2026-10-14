# iso_lib.py — primitives for 2:1 isometric "voxel clay" assets in the two-diamond template
# Every solid is a rounded box (a clay voxel). Cel shading, light from the upper right, no outlines.
# Supports multi-tile footprints: Asset(tiles=(2, 1)) is two tiles long along +x (down-right),
# Asset(tiles=(1, 2)) two tiles long along +y (down-left), Asset(tiles=(1, 1, 2)) two blocks tall
# (ceiling at z = 682). The anchor tile keeps the 1x1 coordinates.
# Requires: shapely (pip install shapely --break-system-packages)
import heapq
import math
from shapely.geometry import MultiPoint, Point, Polygon
from shapely.ops import unary_union
from shapely.prepared import prep

CX, CY = 512, 256
H = 341        # volume height (upper diamond plane)
TILE = 512     # world size of one tile edge (a tile spans ±256 around its centre)
MARGIN = 2     # anti-aliasing margin kept inside the footprint
HALF = TILE // 2 - MARGIN   # usable half-size of a single tile (254)
VIEW = (1, 1, 1)

FACE = {"top": 1.0, "right": 0.93, "left": 0.77}
BEVEL = 0.866
SEGMENTS = 24
SMOOTH = 2
PLAN_SUBDIV = 4


def P(x, y, z):
    return (CX + (x - y), CY + (x + y) / 2 - z)


def fmt(p):
    return f"{p[0]:.1f},{p[1]:.1f}"


def num(v):
    return f"{v:g}"


def tint(hex_color, f):
    r, g, b = (int(hex_color[i:i+2], 16) for i in (1, 3, 5))
    return "#%02x%02x%02x" % tuple(max(0, min(255, round(c * f))) for c in (r, g, b))


def falloff(z):
    return 0.85 + 0.15 * min(max(z / H, 0), 1)


def shade(hex_color, face, z=None):
    return tint(hex_color, FACE[face] * (falloff(z) if z is not None else 1))


def light(n):
    val = {0: FACE["right"], 1: FACE["left"], 2: FACE["top"]}
    order = sorted(range(3), key=lambda i: -n[i])
    a, b = order[0], order[1]
    if n[a] >= BEVEL or n[b] <= 0:
        return val[a]
    return (val[a] + val[b]) / 2


def seam(fill):
    return f'stroke="{fill}" stroke-width=".75" stroke-linejoin="round"'


def _norm(v):
    m = math.sqrt(sum(c * c for c in v)) or 1.0
    return tuple(c / m for c in v)


QUADS = [(1, 1), (-1, 1), (-1, -1), (1, -1)]


def plan_radii(rp, r, hx, hy):
    if rp is None:
        rp = r
    if not isinstance(rp, (tuple, list)):
        rp = (rp,) * 4
    return tuple(min(max(v, r), hx, hy) for v in rp)


def rbox_facets(cx, cy, z0, hx, hy, hz, r, k=SEGMENTS, rp=None):
    r = min(r, hx, hy, hz)
    rps = plan_radii(rp, r, hx, hy)
    if all(abs(v - r) < 1e-9 for v in rps):
        return _rbox_facets_plain(cx, cy, z0, hx, hy, hz, r, k)
    cz, czr = z0 + hz, hz - r
    kl = k * PLAN_SUBDIV
    lats = [(-90 + 90 * i / kl, -1) for i in range(kl + 1)] + [(90 * i / kl, 1) for i in range(kl + 1)]
    kq = [k * PLAN_SUBDIV if rps[q] - r > 1e-9 else k for q in range(4)]
    lons = [(90 * q + 90 * i / kq[q], q) for q in range(4) for i in range(kq[q] + 1)]

    def vert(lat, lon):
        (t, sz), (p, q) = lat, lon
        sx, sy = QUADS[q]
        ccx, ccy = sx * (hx - rps[q]), sy * (hy - rps[q])
        t, p = math.radians(t), math.radians(p)
        n = (math.cos(t) * math.cos(p), math.cos(t) * math.sin(p), math.sin(t))
        e = rps[q] - r
        pos = (cx + ccx + e * math.cos(p) + r * n[0], cy + ccy + e * math.sin(p) + r * n[1], cz + sz * czr + r * n[2])
        return pos, n

    grid = [[vert(la, lo) for lo in lons] for la in lats]
    out = []
    for i in range(len(lats) - 1):
        for j in range(len(lons)):
            j2 = (j + 1) % len(lons)
            vs = [grid[i][j], grid[i + 1][j], grid[i + 1][j2], grid[i][j2]]
            n = _norm(tuple(sum(v[1][a] for v in vs) for a in range(3)))
            out.append(([v[0] for v in vs], n))
    out.append(([v[0] for v in grid[-1]], (0, 0, 1)))
    return [(pts, n) for pts, n in out if sum(a * b for a, b in zip(n, VIEW)) > 1e-4]


def _rbox_facets_plain(cx, cy, z0, hx, hy, hz, r, k=SEGMENTS):
    cz = z0 + hz
    core = (hx - r, hy - r, hz - r)
    lats = [(-90 + 90 * i / k, -1) for i in range(k + 1)] + [(90 * i / k, 1) for i in range(k + 1)]
    quads = [(1, 1), (-1, 1), (-1, -1), (1, -1)]
    lons = [(90 * q + 90 * i / k, quads[q]) for q in range(4) for i in range(k + 1)]

    def vert(lat, lon):
        (t, sz), (p, (sx, sy)) = lat, lon
        t, p = math.radians(t), math.radians(p)
        n = (math.cos(t) * math.cos(p), math.cos(t) * math.sin(p), math.sin(t))
        pos = (cx + sx * core[0] + r * n[0], cy + sy * core[1] + r * n[1], cz + sz * core[2] + r * n[2])
        return pos, n

    grid = [[vert(la, lo) for lo in lons] for la in lats]
    out = []
    for i in range(len(lats) - 1):
        for j in range(len(lons)):
            j2 = (j + 1) % len(lons)
            vs = [grid[i][j], grid[i + 1][j], grid[i + 1][j2], grid[i][j2]]
            n = _norm(tuple(sum(v[1][a] for v in vs) for a in range(3)))
            out.append(([v[0] for v in vs], n))
    top = cz + hz
    out.append(([(cx + sx * core[0], cy + sy * core[1], top) for sx, sy in quads], (0, 0, 1)))
    return [(pts, n) for pts, n in out if sum(a * b for a, b in zip(n, VIEW)) > 1e-4]


class Asset:
    def __init__(self, tiles=(1, 1)):
        self.nx, self.ny, self.nz = (tuple(tiles) + (1,))[:3]
        assert self.nx >= 1 and self.ny >= 1 and self.nz >= 1
        self.ceiling = H * self.nz
        self.x0, self.x1 = -HALF, TILE * self.nx - TILE // 2 - MARGIN
        self.y0, self.y1 = -HALF, TILE * self.ny - TILE // 2 - MARGIN
        self.mid = ((self.nx - 1) * TILE / 2, (self.ny - 1) * TILE / 2)
        self.out, self.defs, self.screen_pts = [], [], []

    @property
    def axis(self):
        return "x" if self.nx >= self.ny else "y"

    def local(self, u, v, hu, hv):
        mx, my = self.mid
        if self.axis == "x":
            return mx + u, my + v, hu, hv
        return mx + v, my + u, hv, hu

    def envelope(self, length=1.0, width=1.0, height=1.0):
        long_half = TILE * max(self.nx, self.ny) / 2 - MARGIN
        short_half = TILE * min(self.nx, self.ny) / 2 - MARGIN
        return round(length * long_half), round(width * short_half), round(height * self.ceiling)

    def footprint(self, z=0, margin=0):
        T2 = TILE // 2
        xa, xb = -T2 + margin, TILE * self.nx - T2 - margin
        ya, yb = -T2 + margin, TILE * self.ny - T2 - margin
        return [P(xa, ya, z), P(xb, ya, z), P(xb, yb, z), P(xa, yb, z)]

    def viewbox(self):
        return (CX - TILE * self.ny, CY - TILE // 2 - self.ceiling,
                TILE * (self.nx + self.ny), TILE // 2 * (self.nx + self.ny) + self.ceiling)

    def _diamond_d(self, z):
        pts = self.footprint(z)
        return "M" + " ".join(f"{num(p[0])} {num(p[1])}" for p in pts) + "Z"

    def add(self, s): self.out.append(s)
    def define(self, s): self.defs.append(s)
    def _track(self, pts): self.screen_pts.extend(pts)

    def poly(self, pts3d, fill, extra=""):
        sp = [P(*p) for p in pts3d]; self._track(sp)
        self.add(f'<polygon points="{" ".join(fmt(p) for p in sp)}" fill="{fill}" {extra or seam(fill)}/>')

    def shape(self, geom, fill, extra=""):
        polys = [geom] if geom.geom_type == "Polygon" else list(getattr(geom, "geoms", []))
        d = []
        for pg in polys:
            if pg.is_empty or pg.geom_type != "Polygon":
                continue
            for ring in [pg.exterior, *pg.interiors]:
                c = list(ring.coords)[:-1]
                self._track(c)
                d.append("M" + " L".join(fmt(p) for p in c) + "Z")
        if d:
            self.add(f'<path d="{" ".join(d)}" fill="{fill}" fill-rule="evenodd" {extra or seam(fill)}/>')

    def voxel(self, cx, cy, z0, hx, hy, hz, color, r=None, zshade=None, rp=None, clip=None):
        r = 0.45 * min(hx, hy, hz) if r is None else r
        zs = z0 + 2 * hz if zshade is None else zshade
        groups = {}
        for pts, n in rbox_facets(cx, cy, z0, hx, hy, hz, r, rp=rp):
            pg = Polygon([P(*p) for p in pts])
            if pg.area > 1e-3:
                groups.setdefault(light(n), []).append(pg.buffer(0))
        if rp is not None and not all(abs(v - r) < 1e-9 for v in plan_radii(rp, min(r, hx, hy, hz), hx, hy)):
            unions = {lv: unary_union(gs) for lv, gs in groups.items()}
            sil = unary_union(list(unions.values()))
            s = SMOOTH
            for i, level in enumerate(sorted(unions)):
                if i == 0:
                    geom = sil
                else:
                    cum = unary_union([g for lv, g in unions.items() if lv >= level])
                    geom = cum.buffer(s).buffer(-2 * s).buffer(s).intersection(sil)
                if clip is not None:
                    geom = geom.intersection(clip)
                geom = geom.simplify(0.25, preserve_topology=True)
                self.shape(geom, tint(color, level * falloff(zs)))
            return
        for level in sorted(groups):
            geom = unary_union(groups[level])
            if clip is not None:
                geom = geom.intersection(clip)
            geom = geom.simplify(0.25, preserve_topology=True)
            self.shape(geom, tint(color, level * falloff(zs)))

    def pocket(self, cx, cy, ztop, hx, hy, depth, wall_color, floor_color, rp=0.0, k=SEGMENTS):
        rps = rp if isinstance(rp, (tuple, list)) else (rp,) * 4
        rps = tuple(min(max(v, 0.0), hx, hy) for v in rps)
        zf = ztop - depth
        ring = []
        for q, (sx, sy) in enumerate(QUADS):
            ccx, ccy = cx + sx * (hx - rps[q]), cy + sy * (hy - rps[q])
            for i in range(k + 1):
                p = math.radians(90 * q + 90 * i / k)
                ring.append((ccx + rps[q] * math.cos(p), ccy + rps[q] * math.sin(p), (math.cos(p), math.sin(p))))
        opening = Polygon([P(x, y, ztop) for x, y, _ in ring]).buffer(0)
        floor = Polygon([P(x, y, zf) for x, y, _ in ring]).buffer(0).intersection(opening)
        self.shape(floor.simplify(0.25, preserve_topology=True), shade(floor_color, "top", zf))
        groups = {}
        for i in range(len(ring)):
            (x0, y0, n0), (x1, y1, n1) = ring[i], ring[(i + 1) % len(ring)]
            n = _norm((-(n0[0] + n1[0]), -(n0[1] + n1[1]), 0.0))
            if n[0] + n[1] <= 1e-4:
                continue
            quad = Polygon([P(x0, y0, ztop), P(x1, y1, ztop), P(x1, y1, zf), P(x0, y0, zf)]).buffer(0)
            if quad.area > 1e-3:
                groups.setdefault(light(n), []).append(quad)
        for level in sorted(groups):
            geom = unary_union(groups[level]).intersection(opening).simplify(0.25, preserve_topology=True)
            self.shape(geom, tint(wall_color, level * falloff(ztop)))
        return opening

    def flat(self, cx, cy, z, hx, hy, r, color, face="top", zshade=None, alpha=None):
        pts, k = [], 12
        for q, (sx, sy) in enumerate([(1, 1), (-1, 1), (-1, -1), (1, -1)]):
            for i in range(k + 1):
                a = math.radians(90 * q + 90 * i / k)
                pts.append((cx + sx * (hx - r) + r * math.cos(a), cy + sy * (hy - r) + r * math.sin(a), z))
        if alpha is not None:
            self.poly(pts, color, f'fill-opacity="{alpha}"')
        else:
            self.poly(pts, shade(color, face, z if zshade is None else zshade))

    def bounds_hull(self):
        return MultiPoint(self.footprint(0) + self.footprint(self.ceiling)).convex_hull

    def check_bounds(self, tol=1.0):
        hull = prep(self.bounds_hull().buffer(tol))
        bad = [p for p in self.screen_pts if not hull.contains(Point(p))]
        assert not bad, f"{len(bad)} points out of bounds, e.g. {bad[:3]}"
        return min(p[1] for p in self.screen_pts)

    def save(self, path):
        top_sy = self.check_bounds()
        defs = "\n    ".join(STANDARD_DEFS + self.defs)
        body = "\n    ".join(self.out)
        vx, vy, vw, vh = self.viewbox()
        dims = f"{self.nx}x{self.ny}" + (f"x{self.nz}" if self.nz > 1 else "")
        tiles = "" if dims == "1x1" else f' data-tiles="{dims}"'
        svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{vw}" height="{vh}" viewBox="{vx} {vy} {vw} {vh}"{tiles}>
  <defs>
    {defs}
  </defs>
  <path id="lower-shadow" fill="transparent" d="{self._diamond_d(0)}" opacity=".28" />
  <path id="upper-shadow" fill="transparent" d="{self._diamond_d(self.ceiling)}" opacity=".2" />
  <g id="figure">
    {body}
  </g>
</svg>
'''
        open(path, "w").write(svg)
        return top_sy


def _box_screen_bbox(c):
    cx, cy, z0, hx, hy, hz = c[:6]
    pts = [P(cx + sx * hx, cy + sy * hy, z0 + sz * 2 * hz) for sx in (-1, 1) for sy in (-1, 1) for sz in (0, 1)]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def _behind(a, b, eps=0.5):
    ax0, ax1 = a[0] - a[3], a[0] + a[3]
    ay0, ay1 = a[1] - a[4], a[1] + a[4]
    az0, az1 = a[2], a[2] + 2 * a[5]
    bx0, bx1 = b[0] - b[3], b[0] + b[3]
    by0, by1 = b[1] - b[4], b[1] + b[4]
    bz0, bz1 = b[2], b[2] + 2 * b[5]
    return ax1 <= bx0 + eps or ay1 <= by0 + eps or az1 <= bz0 + eps


def depth_order(cells):
    n = len(cells)
    key = [c[0] + c[1] + c[2] + c[5] for c in cells]
    bb = [_box_screen_bbox(c) for c in cells]
    after = [[] for _ in range(n)]
    indeg = [0] * n
    for i in range(n):
        for j in range(i + 1, n):
            bi, bj = bb[i], bb[j]
            if bi[2] <= bj[0] or bj[2] <= bi[0] or bi[3] <= bj[1] or bj[3] <= bi[1]:
                continue
            ij, ji = _behind(cells[i], cells[j]), _behind(cells[j], cells[i])
            if ij and ji:
                continue
            if not ij and not ji:
                ij = key[i] <= key[j]
            if ij:
                after[i].append(j); indeg[j] += 1
            else:
                after[j].append(i); indeg[i] += 1
    heap = [(key[i], i) for i in range(n) if indeg[i] == 0]
    heapq.heapify(heap)
    done, order = [False] * n, []
    while len(order) < n:
        if not heap:
            i = min((k for k in range(n) if not done[k]), key=lambda k: key[k])
            print(f"warning: depth cycle, forcing voxel at {cells[i][:3]} — check for overlapping voxels")
            indeg[i] = 0
            heap.append((key[i], i))
        _, i = heapq.heappop(heap)
        if done[i]:
            continue
        done[i] = True
        order.append(cells[i])
        for j in after[i]:
            indeg[j] -= 1
            if indeg[j] == 0 and not done[j]:
                heapq.heappush(heap, (key[j], j))
    return order


class VoxelGrid:
    def __init__(self, asset, u, uz=None, base=0.0, gap=6.0, r=None, offset=(0, 0)):
        self.a, self.u, self.uz, self.base, self.gap, self.r = asset, u, uz or u, base, gap, r
        self.ox, self.oy = offset
        self.cells = []

    def add(self, i, j, k, color, scale=1.0, dz=0.0, r=None, span=(1, 1, 1)):
        si, sj, sk = span
        hx = self.u * si / 2 * scale - self.gap / 2
        hy = self.u * sj / 2 * scale - self.gap / 2
        hz = self.uz * sk / 2 * scale - self.gap / 2
        cx = self.ox + (i + (si - 1) / 2) * self.u
        cy = self.oy + (j + (sj - 1) / 2) * self.u
        z0 = self.base + k * self.uz + dz + (self.uz * sk / 2 - hz if scale < 1 else 0)
        self.cells.append((cx, cy, z0, hx, hy, hz, color, r if r is not None else self.r))

    def place(self, cx, cy, z0, hx, hy, hz, color, r=None, rp=None, pocket=None):
        extra = {k: v for k, v in (("rp", rp), ("pocket", pocket)) if v is not None}
        self.cells.append((cx, cy, z0, hx, hy, hz, color, r) + ((extra,) if extra else ()))

    def draw(self):
        for c in depth_order(self.cells):
            cx, cy, z0, hx, hy, hz, color, r = c[:8]
            extra = c[8] if len(c) > 8 else {}
            self.a.voxel(cx, cy, z0, hx, hy, hz, color, r=r, rp=extra.get("rp"))
            pk = extra.get("pocket")
            if pk:
                rim = pk["rim"]
                r_used = 0.45 * min(hx, hy, hz) if r is None else min(r, hx, hy, hz)
                host_rp = plan_radii(extra.get("rp"), r_used, hx, hy)
                orp = pk.get("rp", tuple(max(v - rim, 0.0) for v in host_rp))
                opening = self.a.pocket(cx, cy, z0 + 2 * hz, hx - rim, hy - rim, pk["depth"],
                                        color, pk["floor"], rp=orp)
                for ic in depth_order(list(pk.get("inside", []))):
                    self.a.voxel(*ic[:7], r=ic[7] if len(ic) > 7 else None, clip=opening)


GRASS, DIRT, STONE, FOLIAGE, WOOD, MOSS = "#a4de00", "#bcb857", "#c4cdd1", "#86c832", "#9a6e45", "#8fae5a"
FRUIT = "#e8574a"
GLOW = "#7fe8e2"
PAINT = "#e8574a"
TIRE = "#5c5f6a"
GLASS = "#a9dcec"
LAMP = "#ffe7a3"

STANDARD_DEFS = [
    '<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
]
