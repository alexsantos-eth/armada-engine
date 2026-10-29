# path_tiles.py — the sixteen looks of a path block, one per connection mask.
# Run from artifacts/: python3 path_tiles.py ../public/assets/grass/block.svg ../public/assets/path
# Writes block.svg (a lone patch of earth, the material's own texture) and the 4×4 path_tiles.svg
# atlas, frame `mask` at column mask % 4, row mask // 4, each with the canvas of a block.
#
# A path tile is the grass block with a chunky, toon bed of trodden earth on its top: a wide strip
# from the middle of the top to the middle of each joined edge, in big voxel steps (cells of 32
# units) whose edges fray by smooth noise, sunk a little under the grass so the far rim shows a
# step, with a few broad darker patches and chunky stones and slabs. The fraying fades out near the
# tile's edges and the bed runs on past each joined edge, so a strip leaves every tile at the same
# width and neighbouring tiles join without a seam. Engine directions on the asset's top plane: +x
# is −y here, +y is −x, −x is +y, −y is +x.
import math
import os
import re
import sys
from shapely.geometry import box as square
from shapely.ops import unary_union
from iso_lib import *

BASE_SVG = sys.argv[1] if len(sys.argv) > 1 else "../public/assets/grass/block.svg"
OUT_DIR = sys.argv[2] if len(sys.argv) > 2 else "../public/assets/path"

TOP = H
CELL = 32                 # side of an earth voxel step, in asset units (16 per tile)
EDGE = 254                # the earth reaches the edge of the top, so joined tiles meet
HALF_WIDTH = 132          # half the width of a strip where it leaves the tile
BLOB = 150                # radius of the earth in the middle of the tile
FRAY = 40                 # most the fraying moves an edge
FADE = 80                 # distance from the tile's edge over which the fraying fades out
SINK = 22                 # how far the bed sits under the grass
# Engine bit → direction on the asset's top plane.
DIRECTIONS = {1: (0, -1), 2: (-1, 0), 4: (0, 1), 8: (1, 0)}

EARTH = "#c08a4e"
EARTH_DARK = "#a8743d"
WALL = "#7c5426"          # the step down from the grass into the bed
WALL_LIT = "#946630"
STONES = ["#c9ced1", "#a9b1b6", "#d8c3a0"]


def noise(x, y, seed):
    """Smooth deterministic noise in about [-1, 1]."""
    return (
        math.sin(x * 0.021 + seed * 1.7) * math.cos(y * 0.017 - seed * 0.9)
        + 0.6 * math.sin((x + y) * 0.043 + seed * 2.3)
        + 0.4 * math.cos((x - y) * 0.061 - seed * 1.1)
    ) / 2.0


