#!/usr/bin/env python3
# vox_parts_pack.py — packs the `<name>.parts.json` files of the entities the player can gather
# into the one file the game reads, lib/content/json/entity-parts.json.
#
#   python3 vox_models.py --parts && python3 vox_buildings.py --parts    → ../models/*.parts.json
#   python3 vox_parts_pack.py                                            → entity-parts.json
#
# Each model's `.parts.json` says which pieces of the voxel kit it is assembled from and where
# each one stands (see vox_prefabs.parts_of). When the player gathers an entity the game blows
# it apart into those pieces, so only the entities with a harvest rule in items.json are packed:
# the rest are never taken out of the world. They are found by their sprite, the same key the
# game uses to look them up.
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.path.join(HERE, "..", "..", "..", "lib")
MODELS = os.path.join(HERE, "..", "models")
CONTENT = os.path.join(LIB, "content", "json")


def sprite_key(sprite):
    """`/assets/tree/block_2.png` → `tree/block_2`: the sprite's path without its extension."""
    return os.path.splitext(sprite.removeprefix("/assets/"))[0]


def main():
    with open(os.path.join(CONTENT, "items.json")) as source:
        gathered = {b for rule in json.load(source)["harvest"] for b in rule["blueprints"]}
    with open(os.path.join(CONTENT, "entities.json")) as source:
        entities = json.load(source)["entities"]
    wanted = {sprite_key(e["asset"]["sprite"]): e["id"] for e in entities if e["id"] in gathered}
    models = {}
    for path in sorted(glob.glob(os.path.join(MODELS, "*.parts.json"))):
        with open(path) as source:
            model = json.load(source)
        models[model["asset"]] = model
    missing = sorted(set(wanted) - set(models))
    if missing:
        sys.exit("no .parts.json for " + ", ".join(f"{wanted[key]} ({key})" for key in missing))
    packed = {key: dict(tiles=models[key]["tiles"], parts=models[key]["parts"]) for key in sorted(wanted)}
    document = dict(schemaVersion=1, voxelsPerTile=128, voxelsPerBlock=85, entities=packed)
    out = os.path.join(CONTENT, "entity-parts.json")
    with open(out, "w") as target:
        json.dump(document, target, separators=(",", ":"))
        target.write("\n")
    print(f"{len(packed)} entities, {os.path.getsize(out) // 1024} KiB → {os.path.relpath(out)}")


if __name__ == "__main__":
    main()
