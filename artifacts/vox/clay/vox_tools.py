#!/usr/bin/env python3
# vox_tools.py — the player's tools (items.json "tools"), assembled from rounded voxel boxes.
#
#   python3 vox_tools.py            → ../models/tool_<id>.vox for every tool
#
# One model per tool, in the TOOL frame the in-hand renderer (../player/player_rig.py) holds it
# in: the handle runs up the z axis from its butt at z = 0, the head sits on top and its working
# edge faces +x, y is across the head. The grip is GRIP voxels up the handle (where the fist
# closes). Sizes are in voxels, as in vox_prefabs.py (1 voxel = 4 canvas units; the monkey is 62
# voxels tall, so a tool is about half of it). Boxes are vox_prefabs.box dicts, so the same list
# is voxelised here for the kit and drawn as rounded clay by the renderer.
import math
import os
import sys

from vox_prefabs import (BONE, BONE_EDGE, COPPER, COPPER_BRIGHT, FLINT, HANDLE, LEAF_DARK, MOSS, NET, ROCK,
                         ROPE, STEEL, TIMBER, WOOD, box, tile_volume, write)

GRIP = 11 * 1.4          # voxels from the butt of the handle to the middle of the fist


def shaft(length, thick=4, color=HANDLE):
    """The handle: rounded, a little thicker at the butt."""
    return [box(0, 0, 0, thick + 1, thick + 1, 3, color, 1.6), box(0, 0, 3, thick, thick, length - 3, color, 1.6)]


def lashing(z, thick=4, color=ROPE):
    """Two turns of cord round the shaft at height z."""
    return [box(0, 0, z, thick + 2, thick + 2, 1.5, color, 0.6), box(0, 0, z + 2.5, thick + 2, thick + 2, 1.5, color, 0.6)]


def ring(radius, z, plane_y=True, n=10, thick=2, color=ROPE):
    """A hoop of `n` small boxes in the y–z plane (the hoop of a net faces +x), centred on x = 0."""
    out = []
    for k in range(n):
        a = 2 * math.pi * k / n
        out.append(box(0, radius * math.cos(a), z + radius * math.sin(a), thick, thick + 0.5, thick, color, 0.8))
    return out


def flint_axe():
    """flint_axe: a short axe, the handle split at the top and a chipped flint blade lashed in."""
    return (shaft(30) + [box(3.5, 0, 22, 7, 3, 10, WOOD, 1.2)]
            + [box(6, 0, 21, 8, 3.5, 12, FLINT, 1.4), box(11.5, 0, 22, 3, 2.5, 10, STEEL, 1.0)]
            + lashing(23, 4))


def bone_axe():
    """bone_axe: a longer axe, a wide curved blade of bone (a shoulder blade) tied on with cord."""
    return (shaft(34) + [box(4, 0, 24, 6, 3, 9, BONE, 1.4), box(8.5, 0, 22, 6, 3.5, 13, BONE, 2.0),
                         box(12.5, 0, 24, 3, 3, 9, BONE_EDGE, 1.2)]
            + lashing(25, 4) + lashing(31, 4))


def stone_pickaxe():
    """stone_pickaxe: a rough grey stone across the top of the shaft, a point at each end."""
    return (shaft(32) + [box(0, 0, 27, 6, 7, 6, ROCK, 1.6), box(0, -8, 28, 5, 9, 4, ROCK, 1.4),
                         box(0, 8, 28, 5, 9, 4, ROCK, 1.4), box(0, -13.5, 28.5, 4, 4, 3, FLINT, 1.0),
                         box(0, 13.5, 28.5, 4, 4, 3, FLINT, 1.0)]
            + lashing(24, 4))


def copper_pickaxe():
    """copper_pickaxe: a longer shaft and a forged copper head with a collar, bright at the tips."""
    return (shaft(36) + [box(0, 0, 30, 6.5, 7, 6, COPPER, 2.0), box(0, -9, 31, 5, 10, 4, COPPER, 1.6),
                         box(0, 9, 31, 5, 10, 4, COPPER, 1.6), box(0, -15, 31.5, 4, 4, 3, COPPER_BRIGHT, 1.0),
                         box(0, 15, 31.5, 4, 4, 3, COPPER_BRIGHT, 1.0), box(0, 0, 27, 6, 6, 3, COPPER_BRIGHT, 1.4)]
            + lashing(22, 4, TIMBER))


def fiber_net():
    """fiber_net: a long pole with a hoop of cord on top and a pale net bag hanging from it."""
    bag = [box(-3, 0, 31, 5, 8, 3, NET, 1.0), box(-6, 0, 28, 5, 7, 3, NET, 1.0),
           box(-7.5, 0, 25, 4, 5, 3, NET, 1.0)]
    return shaft(34, 3, HANDLE) + ring(8, 34, n=12) + bag + lashing(32, 3)


def vine_trap():
    """vine_trap: a pole with a woven cone of green vine, mouth to the front, a coil at the mouth."""
    cone = [box(1, 0, 30, 7, 10, 9, LEAF_DARK, 3.0), box(-3, 0, 31, 6, 8, 7, MOSS, 2.4),
            box(-7, 0, 32, 5, 6, 5, LEAF_DARK, 2.0)]
    return shaft(32, 3, HANDLE) + cone + ring(7, 33, n=10, color=MOSS) + lashing(28, 3, MOSS)


def copper_hook():
    """copper_hook: a slim rod with a line hanging from the tip and a big copper hook on the end."""
    hook = [box(0, 0, 33, 2, 2, 5, ROPE, 0.4), box(1, 0, 30, 2.5, 2.5, 3, COPPER, 1.0),
            box(2.5, 0, 28, 2.5, 2.5, 3, COPPER, 1.0), box(4, 0, 26, 2.5, 2.5, 3, COPPER_BRIGHT, 1.0),
            box(2.5, 0, 25, 2.5, 2.5, 2, COPPER, 0.9), box(1, 0, 25.5, 2.5, 2.5, 2.5, COPPER, 0.9)]
    return (shaft(36, 3, HANDLE) + [box(0, 0, 36, 3.5, 3.5, 3, COPPER, 1.2), box(0, 0, 13, 6, 6, 3, COPPER, 1.4)]
            + [box(0, 0, 36, 1.5, 1.5, 2, ROPE, 0.4)] + hook)


SIZE = 1.4         # every tool is drawn this much bigger than its measures: the monkey's fist is as
                   # wide as a handle is long, so a true-to-size tool reads as a toothpick


def grown(build):
    """`build` with every box grown by SIZE about the origin (the butt of the handle)."""
    def make():
        return [dict(b, c=tuple(v * SIZE for v in b["c"]), h=tuple(v * SIZE for v in b["h"]), r=b["r"] * SIZE)
                for b in build()]
    return make


TOOLS = {name: grown(build) for name, build in {
    "flint_axe": flint_axe,
    "bone_axe": bone_axe,
    "stone_pickaxe": stone_pickaxe,
    "copper_pickaxe": copper_pickaxe,
    "fiber_net": fiber_net,
    "vine_trap": vine_trap,
    "copper_hook": copper_hook,
}.items()}


def main(names):
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "models")
    os.makedirs(out, exist_ok=True)
    for name in names or TOOLS:
        write(os.path.join(out, "tool_%s.vox" % name), TOOLS[name](), bounds=tile_volume((1, 1, 1)))


if __name__ == "__main__":
    main(sys.argv[1:])
