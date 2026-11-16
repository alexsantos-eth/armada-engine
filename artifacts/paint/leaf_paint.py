#!/usr/bin/env python3
"""Repaint the leafy assets with block_7's lighting: flat faces and a bright bevel.

Same pipeline as tree_paint.py, but the style reference is the game's own cypress and bush
instead of the village scene, and the prompt spells out the four tones that make that look:
bright top, mid right face, shaded left face and a thin highlight along the rounded top edges.
A grove has no drawing beside it, so its current PNG is the shape and the base to fit against.

Usage: leaf_paint.py <assets-src/assets> <work> <name>...   (name like tree/block_3)
"""
import concurrent.futures, os, re, sys
import cairosvg
from PIL import Image
from falrun import run, data_uri
from repaint import (MODEL, MATTE, WHAT, letterbox, decontaminate, fit, ink_box,
                     silhouette_score, drawing_tiles, template_canvas, spend, _cost)

REF = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ref_block7.png")
VARIANTS = 3

WHAT = dict(WHAT)
WHAT["tree/block_grove_1x2"] = WHAT["tree/block_grove_2x1"] = (
    "a small grove of three trees standing apart on open ground, with a fallen mossy log, a "
    "cut stump, low bushes, grey rocks and a few small red toadstools between them")

PROMPT = (
    "The FIRST image is the exact asset to keep. The SECOND image shows two finished assets "
    "from the same game, a cypress tree and a bush: they are the lighting and finish to copy.\n"
    "Redraw the first image as a finished game asset: {what}, in chunky low-poly voxel art.\n"
    "LIGHTING, the whole point of this redraw: the sun is on the UPPER RIGHT, and every leaf "
    "block is a smooth rounded cube with FLAT cel-shaded faces in four clear steps, exactly "
    "like the second image. Its top face is the brightest. Its right face is clearly darker "
    "than the top. Its left face is darker still, in plain shade. And a thin bright highlight "
    "runs along the rounded top edges where they catch the light. The gaps between blocks are "
    "dark, narrow and crisp, so each block reads apart from the next. Draw NO outlines: no black "
    "line, no ink line and no dark border around a block or around the asset. A block is told "
    "apart from the next one only by its own shading, exactly as in the second image.\n"
    "LEAVES: one single plain leaf-green colour for the whole canopy, the same green on every "
    "tree. The only change of tone is the light described above: no second green, no dark or "
    "pale blotches, no spots, no holes, no moss, no texture, no grain and no gradient inside a "
    "face.{fruit}\n"
    "TRUNK: brown wood with simple bark planks, lit the same way. Nothing at its foot.\n"
    "CRITICAL: keep the silhouette, proportions, height and 2:1 isometric camera of the first "
    "image, with every block where it is. Do NOT mirror, flip or rotate it, and do not add or "
    "remove blocks.\n"
    "The background must be pure flat white, with no ground, no drop shadow and no gradient. "
    "Output a square 1:1 image."
)
FRUIT = {"tree/block": " Keep the few small red fruits.",
         "tree/block_6": " Keep the few small red fruits.",
         "tree/block_grove_1x2": " Keep the few small red berries and the red toadstools.",
         "tree/block_grove_2x1": " Keep the few small red berries and the red toadstools."}


def base_image(assets, name, stem):
    """The shape to keep, on its template canvas: the drawing when there is one, else the PNG."""
    svg_path = os.path.join(assets, name + ".svg")
    if os.path.exists(svg_path):
        head = open(svg_path, encoding="utf-8").read(3000)
        head = head[: head.find(">") + 1]
        found = re.search(r'\bdata-tiles="([^"]*)"', head)
        canvas = template_canvas(drawing_tiles(head, found.group(1) if found else None))
        cairosvg.svg2png(url=svg_path, write_to=f"{stem}_base.png", output_width=canvas[0])
        return Image.open(f"{stem}_base.png").convert("RGBA"), canvas
    png = Image.open(os.path.join(assets, name + ".png")).convert("RGBA")
    return png, png.size


def paint(assets, work, name):
    stem = os.path.join(work, name.replace("/", "_"))
    base, canvas = base_image(assets, name, stem)
    letterbox(base).save(f"{stem}_in.png")
    files = run(MODEL, {"prompt": PROMPT.format(what=WHAT[name],
                                                fruit=FRUIT.get(name, " No fruit and no flowers.")),
                        "image_urls": [data_uri(f"{stem}_in.png"), data_uri(REF)],
                        "num_images": VARIANTS, "output_format": "png", "aspect_ratio": "1:1"},
                f"{stem}_v")
    if not files:
        return name, []
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
        fit(cut, base, canvas).save(f"{stem}_placed{i}.png")
        scores.append((i, round(silhouette_score(Image.open(f"{stem}_placed{i}.png"), base), 3)))
    return name, scores


if __name__ == "__main__":
    assets, work, names = sys.argv[1], sys.argv[2], sys.argv[3:]
    os.makedirs(work, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        for f in concurrent.futures.as_completed([pool.submit(paint, assets, work, n) for n in names]):
            print("RESULT", *f.result(), flush=True)
    print(f"total spent this run: {_cost[0]:.2f} $")
