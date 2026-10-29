"""Generates public/assets/cloud-shadow.svg: small voxel cloud shadows on the isometric grid.

Each cloud is a set of half-tile diamonds (the tile's 2:1 rhombus at half size), so its edges run
along the tile edges like the voxel assets, then the whole shape is blurred once, so the edges fade
softly and overlapping cells never add up their opacity. The pattern repeats every PERIOD_TILES tiles in both screen directions, so a GPU TilingSprite can
cover the viewport with it seamlessly.

Units: the SVG is drawn at SVG_PER_PX SVG units per scene pixel (one tile = 40 x 20 scene px), so
one tile is 160 units (CLOUD_SHADOW_TILE_UNITS in cloud-shadows.ts). Run from the repo root: python3 artifacts/cloud_shadow.py
"""

import math
import random
from pathlib import Path

TILE_W, TILE_H = 40, 20  # scene px (TILE_WIDTH, TILE_HEIGHT)
CELL = 0.5  # cell size in tiles
SVG_PER_PX = 4  # SVG units per scene pixel; TILE_W * SVG_PER_PX must equal CLOUD_SHADOW_TILE_UNITS
PERIOD_TILES = 12  # pattern period, in tiles along each screen axis
COLOR = "#17242c"
BLUR = 3.5  # Gaussian blur, in scene px
SEED = 7

# Each cloud is a few round puffs: (across, down, radius) in tiles, measured on the ground along the
# screen's horizontal and vertical, so clouds read wider than tall like the rest of the art.
CLOUDS = [
    {"at": (2.0, 1.5), "puffs": [(-1.1, 0.2, 0.75), (0, 0, 0.95), (1.1, 0.15, 0.8), (-0.3, -0.75, 0.75), (0.7, -0.6, 0.6)]},
    {"at": (8.0, -3.0), "puffs": [(-0.5, 0.1, 0.55), (0.3, 0, 0.7), (1.0, 0.15, 0.5), (0.1, -0.55, 0.5)]},
    {"at": (9.0, 5.5), "puffs": [(-1.6, 0.25, 0.75), (-0.5, 0, 1.0), (0.7, 0, 1.05), (1.8, 0.2, 0.75), (-0.8, -0.85, 0.75), (0.4, -0.95, 0.85), (1.3, -0.6, 0.6)]},
    {"at": (3.0, 8.5), "puffs": [(-0.35, 0, 0.5), (0.35, 0.05, 0.55), (0, -0.4, 0.45)]},
]


def to_screen(i: float, j: float) -> tuple[float, float]:
    """Ground-plane tiles to scene px (x right, y down), like projectBoxesToIsometric."""
    return (i - j) * TILE_W / 2, (i + j) * TILE_H / 2


def cloud_cells(cloud: dict, rng: random.Random) -> set[tuple[int, int]]:
    """Cells (in CELL units) whose centre falls inside the cloud's puffs, with a ragged edge."""
    ci, cj = cloud["at"]
    cells = set()
    for across, down, r in cloud["puffs"]:
        # Screen right is +i -j on the ground, screen down is +i +j.
        cx = ci + (across + down) / math.sqrt(2)
        cy = cj + (down - across) / math.sqrt(2)
        n = math.ceil((r + 1) / CELL)
        for a in range(-n, n + 1):
            for b in range(-n, n + 1):
                i, j = round(cx / CELL) + a, round(cy / CELL) + b
                d = math.hypot(i * CELL + CELL / 2 - cx, j * CELL + CELL / 2 - cy)
                if d <= r + CELL * 0.15 * (rng.random() - 0.5):
                    cells.add((i, j))
    return cells


def diamond(i: int, j: int, width: float, height: float) -> list[str]:
    """The cell's rhombus, plus its copies across the pattern's edges, in SVG units."""
    x, y = to_screen(i * CELL, j * CELL)  # top vertex of the cell
    hw, hh = TILE_W * CELL / 2, TILE_H * CELL / 2
    out = []
    for dx in (-width, 0, width):
        for dy in (-height, 0, height):
            px, py = x % width + dx, y % height + dy
            pts = [(px, py), (px + hw, py + hh), (px, py + 2 * hh), (px - hw, py + hh)]
            # Copies just outside the pattern still blur into it, so its edges stay seamless.
            reach = 3 * BLUR
            if max(p[0] for p in pts) < -reach or min(p[0] for p in pts) > width + reach:
                continue
            if max(p[1] for p in pts) < -reach or min(p[1] for p in pts) > height + reach:
                continue
            s = SVG_PER_PX
            out.append("M" + " ".join(f"{a * s:g},{b * s:g}" for a, b in pts) + "Z")
    return out


def main() -> None:
    rng = random.Random(SEED)
    width, height = PERIOD_TILES * TILE_W, PERIOD_TILES * TILE_H
    cells: set[tuple[int, int]] = set()
    for cloud in CLOUDS:
        cells |= cloud_cells(cloud, rng)
    shape = [p for c in sorted(cells) for p in diamond(*c, width, height)]
    w, h = width * SVG_PER_PX, height * SVG_PER_PX
    # One opaque path, blurred once: cells that touch or overlap never darken twice, and the
    # engine applies the shadow's opacity to the whole pattern.
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">\n'
        f'  <filter id="soft" x="0" y="0" width="{w}" height="{h}" filterUnits="userSpaceOnUse">'
        f'<feGaussianBlur stdDeviation="{BLUR * SVG_PER_PX:g}"/></filter>\n'
        f'  <path filter="url(#soft)" fill="{COLOR}" d="{" ".join(shape)}"/>\n'
        "</svg>\n"
    )
    out = Path(__file__).resolve().parent.parent / "public" / "assets" / "cloud-shadow.svg"
    out.write_text(svg)
    print(f"{out}: {len(cells)} cells, {len(svg)} bytes")


if __name__ == "__main__":
    main()
