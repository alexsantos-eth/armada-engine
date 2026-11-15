#!/usr/bin/env python3
"""Repaint the engine's drawn assets as higher-quality rasters, one by one.

For each asset: render the drawing on its template canvas, send that shape and the game's style
reference to fal.ai's edit model, matte the result, and lay it back on the same canvas so the
engine measures it where the drawing stood. The drawing stays in the tree and the raster beside
it overrides it, so any asset is put back by deleting its PNG.

Usage: repaint.py <assets-src/assets> <work-dir> <name>...     (name like building/block_market)
"""
import concurrent.futures
import json
import os
import re
import sys
import threading

import cairosvg
import numpy as np
from PIL import Image

from falrun import run, data_uri

MODEL = "fal-ai/nano-banana/edit"
MATTE = "fal-ai/birefnet/v2"
PRICE = {MODEL: 0.039, MATTE: 0.003}
VARIANTS = 2
SQUARE = 1024
REF = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ref_style.png")

_cost = [0.0]
_lock = threading.Lock()


def spend(model, images=1):
    with _lock:
        _cost[0] += PRICE[model] * images
    return _cost[0]


# What each asset is, so the model repaints the thing that is there instead of inventing one.
WHAT = {
    "tree/block": "a round fruit tree with red fruit in its canopy",
    "tree/block_2": "a leafy broadleaf tree",
    "tree/block_3": "a tall pine tree",
    "tree/block_4": "a flat-topped acacia tree",
    "tree/block_5": "a slender poplar tree",
    "tree/block_6": "a forked tree with two canopies",
    "tree/block_7": "a narrow cypress tree",
    "tree/block_8": "a birch tree with a pale trunk",
    "bush/block": "a low round leafy bush, nothing else",
    "rock/block": "a grey boulder",
    "rock/block_2": "a cluster of grey rocks",
    "rock/block_3": "a tall grey rock",
    "statue/block": "a statue of a blocky robot with a cube head and glowing cyan eyes, standing on a square stone plinth",
    "car/block": "a small toy-like car",
    "house/block": "a small suburban house with a tiled gable roof",
    "house/block_2x1": "a two-storey house with a tiled gable roof",
    "house/block_balcony": "a two-storey house with a balcony",
    "building/block_market": "a market hall with awnings and stalls",
    "building/block_restaurant": "a small restaurant with a terrace",
    "building/block_hospital": "a hospital with a red cross sign",
    "building/block_townhall": "a town hall with a clock and a pediment",
    "building/block_tower": "a slim stone tower",
    "building/block_apartments_1x2": "an apartment block with rows of windows and balconies",
    "building/block_apartments_2x1": "an apartment block with rows of windows and balconies",
    "building/block_hotel_1x2": "a hotel with many windows and a sign over its entrance",
    "building/block_hotel_2x1": "a hotel with many windows and a sign over its entrance",
    "building/block_office_1x3": "a long office building with glass windows",
    "building/block_office_3x1": "a long office building with glass windows",
    "building/block_skyscraper": "a tall glass skyscraper",
}

PROMPT = (
    "The FIRST image is the exact object to keep. The SECOND image is the art style to copy.\n"
    "Repaint the object of the first image in the style of the second image. It is {what}, "
    "drawn as a game asset: clean chunky low-poly voxel art, flat cel-shaded faces, crisp "
    "readable shapes, no outlines and no texture noise.\n"
    "CRITICAL — it must stay the same object. Keep its silhouette, proportions, height, 2:1 "
    "isometric camera angle and the colour of every part exactly as in the first image, with "
    "every part in its original place. Do NOT mirror, flip or rotate it. Do NOT add anything "
    "that is not already in the first image: no extra objects, no decorations, no ornaments, "
    "no lights, no signs, no banners, no characters, no machinery. Your only job is to raise "
    "the quality of the shading and surface detail of what is already there.{extra}\n"
    "LIGHTING: the sun is on the UPPER RIGHT. Surfaces facing RIGHT are the brightest, "
    "surfaces facing LEFT are in shade, and tops are brightest of all.\n"
    "The background must be pure flat white, with no ground, no drop shadow and no gradient. "
    "Output a square 1:1 image."
)

