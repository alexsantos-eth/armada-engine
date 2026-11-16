# vox_lib.py — the core of the voxel asset route: rounded boxes → voxels → MagicaVoxel .vox.
#
# A model is a list of boxes, each a dict: c (centre), h (half-sizes), r (corner radius),
# color ('#rrggbb'), zs (height used for the baked falloff) and pocket (None, or a hollow
# carved into the top). Lengths are in skill units; `scale` says how many make one voxel.
# vox_prefabs.py builds the pieces and vox_models.py the entities on top of this; iso_vox.py
# uses it to convert the drawn generators. Standard library only.
import math
import struct

H = 341                               # skill units in one block of height
FACE = {"top": 1.0, "right": 0.93, "left": 0.77}
BEVEL = 0.866


def tint(hex_color, f):
    r, g, b = (int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
    return "#%02x%02x%02x" % tuple(max(0, min(255, round(c * f))) for c in (r, g, b))


def falloff(z):
    return 0.85 + 0.15 * min(max(z / H, 0), 1)


def light(n):
    """The skill's cel level for a normal. Faces the sprite never shows (−x, −y, −z) take the
    value of the opposite face, so the model is shaded all the way round."""
    n = tuple(abs(c) for c in n)
    val = {0: FACE["right"], 1: FACE["left"], 2: FACE["top"]}
    order = sorted(range(3), key=lambda i: -n[i])
    a, b = order[0], order[1]
    if n[a] >= BEVEL or n[b] <= 0:
        return val[a]
    return (val[a] + val[b]) / 2


# ---------------------------------------------------------------- voxelisation

def _sdf(box, p):
    """(distance to the rounded box surface, outward normal) at world point p."""
    q = [abs(p[a] - box["c"][a]) - (box["h"][a] - box["r"]) for a in range(3)]
    out = [max(v, 0.0) for v in q]
    m = math.sqrt(sum(v * v for v in out))
    if m > 0:
        n = tuple(math.copysign(out[a] / m, p[a] - box["c"][a]) for a in range(3))
        return m - box["r"], n
    a = max(range(3), key=lambda i: q[i])       # inside the core: nearest face decides
    n = tuple(math.copysign(1.0, p[i] - box["c"][i]) if i == a else 0.0 for i in range(3))
    return q[a] - box["r"], n


def voxelise(boxes, scale, bake):
    """→ {(i, j, k): '#rrggbb'} in world-aligned cells of `scale` units (cell centre sampled).
    Later boxes overwrite earlier ones, like accents pressed into a face."""
    cells = {}
    for b in boxes:
        lo = [math.floor((b["c"][a] - b["h"][a]) / scale) for a in range(3)]
        hi = [math.ceil((b["c"][a] + b["h"][a]) / scale) for a in range(3)]
        pk = b["pocket"]
        if pk:      # hollow carved into the top: an inner box, open upwards
            top = b["c"][2] + b["h"][2]
            ph = (b["h"][0] - pk["rim"], b["h"][1] - pk["rim"])
        flat = b["color"]
        for i in range(lo[0], hi[0] + 1):
            for j in range(lo[1], hi[1] + 1):
                for k in range(lo[2], hi[2] + 1):
                    p = ((i + .5) * scale, (j + .5) * scale, (k + .5) * scale)
                    d, n = _sdf(b, p)
                    if d > 0:
                        continue
                    color = flat
                    if pk and abs(p[0] - b["c"][0]) < ph[0] and abs(p[1] - b["c"][1]) < ph[1]:
                        if p[2] > top - pk["depth"]:
                            cells.pop((i, j, k), None)
                            continue
                        if p[2] > top - pk["depth"] - scale:
                            color, n = pk["floor"], (0, 0, 1)
                    cells[(i, j, k)] = tint(color, light(n) * falloff(b["zs"])) if bake else color
    return cells


def shell(cells):
    """Drop voxels with all six neighbours filled: nobody can see them."""
    near = ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1))
    return {p: c for p, c in cells.items()
            if any((p[0] + a, p[1] + b, p[2] + d) not in cells for a, b, d in near)}


def write_vox(path, cells, palette=None, bounds=None):
    """MagicaVoxel .vox, version 150: MAIN { SIZE, XYZI, RGBA }. One model, at most 256 per axis
    and 255 colours. World +y becomes .vox −y (see the header).
    palette: a fixed list of colours to write instead of the model's own, so that several files
    share one palette and keep their colours when they meet in one MagicaVoxel scene.
    bounds: ((x0, y0, z0), (sx, sy, sz)) in cells, to write a fixed volume (a whole tile)
    instead of cropping to the model, so the file keeps where the model stands on its tile."""
    assert cells, "no voxels: did the generator call draw()?"
    lo = [min(p[a] for p in cells) for a in range(3)]
    hi = [max(p[a] for p in cells) for a in range(3)]
    if bounds:
        assert all(bounds[0][a] <= lo[a] and hi[a] < bounds[0][a] + bounds[1][a] for a in range(3)), \
            f"the model ({lo}..{hi}) does not fit the volume {bounds}"
        lo = list(bounds[0])
        hi = [lo[a] + bounds[1][a] - 1 for a in range(3)]
    size = [hi[a] - lo[a] + 1 for a in range(3)]
    assert max(size) <= 256, f"model is {size} voxels; raise --scale (a .vox model holds 256 per axis)"
    colors = list(palette) if palette else sorted(set(cells.values()))
    assert set(cells.values()) <= set(colors), "a colour is missing from the palette"
    assert len(colors) <= 255, f"{len(colors)} colours; a .vox palette holds 255"
    index = {c: n + 1 for n, c in enumerate(colors)}

    xyzi = struct.pack("<i", len(cells)) + b"".join(
        struct.pack("<4B", p[0] - lo[0], hi[1] - p[1], p[2] - lo[2], index[c])
        for p, c in sorted(cells.items()))
    rgba = b"".join(bytes.fromhex(c[1:]) + b"\xff" for c in colors).ljust(1024, b"\x00")

    def chunk(tag, content, children=b""):
        return tag + struct.pack("<ii", len(content), len(children)) + content + children

    body = chunk(b"SIZE", struct.pack("<3i", *size)) + chunk(b"XYZI", xyzi) + chunk(b"RGBA", rgba)
    with open(path, "wb") as f:
        f.write(b"VOX " + struct.pack("<i", 150) + chunk(b"MAIN", b"", body))
    return size, len(cells), colors
