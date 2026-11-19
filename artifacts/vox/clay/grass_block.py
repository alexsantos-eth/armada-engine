#!/usr/bin/env python3
# grass_block.py — the plain grass blocks by the voxel route, with the clay finish, made to join
# their neighbours without a seam.
#
#   python3 grass_block.py [only …]       → lib/assets/grass/block.png, block_2.png, block_3.png,
#                                           block_4.png and ../models/grass_block*.vox
#
# A grass block is terrain, so like the stairs it **fills its whole cell**: soil and turf are
# square prisms from edge to edge of the 128-voxel tile. What makes it clay is what grows over
# that mass: round tufts in clumps on the lawn, the turf hanging over the soil in rounded drips
# of uneven length, and a few pebbles pressed into the soil.
#
# The blocks tile like a repeating pattern: whatever crosses an edge of the cell comes back in
# through the opposite edge, so the right side of one block runs on into the left side of the
# next, and the front into the back. That goes for the tufts on the lawn and for the drips that
# cross the vertical corners of the side faces. Those edge features come from one seed shared by
# every variant, so any two variants join too; what changes from one variant to the next is only
# the inside of the cell (the tufts and drips that stay clear of the edges), and the terrain
# alternates the variants to break the grid.
#
# For the clay finish not to round the lawn off where the voxels stop, every block is two clay
# renders, both shaped over a margin of the neighbouring cells (the same wrapped pattern) and
# cut back to the cell afterwards (vox_render.py --margin):
#
#   - the top: the margin goes round all four sides, so the lawn is one continuous field cut
#     clean at every edge. Its sides are bare cuts, so only the top of this render is used;
#   - the sides: the margin only goes behind (−x and −y), so the two faces the camera sees are
#     real faces with their drips, and their far ends are clean cuts.
#
# The top render is laid over the side render inside the top face (the diamond at the turf's
# height, and everything above it); outside it, the side render shows.
#
# The turf sits a few voxels under the top of the block and the tufts reach it, so nothing rises
# over z = 85 and the blocks keep the template of every terrain sprite (512 × 427). Under the
# clay render goes the hard-cube render of the bare cell, as with the stairs, so the silhouette
# is the full cell.
import os
import random
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw

import vox_lib
from grass_clay import blender
from vox_prefabs import GRASS_DEEP, GRASS_TOP, PALETTE, ROCK, SCALE, SOIL, box, tile_volume, write

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "..", "..", "lib", "assets", "grass")
MODELS = os.path.join(HERE, "..", "models")
RENDER = os.path.join(HERE, "vox_render.py")
SIZE = (512, 427)                 # a terrain sprite: the 1x1x1 template at half size

EDGE_SEED = 7                     # the features that cross an edge: shared by every variant
VARIANTS = {"block.png": 11, "block_2.png": 23, "block_3.png": 37, "block_4.png": 52}

CELL = 128
HALF = 64                         # half a cell
MARGIN = 16                       # voxels of the neighbours carried behind the cell
TOP = 85                          # one block: nothing goes over it
TURF = 79                         # the top of the turf; the tufts rise from it to TOP
SOIL_TOP = 64                     # where the soil ends and the turf begins
DRIP = 16                         # how far a drip reaches into the block: deep enough to round it


# ------------------------------------------------------------------ features

def tuft(x, y, size, rank):
    """One round tuft; the first of a clump (rank 0) is darker and the tallest."""
    color = GRASS_DEEP if rank == 0 else GRASS_TOP
    top = TOP - rank * 2
    return box(x, y, top - 14, size, size, 14, color, size * 0.45)


def clump(rnd, cx, cy):
    out = []
    for rank in range(rnd.choice((2, 3))):
        out.append(tuft(cx + rnd.uniform(-7, 7), cy + rnd.uniform(-7, 7), rnd.choice((11, 13, 16)), rank))
    return out


def drip(face, along, width, length):
    """A rounded tongue of turf down a side face, its outer face on the cell's plane. The +x face
    runs along y, the +y face along x."""
    inside = HALF - DRIP / 2
    x, y = (inside, along) if face == "+x" else (along, inside)
    sx, sy = (DRIP, width) if face == "+x" else (width, DRIP)
    return box(x, y, SOIL_TOP - length, sx, sy, length + 8, GRASS_TOP, width * 0.45)


def pebble(face, along, z):
    inside = HALF - 5
    x, y = (inside, along) if face == "+x" else (along, inside)
    return box(x, y, z, 10, 10, 12, ROCK, 4.5)


def edge_features():
    """What crosses the edges of the cell, the same for every variant: clumps of tufts straddling
    the two edge lines (x = ±64 and y = ±64 are the same line, wrapped) and a drip over each
    vertical corner of the two faces the camera sees."""
    rnd = random.Random(EDGE_SEED)
    out = []
    for along in (rnd.uniform(-50, -20), rnd.uniform(5, 45)):
        out += clump(rnd, HALF + rnd.uniform(-4, 4), along)        # across the x edge
    for along in (rnd.uniform(-45, -10), rnd.uniform(15, 50)):
        out += clump(rnd, along, HALF + rnd.uniform(-4, 4))        # across the y edge
    out += clump(rnd, HALF + rnd.uniform(-3, 3), HALF + rnd.uniform(-3, 3))  # on the corner
    for face in ("+x", "+y"):
        out.append(drip(face, HALF + rnd.uniform(-3, 3), rnd.uniform(14, 20), rnd.choice((10, 16, 22))))
    return out