# What to say about material, by what the asset is made of. Trees gain real depth from being
# allowed extra foliage and litter; stone only drifts when it is given that licence, and a
# building only needs to be told to leave its openings where they are.
FOLIAGE = (" This is a natural object of wood and leaves. Give it rich natural material: bark "
           "grain on the trunk, clustered leaves and a little moss in the canopy, and a few "
           "fallen leaves at its foot. Add no man-made part, no metal, no ornament hung on it "
           "and no flowers or fruit the first image does not already show.")
STONE = (" This is bare stone: no man-made part, no metal, no moss, no lichen, no plants and "
         "no coloured speckles. Only cleaner facets and a little weathering on the rock that "
         "is already there.")
BUILT = " Windows, doors and roofs stay exactly where the first image puts them."

# A bush is all canopy: the tree wording's fallen litter gave it a red mess at its foot.
SHRUB = (" This is a natural object of leaves and thin twigs. Give it clustered leaves with "
         "a little depth between them, and nothing else: no trunk, no bark, no soil, no "
         "mulch, no ground under it, no flowers and no berries.")
# The statue kept coming back as a robot, so say what it is made of and what it is not.
CARVED = (" This is pale grey stone. Keep the square flat plinth it stands on exactly as the "
          "first image draws it, with the same size and the same straight edges, and keep the "
          "two cyan eyes. Draw NOTHING on the plinth and NOTHING beside it: no cast shadow, no "
          "dark patch, no pale patch, no slab, no step and no ground. The plinth is the lowest "
          "and widest thing in the picture. Only cleaner facets and a little weathering.")

MATERIAL = {"tree": FOLIAGE, "bush": SHRUB, "rock": STONE, "statue": CARVED}

def drawing_tiles(head, tiles):
    """The footprint the drawing really has, read off its own view box.

    `data-tiles` is the engine's word for it, but a good few drawings never wrote one, and
    `statue/block` is 1x1x2 with no attribute at all: taken as 1x1x1 it lost a block of
    height and the repaint came back clipped. The view box can't be missing or stale, so
    it is the one measurement to trust, and `data-tiles` only has to agree with it.
    """
    found = re.search(r'\bviewBox="([^"]*)"', head)
    if not found:
        return tiles
    x, y, width, height = (float(v) for v in re.split(r"[\s,]+", found.group(1).strip()))
    total = round(width / 512)                # along + across
    across = round((512 - x) / 512)
    derived = f"{total - across}x{across}x{round((height - 256 * total) / 341)}"
    return derived if template_canvas(derived) != (0, 0) else tiles


def template_canvas(tiles):
    """The canvas `tiles` implies, in template units: `iso_lib.Asset.viewbox()`."""
    counts = [max(1, int(n)) for n in (tiles or "1x1x1").split("x")] + [1, 1]
    along, across, high = counts[:3]
    return round(512 * (along + across)), round(256 * (along + across) + 341 * high)


