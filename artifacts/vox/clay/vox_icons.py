#!/usr/bin/env python3
# vox_icons.py — renders the bare icons of the items and the tools with Blender, in the clay
# finish of the entities themselves.
#
#   python3 vox_icons.py                 → ../models/icon_<id>.vox for every item and tool
#   python3 vox_icons.py --render        → …and each one rendered onto artifacts/vox/icons/<id>.png
#   python3 vox_icons.py --render wood   only those
#
# An item's icon is the voxel piece the game drops for it (the first `collect` piece of its
# `pieces` in items.json, unless FACE names another, in the colour nearest to the item's own), enlarged to fill the tile.
# A tool's icon is its leaned model (vox_tools.py). Both leave Blender WITHOUT an outline: the ink
# line is drawn over the crops by lib/scripts/build-ui-icons.py, the same way for every icon, so
# changing the line never means rendering anything again.
import json
import os
import sys

from vox_models import render
from vox_parts_pack import CONTENT, pieces, piece_sprite
from vox_prefabs import SCALE, tile_volume, write
from vox_tools import icons as tool_icons

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "icons")
MODELS = os.path.join(HERE, "..", "models")
REACH = 40      # voxels an enlarged piece may reach from its middle along x or y
HEIGHT = 56     # voxels it may rise
# The piece that stands for an item when the first of its `pieces` is not the best face for it
# (a horned skull is not "a bone").
FACE = {"stone": "stone_block", "bone": "bone"}


def mean_color(boxes):
    """The volume-weighted mean colour of a piece's boxes, as an (r, g, b) tuple."""
    total = [0.0, 0.0, 0.0]
    weight = 0.0
    for b in boxes:
        volume = b["h"][0] * b["h"][1] * b["h"][2]
        weight += volume
        for i in range(3):
            total[i] += int(b["color"][2 * i:2 * i + 2], 16) * volume
    return tuple(v / weight for v in total)


def item_boxes(item, shapes):
    """The enlarged boxes of the piece that stands for `item`, centred on the origin."""
    want = tuple(int(item["color"][2 * i:2 * i + 2], 16) for i in range(3))
    best = None
    for name in [FACE[item["id"]]] if item["id"] in FACE else item["pieces"]:
        for boxes in shapes.get(name, []):
            mean = mean_color(boxes)
            distance = sum((a - b) ** 2 for a, b in zip(mean, want))
            if best is None or distance < best[0]:
                best = (distance, boxes)
        if best is not None:
            break       # the first piece that exists is the item's face
    if best is None:
        raise SystemExit(f"{item['id']}: none of its pieces is a collectable piece of an entity")
    boxes = best[1]
    reach = max(max(abs(b["c"][a]) + b["h"][a] for b in boxes) for a in (0, 1))
    height = max(b["c"][2] + b["h"][2] for b in boxes)
    f = min(REACH / reach, HEIGHT / height)
    return [dict(c=(b["c"][0] * f * SCALE, b["c"][1] * f * SCALE, b["c"][2] * f * SCALE),
                 h=tuple(v * f * SCALE for v in b["h"]), r=b["r"] * f * SCALE,
                 color="#" + b["color"], zs=0, pocket=None) for b in boxes]


def collectable_shapes():
    """{piece name: [boxes of each colour variant]} of the pieces entities drop."""
    with open(os.path.join(CONTENT, "entity-parts.json")) as source:
        parts = json.load(source)["entities"]
    collect = {p["sprite"] for e in parts.values() for p in e["parts"] if p.get("collect")}
    named = {}
    every = pieces()
    for e in parts.values():
        for p in e["parts"]:
            if p.get("collect") and p["sprite"] in every:
                named.setdefault(p["piece"], {})[p["sprite"]] = every[p["sprite"]]
    assert collect
    return {name: list(by_sprite.values()) for name, by_sprite in named.items()}


def models():
    with open(os.path.join(CONTENT, "items.json")) as source:
        items = json.load(source)["items"]
    shapes = collectable_shapes()
    out = {item["id"]: (lambda item=item: item_boxes(item, shapes)) for item in items}
    for key, (build, _tiles, _asset) in tool_icons().items():
        out[key[len("tool_"):]] = build
    return out


def main(args):
    rendering = "--render" in args
    built = models()
    names = [a for a in args if not a.startswith("--")] or list(built)
    os.makedirs(MODELS, exist_ok=True)
    os.makedirs(ASSETS, exist_ok=True)
    for name in names:
        path = os.path.join(MODELS, f"icon_{name}.vox")
        write(path, built[name](), bounds=tile_volume((1, 1, 1)))
        if rendering:
            render(path, os.path.join(ASSETS, f"{name}.png"))


if __name__ == "__main__":
    main(sys.argv[1:])
