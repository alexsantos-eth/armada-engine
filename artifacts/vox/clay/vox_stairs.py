#!/usr/bin/env python3
# vox_stairs.py — the four looks of a stairs block, by the voxel route: a flight of old stone
# steps that carries a path from one elevation up to the next.
#
#   python3 vox_stairs.py [only …]        → lib/assets/stairs/block_{px,py,nx,ny}.png
#                                           and ../models/stairs_{px,py,nx,ny}.vox
#
# A stairs block is terrain, so unlike an entity it **fills its whole cell**: the mass is square
# prisms from edge to edge of the 128-voxel tile, with no rounding and no air at the sides, or a
# column would show a groove against its neighbours. It is one block tall and that whole block
# is the climb: four bands of a quarter tile each, rising a quarter block each, so the last
# tread is flush with the ground of the tile one level up. Nothing may rise over z = 85.
#
# Down the middle runs the walked strip, as wide as the strip of earth a path block leaves at
# its edge (66 voxels) and sunk the same 5 voxels, so a path runs onto the stairs and off the
# other end without a jump. Kerb stones, rubble and moss from the kit sit on the treads.
#
# The sprite is two renders of the same model: the clay one, and under it the hard-cube one of
# the bare mass. Clay rounds the edges of the cell by a voxel or two; the hard render fills that
# sliver with the same stone, so the silhouette is the full cell and the blocks tile.
#
# One file per direction the flight climbs toward, in engine axes (engine +x is −y of the model,
# +y is −x): px, py, nx, ny. The flight is written once climbing toward −y and laid out for the
# other three; each is rendered in its own orientation, so the light stays where it belongs.
import os
import subprocess
import sys
import tempfile

from PIL import Image

from grass_clay import blender
from vox_prefabs import STEP, STEP_DEEP, TREAD, box, moved, piece, tile_volume, turned, write

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "..", "..", "..", "lib", "assets", "stairs")
MODELS = os.path.join(HERE, "..", "models")
RENDER = os.path.join(HERE, "vox_render.py")
SIZE = (512, 427)                 # a terrain sprite: the 1x1x1 template at half size

BANDS = 4                         # steps of the flight (PLAYER_STAIRS_STEPS in the engine)
TOPS = [21, 42, 64, 85]           # top of each band, from the lowest: a quarter block each
DEPTH = 128 // BANDS              # 32: how deep one band is
STRIP = 66                        # width of the walked strip (a path's strip of earth)
SINK = 5                          # how far the strip sits under the stone beside it
FOOT = 10                         # the darker foundation course


def mass():
    """The bare flight climbing toward −y: square prisms, edge to edge of the cell."""
    out = [box(0, 0, 0, 128, 128, FOOT, STEP_DEEP, 0)]
    side = (128 - STRIP) // 2
    for b, top in enumerate(TOPS):
        y = 48 - b * DEPTH                                  # band 0 is the front one, at +y
        for x in (-(STRIP + side) / 2, (STRIP + side) / 2):
            out.append(box(x, y, FOOT, side, DEPTH, top - FOOT, STEP, 0))
        out.append(box(0, y, FOOT, STRIP, DEPTH, top - SINK - 2 - FOOT, STEP, 0))
        out.append(box(0, y, top - SINK - 2, STRIP, DEPTH, 2, TREAD, 0))
    return out


def put(name, x, y, z, variant=""):
    return moved(piece(name, variant), x, y, z)


def clutter():
    """What time left on the treads: kerb stones beside the strip, rubble and moss. The top band
    carries nothing: the upper tile's own ground starts there."""
    kerb = STRIP / 2 + 9
    out = put("stone_small", kerb, 48, TOPS[0], "sand") + put("stone_small", -kerb, 48, TOPS[0], "grey")
    out += put("stone_small", kerb, 16, TOPS[1], "grey") + put("moss_patch", kerb, 17, TOPS[1] + 14)
    out += put("stone_small", -kerb, -16, TOPS[2], "sand") + put("moss_patch", -kerb, -15, TOPS[2] + 14)
    out += put("rock_s", -kerb - 2, 14, TOPS[1]) + put("pebble_l", kerb + 4, -16, TOPS[2])
    out += put("pebble_m", 14, 50, TOPS[0] - SINK) + put("pebble_s", -18, 18, TOPS[1] - SINK)
    out += put("moss_patch", -22, 44, TOPS[0] - SINK) + put("moss_patch", 20, -12, TOPS[2] - SINK)
    return out + put("moss_patch", 50, -50, TOPS[3] - 3) + put("moss_patch", -24, -46, TOPS[3] - SINK - 1)


def flipped(boxes):
    """The same boxes facing the other way along y."""
    return [dict(b, c=(b["c"][0], -b["c"][1], b["c"][2])) for b in boxes]


# file → how the flight written toward −y is laid out to climb that way
LAYOUT = {
    "px": lambda boxes: boxes,                      # engine +x: model −y
    "py": turned,                                   # engine +y: model −x
    "nx": flipped,                                  # engine −x: model +y
    "ny": lambda boxes: turned(flipped(boxes)),     # engine −y: model +x
}


def render(model, sprite, style):
    binary = blender()
    tail = [model, sprite, "--style", style]
    command = [binary, "-b", "-P", RENDER, "--"] + tail if binary else [sys.executable, RENDER] + tail
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main():
    only = sys.argv[1:]
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(MODELS, exist_ok=True)
    volume = tile_volume((1, 1, 1))
    with tempfile.TemporaryDirectory() as tmp:
        for name, lay in LAYOUT.items():
            if only and name not in only:
                continue
            model, bare = os.path.join(MODELS, f"stairs_{name}.vox"), os.path.join(tmp, "bare.vox")
            write(model, lay(mass() + clutter()), bounds=volume)
            write(bare, lay(mass()), bounds=volume)
            render(model, os.path.join(tmp, "clay.png"), "clay")
            render(bare, os.path.join(tmp, "bare.png"), "voxel")
            out = Image.open(os.path.join(tmp, "bare.png")).convert("RGBA")
            out.alpha_composite(Image.open(os.path.join(tmp, "clay.png")).convert("RGBA"))
            out.resize(SIZE, Image.LANCZOS).save(os.path.join(OUT_DIR, f"block_{name}.png"))
            print("ok", f"block_{name}.png")


if __name__ == "__main__":
    main()
