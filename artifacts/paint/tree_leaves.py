#!/usr/bin/env python3
"""Give every tree's leaves the tone and shading of the bush.

The bush (`bush/block.png`) is the reference: its leaf pixels give three tones (shaded
side, lit top, bevel highlight) and, for every brightness, the hue and saturation the bush
shows there. Each tree's own tones are found the same way and its brightness is bent,
linearly, so its shaded side and lit top land on the bush's; the colour then comes from
the bush's table. A full histogram match was tried first and turned the repaint's grain
into speckle, which is why the mapping is a straight line and the brightness is
median-filtered. Fruit, trunk and bark are not green, so they are left alone.

Usage: tree_leaves.py <work> <assets-src/assets>"""
import os, sys
import numpy as np
from PIL import Image, ImageFilter

PICK = {"tree/block": 1, "tree/block_2": 2, "tree/block_3": 2, "tree/block_4": 1,
        "tree/block_5": 1, "tree/block_6": 2, "tree/block_7": 0, "tree/block_8": 2}
BINS = 64


def hsv(rgb):
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    d = mx - mn + 1e-9
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    h = np.where(mx == r, (g - b) / d % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6
    return h, np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-9), 0), mx


def unhsv(h, s, v):
    i = np.floor(h * 6).astype(int) % 6
    f = h * 6 - np.floor(h * 6)
    p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    return np.stack([np.choose(i, [v, q, p, p, t, v]), np.choose(i, [t, v, v, q, p, p]),
                     np.choose(i, [p, p, t, v, v, q])], axis=2)


def load(path):
    return np.asarray(Image.open(path).convert("RGBA")).astype(float) / 255


def leaf_mask(im):
    h, s, v = hsv(im[:, :, :3])
    return (h > 0.14) & (h < 0.50) & (s > 0.22) & (im[:, :, 3] > 0.02), h, s, v


def face_tones(v):
    """The three brightness clusters of a set of leaf pixels, dark to light (1-D k-means)."""
    tones = np.percentile(v, [15, 50, 85])
    for _ in range(30):
        near = np.abs(v[:, None] - tones[None, :]).argmin(axis=1)
        tones = np.array([v[near == k].mean() if (near == k).any() else tones[k] for k in range(3)])
    return np.sort(tones)


def calm(v):
    """Median-filter a brightness plane, to drop the repaint's grain before bending it."""
    plane = Image.fromarray((np.clip(v, 0, 1) * 255).round().astype(np.uint8), "L")
    return np.asarray(plane.filter(ImageFilter.MedianFilter(5))).astype(float) / 255


def bush_reference(assets):
    """The bush's sorted leaf values, and its hue and saturation per value bin."""
    im = load(os.path.join(assets, "bush/block.png"))
    leaf, h, s, v = leaf_mask(im)
    leaf &= im[:, :, 3] > 0.95
    values = face_tones(v[leaf])
    centers = (np.arange(BINS) + 0.5) / BINS
    which = np.clip((v[leaf] * BINS).astype(int), 0, BINS - 1)
    hue, sat, seen = np.zeros(BINS), np.zeros(BINS), np.zeros(BINS, bool)
    for b in range(BINS):
        pick = which == b
        if pick.sum() > 40:
            hue[b], sat[b], seen[b] = np.median(h[leaf][pick]), np.median(s[leaf][pick]), True
    hue = np.interp(centers, centers[seen], hue[seen])
    sat = np.interp(centers, centers[seen], sat[seen])
    return values, centers, hue, sat


def main():
    work, assets = sys.argv[1], sys.argv[2]
    values, centers, hue, sat = bush_reference(assets)
    for name, pick in PICK.items():
        im = load(os.path.join(work, f"{name.replace('/', '_')}_placed{pick}.png"))
        leaf, h, s, v = leaf_mask(im)
        solid = leaf & (im[:, :, 3] > 0.95)
        v = np.where(leaf, calm(v), v)
        own = face_tones(v[solid])
        # Bend the brightness so the tree's shaded side and lit top land on the bush's.
        # The bush's third, brightest tone is only its bevel highlights, not a face, so a
        # tree's top goes to the bush's middle tone and the highlights ride above it.
        slope = (values[1] - values[0]) / max(own[2] - own[0], 1e-6)
        v2 = np.clip(values[0] + (v - own[0]) * slope, 0, 1)
        rgb = unhsv(np.interp(v2, centers, hue), np.interp(v2, centers, sat), v2)
        rgb = np.where(leaf[:, :, None], rgb, im[:, :, :3])
        out = np.dstack([rgb, im[:, :, 3]])
        Image.fromarray((np.clip(out, 0, 1) * 255).round().astype(np.uint8), "RGBA").save(
            os.path.join(assets, name + ".png"), optimize=True)
        print(name, "tones", own.round(2), "->", values.round(2))


if __name__ == "__main__":
    main()
