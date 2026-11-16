#!/usr/bin/env python3
# grass_clay.py — the grass tops with something growing on them: clutter as clay pieces from the
# voxel kit, laid over the grass block that already exists. The block itself is never drawn.
#
#   python3 grass_clay.py [block.png] [out_dir]        (defaults: the game's assets)
#
#   → block_bushes.png, block_flowers.png, block_flowers_2.png, block_leaves.png,
#     block_mushrooms.png, block_pebbles.png, block_sprouts.png,
#     block_wildflowers_red.png, block_wildflowers_white.png
#
# The decorations are assembled as a voxel model standing on the ground plane of a 1x1x1 volume
# (their z = 0 is the block's foot), rendered with the same camera and template as every other
# clay sprite, and composited onto the block. On the 1x1x1 template the block's top face sits
# exactly where the ground plane of a decoration does — one block of height cancels the shift —
# so the render drops onto the block at one vertical offset and to the pixel.
#
# The decorations stay inside the block's silhouette (low, and within the flat top), so the
# opaque bounds of each variant are the plain block's bounds, the packed atlas measures every
# variant's ink as the block's, and the terrain draws them exactly where it draws the block.
#
# Rendering needs Blender (the `blender` on the PATH, /Applications/Blender.app on macOS, or the
# `bpy` pip module); each sprite takes about half a minute. Needs Pillow for the composite.
import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image

from vox_prefabs import moved, piece, tile_volume, write

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "lib", "assets-src", "assets", "grass")
BASE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ASSETS, "block.png")
OUT_DIR = sys.argv[2] if len(sys.argv) > 2 else ASSETS
ONLY = sys.argv[3:]  # rebuild only these variants, e.g. block_bushes
RENDER = os.path.join(HERE, "vox_render.py")
# The block's top face is one block (341 template px) above the decoration's foot plane.
TOP_SHIFT = 341

# (x, y) spots on the top, in voxels, kept within the flat top and the silhouette
A, B, C, D, E, F = (-30, -28), (22, -35), (-38, 17), (10, 5), (35, 27), (-10, 38)


def flowers(variant, spots):
    return [b for x, y in spots for b in put("flower_big", x, y, 0, variant)]


def wildflowers(variant, spots):
    return [b for x, y in spots for b in put("wildflower", x, y, 0, variant)]


def sprouts():
    return [b for x, y in (A, B, C, D, E) for b in put("sprout", x, y, 0)]


def leaves():
    colours = ("ochre", "rust", "ochre", "rust", "ochre", "rust", "ochre")
    spots = [(-35, -25), (15, -38), (-40, 20), (2, 0), (38, 15), (-8, 40), (27, 42)]
    return [b for (x, y), variant in zip(spots, colours) for b in put("fallen_leaf", x, y, 0, variant)]


def pebbles():
    return (put("pebble_l", -28, -10, 0) + put("pebble_m", -8, 9, 0)
            + put("pebble_s", 20, -9, 0) + put("pebble_m", 36, 26, 0))


def mushrooms():
    return put("mushroom", -21, -8, 0) + put("mushroom", 14, 13, 0)


def bushes():
    out = []
    for x, y in ((-35, -5), (30, -22), (12, 32)):
        out += put("leaf_tuft", x, y, 0, "green")
        out += put("leaf_tuft", x + 9, y + 4, 0, "dark")
        out += put("leaf_tuft", x - 7, y - 5, 0, "green")
    return out


def put(name, x, y, z, variant=""):
    return moved(piece(name, variant), x, y, z)


VARIANTS = {
    "block_flowers.png": flowers("yellow", (A, B, D)),
    "block_flowers_2.png": flowers("pink", (A, C, E)),
    "block_wildflowers_red.png": wildflowers("red", (A, C, E)),
    "block_wildflowers_white.png": wildflowers("white", (A, B, F)),
    "block_sprouts.png": sprouts(),
    "block_leaves.png": leaves(),
    "block_pebbles.png": pebbles(),
    "block_mushrooms.png": mushrooms(),
    "block_bushes.png": bushes(),
}


def blender():
    path = shutil.which("blender")
    if path:
        return path
    fallback = "/Applications/Blender.app/Contents/MacOS/Blender"
    return fallback if os.path.exists(fallback) else None


def render(model, sprite):
    script = RENDER
    binary = blender()
    command = [binary, "-b", "-P", script, "--", model, sprite] if binary else [sys.executable, script, model, sprite]
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL)


def main():
    base = Image.open(BASE).convert("RGBA")
    full_h = 853  # the 1x1x1 template's height in units; the render comes out 1024 x 853
    shift = round(TOP_SHIFT * base.height / full_h)
    models = os.path.join(HERE, "vox", "models")
    os.makedirs(models, exist_ok=True)
    os.makedirs(OUT_DIR, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for name, boxes in VARIANTS.items():
            if ONLY and name not in ONLY and name not in (n + ".png" for n in ONLY):
                continue
            model = os.path.join(models, os.path.splitext(name)[0] + ".vox")
            render_png = os.path.join(tmp, name)
            write(model, boxes, bounds=tile_volume((1, 1, 1)))
            render(model, render_png)
            decor = Image.open(render_png).convert("RGBA").resize(base.size, Image.LANCZOS)
            out = base.copy()
            out.alpha_composite(decor, (0, -shift))
            out.save(os.path.join(OUT_DIR, name))
            print("ok", os.path.join(OUT_DIR, name))


if __name__ == "__main__":
    main()
