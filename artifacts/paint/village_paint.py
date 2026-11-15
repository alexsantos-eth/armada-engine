#!/usr/bin/env python3
"""Paint the viking village: base shape + style reference -> fal.ai -> matte -> template canvas.

Unlike repaint.py this one is allowed to invent surface detail: the base shape fixes massing,
footprint and camera, and the reference image fixes the look.

Usage: village_paint.py <svg_dir> <work_dir> <name>...   (name like building_block_smithy)
"""
import concurrent.futures
import os
import re
import sys

import cairosvg
from PIL import Image

from falrun import run, data_uri
from repaint import (MODEL, MATTE, letterbox, decontaminate, fit, ink_box, silhouette_score,
                     drawing_tiles, template_canvas, spend, _cost)

REF = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ref_village.png")
VARIANTS = 3

WHAT = {
    "house_block_hut_moss": "a small Viking hut: dark tarred vertical plank walls, a steep gable roof of thick green moss and turf over a golden straw eave, crossed carved gable beams, a plank door, one round painted shield by the door and a barrel at the corner, on a low stone foundation",
    "house_block_hut_thatch": "a low Viking farm hut: pale wattle-and-daub walls between timber posts, a very big golden straw thatch roof stepping up to a wooden smoke cap, a small plank door and a stack of firewood beside it, on a low stone foundation",
    "house_block_cottage_tile": "a Viking-age timber-framed cottage: cream daub walls with dark timber framing, a steep roof of orange-red clay tiles, a grey stone chimney, a plank door and one warm lit window, on a low stone foundation",
    "building_block_smithy": "a Viking blacksmith's forge: an open shelter of four timber posts under a sloping wooden shingle roof, a grey stone hearth with glowing orange embers and a tall stone chimney at the back, an iron anvil on a tree stump, a water trough, a barrel and a rack of iron tools, on a dark stone floor",
    "building_block_market_stall": "a Viking trader's market stall: a wooden counter loaded with goods (bread, red apples, green cabbages), four poles holding a sloping awning of red and cream striped sailcloth, a barrel and stacked wooden crates behind it, on packed earth",
    "building_block_healer_hut": "a Viking seer's round hut: a low round wall of grey field stones under a tall cone-shaped roof of green turf and moss with a wooden smoke-hole post on top, a small plank door, an iron cauldron of green brew outside and a pole with drying herbs",
    "building_block_stave_temple": "a Norse stave temple (stave church): three stacked tiers of steep dark wooden shingle roofs, each tier smaller than the one below, dark tarred plank walls, carved dragon heads on the middle roof ridge, a thin spire on top, an arched plank door with a stone step",
    "building_block_watchtower": "a Viking watchtower: a square tower of big grey stone blocks with narrow arrow slits, an overhanging timber gallery with a plank railing on top, a small wooden cabin above it under a steep mossy gable roof with crossed gable beams, a red banner on a pole and a plank door at the foot",
    "building_block_stone_shrine": "a Norse stepped shrine: four square tiers of weathered red-brown carved stone blocks with rune panels on each tier, a stone altar on top with a small offering fire",
    "building_block_runestone": "three Viking runestones on a small patch of pebbles: one tall grey standing stone carved with blue painted runes, a medium one with red runes and a small plain one, with a little moss at their feet",
    "building_block_mead_hall_2x1": "a great Viking mead hall: a long building with low dark tarred plank walls, a huge steep roof of brown wooden shingles over a golden straw eave, carved dragon heads on both gable ends, crossed beams along the ridge, a small gabled porch with a plank door, and round red and cream painted shields hung along the long wall, on a stone foundation",
    "building_block_boathouse_2x1": "a Viking boathouse: a long shed of dark tarred planks under a mossy turf gable roof over a straw eave, open at one gable end where the carved prow of a wooden longship with round shields sticks out, oars leaning against the wall and a barrel, on packed earth",
}
WHAT["building_block_mead_hall_1x2"] = WHAT["building_block_mead_hall_2x1"]
WHAT["building_block_boathouse_1x2"] = WHAT["building_block_boathouse_2x1"]

PROMPT = (
    "The FIRST image is the exact 3D shape and camera to keep. The SECOND image is a scene "
    "that shows the art style to copy: look at how its Viking buildings are drawn.\n"
    "Redraw the single object of the first image as a finished game asset in exactly the "
    "style of the buildings in the second image. It is {what}.\n"
    "STYLE: chunky low-poly voxel art, soft clay-like blocks, flat cel-shaded faces with "
    "gentle shading, rich but clean detail (planks, moss clumps, stones), no outlines and no "
    "photographic texture noise.\n"
    "CRITICAL: keep the same silhouette, proportions, height, footprint and 2:1 isometric "
    "camera angle as the first image, with each part where the first image puts it. Do NOT "
    "mirror, flip or rotate it. Do not add ground, grass, paths, trees, people or animals "
    "around it: draw the one object alone.\n"
    "LIGHTING: the sun is on the UPPER RIGHT. Faces looking to the RIGHT are the brightest, "
    "faces looking to the LEFT are in shade, and tops are brightest of all.\n"
    "The background must be pure flat white, with no ground, no drop shadow and no gradient. "
    "Output a square 1:1 image."
)


def paint(svg_dir, work, name):
    svg_path = os.path.join(svg_dir, name + ".svg")
    head = open(svg_path, encoding="utf-8").read(2000)
    head = head[: head.find(">") + 1]
    found = re.search(r'\bdata-tiles="([^"]*)"', head)
    tiles = drawing_tiles(head, found.group(1) if found else None)
    canvas = template_canvas(tiles)
    stem = os.path.join(work, name)
    cairosvg.svg2png(url=svg_path, write_to=f"{stem}_base.png", output_width=canvas[0])
    base = Image.open(f"{stem}_base.png").convert("RGBA")
    letterbox(base).save(f"{stem}_in.png")
    files = run(MODEL, {"prompt": PROMPT.format(what=WHAT[name]),
                        "image_urls": [data_uri(f"{stem}_in.png"), data_uri(REF)],
                        "num_images": VARIANTS, "output_format": "png", "aspect_ratio": "1:1"},
                f"{stem}_v")
    if not files:
        return name, tiles, []
    spend(MODEL, len(files))
    scores = []
    for i, raw in enumerate(files):
        matted = run(MATTE, {"image_url": data_uri(raw), "output_format": "png",
                             "operating_resolution": "1024x1024", "refine_foreground": True},
                     f"{stem}_m{i}")
        if not matted:
            continue
        spend(MATTE)
        cut = Image.open(decontaminate(raw, matted[0], f"{stem}_cut{i}.png")).convert("RGBA")
        if ink_box(cut) is None:
            continue
        placed = fit(cut, base, canvas)
        placed.save(f"{stem}_placed{i}.png")
        scores.append((i, round(silhouette_score(placed, base), 3)))
    return name, tiles, scores


def main():
    svg_dir, work, names = sys.argv[1], sys.argv[2], sys.argv[3:]
    os.makedirs(work, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        for future in concurrent.futures.as_completed(
                [pool.submit(paint, svg_dir, work, n) for n in names]):
            try:
                print("RESULT", *future.result(), flush=True)
            except Exception as error:
                print("FAILED", error, flush=True)
    print(f"total spent this run: {_cost[0]:.2f} $")


if __name__ == "__main__":
    main()
