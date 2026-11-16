#!/usr/bin/env python3
"""Give every canopy the tone and shading of the bush.

The bush (`bush/block.png`) is the reference: its leaf pixels give three tones (shaded
side, lit top, bevel highlight) and, for every brightness, the hue and saturation the bush
shows there. Each canopy's own tones are found the same way and its brightness is bent,
linearly, so its shaded side and lit top land on the bush's; the colour then comes from
the bush's table. A full histogram match was tried first and turned the repaint's grain
into speckle, which is why the mapping is a straight line and the brightness is
median-filtered. Fruit, trunk and bark are not green, so they are left alone.

A grove holds several canopies at once, and the model draws its conifer darker than its
broadleaves, so the bend is worked out per canopy instead of per file: the leaf mask is cut
into connected pieces and each piece into a light and a dark hue family when it holds both.
Every canopy then lands on the bush's tones and the grove matches the single trees.

The edit model also likes to draw a dark line around a leaf block. Those pixels are not
leaf-green, so the mask misses them and they would survive as black outlines on an asset
whose leaves have all moved: `inked` picks them up by the leaves they sit against and bends
them with the canopy, which leaves them as the deep creases the style wants.

Usage: tree_leaves.py <work> <assets-src/assets>"""
import os, sys
import numpy as np
from PIL import Image, ImageFilter

PICK = {"tree/block": 2, "tree/block_2": 1, "tree/block_3": 0, "tree/block_4": 2,
        "tree/block_5": 1, "tree/block_6": 1, "tree/block_8": 2,
        "tree/block_grove_1x2": 1, "tree/block_grove_2x1": 2}
BINS = 64
MIN_GROUP = 400        # leaf pixels a piece needs before it is bent on its own
HUE_SPLIT = 0.012       # how far apart two greens must sit to count as two canopies
MIN_SHARE = 0.1         # the smaller green must be this much of the piece to count as one


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


def inked(leaf, v, alpha):
    """The dark lines the model sometimes draws between leaf blocks, and around them.

    They are not leaf-green, so the mask misses them, and left alone they stay as black
    outlines while everything around them is bent to the bush's tones. Closing the leaf
    mask finds the pixels they enclose; bent with the leaves they read as deep creases.
    """
    plane = Image.fromarray((leaf * 255).astype(np.uint8), "L")
    near = np.asarray(plane.filter(ImageFilter.MaxFilter(31))).astype(bool)
    return near & ~leaf & (v < 0.36) & (alpha > 0.5)


def calm(v):
    """Median-filter a brightness plane, to drop the repaint's grain before bending it."""
    plane = Image.fromarray((np.clip(v, 0, 1) * 255).round().astype(np.uint8), "L")
    return np.asarray(plane.filter(ImageFilter.MedianFilter(7))).astype(float) / 255


def pieces(mask):
    """Label the mask's connected pieces (4-neighbour), run by run with a union-find."""
    parent = [0]

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a, b):
        a, b = find(a), find(b)
        if a != b:
            parent[max(a, b)] = min(a, b)

    out = np.zeros(mask.shape, np.int32)
    previous = []
    for y in range(mask.shape[0]):
        edges = np.diff(np.concatenate(([0], mask[y].view(np.int8), [0])))
        current = []
        for start, end in zip(np.flatnonzero(edges == 1), np.flatnonzero(edges == -1)):
            touching = [lab for (s, e, lab) in previous if s < end and start < e]
            if touching:
                lab = min(find(x) for x in touching)
                for x in touching:
                    union(lab, x)
            else:
                lab = len(parent)
                parent.append(lab)
            out[y, start:end] = lab
            current.append((start, end, lab))
        previous = current
    return np.array([find(i) for i in range(len(parent))], np.int32)[out]


def hue_families(hues):
    """One mask, or two when the piece holds a light and a dark green side by side."""
    centres = np.array([np.percentile(hues, 20), np.percentile(hues, 80)])
    for _ in range(30):
        near = np.abs(hues[:, None] - centres[None, :]).argmin(axis=1)
        centres = np.array([hues[near == k].mean() if (near == k).any() else centres[k]
                            for k in range(2)])
    if abs(centres[1] - centres[0]) < HUE_SPLIT:
        return [np.ones(hues.shape, bool)]
    cut = centres.mean()
    return [hues <= cut, hues > cut]


def canopies(leaf, solid, h):
    """The leaf mask cut into the pieces that are bent one by one."""
    labels = pieces(leaf)
    out = []
    for label in np.unique(labels[labels > 0]):
        piece = labels == label
        if (piece & solid).sum() < MIN_GROUP:
            continue
        families = hue_families(h[piece])
        masks = []
        for family in families:
            mask = np.zeros(piece.shape, bool)
            mask[piece] = family
            masks.append(mask)
        # A split is two canopies only when both sides are a real share of the piece;
        # otherwise it is the crease shadow being told apart from the leaves, and bending
        # that on its own turns the creases into speckle.
        if len(masks) == 2 and min((m & solid).sum() for m in masks) < MIN_SHARE * (piece & solid).sum():
            masks = [piece]
        for mask in masks:
            if (mask & solid).sum() >= MIN_GROUP:
                out.append(mask)
    return out


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


def relight(im, values, centers, hue, sat):
    """The asset with every canopy's leaves bent onto the bush's tones."""
    leaf, h, s, v = leaf_mask(im)
    solid = leaf & (im[:, :, 3] > 0.95)
    paint = leaf | inked(leaf, v, im[:, :, 3])
    v = np.where(paint, calm(v), v)
    bent = v.copy()
    tones = []
    for mask in canopies(paint, solid, h):
        own = face_tones(v[mask & solid])
        # Bend the brightness so the canopy's shaded side and lit top land on the bush's.
        # The bush's third, brightest tone is only its bevel highlights, not a face, so a
        # canopy's top goes to the bush's middle tone and the highlights ride above it.
        slope = (values[1] - values[0]) / max(own[2] - own[0], 1e-6)
        bent[mask] = np.clip(values[0] + (v[mask] - own[0]) * slope, 0, 1)
        tones.append(own.round(2))
    rgb = unhsv(np.interp(bent, centers, hue), np.interp(bent, centers, sat), bent)
    rgb = np.where(paint[:, :, None], rgb, im[:, :, :3])
    return np.dstack([rgb, im[:, :, 3]]), tones


def main():
    work, assets = sys.argv[1], sys.argv[2]
    values, centers, hue, sat = bush_reference(assets)
    for name, pick in PICK.items():
        source = os.path.join(work, f"{name.replace('/', '_')}_placed{pick}.png")
        if not os.path.exists(source):      # an asset kept from an earlier round
            source = os.path.join(assets, name + ".png")
        out, tones = relight(load(source), values, centers, hue, sat)
        Image.fromarray((np.clip(out, 0, 1) * 255).round().astype(np.uint8), "RGBA").save(
            os.path.join(assets, name + ".png"), optimize=True)
        print(name, "canopies", tones, "->", values.round(2))


if __name__ == "__main__":
    main()
