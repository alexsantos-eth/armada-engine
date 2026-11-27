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
#
# Each piece is packed as where it stands and the sprite it is drawn with: `debris/p_<hash>`, the
# hash of its boxes, so two pieces of the same shape and colour share one sprite. vox_debris.py
# renders those sprites with Blender.
import glob
import hashlib
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


def piece_sprite(part):
    """`debris/p_<hash>`: the sprite of a piece, named by what it looks like."""
    shape = json.dumps([[b["c"], b["h"], b["r"], b["color"]] for b in part["boxes"]], separators=(",", ":"))
    return "debris/p_" + hashlib.sha1(shape.encode()).hexdigest()[:10]


TILE_REACH = 64          # voxels a piece may reach from its origin and still fit the 1x1x1 canvas
BIG_SHIFT = 64           # voxels a wider piece is moved along x and y to fit a 2x2 one


def reach(boxes):
    """The farthest a piece's boxes lie from its origin along x or y, in voxels."""
    return max(max(abs(b["c"][a]) + b["h"][a] for b in boxes) for a in (0, 1))


def piece_shift(boxes):
    """How far a piece is moved off the foot of its canvas when rendered, in voxels along x and y:
    none if it fits the 1x1x1 canvas, `BIG_SHIFT` if it needs the 2x2 one."""
    return [0, 0] if reach(boxes) <= TILE_REACH else [BIG_SHIFT, BIG_SHIFT]


def packed_parts(model):
    """The `.parts.json` of a model, as the game reads it: each piece's name, where it stands,
    its sprite, whether it is collectable as an item (`collect`, only written when true) and, for a
    wide piece, how far its sprite was shifted (`shift`)."""
    out = []
    for p in model["parts"]:
        part = dict(piece=p["piece"], at=p["at"], sprite=piece_sprite(p))
        if p.get("collect"):
            part["collect"] = True
        if any(piece_shift(p["boxes"])):
            part["shift"] = piece_shift(p["boxes"])
        out.append(part)
    return out


def gathered_models():
    """{sprite key: model} of the entities with a harvest rule, from their `.parts.json`."""
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
    return {key: models[key] for key in sorted(wanted)}


def pieces():
    """{sprite: boxes} of every distinct piece the gatherable entities are made of."""
    out = {}
    for model in gathered_models().values():
        for part in model["parts"]:
            out.setdefault(piece_sprite(part), part["boxes"])
    return out


def collected_pieces():
    """The sprites of the pieces some entity leaves floating as an item to pick up."""
    return {piece_sprite(p) for m in gathered_models().values() for p in m["parts"] if p.get("collect")}


def main():
    packed = {key: dict(tiles=model["tiles"], parts=packed_parts(model)) for key, model in gathered_models().items()}
    document = dict(schemaVersion=1, voxelsPerTile=128, voxelsPerBlock=85, entities=packed)
    out = os.path.join(CONTENT, "entity-parts.json")
    with open(out, "w") as target:
        json.dump(document, target, separators=(",", ":"))
        target.write("\n")
    print(f"{len(packed)} entities, {len(pieces())} pieces, {os.path.getsize(out) // 1024} KiB → {os.path.relpath(out)}")


if __name__ == "__main__":
    main()