def hash01(i, j, seed):
    h = (i * 73856093) ^ (j * 19349663) ^ (seed * 83492791)
    h = (h ^ (h >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF) / 0x10000


def is_earth(x, y, mask):
    edge = max(abs(x), abs(y))
    if edge > EDGE:
        return False
    fray = FRAY * min(1.0, max(0.0, (256 - edge) / FADE)) * noise(x, y, mask)
    if mask == 0 or math.hypot(x, y) < BLOB + fray:
        return math.hypot(x, y) < BLOB + fray
    for bit, (dx, dy) in DIRECTIONS.items():
        if not mask & bit:
            continue
        along = x * dx + y * dy
        across = abs(x * dy - y * dx)
        if along >= 0 and across < HALF_WIDTH + fray:
            return True
    return False


def earth_cells(mask):
    cells = set()
    n = 256 // CELL
    for i in range(-n, n):
        for j in range(-n, n):
            if is_earth((i + 0.5) * CELL, (j + 0.5) * CELL, mask):
                cells.add((i, j))
    return cells


def top_shape(cells, z=TOP):
    """The cells as one shape on the screen, on the plane at height `z`."""
    polys = []
    for i, j in cells:
        x0, y0 = i * CELL, j * CELL
        corners = [P(x0, y0, z), P(x0 + CELL, y0, z), P(x0 + CELL, y0 + CELL, z), P(x0, y0 + CELL, z)]
        polys.append(Polygon(corners).buffer(0.01))
    return unary_union(polys).buffer(-0.01)


def run_on(cells, mask):
    """The cells plus the bed past each joined edge, so the sunk floor fills the tile to its edge."""
    n = 256 // CELL
    more = set(cells)
    for bit, (dx, dy) in DIRECTIONS.items():
        if mask & bit:
            edge = [(i, j) for i, j in cells if (dx == 1 and i == n - 1) or (dx == -1 and i == -n)
                    or (dy == 1 and j == n - 1) or (dy == -1 and j == -n)]
            for i, j in edge:
                for step in (1, 2):
                    more.add((i + dx * step, j + dy * step))
    return more


def tile(mask):
    asset = Asset()
    cells = earth_cells(mask)
    opening = top_shape(cells)
    floor = top_shape(run_on(cells, mask), TOP - SINK).intersection(opening)
    # The step down: the far rim, lit on its right-facing walls, then the floor over it.
    asset.shape(opening.simplify(0.25, preserve_topology=True), WALL)
    lit = [top_shape([(i, j)]) for i, j in cells if (i, j - 1) not in cells and j > -256 // CELL]
    if lit:
        rim = unary_union(lit).difference(floor).intersection(opening)
        if not rim.is_empty:
            asset.shape(rim.simplify(0.25, preserve_topology=True), WALL_LIT)
    asset.shape(floor.simplify(0.25, preserve_topology=True), EARTH)
    # A few broad, darker patches of earth, in whole cells, away from the edges the tile joins at.
    dark = {c for c in cells if max(abs(c[0] + 0.5), abs(c[1] + 0.5)) < 256 // CELL - 2
            and math.sin(c[0] * 0.75 + mask * 1.3) * math.cos(c[1] * 0.75 - mask * 0.7) > 0.55}
    if dark:
        patch = top_shape(dark, TOP - SINK).intersection(floor)
        if not patch.is_empty:
            asset.shape(patch.simplify(0.25, preserve_topology=True), EARTH_DARK)
    # Chunky stones and flat slabs well inside the bed.
    deep = sorted(c for c in cells if all((c[0] + di, c[1] + dj) in cells for di in (-1, 0, 1) for dj in (-1, 0, 1)))
    grid = VoxelGrid(asset, u=100)
    picked = []
    for c in sorted(deep, key=lambda c: hash01(*c, mask + 101)):
        if len(picked) >= 2 + (mask % 2) + bin(mask).count("1"):
            break
        if all(abs(c[0] - p[0]) + abs(c[1] - p[1]) > 2 for p in picked):
            picked.append(c)
    for k, (i, j) in enumerate(picked):
        roll = hash01(i, j, mask + 5)
        jitter = (hash01(i, j, mask + 9) - 0.5) * CELL * 0.6
        cx, cy = (i + 0.5) * CELL + jitter, (j + 0.5) * CELL - jitter
        if k % 3 == 2:   # a flat slab
            size = 26 + 14 * roll
            grid.place(cx, cy, TOP - SINK, size * 1.3, size, 5, STONES[2], r=6)
        else:            # a chunky stone
            size = 14 + 12 * roll
            grid.place(cx, cy, TOP - SINK, size * 1.15, size, size * 0.7, STONES[k % 2], r=size * 0.35)
    grid.draw()
    asset.check_bounds()
    return asset


with open(BASE_SVG, encoding="utf8") as base_file:
    base = base_file.read()


def with_top(asset):
    decor = "\n    ".join(asset.out)
    svg = re.sub(r"(\s*)</g>\s*</svg>\s*$", lambda match: f"\n    {decor}\n  </g>\n</svg>\n", base)
    assert svg != base
    return svg


def svg_inner(svg, prefix):
    inner = svg.split(">", 1)[1].rsplit("</svg>", 1)[0]
    for identifier in re.findall(r'\bid="([^"]+)"', inner):
        inner = inner.replace(f'id="{identifier}"', f'id="{prefix}-{identifier}"')
        inner = inner.replace(f"#{identifier}", f"#{prefix}-{identifier}")
    return inner


os.makedirs(OUT_DIR, exist_ok=True)
tiles = [with_top(tile(mask)) for mask in range(16)]
with open(os.path.join(OUT_DIR, "block.svg"), "w", encoding="utf8") as block_file:
    block_file.write(tiles[0])
atlas = ['<svg xmlns="http://www.w3.org/2000/svg" width="4096" height="3412" viewBox="0 -341 4096 3412">']
for mask, svg in enumerate(tiles):
    atlas.append(f'<g id="path-{mask}" transform="translate({mask % 4 * 1024} {mask // 4 * 853})">')
    atlas.append(svg_inner(svg, f"path-{mask}"))
    atlas.append("</g>")
atlas.append("</svg>")
with open(os.path.join(OUT_DIR, "path_tiles.svg"), "w", encoding="utf8") as atlas_file:
    atlas_file.write("\n".join(atlas) + "\n")
print("ok", len(tiles), "path tiles")