def ink_box(img):
    alpha = np.asarray(img.convert("RGBA"))[:, :, 3] > 8
    ys, xs = np.where(alpha)
    if not len(xs):
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def letterbox(base):
    """The drawing centred on a white square, which is what the edit model takes."""
    square = Image.new("RGBA", (SQUARE, SQUARE), (255, 255, 255, 255))
    fitted = base.copy()
    fitted.thumbnail((int(SQUARE * 0.92), int(SQUARE * 0.92)), Image.LANCZOS)
    square.alpha_composite(fitted, ((SQUARE - fitted.width) // 2, (SQUARE - fitted.height) // 2))
    return square.convert("RGB")


def decontaminate(source_png, matte_png, out_png):
    """The matte's alpha with the white page un-blended out of the partly covered pixels."""
    rgb = np.asarray(Image.open(source_png).convert("RGB")).astype(float)
    cut = Image.open(matte_png).convert("RGBA").resize(Image.open(source_png).size)
    alpha = np.asarray(cut).astype(float)[:, :, 3:4] / 255.0
    free = np.clip((rgb - 255.0 * (1.0 - alpha)) / np.maximum(alpha, 1e-3), 0, 255)
    free = np.where(alpha > 0.995, rgb, free)
    Image.fromarray(np.dstack([free, alpha[:, :, 0] * 255.0]).round().astype(np.uint8),
                    "RGBA").save(out_png)
    return out_png


def fit(cut, base, canvas):
    """The cut-out laid on the template canvas, its ink matching the drawing's ink."""
    bx0, by0, bx1, by1 = (v * canvas[0] / base.width for v in ink_box(base))
    cx0, cy0, cx1, cy1 = ink_box(cut)
    scale = (bx1 - bx0) / (cx1 - cx0)
    scaled = cut.resize((max(1, round(cut.width * scale)), max(1, round(cut.height * scale))),
                        Image.LANCZOS)
    out = Image.new("RGBA", canvas, (0, 0, 0, 0))
    out.alpha_composite(scaled, (round((bx0 + bx1) / 2 - (cx0 + cx1) / 2 * scale),
                                 round(by1 - cy1 * scale)))
    return out


def silhouette_score(candidate, base):
    """How much of the drawing's shape the repaint keeps, as intersection over union.

    Both are reduced to their ink boxes first, so only the shape is compared and not where it
    happens to sit on the canvas.
    """
    def mask(img):
        box = ink_box(img)
        return np.asarray(img.convert("RGBA").crop(box).resize((128, 128)))[:, :, 3] > 100
    a, b = mask(candidate), mask(base)
    return float((a & b).sum()) / float(max((a | b).sum(), 1))


def repaint(assets_dir, work, name):
    out_png = os.path.join(assets_dir, f"{name}.png")
    if os.path.exists(out_png):
        return name, None, "already repainted"
    svg_path = os.path.join(assets_dir, f"{name}.svg")
    svg = open(svg_path, encoding="utf-8").read()
    head = svg[: svg.find(">") + 1]
    found = re.search(r'\bdata-tiles="([^"]*)"', head)
    stated = found.group(1) if found else None
    tiles = drawing_tiles(head, stated)
    canvas = template_canvas(tiles)

    stem = os.path.join(work, name.replace("/", "_"))
    os.makedirs(os.path.dirname(stem), exist_ok=True)
    cairosvg.svg2png(url=svg_path, write_to=f"{stem}_base.png", output_width=canvas[0])
    base = Image.open(f"{stem}_base.png").convert("RGBA")
    if ink_box(base) is None:
        return name, None, "the drawing is empty"
    letterbox(base).save(f"{stem}_in.png")

    what = WHAT.get(name, "a game asset")
    kind = name.split("/")[0]
    extra = MATERIAL.get(kind, BUILT)
    variants = 3 if kind in ("tree", "bush", "statue") else VARIANTS
    files = run(MODEL, {"prompt": PROMPT.format(what=what, extra=extra),
                        "image_urls": [data_uri(f"{stem}_in.png"), data_uri(REF)],
                        "num_images": variants, "output_format": "png", "aspect_ratio": "1:1"},
                f"{stem}_v")
    if not files:
        return name, None, "the model returned nothing"
    spend(MODEL, len(files))

    best = None
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
        score = silhouette_score(placed, base)
        if best is None or score > best[0]:
            best = (score, placed, i)
    if best is None:
        return name, None, "nothing could be matted"
    score, placed, which = best
    placed.save(out_png)
    sidecar = os.path.join(assets_dir, f"{name}.json")
    if tiles and template_canvas(stated) != canvas:
        json.dump({"tiles": tiles}, open(sidecar, "w"), indent=1)
    elif os.path.exists(sidecar):
        os.remove(sidecar)
    return name, score, f"variant {which}, {_cost[0]:.2f} $ so far"


def main():
    assets_dir, work = sys.argv[1], sys.argv[2]
    names = sys.argv[3:]
    os.makedirs(work, exist_ok=True)
    results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(repaint, assets_dir, work, n): n for n in names}
        for future in concurrent.futures.as_completed(futures):
            name = futures[future]
            try:
                name, score, note = future.result()
            except Exception as error:  # one bad asset must not stop the batch
                name, score, note = name, None, f"failed: {error}"
            results[name] = (score, note)
            print(f"{name:<34} {'' if score is None else f'IoU {score:.3f}'}  {note}", flush=True)
    json.dump({k: v for k, v in sorted(results.items())},
              open(os.path.join(work, "report.json"), "w"), indent=1)
    print(f"\ntotal spent this run: {_cost[0]:.2f} $")


if __name__ == "__main__":
    main()
