#!/usr/bin/env python3
"""Rasterize the game's assets for the atlas packer.

Every asset is a PNG already (the voxel renders, the hand-drawn legacy ones), so this script
only: scales each `.png` asset it finds to the shared resolution (the packer then trims each to
its ink), and cuts every painted player sheet (`painted/player-16_<sheet>.png`, the 3D-model
renders) cell by cell into `sheets/player-16_<sheet>/<row>-<column>.png` — needing the cell
geometry of each sheet, which is compiled in beside them as `player-16/<sheet>.json`.

`PIXELS_PER_TILE` is the width of one tile of world in the rasters, so every sprite comes out at
the same resolution per tile of world. The packer only trims and places; nothing is scaled
twice, and a three-cell pier no longer comes out at a third of the detail of a bush because both
were squeezed into the same cell.

A sheet may also be a pre-rendered picture of a sheet: its cells are cut from that picture, and
its geometry is read from its sheet JSON — a plain grid, one cell per facing and pose, with no
alpha to cut by hand.

Usage: rasterize.py <assets_dir> <out_dir> [pixels_per_tile]
"""
import glob
import json
import os
import sys
from PIL import Image


def pixels(units, scale):
    """`units` of the template canvas's space, in pixels, never zero."""
    return max(1, round(units * scale))


# How many pixels wide one tile of world is rasterized at. The client draws a tile 280 px wide,
# so this leaves a little room to zoom in without the artwork going soft; raising it costs atlas
# area in proportion to its square.
PIXELS_PER_TILE = 320


def template_canvas(tiles):
    """The canvas `tiles` implies, in pixels at the rasterized resolution."""
    counts = [max(1, int(n)) for n in (tiles or "1x1x1").split("x")]
    counts += [1] * (3 - len(counts))
    along, across, high = counts[:3]
    return (512 * (along + across), 256 * (along + across) + 341 * high)


def render_raster(path, out_dir, name, scale, tiles):
    """Copies a raster asset in at the shared resolution, leaving its canvas untouched."""
    image = Image.open(path).convert("RGBA")
    out = os.path.join(out_dir, "%s.png" % name)
    if tiles == "reflection":
        # Reflections are drawn on the face of the ground plane, not on the block's own
        # template: they keep their native 1024-wide canvas, and the packer measures their
        # ink exactly like the reflection assets always did. Nearest scaling keeps the hard polygon
        # edges hard so the measured box is exactly one elevation step tall.
        image.resize((1024, round(image.height * 1024 / image.width)), Image.NEAREST).save(out)
    else:
        width, height = template_canvas(tiles)
        image.resize((pixels(width, scale), pixels(height, scale)), Image.LANCZOS).save(out)
    return 1


def asset_tiles(path):
    """The `data-tiles` of a raster asset, from the JSON sidecar beside it."""
    sidecar = path[: -len(".png")] + ".json"
    if not os.path.exists(sidecar):
        return None
    with open(sidecar, encoding="utf-8") as file:
        return json.load(file).get("tiles")


def sheet_grid(path):
    """The grid of a sheet from its JSON sidecar: cell, columns, rows from the facings list."""
    with open(path, encoding="utf-8") as file:
        data = json.load(file)
    cell = data.get("cell")
    frames = data.get("frames")
    facings = data.get("facings")
    if not (cell and frames and facings):
        return None
    x, y, width, height = cell
    return {
        "cell": (x, y, width, height),
        "columns": int(frames),
        "facings": facings,
        "poses": data.get("poses") or [],
    }


def cut_painted(path, grid, out_dir, name, scale):
    """Cuts a painted sheet into its cells, each scaled to what the drawing would give."""
    sheet = Image.open(path).convert("RGBA")
    _, _, width, height = grid["cell"]
    rows, columns = len(grid["facings"]), grid["columns"]
    cell_w, cell_h = sheet.width / columns, sheet.height / rows
    size = (pixels(width, scale), pixels(height, scale))
    directory = os.path.join(out_dir, "sheets", name)
    os.makedirs(directory, exist_ok=True)
    for row in range(rows):
        for column in range(columns):
            box = (round(column * cell_w), round(row * cell_h),
                   round((column + 1) * cell_w), round((row + 1) * cell_h))
            cell = sheet.crop(box).resize(size, Image.LANCZOS)
            cell.save(os.path.join(directory, "%d-%d.png" % (row, column)))
    return rows * columns


def main():
    svg_dir, out_dir = sys.argv[1], sys.argv[2]
    per_tile = float(sys.argv[3]) if len(sys.argv) > 3 else PIXELS_PER_TILE
    scale = per_tile / 1024
    os.makedirs(out_dir, exist_ok=True)

    rasters = cells = sheets = 0
    for path in sorted(glob.glob(os.path.join(svg_dir, "**", "*.png"), recursive=True)):
        name = os.path.relpath(path, svg_dir).replace(os.sep, "_")[: -len(".png")]
        try:
            rasters += render_raster(path, out_dir, name, scale, asset_tiles(path))
        except Exception as error:  # a broken file must not stop the rest of the atlas
            print("warning: failed to rasterize %s: %s" % (path, error), file=sys.stderr)

    painted = os.path.join(os.path.dirname(os.path.normpath(svg_dir)), "painted")
    for path in sorted(glob.glob(os.path.join(painted, "*.png"))):
        stem = os.path.splitext(os.path.basename(path))[0]   # e.g. player-16_walk
        folder, separator, sheet = stem.partition("_")
        if not separator or folder != "player-16":
            continue
        sidecar = os.path.join(svg_dir, folder, sheet + ".json")
        try:
            grid = sheet_grid(sidecar)
            assert grid, "%s is not a sheet" % sidecar
            cells += cut_painted(path, grid, out_dir, stem, scale)
            sheets += 1
        except Exception as error:  # a broken file must not stop the rest of the atlas
            print("warning: failed to cut sheet %s: %s" % (path, error), file=sys.stderr)

    print(
        "Rasterized %d rasters and %d sheets (%d cells) at %g px per tile."
        % (rasters, sheets, cells, per_tile)
    )


if __name__ == "__main__":
    main()
