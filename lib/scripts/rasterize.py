#!/usr/bin/env python3
"""Rasterize the game's SVG assets for the atlas packer.

Every asset is drawn in one coordinate system (``artifacts/iso_lib.py``): one tile is 1024
units across, so rasterizing at ``PIXELS_PER_TILE / 1024`` of the SVG's own size gives every
sprite the same resolution per tile of world, whatever its size. The packer then only trims and
places what it is given: nothing is scaled twice, and a three-cell pier no longer comes out at a
third of the detail of a bush because both were squeezed into the same cell.

The player's poses are sheets (``data-frames``), one cell per facing and pose with a gap between
the cells, and every cell is a window on the same character template. Fitting a whole sheet into
one cell left a pose about sixteen pixels across, so the sheets are cut here, one PNG per cell,
into ``sheets/<name>/<facing>-<pose>.png``; the packer gives each sheet a texture of its own.

Usage: rasterize.py <svg_dir> <out_dir> [pixels_per_tile]
"""
import glob
import json
import os
import re
import sys


def cairosvg_candidates():
    """Directories that may hold a `cairosvg` package, likeliest first.

    The cheap guesses come first — a user install of Python, Homebrew, /usr/local — and only
    then the walk over the whole filesystem, which on macOS also reaches the same files a
    second time through /System/Volumes/Data.
    """
    for pattern in (
        "~/Library/Python/*/lib/python/site-packages",
        "~/.local/lib/python*/site-packages",
        "/opt/homebrew/lib/python*/site-packages",
        "/usr/local/lib/python*/site-packages",
        "/usr/lib/python*/site-packages",
        "/usr/lib/python3/dist-packages",
    ):
        for directory in sorted(glob.glob(os.path.expanduser(pattern)), reverse=True):
            yield directory
    for root in (os.path.expanduser("~/.cache"), "/opt", "/usr", "/Library", "/"):
        for directory, names, _ in os.walk(root, onerror=lambda _error: None):
            if "cairosvg" in names:
                yield directory


def import_cairosvg():
    """cairosvg, looked for outside the import path if it is not on it.

    It may not be installed for the interpreter running this: it can come with another runtime,
    so the package is searched for and its directory put on the path. A copy installed for a
    different version of Python imports its own compiled parts (cffi, cairocffi) and fails here
    with `ModuleNotFoundError: No module named '_cffi_backend'` or a bad magic number, so a
    candidate that does not import is undone and the search goes on. `build-atlas.sh` picks an
    interpreter that can import it, and points the dynamic loader at a libcairo, before calling
    this.
    """
    try:
        return __import__("cairosvg")
    except ImportError:
        pass
    tried, rejected = set(), []
    for directory in cairosvg_candidates():
        if directory in tried:
            continue
        tried.add(directory)
        if not os.path.exists(os.path.join(directory, "cairosvg", "__init__.py")):
            continue
        sys.path.insert(0, directory)
        try:
            return __import__("cairosvg")
        except Exception as error:  # noqa: BLE001  (any failure means: not this copy)
            sys.path.remove(directory)
            for name in [
                module
                for module in sys.modules
                if module.split(".")[0] in ("cairosvg", "cairocffi", "cffi", "tinycss2")
            ]:
                del sys.modules[name]
            rejected.append("  %s\n    %s" % (directory, error))
    detail = "\n".join(rejected) or "  (no copy of cairosvg was found)"
    raise SystemExit(
        "cairosvg does not work under %s.\nCopies tried:\n%s\n"
        "Install it for this interpreter, for example:\n"
        "  python3 -m pip install --user cairosvg\n"
        "On macOS it also needs libcairo (`brew install cairo`), and on Linux libcairo2."
        % (sys.executable, detail)
    )


cairosvg = import_cairosvg()

# Width of one tile in the SVGs' own units.
SVG_TILE_WIDTH = 1024
# Top of the character template's canvas in those units: it reaches one block above the ground
# plane, and a sheet's `data-cell` is measured from there.
SVG_CANVAS_TOP = -341
# Sheets this client does not draw from: the eight-facing player sheets under `player/` are not
# used, because this client reads the sixteen-facing ones under `player-16/` and cuts every cell
# separately. Cutting the others would pack five textures nothing asks for.
SKIPPED_SHEETS = frozenset(
    "player_%s" % name for name in ("walk", "idle", "jump", "climb", "jetpack", "swim")
)

# How many pixels wide one tile of world is rasterized at. The client draws a tile 280 px wide,
# so this leaves a little room to zoom in without the artwork going soft; raising it costs atlas
# area in proportion to its square.
PIXELS_PER_TILE = 320


def attribute(svg, name):
    """The value of one attribute of the root element."""
    found = re.search(r'\b%s="([^"]*)"' % re.escape(name), svg[: svg.find(">") + 1])
    return found.group(1) if found else None


