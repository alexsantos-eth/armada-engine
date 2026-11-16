#!/usr/bin/env python3
# iso_vox.py — turns the shape base of an iso_lib generator into a MagicaVoxel .vox file.
#
#   python3 iso_vox.py tree_cypress.py                 → tree_cypress.vox (next to the generator)
#   python3 iso_vox.py tree_cypress.py -o out.vox --scale 2 --bake
#
# It runs the generator unchanged, but with a stand-in `iso_lib` that records every clay
# voxel (rounded box) instead of projecting it to SVG, then fills a 3D grid with them.
# No dependencies (standard library only).
#
#   --scale N    world units per .vox voxel (default 4: one tile = 128 voxels, a block = 85 high).
#                Seams between clay voxels are 6 units, so they survive up to scale 4.
#   --bake       paint the skill's cel shading into the colours (top / right / left faces,
#                the bevel band and the height falloff). Without it every voxel carries its
#                flat material colour and the lighting is left to whoever renders the model.
#   --recolor A=B  swap a material colour (repeatable), e.g. the painted look of the game:
#                --recolor '#3f8f47=#80c034'
#   --solid      keep the inside voxels too (by default only the shell is written).
#
# Axes: .vox is right-handed with z up; the asset world (x down-right, y down-left, z up) is
# left-handed, so world +y maps to .vox −y. Seen from the default MagicaVoxel camera the model
# then reads like the sprite, lit face included.
#
# Not carried over: cast shadows (`flat`), hand-drawn shapes (`poly`, `shape`), glow filters,
# and curved plans (`rp`: the voxel is written as a plain rounded box). Pockets are carved.
import argparse
import os
import runpy
import struct
import sys
import types

from vox_lib import BEVEL, FACE, H, falloff, light, shell, tint, voxelise, write_vox

TILE, MARGIN = 512, 2
HALF = TILE // 2 - MARGIN

GRASS, DIRT, STONE, FOLIAGE, WOOD, MOSS = "#a4de00", "#bcb857", "#c4cdd1", "#86c832", "#9a6e45", "#8fae5a"
FRUIT, GLOW = "#e8574a", "#7fe8e2"
PAINT, TIRE, GLASS, LAMP = "#e8574a", "#5c5f6a", "#a9dcec", "#ffe7a3"
STANDARD_DEFS = []
CX, CY = 512, 256

BOXES = []          # every recorded clay voxel, in the order the generator drew it
SKIPPED = set()     # features the generator used that a .vox cannot carry
SAVED = []          # paths the generator asked to save


def P(x, y, z):
    return (CX + (x - y), CY + (x + y) / 2 - z)


def shade(hex_color, face, z=None):
    return tint(hex_color, FACE[face] * (falloff(z) if z is not None else 1))


class Asset:
    """Same surface as iso_lib.Asset; solids are recorded, 2D-only drawing is dropped."""

    def __init__(self, tiles=(1, 1)):
        self.nx, self.ny, self.nz = (tuple(tiles) + (1,))[:3]
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

    def voxel(self, cx, cy, z0, hx, hy, hz, color, r=None, zshade=None, rp=None, clip=None, pocket=None):
        r = 0.45 * min(hx, hy, hz) if r is None else min(r, hx, hy, hz)
        if rp is not None:
            SKIPPED.add("curved plans (rp)")
        zs = z0 + 2 * hz if zshade is None else zshade
        BOXES.append(dict(c=(cx, cy, z0 + hz), h=(hx, hy, hz), r=r, color=color, zs=zs, pocket=pocket))

    def flat(self, *args, **kw):
        SKIPPED.add("cast shadows (flat)")

    def pocket(self, *args, **kw):
        SKIPPED.add("stand-alone pockets")

    def poly(self, *args, **kw):
        SKIPPED.add("hand-drawn shapes (poly/shape)")

    shape = poly

    def add(self, s):
        SKIPPED.add("raw SVG (add/define)")

    define = add

    def footprint(self, z=0, margin=0):
        T2 = TILE // 2
        xa, xb = -T2 + margin, TILE * self.nx - T2 - margin
        ya, yb = -T2 + margin, TILE * self.ny - T2 - margin
        return [P(xa, ya, z), P(xb, ya, z), P(xb, yb, z), P(xa, yb, z)]

    def viewbox(self):
        return (CX - TILE * self.ny, CY - TILE // 2 - self.ceiling,
                TILE * (self.nx + self.ny), TILE // 2 * (self.nx + self.ny) + self.ceiling)

    def check_bounds(self, tol=1.0):
        return 0.0

    def save(self, path):
        SAVED.append(path)
        return 0.0


class VoxelGrid:
    """Same surface as iso_lib.VoxelGrid. Painter order does not exist in 3D: draw() just records."""

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
        self.cells.append((cx, cy, z0, hx, hy, hz, color, r if r is not None else self.r, {}))

    def place(self, cx, cy, z0, hx, hy, hz, color, r=None, rp=None, pocket=None):
        self.cells.append((cx, cy, z0, hx, hy, hz, color, r, dict(rp=rp, pocket=pocket)))

    def draw(self):
        for cx, cy, z0, hx, hy, hz, color, r, extra in self.cells:
            self.a.voxel(cx, cy, z0, hx, hy, hz, color, r=r, rp=extra.get("rp"), pocket=extra.get("pocket"))
            for ic in (extra.get("pocket") or {}).get("inside", []):
                self.a.voxel(*ic[:7], r=ic[7] if len(ic) > 7 else None)
        self.cells = []


def depth_order(cells):
    return list(cells)


def main():
    ap = argparse.ArgumentParser(description="iso_lib generator → MagicaVoxel .vox")
    ap.add_argument("generator", help="an iso_lib generator script, e.g. tree_cypress.py")
    ap.add_argument("-o", "--out", help="output path (default: the generator's name with .vox)")
    ap.add_argument("--scale", type=float, default=4, help="world units per voxel (default 4)")
    ap.add_argument("--bake", action="store_true", help="bake the cel shading into the colours")
    ap.add_argument("--recolor", action="append", default=[], metavar="A=B", help="swap a material colour")
    ap.add_argument("--solid", action="store_true", help="keep inside voxels")
    args, rest = ap.parse_known_args()

    swap = {a.lower(): b.lower() for a, b in (s.split("=") for s in args.recolor)}
    shim = types.ModuleType("iso_lib")
    shim.__dict__.update({k: v for k, v in globals().items() if not k.startswith("_")})
    shim.__all__ = [k for k in shim.__dict__ if k not in ("main", "argparse")]
    sys.modules["iso_lib"] = shim
    gen = os.path.abspath(args.generator)
    sys.path.insert(0, os.path.dirname(gen))
    sys.argv = [gen] + rest                     # extra arguments go to the generator (e.g. `y`)
    runpy.run_path(gen, run_name="__main__")

    for b in BOXES:
        b["color"] = swap.get(b["color"].lower(), b["color"])
    cells = voxelise(BOXES, args.scale, args.bake)
    if not args.solid:
        cells = shell(cells)
    out = args.out or os.path.splitext(gen)[0] + ".vox"
    size, count, colors = write_vox(out, cells)
    print(f"ok {out}: {len(BOXES)} clay voxels → {size[0]}x{size[1]}x{size[2]}, "
          f"{count} voxels, {len(colors)} colours")
    for s in sorted(SKIPPED):
        print("  not carried over:", s)


if __name__ == "__main__":
    main()
