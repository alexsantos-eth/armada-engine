#!/usr/bin/env python3
"""Repaint the trees with plain single-colour leaves: no spots, no pockets, no moss.
Usage: tree_paint.py <assets-src/assets> <work> <name>...   (name like tree/block_3)"""
import concurrent.futures, os, re, sys
import cairosvg
from PIL import Image
from falrun import run, data_uri
from repaint import (MODEL, MATTE, WHAT, letterbox, decontaminate, fit, ink_box, silhouette_score,
                     drawing_tiles, template_canvas, spend, _cost)

REF = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ref_village.png")
PROMPT = (
    "The FIRST image is the exact tree to keep. The SECOND image is a scene whose trees show "
    "the art style to copy.\n"
    "Redraw the tree of the first image as a finished game asset: {what}, in chunky low-poly "
    "voxel art with flat cel-shaded faces, like the trees of the second image.\n"
    "LEAVES: the whole canopy is ONE single plain leaf-green colour. Every leaf block is a "
    "smooth solid cube. Remove every mark the first image has on its leaves: no dark squares, "
    "no holes, no pockets, no dots, no spots, no stains, no moss patches, no darker or lighter "
    "blotches and no second green. The only change of tone on the leaves is the light: tops "
    "brightest, right faces bright, left faces in shade.{fruit}\n"
    "TRUNK: brown wood with simple bark planks. Nothing at its foot: no fallen leaves, no "
    "grass, no roots spreading out.\n"
    "CRITICAL: keep the silhouette, proportions, height and 2:1 isometric camera of the first "
    "image, with the canopy blocks where they are. Do NOT mirror, flip or rotate it.\n"
    "LIGHTING: the sun is on the UPPER RIGHT.\n"
    "The background must be pure flat white, with no ground, no drop shadow and no gradient. "
    "Output a square 1:1 image."
)
FRUIT = {"tree/block": " Keep the few small red fruits.", "tree/block_6": " Keep the few small red fruits."}


def paint(assets, work, name):
    svg_path = os.path.join(assets, name + ".svg")
    head = open(svg_path, encoding="utf-8").read(3000)
    head = head[: head.find(">") + 1]
    found = re.search(r'\bdata-tiles="([^"]*)"', head)
    canvas = template_canvas(drawing_tiles(head, found.group(1) if found else None))
    stem = os.path.join(work, name.replace("/", "_"))
    cairosvg.svg2png(url=svg_path, write_to=f"{stem}_base.png", output_width=canvas[0])
    base = Image.open(f"{stem}_base.png").convert("RGBA")
    letterbox(base).save(f"{stem}_in.png")
    files = run(MODEL, {"prompt": PROMPT.format(what=WHAT[name], fruit=FRUIT.get(name, " No fruit and no flowers.")),
                        "image_urls": [data_uri(f"{stem}_in.png"), data_uri(REF)],
                        "num_images": 3, "output_format": "png", "aspect_ratio": "1:1"}, f"{stem}_v")
    if not files:
        return name, []
    spend(MODEL, len(files))
    scores = []
    for i, raw in enumerate(files):
        matted = run(MATTE, {"image_url": data_uri(raw), "output_format": "png",
                             "operating_resolution": "1024x1024", "refine_foreground": True}, f"{stem}_m{i}")
        if not matted:
            continue
        spend(MATTE)
        cut = Image.open(decontaminate(raw, matted[0], f"{stem}_cut{i}.png")).convert("RGBA")
        if ink_box(cut) is None:
            continue
        placed = fit(cut, base, canvas)
        placed.save(f"{stem}_placed{i}.png")
        scores.append((i, round(silhouette_score(placed, base), 3)))
    return name, scores


if __name__ == "__main__":
    assets, work, names = sys.argv[1], sys.argv[2], sys.argv[3:]
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        for f in concurrent.futures.as_completed([pool.submit(paint, assets, work, n) for n in names]):
            print("RESULT", *f.result(), flush=True)
    print(f"total spent this run: {_cost[0]:.2f} $")
