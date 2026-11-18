#!/usr/bin/env python3
# vox_shadow.py — the shadow volume of every entity model: which columns of its footprint are
# solid and between which heights, read off its .vox, for the engine to cast ground shadows
# from the real shape instead of from the sprite's cut-out.
#
#   python3 vox_shadow.py                 → lib/content/volumes/shadow-volumes.bin
#   python3 vox_shadow.py out.bin         → that file instead
#
# Reads the models already written to ../models/ (vox_models.py and vox_buildings.py write
# them); run it again whenever a model changes. Standard library only.
#
# A model is cut into square columns of COLUMN voxels a side. Each column keeps at most
# MAX_SPANS runs of solid height: the joints between pieces and the small gaps of a canopy
# are closed by merging the runs that sit closest together, so only real air (the space under
# a canopy beside its trunk, under an eave) stays open.
#
# Format (little-endian), version 1:
#   b"ASVL", u16 version, u16 voxels per column, u16 voxels per tile, u16 voxels per block,
#   u32 entries; then per entry:
#   u16 length + the sprite's source path (UTF-8, as the entity catalogue names it),
#   u8 tiles along the model's x, u8 tiles along its y, u32 columns; then per column:
#   u8 column x, u8 column y (in columns, from the model's corner, y in the generator's axes:
#   the .vox file stores it flipped), u8 runs, and per run
#   u8 lowest voxel, u8 highest voxel (both solid, inclusive).
# The engine places it (iso::assets::shadow_volumes): model x runs down-right on screen (world
# −y), model y down-left (world −x), and the anchor tile is the model's last along each axis.

import os
import struct
import sys

from vox_buildings import MODELS as BUILT
from vox_models import MODELS as NATURE

VERSION = 1
COLUMN = 4
TILE = 128
BLOCK = 85
MAX_SPANS = 2


def read_vox(path):
    """(size, voxels) of a MagicaVoxel file's first model: voxels as (x, y, z) in file order."""
    with open(path, "rb") as f:
        data = f.read()
    assert data[:4] == b"VOX ", f"{path} is not a .vox"
    size, voxels = None, []
    at = 8
    while at < len(data):
        tag = data[at:at + 4]
        content, children = struct.unpack("<ii", data[at + 4:at + 12])
        body = data[at + 12:at + 12 + content]
        if tag == b"MAIN":
            at += 12 + content
            continue
        if tag == b"SIZE" and size is None:
            size = struct.unpack("<3i", body[:12])
        elif tag == b"XYZI" and not voxels:
            count = struct.unpack("<i", body[:4])[0]
            voxels = [tuple(body[4 + 4 * n:7 + 4 * n]) for n in range(count)]
        at += 12 + content + children
    return size, voxels


def runs(heights):
    """The solid runs of a sorted set of heights, as [low, high] inclusive."""
    out = []
    for z in heights:
        if out and z == out[-1][1] + 1:
            out[-1][1] = z
        else:
            out.append([z, z])
    return out


def merged(spans):
    """Closes the narrowest gaps until at most MAX_SPANS runs are left."""
    spans = [list(s) for s in spans]
    while len(spans) > MAX_SPANS:
        gap = min(range(len(spans) - 1), key=lambda n: spans[n + 1][0] - spans[n][1])
        spans[gap][1] = spans[gap + 1][1]
        del spans[gap + 1]
    return spans


def volume(path):
    """(tiles along x, tiles along y, columns) of one model."""
    size, voxels = read_vox(path)
    assert size[0] % TILE == 0 and size[1] % TILE == 0, f"{path}: {size} is not whole tiles"
    columns = {}
    for x, y, z in voxels:
        columns.setdefault((x // COLUMN, y // COLUMN), set()).add(z)
    # write_vox stores world +y as .vox −y; flip it back so the columns are in the generator's
    # own axes, the ones the sprite was rendered in.
    last_y = size[1] // COLUMN - 1
    out = []
    for (cx, cy), heights in sorted(columns.items()):
        out.append((cx, last_y - cy, merged(runs(sorted(heights)))))
    return size[0] // TILE, size[1] // TILE, out


def main(args):
    here = os.path.dirname(os.path.abspath(__file__))
    target = args[0] if args else os.path.join(
        here, "..", "..", "..", "lib", "content", "volumes", "shadow-volumes.bin")
    models = {**NATURE, **BUILT}
    entries = []
    for name, (_, _, asset) in sorted(models.items()):
        path = os.path.join(here, "..", "models", name + ".vox")
        if not os.path.exists(path):
            print("  no model for", name, "(run vox_models.py / vox_buildings.py first)")
            continue
        entries.append(("/assets/" + asset, volume(path)))
    blob = bytearray(b"ASVL")
    blob += struct.pack("<4HI", VERSION, COLUMN, TILE, BLOCK, len(entries))
    for source, (tiles_x, tiles_y, columns) in entries:
        name = source.encode()
        blob += struct.pack("<H", len(name)) + name
        blob += struct.pack("<BBI", tiles_x, tiles_y, len(columns))
        for cx, cy, spans in columns:
            blob += struct.pack("<3B", cx, cy, len(spans))
            for low, high in spans:
                blob += struct.pack("<2B", low, high)
    os.makedirs(os.path.dirname(os.path.abspath(target)), exist_ok=True)
    with open(target, "wb") as f:
        f.write(blob)
    print(f"{len(entries)} shadow volumes, {len(blob) // 1024} KB → {os.path.relpath(target)}")


if __name__ == "__main__":
    main(sys.argv[1:])
