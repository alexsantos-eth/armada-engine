#!/usr/bin/env python3
# vox_items.py — the items the world drops when something is gathered (wood, stone, fiber…),
# assembled from the voxel pieces of vox_prefabs.py like every entity.
#
#   python3 vox_items.py                 → ../models/item_<id>.vox for every item
#   python3 vox_items.py --render        → …and each one rendered onto lib/assets/items/<id>.png
#   python3 vox_items.py --render wood   only those
#
# An item lies loose on the ground in the middle of a 1x1x1 tile: a small heap, much lower and
# narrower than an entity (about a third of the tile across), so it reads as something to pick
# up and not as something that grows there. The game draws it bobbing over its own shadow, so
# the model has no ground and no shadow of its own, like every entity. One item, one heap: the
# kind of thing it is, in the colour the chips of its harvest fly in (`color` in items.json).
import sys

from vox_models import put, run


def wood():
    """wood: three cut logs, two side by side and one across them."""
    return (put("firewood", 0, -7, 0) + put("firewood", 0, 7, 0)
            + put("firewood", 0, 0, 11, turn=True))


def stone():
    """stone: a broken block of grey stone with a darker stone and a pebble at its foot."""
    return (put("stone_small", -4, -4, 0, "grey") + put("rock_s", 10, 6, 0)
            + put("pebble_m", -10, 12, 0))


def fiber():
    """fiber: a tuft of pale cut grass, the stuff ropes and nets are twisted from."""
    return put("grass_tuft", 0, 0, 0, "dry")


def mushroom():
    """mushroom: a red toadstool with two small mushrooms against it."""
    return (put("toadstool", -4, -4, 0, "red") + put("mushroom", 18, 6, 0)
            + put("mushroom", -6, 20, 0))


def coconut():
    """coconut: two coconuts, one leaning on the other."""
    return put("coconut", -5, -3, 0) + put("coconut", 6, 5, 0)


def bone():
    """bone: two long bones crossed."""
    return put("bone", 0, 0, 0) + put("bone", 0, 0, 5, turn=True)


def copper_ore():
    """copper_ore: three copper nuggets in their rock, heaped."""
    return (put("ore", -6, -4, 0, "copper") + put("ore", 6, -2, 0, "copper")
            + put("ore", 0, 7, 0, "copper") + put("ore", 0, 0, 5, "copper"))


def amber():
    """amber: three nuggets of amber in their rock, heaped."""
    return (put("ore", -6, -4, 0, "amber") + put("ore", 6, -2, 0, "amber")
            + put("ore", 0, 7, 0, "amber") + put("ore", 0, 0, 5, "amber"))


MODELS = {
    "item_wood": (wood, (1, 1, 1), "items/wood.png"),
    "item_stone": (stone, (1, 1, 1), "items/stone.png"),
    "item_fiber": (fiber, (1, 1, 1), "items/fiber.png"),
    "item_mushroom": (mushroom, (1, 1, 1), "items/mushroom.png"),
    "item_coconut": (coconut, (1, 1, 1), "items/coconut.png"),
    "item_bone": (bone, (1, 1, 1), "items/bone.png"),
    "item_copper_ore": (copper_ore, (1, 1, 1), "items/copper_ore.png"),
    "item_amber": (amber, (1, 1, 1), "items/amber.png"),
}


if __name__ == "__main__":
    run(MODELS, sys.argv[1:])
