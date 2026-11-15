#!/usr/bin/env python3
"""Lay the edit model's detail on the terrain so every block still fills its cell and tiles.

A block keeps the drawing's exact silhouette (its alpha) and, along every edge of every face,
the drawing's exact colours: the model's detail fades in only inside each face. Two neighbours
therefore always meet on the same flat colour, however the detail came out.

Usage: terrain_compose.py <assets-src/assets> <work> <out_dir>
"""
import io
import os
import sys

import cairosvg
import numpy as np
from PIL import Image, ImageFilter

W, HGT = 1024, 853            # the block's template canvas
OUT = (512, 427)              # what is stored: the atlas takes 320 px a tile
SQUARE, FIT = 1024, 0.92      # repaint.letterbox

PICK = {"grass": 1, "ground": 1, "sand": 1, "stairs_px": 1, "stairs_py": 0, "stairs_nx": 0,
        "stairs_ny": 0}
EARTH = (1, 0)
#: How much of the detail each ground keeps on its faces: these blocks repeat by the thousand.
STRENGTH = {"grass": 0.5, "ground": 0.45, "sand": 0.6}


def render(svg_path):
    return Image.open(io.BytesIO(cairosvg.svg2png(url=svg_path, output_width=W))).convert("RGBA")


def unbox(path):
    """The model's square picture cut back to the block's canvas."""
    w, h = round(W * FIT), round(HGT * FIT * SQUARE / 1024)
    x, y = (SQUARE - w) // 2, (SQUARE - h) // 2
    return Image.open(path).convert("RGB").resize((SQUARE, SQUARE)).crop((x, y, x + w, y + h)).resize((W, HGT), Image.LANCZOS)


def faces():
    """Each face of a full block as (mask, distance in pixels to the face's own border)."""
    ys, xs = np.mgrid[0:HGT, 0:W].astype(float)
    xs += 0.5
    ys += 0.5
    s = np.abs(xs - 512) / 512 + np.abs(ys - 256) / 256
    top = s <= 1.0
    top_d = (1.0 - s) * 229.0
    edge_y = 256 + (256 - np.abs(xs - 512) / 2)          # the top's lower edge at this x
    depth = ys - edge_y
    side = (~top) & (depth >= 0) & (depth <= 341)
    left, right = side & (xs < 512), side & (xs >= 512)
    side_d = np.minimum(np.minimum(depth, 341 - depth),
                        np.minimum(np.abs(xs - 512), np.minimum(xs, 1024 - xs)) * 0.9)
    return (top, top_d), (left, side_d), (right, side_d)


def smooth(d, reach):
    t = np.clip(d / reach, 0.0, 1.0)
    return t * t * (3 - 2 * t)


def block(base, ai, top_reach=34.0, side_reach=16.0, strength=1.0, tops_only=False):
    """The drawing with the model's detail faded in inside each face."""
    b = np.asarray(base).astype(float)
    a = np.asarray(ai).astype(float)
    out = b[:, :, :3].copy()
    for i, (mask, dist) in enumerate(faces()):
        if tops_only and i:
            continue
        mask = mask & (b[:, :, 3] > 250)
        if not mask.any():
            continue
        inner = mask & (dist > (top_reach if i == 0 else side_reach))
        matched = a + (b[inner][:, :3].mean(axis=0) - a[inner].mean(axis=0))
        w = (smooth(dist, top_reach if i == 0 else side_reach) * strength * mask)[:, :, None]
        out = out * (1 - w) + np.clip(matched, 0, 255) * w
    return np.dstack([out, b[:, :, 3]])


def save(arr, path):
    Image.fromarray(np.clip(arr, 0, 255).round().astype(np.uint8), "RGBA").resize(OUT, Image.LANCZOS).save(path, optimize=True)


def differs(a, b, threshold=14):
    return np.abs(np.asarray(a).astype(int) - np.asarray(b).astype(int)).max(axis=2) > threshold


def main():
    assets, work, out = sys.argv[1], sys.argv[2], sys.argv[3]
    for sub in ("grass", "ground", "sand", "path", "stairs"):
        os.makedirs(os.path.join(out, sub), exist_ok=True)
    made = {}
    for name in ("grass", "ground", "sand"):
        base = render(os.path.join(assets, name, "block.svg"))
        made[name] = block(base, unbox(os.path.join(work, f"{name}_v_{PICK[name]}.png")), strength=STRENGTH[name])
        save(made[name], os.path.join(out, name, "block.png"))
    grass_svg = render(os.path.join(assets, "grass", "block.svg"))
    grass = made["grass"]

    # The grass top's other looks: the same new block with the drawing's clutter laid back on it.
    for file in sorted(os.listdir(os.path.join(assets, "grass"))):
        stem = file[:-4]
        if not file.endswith(".svg") or stem in ("block", "block_reflection", "grass_variants"):
            continue
        variant = render(os.path.join(assets, "grass", file))
        if variant.size != (W, HGT):
            print("skipped", file, variant.size)
            continue
        clutter = differs(variant, grass_svg)
        v = np.asarray(variant).astype(float)
        mix = grass.copy()
        mix[clutter] = v[clutter]
        save(mix, os.path.join(out, "grass", stem + ".png"))

    # The road: one bed of trodden earth, cut to each connection mask's own frayed outline.
    (top, top_d), _, _ = faces()
    beds = []
    for pick in EARTH:
        a = np.asarray(unbox(os.path.join(work, f"earth_v_{pick}.png"))).astype(float)
        mean = a[top & (top_d > 30)].mean(axis=0)
        a = mean + (a - mean) * 0.62                      # a little calmer than the model made it
        w = smooth(top_d, 30.0)[:, :, None]
        beds.append(mean * (1 - w) + a * w)               # flat where a strip leaves the tile
    for mask in range(16):
        drawn = render(os.path.join(assets, "path", f"block_{mask}.svg"))
        bed = differs(drawn, grass_svg) & top
        tile = grass.copy()
        tile[bed, :3] = beds[mask % len(beds)][bed]
        # The step down into the bed: a shade under every edge the grass overhangs.
        sunk = Image.fromarray((bed * 255).astype(np.uint8))
        lip = bed & ~np.asarray(sunk.transform(sunk.size, Image.AFFINE, (1, 0, 0, 0, 1, -12))).astype(bool)
        soft = np.asarray(Image.fromarray((lip * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))) / 255.0
        tile[:, :, :3] *= (1 - 0.34 * soft * bed)[:, :, None]
        save(tile, os.path.join(out, "path", f"block_{mask}.png"))

    # The stairs keep their own colours and take only the model's fine detail.
    for d in ("px", "py", "nx", "ny"):
        base = render(os.path.join(assets, "stairs", f"block_{d}.svg"))
        b = np.asarray(base).astype(float)
        ai = unbox(os.path.join(work, f"stairs_{d}_v_{PICK['stairs_' + d]}.png"))
        fine = np.asarray(ai).astype(float) - np.asarray(ai.filter(ImageFilter.GaussianBlur(26))).astype(float)
        flat = np.asarray(base.convert("RGB").filter(ImageFilter.GaussianBlur(3))).astype(float)
        keep = (b[:, :, 3:4] > 250)
        rgb = np.where(keep, 0.55 * b[:, :, :3] + 0.45 * flat + fine * 0.9, b[:, :, :3])
        save(np.dstack([rgb, b[:, :, 3]]), os.path.join(out, "stairs", f"block_{d}.png"))
    print("ok")


if __name__ == "__main__":
    main()
