#!/usr/bin/env python3
# vox_debris.py — renders the pieces the gatherable entities blow apart into, with Blender, as
# sprites with the same clay finish as the entities themselves.
#
#   python3 vox_parts_pack.py                       → entity-parts.json (names each piece's sprite)
#   python3 vox_debris.py [--jobs N] [--samples N]  → lib/assets/debris/p_<hash>.png (+ .json)
#   python3 vox_debris.py p_0123abcd…               only those (even if they exist)
#
# One sprite per distinct piece (kit piece, colour and turn), on the 1x1x1 template canvas (2x2x1,
# with the piece moved 64 voxels along x and y, for one that reaches past a tile) with
# the piece's own origin (the middle of its footprint, on its lowest point) at the foot of the
# anchor tile: the game puts the sprite on the ground where the piece stands, like any entity.
# Needs Blender (the `blender` on the PATH, or the `bpy` pip module in this Python).
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

from vox_models import render
from vox_parts_pack import collected_pieces, piece_shift, pieces
from vox_prefabs import SCALE, tile_volume, write

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "..", "..", "lib", "assets", "debris")
MODELS = os.path.join(HERE, "..", "models", "debris")
# The pieces the player picks up are rendered bare here; lib/scripts/ink-debris.py draws their ink
# line and writes the sprite into ASSETS.
BARE = os.path.join(HERE, "..", "debris")


def boxes_of(shape, shift):
    """The boxes of a packed piece as vox_lib wants them: skill units, centred on the origin
    moved by `shift` voxels along x and y."""
    return [dict(c=tuple((v + (shift[a] if a < 2 else 0)) * SCALE for a, v in enumerate(b["c"])), h=tuple(v * SCALE for v in b["h"]), r=b["r"] * SCALE,
                 color="#" + b["color"], zs=0, pocket=None) for b in shape]


def build(name, shape, samples, collect=False):
    stem = name.split("/")[-1]
    shift = piece_shift(shape)
    tiles = (2, 2, 1) if any(shift) else (1, 1, 1)
    model = os.path.join(MODELS, stem + ".vox")
    write(model, boxes_of(shape, shift), bounds=tile_volume(tiles))
    sprite = os.path.join(BARE if collect else ASSETS, stem + ".png")
    command = [sys.executable, os.path.join(HERE, "vox_render.py"), model, sprite, "--samples", str(samples)]
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL)
    with open(os.path.join(ASSETS, stem + ".json"), "w") as sidecar:
        sidecar.write('{"tiles": "%dx%dx%d"}\n' % tiles)
    print("  rendered", stem, flush=True)


def main():
    args = sys.argv[1:]
    jobs, samples = 4, 32
    for flag in ("--jobs", "--samples"):
        if flag in args:
            at = args.index(flag)
            value = int(args[at + 1])
            del args[at:at + 2]
            jobs, samples = (value, samples) if flag == "--jobs" else (jobs, value)
    os.makedirs(ASSETS, exist_ok=True)
    os.makedirs(BARE, exist_ok=True)
    os.makedirs(MODELS, exist_ok=True)
    every = pieces()
    collect = collected_pieces()

    def done(n):
        stem = n.split("/")[-1]
        return os.path.exists(os.path.join(BARE if n in collect else ASSETS, stem + ".png"))

    # Without names, only the sprites that are not there yet (delete one to render it again).
    chosen = {n: s for n, s in every.items()
              if (n.split("/")[-1] in args if args else not done(n))}
    with ThreadPoolExecutor(jobs) as pool:
        list(pool.map(lambda item: build(item[0], item[1], samples, item[0] in collect), chosen.items()))
    print(f"{len(chosen)} of {len(every)} pieces" + ("; now run lib/scripts/ink-debris.py for the collectable ones" if collect & set(chosen) else ""))


if __name__ == "__main__":
    main()
