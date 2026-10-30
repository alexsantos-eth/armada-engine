# player_jetpack.py — the jetpack the player (monkey.py's monkey) wears on its back, in 8 facings.
# One row per facing, in the walk sheet's order (east, north-east, north, north-west, west,
# south-west, south, south-east), one column: only the jetpack, cut where the standing monkey's
# body is in front of it, so the engine draws it over every pose of the other sheets (a child of
# the player's sprite). Every cell is the walk sheet's window (CELL, GAP). Requires shapely (see
# iso_lib.py).
from shapely.geometry import Polygon
from shapely.ops import unary_union
from iso_lib import P, VIEW, fmt, light, tint, falloff
import monkey
from player_walk import CELL, CELL_STYLE, FACINGS, GAP, MIN_AREA, TOP, Part, facing_yaw, pose, rbox_local


def shapes_of(parts, yaw):
    """Each part's shapes, back to front, as (polygon, fill, is the jetpack's), and their screen points."""
    drawn = []
    for (part, lift), mine in parts:
        groups, points = {}, []
        for pts, n in rbox_local(*part.h, part.r):
            nw = part.normal(n, yaw)
            if sum(a * b for a, b in zip(nw, VIEW)) <= 1e-4:
                continue
            sp = [P(*part.world(p, yaw, lift)) for p in pts]
            pg = Polygon(sp)
            if pg.area > 1e-3:
                groups.setdefault(light(nw), []).append(pg.buffer(0))
                points += sp
        drawn.append((sum(part.world((0, 0, 0), yaw, lift)), part, lift, groups, points, mine))
    drawn.sort(key=lambda d: d[0])
    shapes, every = [], []
    for _, part, lift, groups, points, mine in drawn:
        if mine:
            every += points
        for level in sorted(groups):
            geom = unary_union(groups[level]).simplify(0.4, preserve_topology=True)
            fill = tint(part.color, level * falloff(part.top + lift))
            for pg in ([geom] if geom.geom_type == "Polygon" else list(getattr(geom, "geoms", []))):
                if not pg.is_empty and pg.geom_type == "Polygon" and pg.area >= MIN_AREA:
                    shapes.append((pg, fill, mine))
    return shapes, every


def draw_jetpack(yaw):
    """SVG paths of the jetpack on the standing monkey turned to `yaw`, without what the body hides,
    and its screen points."""
    parts = [(p, False) for p in pose(0.0, False)] + [((Part(*p), 0.0), True) for p in monkey.jetpack()]
    shapes, every = shapes_of(parts, yaw)
    paths, cover = [], None
    # front to back: what shows of each jetpack shape is what the body in front of it leaves
    for pg, fill, mine in reversed(shapes):
        if mine:
            shown = pg if cover is None else pg.difference(cover)
            geoms = [shown] if shown.geom_type == "Polygon" else list(getattr(shown, "geoms", []))
            for g in geoms:
                if g.geom_type == "Polygon" and g.area >= MIN_AREA:
                    d = " ".join("M" + " ".join(fmt(p) for p in list(ring.coords)[:-1]) + "Z"
                                 for ring in [g.exterior, *g.interiors])
                    paths.append(f'<path d="{d}" fill="{fill}" stroke="{fill}"/>')
        else:
            cover = pg if cover is None else cover.union(pg)
    return list(reversed(paths)), every


def main():
    x0, y0c, w, h = CELL
    y0 = y0c + TOP
    rows, every = [], []
    for r, facing in enumerate(FACINGS):
        paths, pts = draw_jetpack(facing_yaw(r))
        every += pts
        tx, ty = -x0, r * (h + GAP) - y0
        rows.append(f'<g id="{facing}-0" transform="translate({tx} {ty})" {CELL_STYLE}>\n    '
                    + "\n    ".join(paths) + "\n  </g>")
    xs, ys = [p[0] for p in every], [p[1] for p in every]
    assert min(xs) >= x0 and max(xs) <= x0 + w, (min(xs), max(xs))
    assert min(ys) >= y0 and max(ys) <= y0 + h, (min(ys), max(ys))
    sheet_w, sheet_h = w, len(FACINGS) * (h + GAP) - GAP
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{sheet_w}" height="{sheet_h}" '
           f'viewBox="0 0 {sheet_w} {sheet_h}" data-cell="{x0} {y0c} {w} {h}" data-gap="{GAP}" '
           f'data-frames="1" data-facings="{" ".join(FACINGS)}">\n  ' + "\n  ".join(rows) + "\n</svg>\n")
    open("jetpack.svg", "w").write(svg)
    print(f"ok jetpack.svg {sheet_w}x{sheet_h}, cell x={x0} y={y0c} w={w} h={h}, gap {GAP}, 1 column x {len(FACINGS)} rows")


if __name__ == "__main__":
    main()
