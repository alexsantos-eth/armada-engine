#!/usr/bin/env python3
"""Paint the grove entities: base shape + style reference -> fal.ai -> matte -> template canvas.

Same pipeline as village_paint.py, with a prompt written for a clump of several trees instead
of one building: here the extra trees, the log and the bushes are the subject, not clutter to
be removed, so the "draw the one object alone" rule of village_paint.py would fight the asset.

Usage: grove_paint.py <svg_dir> <work_dir> <name>...   (name like tree_block_grove_2x1)
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
    "tree_block_grove_2x1": "a small grove of three trees standing apart on open ground: a tall "
                            "broadleaf tree with a wide light-green canopy, a shorter dark-green "
                            "conifer, and a young sapling half their height, with a fallen mossy "
                            "log, a cut stump with a pale sawn top, two low bushes, two grey "
                            "rocks with moss on them and a couple of small red toadstools on the "
                            "forest floor between them",
}
WHAT["tree_block_grove_1x2"] = WHAT["tree_block_grove_2x1"]
WHAT["tree_block_grove_2x2"] = WHAT["tree_block_grove_2x1"]

PROMPT = (
    "The FIRST image is the exact 3D shape and camera to keep. The SECOND image is a scene "
    "that shows the art style to copy: look at how its trees and bushes are drawn.\n"
    "Redraw the group of the first image as a finished game asset in exactly the style of the "
    "second image. It is {what}.\n"
    "STYLE: chunky low-poly voxel art, soft clay-like blocks, flat cel-shaded faces with gentle "
    "shading, no outlines and no photographic texture noise.\n"
    "DETAIL: push the surface detail as far as the style allows. Cut the canopies into separate "
    "leaf clumps with clear steps between them, give every trunk vertical bark planks and a few "
    "knots, show the rings and the split grain on the sawn stump, chipped facets and moss patches "
    "on the rocks, and bark peeling off the fallen log.\n"
    "LEAVES: each canopy is one plain leaf-green colour, the broadleaf ones lighter and the "
    "conifer darker. Keep the few small red berries. No dark squares, holes, spots or stains "
    "on the leaves.\n"
    "CRITICAL: keep the same silhouette, proportions, heights, footprint and 2:1 isometric "
    "camera angle as the first image. Keep exactly three trees, each trunk where the first "
    "image puts it, and keep the log, the bushes and the rock where they are. Do NOT mirror, "
    "flip or rotate it, do not add or remove trees, and do not add ground, grass, paths, "
    "people or animals around them. The asset casts NO shadow on the ground: the game bakes "
    "its own, so draw no drop shadow and no dark patch under anything.\n"
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
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for future in concurrent.futures.as_completed(
                [pool.submit(paint, svg_dir, work, n) for n in names]):
            try:
                print("RESULT", *future.result(), flush=True)
            except Exception as error:
                print("FAILED", error, flush=True)
    print(f"total spent this run: {_cost[0]:.2f} $")


if __name__ == "__main__":
    main()