def inside_features(seed):
    """What only this variant has: tufts and drips that stay clear of the edges."""
    rnd = random.Random(seed)
    out, spots, want = [], [], rnd.choice((5, 6, 7))
    while len(spots) < want:
        spot = (rnd.uniform(-HALF + 22, HALF - 22), rnd.uniform(-HALF + 22, HALF - 22))
        if all((spot[0] - a) ** 2 + (spot[1] - b) ** 2 > 26 ** 2 for a, b in spots):
            spots.append(spot)
    for cx, cy in spots:
        out += clump(rnd, cx, cy)
    for face in ("+x", "+y"):
        at = -HALF + 14
        while at < HALF - 26:
            width = rnd.uniform(12, 20)
            at += width / 2
            if at + width / 2 < HALF - 14:
                out.append(drip(face, at, width, rnd.choice((6, 9, 12, 16, 20, 24))))
            at += width / 2 + rnd.uniform(0, 8)
        for _ in range(3):
            out.append(pebble(face, rnd.uniform(-HALF + 14, HALF - 14), rnd.uniform(6, SOIL_TOP - 24)))
    return out


def mass(margin=0, around=False):
    """Soil and turf as square prisms, edge to edge of the cell and over its margin."""
    side = CELL + margin * (2 if around else 1)
    at = 0 if around else -margin / 2
    return [box(at, at, 0, side, side, SOIL_TOP, SOIL, 0),
            box(at, at, SOIL_TOP, side, side, TURF - SOIL_TOP, GRASS_TOP, 0)]


def top_mask():
    """The top face of the block on the sprite: the diamond at the turf's height and everything
    above it, at the sprite's size (512 × 427: a tile 512 × 256, a block 170.5 high)."""
    drop = (TOP - TURF) / TOP * 170.5
    w, h = SIZE
    mask = Image.new("L", SIZE, 0)
    ImageDraw.Draw(mask).polygon([(0, 0), (w, 0), (w, 128 + drop), (w / 2, 256 + drop), (0, 128 + drop)], fill=255)
    return mask


def wrapped(boxes):
    """The boxes and their copies one cell over in every direction, so a feature that leaves the
    cell through one edge comes back in through the opposite one."""
    step = CELL * SCALE
    return [dict(b, c=(b["c"][0] + dx * step, b["c"][1] + dy * step, b["c"][2]))
            for b in boxes for dx in (-1, 0, 1) for dy in (-1, 0, 1)]


def write_tile(path, boxes, around):
    """The model over the cell and its margin (behind it, or all round): everything voxelised,
    then cropped to that volume."""
    side = CELL + MARGIN * (2 if around else 1)
    lo, size = (-HALF - MARGIN, -HALF - MARGIN, 0), (side, side, TOP)
    cells = vox_lib.voxelise(boxes, SCALE, bake=False)
    cells = vox_lib.shell({p: c for p, c in cells.items() if all(lo[a] <= p[a] < lo[a] + size[a] for a in range(3))})
    vox_lib.write_vox(path, cells, palette=PALETTE, bounds=(lo, size))
    print(f"{os.path.basename(path):34} {size[0]:3} x {size[1]:3} x {size[2]:3}  {len(cells):6} voxels")


# ------------------------------------------------------------------ render

def render(vox, sprite, style, margin=0, around=False):
    binary = blender()
    tail = [vox, sprite, "--style", style, "--margin", str(margin)] + (["--around"] if around else [])
    command = [binary, "-b", "-P", RENDER, "--"] + tail if binary else [sys.executable, RENDER] + tail
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main():
    only = sys.argv[1:]
    os.makedirs(MODELS, exist_ok=True)
    edges = edge_features()
    with tempfile.TemporaryDirectory() as tmp:
        bare_vox, bare_png = os.path.join(tmp, "bare.vox"), os.path.join(tmp, "bare.png")
        write(bare_vox, mass(), bounds=tile_volume((1, 1, 1)))
        render(bare_vox, bare_png, "voxel")
        for name, seed in VARIANTS.items():
            if only and name not in only and name not in (n + ".png" for n in only):
                continue
            stem = "grass_" + os.path.splitext(name)[0]
            features = wrapped(edges) + inside_features(seed)
            layers = []
            for around in (False, True):
                model = os.path.join(MODELS, stem + ("_top" if around else "") + ".vox")
                write_tile(model, mass(MARGIN, around) + features, around)
                render(model, os.path.join(tmp, "clay.png"), "clay", MARGIN, around)
                layers.append(Image.open(os.path.join(tmp, "clay.png")).convert("RGBA").resize(SIZE, Image.LANCZOS))
            out = Image.open(bare_png).convert("RGBA").resize(SIZE, Image.LANCZOS)
            out.alpha_composite(layers[0])
            out.paste(layers[1], (0, 0), top_mask())
            out.save(os.path.join(ASSETS, name))
            print("ok", name)


if __name__ == "__main__":
    main()