def sheet_grid(svg):
    """The grid of a sprite sheet, or None if the file is not one."""
    frames = attribute(svg, "data-frames")
    cell = attribute(svg, "data-cell")
    facings = attribute(svg, "data-facings")
    if not (frames and cell and facings):
        return None
    x, y, width, height = (float(n) for n in cell.split())
    poses = (attribute(svg, "data-poses") or "").split()
    return {
        "cell": (x, y + SVG_CANVAS_TOP, width, height),
        "columns": int(frames),
        "facings": facings.split(),
        "poses": poses,
    }


def pixels(units, scale):
    """`units` of the SVG's own space, in pixels, never zero."""
    return max(1, round(units * scale))


def template_canvas(tiles):
    """The canvas `tiles` implies, in the SVG's own units: `iso_lib.Asset.viewbox()`.

    An asset authored as a PNG is drawn on exactly this canvas, so rasterizing it means only
    scaling it to the same pixels per tile as everything else.
    """
    counts = [max(1, int(n)) for n in (tiles or "1x1x1").split("x")]
    counts += [1] * (3 - len(counts))
    along, across, high = counts[:3]
    half = SVG_TILE_WIDTH / 2
    return half * (along + across), half / 2 * (along + across) + 341 * high


def render_raster(path, out_dir, name, scale, tiles):
    """Copies a raster asset in at the shared resolution, leaving its canvas untouched."""
    from PIL import Image

    width, height = template_canvas(tiles)
    image = Image.open(path).convert("RGBA")
    out = os.path.join(out_dir, "%s.png" % name)
    image.resize((pixels(width, scale), pixels(height, scale)), Image.LANCZOS).save(out)
    return 1


def asset_tiles(path):
    """The `data-tiles` of a raster asset, from the JSON file beside it."""
    sidecar = path[: -len(".png")] + ".json"
    if not os.path.exists(sidecar):
        return None
    with open(sidecar, encoding="utf-8") as file:
        return json.load(file).get("tiles")


def render_asset(path, svg, out_dir, name, scale):
    """Draws one whole asset at `scale` of its own size."""
    width = float(attribute(svg, "viewBox").split()[2])
    out = os.path.join(out_dir, "%s.png" % name)
    cairosvg.svg2png(url=path, write_to=out, output_width=pixels(width, scale))
    return 1


def render_sheet(svg, grid, out_dir, name, scale):
    """Draws every cell of a sheet on its own, in the window the cells share.

    Each pose is one `<g id="facing-pose">` whose geometry is in the character template's own
    coordinates; the group's `transform` is what places it in the sheet's grid. So a cell is
    drawn by taking its group, dropping that transform and showing the template through the
    `data-cell` window — which is both simpler and sharper than rasterizing the whole sheet and
    cutting the pixels up, because no cell boundary ever falls between two pixels.
    """
    groups = dict(re.findall(r'<g id="([^"]+)"[^>]*>(.*?)</g>', svg, re.S))
    x, y, width, height = grid["cell"]
    directory = os.path.join(out_dir, "sheets", name)
    os.makedirs(directory, exist_ok=True)
    written = 0
    for row, facing in enumerate(grid["facings"]):
        for column in range(grid["columns"]):
            pose = grid["poses"][column] if grid["poses"] else column
            body = groups.get("%s-%s" % (facing, pose))
            if body is None:
                print("warning: %s has no cell %s-%s" % (name, facing, pose), file=sys.stderr)
                continue
            cell = (
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="%g %g %g %g">'
                '<g fill-rule="evenodd" stroke-width=".75" stroke-linejoin="round">%s</g></svg>'
            ) % (x, y, width, height, body)
            cairosvg.svg2png(
                bytestring=cell.encode(),
                write_to=os.path.join(directory, "%d-%d.png" % (row, column)),
                output_width=pixels(width, scale),
                output_height=pixels(height, scale),
            )
            written += 1
    return written


def main():
    svg_dir, out_dir = sys.argv[1], sys.argv[2]
    per_tile = float(sys.argv[3]) if len(sys.argv) > 3 else PIXELS_PER_TILE
    scale = per_tile / SVG_TILE_WIDTH
    os.makedirs(out_dir, exist_ok=True)

    assets = sheets = cells = rasters = 0
    for pattern in ("*.svg", "*.png"):
        for path in sorted(glob.glob(os.path.join(svg_dir, "**", pattern), recursive=True)):
            extension = os.path.splitext(path)[1]
            name = os.path.relpath(path, svg_dir).replace(os.sep, "_")[: -len(extension)]
            try:
                if extension == ".png":
                    rasters += render_raster(path, out_dir, name, scale, asset_tiles(path))
                    continue
                svg = open(path, encoding="utf-8").read()
                grid = sheet_grid(svg)
                if grid and name in SKIPPED_SHEETS:
                    continue
                if grid:
                    cells += render_sheet(svg, grid, out_dir, name, scale)
                    sheets += 1
                else:
                    assets += render_asset(path, svg, out_dir, name, scale)
            except Exception as error:  # a broken file must not stop the rest of the atlas
                print("warning: failed to rasterize %s: %s" % (path, error), file=sys.stderr)

    print(
        "Rasterized %d assets, %d rasters and %d sheets (%d cells) at %g px per tile."
        % (assets, rasters, sheets, cells, per_tile)
    )


if __name__ == "__main__":
    main()
