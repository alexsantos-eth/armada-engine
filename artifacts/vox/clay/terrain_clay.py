#!/usr/bin/env python3
# terrain_clay.py — the ground blocks by the voxel route, with the clay finish, made to join their
# neighbours without a seam: grass, bare ground, sand and the sixteen path blocks.
#
#   python3 terrain_clay.py [only …]      e.g. grass, sand/block_2, path, path/block_5
#
#   → lib/assets/grass/block.png, block_2..4.png    (and ../models/terrain_*.vox)
#     lib/assets/ground/block.png, block_2..3.png
#     lib/assets/sand/block.png, block_2..3.png
#     lib/assets/path/block_0..15.png               (one per connection mask)
#
# A ground block is terrain, so like the stairs it **fills its whole cell**: the mass is square
# prisms from edge to edge of the 128-voxel tile. What makes it clay is what lies on and over
# that mass: round tufts and turf dripping over the soil on the grass, clods and pebbles on bare
# ground, low ripples and a few shells on the sand, a trodden bed of earth down a path.
#
# The blocks tile like a repeating pattern: whatever crosses an edge of the cell comes back in
# through the opposite edge, so the right side of one block runs on into the left side of the
# next, and the front into the back. Those edge features come from one seed per material, shared
# by all its looks, so any two looks of a material join; what changes from one look to the next
# is only the inside of the cell, and the terrain alternates the looks to break the grid.
#
# A path is a grass block with a bed of earth sunk into its lawn, from the middle to the middle
# of every edge its mask joins, the same width at every edge: two path blocks that join meet in
# one continuous bed, and a grass tuft that crosses an edge where a bed runs is left out on both
# sides of it.
#
# For the clay finish not to round the surface off where the voxels stop, every block is two clay
# renders, both shaped over a margin of the neighbouring cells (the same wrapped pattern) and cut
# back to the cell afterwards (vox_render.py --margin):
#
#   - the top: the margin goes round all four sides, so the surface is one continuous field cut
#     clean at every edge. Its sides are bare cuts, so only the top of this render is used;
#   - the sides: the margin only goes behind (−x and −y), so the two faces the camera sees are
#     real faces with their drips, and their far ends are clean cuts.
#
# The top render is laid over the side render inside the top face (the diamond at the surface's
# lowest height, and everything above it); outside it the side render shows, and under both the
# hard-cube render of the bare cell, as with the stairs, so the silhouette is the full cell.
# Nothing rises over z = 85: the blocks keep the template of every terrain sprite (512 × 427).
import math
import os
import random
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw

import vox_lib
from grass_clay import blender
from vox_prefabs import (EARTH, EARTH_DARK, GRASS_DEEP, GRASS_TOP, PALETTE, ROCK, ROCK_DARK, SAND_BODY,
                         SAND_TOP, SCALE, SOIL, SOIL_DARK, STONE_SAND, WHITE, box, tile_volume, write)

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "..", "..", "lib", "assets")
MODELS = os.path.join(HERE, "..", "models")
RENDER = os.path.join(HERE, "vox_render.py")
SIZE = (512, 427)                 # a terrain sprite: the 1x1x1 template at half size

CELL = 128
HALF = 64                         # half a cell
MARGIN = 16                       # voxels of the neighbours carried around the cell
TOP = 85                          # one block: nothing goes over it
DRIP = 16                         # how far a drip reaches into the block: deep enough to round it

# The grass (and the path's lawn): soil, then turf from SOIL_TOP to TURF; tufts reach TOP.
SOIL_TOP, TURF = 64, 79
# Bare ground: soil all the way to GROUND, clods to TOP.
GROUND = 81
# Sand: body, then the paler crust from CRUST to SAND; ripples reach a little over it.
CRUST, SAND = 68, 81
# Path: the bed of earth sits BED high, a voxel under the lawn (the stairs' walked strip meets it).
BED = 78
STRIP = 66                        # width of a path's bed where it leaves the cell
BLOB = 36                         # radius of the bed in the middle of the cell
FRAY, FADE = 9, 22                # most the bed's edge wanders, and how far from the cell's edge
#                                   that wandering has faded out, so a bed leaves at its width
# Engine bit → direction on the model's top plane (engine +x is model −y, +y is −x).
DIRECTIONS = {1: (0, -1), 2: (-1, 0), 4: (0, 1), 8: (1, 0)}


# ------------------------------------------------------------------ pieces

def lump(x, y, top, size, color, depth=14, stretch=(1, 1)):
    """A round lump whose top reaches `top`; most of it is buried in what it sits on."""
    sx, sy = size * stretch[0], size * stretch[1]
    return dict(box(x, y, top - depth, sx, sy, depth, color, min(sx, sy) * 0.45), surface=True)


def on_face(face, along, depth, z0, width, height, color, r):
    """A box pressed flush into a side face: its outer face lies on the cell's plane. The +x face
    runs along y, the +y face along x."""
    inside = HALF - depth / 2
    x, y = (inside, along) if face == "+x" else (along, inside)
    sx, sy = (depth, width) if face == "+x" else (width, depth)
    return box(x, y, z0, sx, sy, height, color, r)


def drip(face, along, width, length, root, color):
    """A rounded tongue of the top layer hanging down a side face from `root`."""
    return on_face(face, along, DRIP, root - length, width, length + 8, color, width * 0.45)


def clump(rnd, cx, cy):
    """Two or three round tufts; the first is darker and the tallest."""
    out = []
    for rank in range(rnd.choice((2, 3))):
        size = rnd.choice((11, 13, 16))
        out.append(lump(cx + rnd.uniform(-7, 7), cy + rnd.uniform(-7, 7), TOP - rank * 2, size,
                        GRASS_DEEP if rank == 0 else GRASS_TOP))
    return out


def scatter(rnd, count, keep, gap):
    """`count` spots inside the cell, at least `keep` from its edges and `gap` from each other."""
    spots, tries = [], 0
    while len(spots) < count and tries < 500:
        tries += 1
        spot = (rnd.uniform(-HALF + keep, HALF - keep), rnd.uniform(-HALF + keep, HALF - keep))
        if all((spot[0] - a) ** 2 + (spot[1] - b) ** 2 > gap ** 2 for a, b in spots):
            spots.append(spot)
    return spots


def face_drips(rnd, root, color, lengths):
    """Drips down the two faces the camera sees, clear of the corners (those are edge features)."""
    out = []
    for face in ("+x", "+y"):
        at = -HALF + 14
        while at < HALF - 26:
            width = rnd.uniform(12, 20)
            at += width / 2
            if at + width / 2 < HALF - 14:
                out.append(drip(face, at, width, rnd.choice(lengths), root, color))
            at += width / 2 + rnd.uniform(0, 8)
    return out


def face_stones(rnd, count, low, high, colors):
    return [on_face(face, rnd.uniform(-HALF + 14, HALF - 14), 10, rnd.uniform(low, high), 10, 12,
                    rnd.choice(colors), 4.5)
            for face in ("+x", "+y") for _ in range(count)]


# ------------------------------------------------------------------ materials
#
# Each material gives: its bare mass (with a margin), the features that cross its edges (one
# seed for all its looks) and the features inside one look. Sizes and heights in voxels.

def slab(margin, around, layers):
    side = CELL + margin * (2 if around else 1)
    at = 0 if around else -margin / 2
    return [box(at, at, z0, side, side, z1 - z0, color, 0) for z0, z1, color in layers]


class Grass:
    folder, looks, floor, surface = "grass", 4, TURF, TURF

    @staticmethod
    def mass(margin=0, around=False):
        return slab(margin, around, [(0, SOIL_TOP, SOIL), (SOIL_TOP, TURF, GRASS_TOP)])

    @staticmethod
    def edges():
        rnd = random.Random(7)
        out = []
        for along in (rnd.uniform(-50, -20), rnd.uniform(5, 45)):
            out += clump(rnd, HALF + rnd.uniform(-4, 4), along)        # across the x edge
        for along in (rnd.uniform(-45, -10), rnd.uniform(15, 50)):
            out += clump(rnd, along, HALF + rnd.uniform(-4, 4))        # across the y edge
        out += clump(rnd, HALF + rnd.uniform(-3, 3), HALF + rnd.uniform(-3, 3))  # on the corner
        for face in ("+x", "+y"):
            out.append(drip(face, HALF + rnd.uniform(-3, 3), rnd.uniform(14, 20),
                            rnd.choice((10, 16, 22)), SOIL_TOP, GRASS_TOP))
        return out

    @staticmethod
    def inside(seed):
        rnd = random.Random(seed)
        out = []
        for cx, cy in scatter(rnd, rnd.choice((5, 6, 7)), 22, 26):
            out += clump(rnd, cx, cy)
        out += face_drips(rnd, SOIL_TOP, GRASS_TOP, (6, 9, 12, 16, 20, 24))
        return out + face_stones(rnd, 3, 6, SOIL_TOP - 24, (ROCK,))


GRASS_SEEDS = (11, 23, 37, 52)    # the inside of each grass look (the paths borrow the first)


class Ground:
    folder, looks, floor, surface = "ground", 3, GROUND, GROUND

    @staticmethod
    def mass(margin=0, around=False):
        return slab(margin, around, [(0, GROUND, SOIL)])

    @staticmethod
    def clods(rnd, cx, cy):
        out = [lump(cx, cy, rnd.choice((84, 85)), rnd.choice((12, 15, 18)), SOIL_DARK,
                    stretch=(rnd.uniform(1, 1.4), rnd.uniform(1, 1.4)))]
        if rnd.random() < 0.6:
            out.append(lump(cx + rnd.uniform(-10, 10), cy + rnd.uniform(-10, 10), 83,
                            rnd.choice((7, 9)), SOIL))
        return out

    @staticmethod
    def edges():
        rnd = random.Random(8)
        out = []
        for along in (rnd.uniform(-48, -16), rnd.uniform(10, 46)):
            out += Ground.clods(rnd, HALF + rnd.uniform(-3, 3), along)
        for along in (rnd.uniform(-46, -12), rnd.uniform(14, 48)):
            out += Ground.clods(rnd, along, HALF + rnd.uniform(-3, 3))
        return out

    @staticmethod
    def inside(seed):
        rnd = random.Random(seed)
        out = []
        for cx, cy in scatter(rnd, rnd.choice((4, 5)), 20, 28):
            out += Ground.clods(rnd, cx, cy)
        for cx, cy in scatter(rnd, rnd.choice((3, 4)), 12, 14):
            out.append(lump(cx, cy, rnd.choice((83, 84)), rnd.choice((6, 8, 9)), rnd.choice((ROCK, ROCK_DARK))))
        out += face_stones(rnd, 3, 8, GROUND - 18, (ROCK, ROCK_DARK))
        for face in ("+x", "+y"):       # darker clods pressed into the faces, rounded by their depth
            for _ in range(3):
                out.append(on_face(face, rnd.uniform(-HALF + 16, HALF - 16), 14, rnd.uniform(10, GROUND - 26),
                                   rnd.choice((14, 18, 22)), rnd.choice((12, 14)), SOIL_DARK, 6))
        return out


class Sand:
    folder, looks, floor, surface = "sand", 3, SAND, SAND

    @staticmethod
    def mass(margin=0, around=False):
        return slab(margin, around, [(0, CRUST, SAND_BODY), (CRUST, SAND, SAND_TOP)])

    @staticmethod
    def ripple(rnd, cx, cy):
        """A low dune ripple: a long soft ridge, running along y like the wind left it."""
        return [lump(cx + dx, cy + dy, 83, 11, SAND_TOP, depth=12, stretch=(1, rnd.uniform(1.8, 2.4)))
                for dx, dy in ((0, 0), (rnd.uniform(-3, 3), rnd.choice((-1, 1)) * rnd.uniform(14, 20)))]

    @staticmethod
    def edges():
        rnd = random.Random(9)
        out = []
        for along in (rnd.uniform(-46, -16), rnd.uniform(12, 46)):
            out += Sand.ripple(rnd, HALF + rnd.uniform(-2, 2), along)
        for along in (rnd.uniform(-44, -14), rnd.uniform(14, 44)):
            out += Sand.ripple(rnd, along, HALF + rnd.uniform(-2, 2))
        for face in ("+x", "+y"):
            out.append(drip(face, HALF + rnd.uniform(-3, 3), rnd.uniform(16, 22), rnd.choice((4, 6)),
                            CRUST, SAND_TOP))
        return out

    @staticmethod
    def inside(seed):
        rnd = random.Random(seed)
        out = []
        for cx, cy in scatter(rnd, rnd.choice((3, 4)), 24, 30):
            out += Sand.ripple(rnd, cx, cy)
        for cx, cy in scatter(rnd, rnd.choice((2, 3)), 14, 20):
            out.append(lump(cx, cy, 83, rnd.choice((6, 7)), rnd.choice((WHITE, ROCK, STONE_SAND)), depth=8))
        out += face_drips(rnd, CRUST, SAND_TOP, (3, 4, 5, 7, 9))
        return out + face_stones(rnd, 2, 8, CRUST - 22, (ROCK, STONE_SAND))


class Path:
    """A grass block with a bed of trodden earth: `mask` says which edges the bed reaches."""
    folder, looks, floor, surface = "path", 16, BED, TURF

    def __init__(self, mask):
        self.mask = mask

    mass = staticmethod(Grass.mass)

    @staticmethod
    def bare():
        """The hard-cube cell under the clay: only as high as the bed, or its lawn-high rim would
        show as a green line along every edge the bed crosses."""
        return slab(0, False, [(0, SOIL_TOP, SOIL), (SOIL_TOP, BED, GRASS_TOP)])

    def bed(self, x, y):
        """Whether the point (in voxels, model axes, margin included) lies in the bed."""
        edge = max(abs(x), abs(y))
        joined = [d for bit, d in DIRECTIONS.items() if self.mask & bit]
        for dx, dy in joined:                                  # runs on into a joined neighbour
            if (x * dx + y * dy) >= HALF and abs(x * dy - y * dx) < STRIP / 2:
                return True
        if edge >= HALF:
            return False
        fade = min(1.0, max(0.0, (HALF - edge) / FADE))
        fray = FRAY * fade * noise(x, y, self.mask)
        if math.hypot(x, y) < BLOB + fray:
            return True
        return any((x * dx + y * dy) >= 0 and abs(x * dy - y * dx) < STRIP / 2 + fray for dx, dy in joined)

    def clear_of_bed(self, boxes):
        """The lumps (tufts) whose footprint stays out of the bed."""
        out = []
        for b in boxes:
            x, y = b["c"][0] / SCALE, b["c"][1] / SCALE
            reach = max(b["h"][0], b["h"][1]) / SCALE + 2
            if b["c"][2] / SCALE > SOIL_TOP and any(
                    self.bed(x + dx * reach, y + dy * reach) for dx, dy in
                    ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1), (.7, .7), (-.7, .7), (.7, -.7), (-.7, -.7))):
                continue
            out.append(b)
        return out

    def stones(self, seed):
        """Patches of darker earth and a few stones, well inside the bed."""
        rnd = random.Random(seed)
        out = []
        deep = [(x, y) for x in range(-HALF + 10, HALF - 10, 4) for y in range(-HALF + 10, HALF - 10, 4)
                if all(self.bed(x + dx, y + dy) for dx in (-9, 0, 9) for dy in (-9, 0, 9))]
        rnd.shuffle(deep)
        picked = []
        for spot in deep:
            if len(picked) >= 2 + bin(self.mask).count("1"):
                break
            if all(abs(spot[0] - a) + abs(spot[1] - b) > 16 for a, b in picked):
                picked.append(spot)
        for n, (x, y) in enumerate(picked):
            if n % 3 == 0:
                out.append(box(x, y, BED - 3, rnd.choice((14, 18)), rnd.choice((12, 16)), 3, EARTH_DARK, 5))
            elif n % 3 == 1:
                size = rnd.choice((8, 10, 12))
                out.append(box(x, y, BED - 2, size * 1.15, size, size * 0.6, rnd.choice((ROCK, ROCK_DARK)), size * 0.4))
            else:
                out.append(box(x, y, BED - 1, 16, 12, 3, STONE_SAND, 4))
        return out

    def carve(self, cells, extra):
        """Sinks the bed into the voxels: the lawn over it goes, the layer under it turns to
        earth, then the stones and patches go on top."""
        out = {}
        for (i, j, k), color in cells.items():
            if self.bed(i + .5, j + .5):
                if k >= BED:
                    continue
                if k >= BED - 4:
                    color = EARTH
            out[(i, j, k)] = color
        out.update(extra)
        return out


def noise(x, y, seed):
    """Smooth deterministic noise in about [−1, 1], over voxels."""
    x, y = x * 4, y * 4
    return (math.sin(x * 0.021 + seed * 1.7) * math.cos(y * 0.017 - seed * 0.9)
            + 0.6 * math.sin((x + y) * 0.043 + seed * 2.3)
            + 0.4 * math.cos((x - y) * 0.061 - seed * 1.1)) / 2.0


# ------------------------------------------------------------------ the model

def wrapped(boxes):
    """The boxes and their copies one cell over in every direction, so a feature that leaves the
    cell through one edge comes back in through the opposite one."""
    step = CELL * SCALE
    return [dict(b, c=(b["c"][0] + dx * step, b["c"][1] + dy * step, b["c"][2]))
            for b in boxes for dx in (-1, 0, 1) for dy in (-1, 0, 1)]


def voxels(path, boxes, around, floor, finish=None):
    """The model over the cell and its margin (behind it, or all round): voxelised, cropped to
    that volume and written; `finish` gets the voxels first (the path carves its bed there).

    The lumps on the surface are mostly buried, so that they come out round; under the surface
    they keep the colour of the mass, or where one crosses an edge its buried half would show
    on the side face as a patch of its colour."""
    side = CELL + MARGIN * (2 if around else 1)
    lo, size = (-HALF - MARGIN, -HALF - MARGIN, 0), (side, side, TOP)
    cells = vox_lib.voxelise([b for b in boxes if not b.get("surface")], SCALE, bake=False)
    for p, c in vox_lib.voxelise([b for b in boxes if b.get("surface")], SCALE, bake=False).items():
        if p[2] >= floor or p not in cells:
            cells[p] = c
    if finish:
        cells = finish(cells)
    cells = vox_lib.shell({p: c for p, c in cells.items() if all(lo[a] <= p[a] < lo[a] + size[a] for a in range(3))})
    vox_lib.write_vox(path, cells, palette=PALETTE, bounds=(lo, size))
    print(f"{os.path.basename(path):34} {size[0]:3} x {size[1]:3} x {size[2]:3}  {len(cells):6} voxels")


def top_mask(floor):
    """The top face on the sprite: the diamond a little under the surface's lowest height (the
    side render rounds the edge itself, which would show a hairline between two blocks) and
    everything above it, at the sprite's size (512 × 427: a tile 512 × 256, a block 170.5 high)."""
    drop = (TOP - floor + 3) / TOP * 170.5       # 3 voxels lower: the edge row is the top's too
    w = SIZE[0]
    mask = Image.new("L", SIZE, 0)
    ImageDraw.Draw(mask).polygon([(0, 0), (w, 0), (w, 128 + drop), (w / 2, 256 + drop), (0, 128 + drop)], fill=255)
    return mask


def render(vox, sprite, style, margin=0, around=False):
    binary = blender()
    tail = [vox, sprite, "--style", style, "--margin", str(margin)] + (["--around"] if around else [])
    command = [binary, "-b", "-P", RENDER, "--"] + tail if binary else [sys.executable, RENDER] + tail
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def jobs():
    """(material, file name, model stem, features, finish) for every sprite."""
    for kind, seeds in ((Grass, GRASS_SEEDS), (Ground, (13, 29, 41)), (Sand, (17, 31, 43))):
        edges = wrapped(kind.edges())
        for n, seed in enumerate(seeds):
            name = "block.png" if n == 0 else f"block_{n + 1}.png"
            yield kind, name, f"terrain_{kind.folder}_{n + 1}", edges + kind.inside(seed), None
    grass_edges = wrapped(Grass.edges())
    for mask in range(16):
        path = Path(mask)
        features = path.clear_of_bed(grass_edges + Grass.inside(GRASS_SEEDS[0] + mask))
        stones = vox_lib.voxelise(path.stones(100 + mask), SCALE, bake=False)
        yield path, f"block_{mask}.png", f"terrain_path_{mask}", features, \
            (lambda cells, path=path, stones=stones: path.carve(cells, stones))


def main():
    only = sys.argv[1:]
    os.makedirs(MODELS, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        bare_png = None
        for kind, name, stem, features, finish in jobs():
            label = f"{kind.folder}/{os.path.splitext(name)[0]}"
            if only and not any(label == o or kind.folder == o for o in only):
                continue
            layers = []
            for around in (False, True):
                model = os.path.join(MODELS, stem + ("_top" if around else "") + ".vox")
                voxels(model, kind.mass(MARGIN, around) + features, around, kind.surface, finish)
                render(model, os.path.join(tmp, "clay.png"), "clay", MARGIN, around)
                layers.append(Image.open(os.path.join(tmp, "clay.png")).convert("RGBA").resize(SIZE, Image.LANCZOS))
            bare_vox, bare_png = os.path.join(tmp, "bare.vox"), os.path.join(tmp, "bare.png")
            write(bare_vox, kind.bare() if hasattr(kind, "bare") else kind.mass(), bounds=tile_volume((1, 1, 1)))
            render(bare_vox, bare_png, "voxel")
            out = Image.open(bare_png).convert("RGBA").resize(SIZE, Image.LANCZOS)
            out.alpha_composite(layers[0])
            top = layers[1].copy()                       # the top render, only inside the top face,
            alpha = Image.composite(top.getchannel("A"), Image.new("L", SIZE, 0), top_mask(kind.floor))
            top.putalpha(alpha)                          # and over the side render, which fills
            out.alpha_composite(top)                     # wherever the top one is see-through
            os.makedirs(os.path.join(ASSETS, kind.folder), exist_ok=True)
            out.save(os.path.join(ASSETS, kind.folder, name))
            print("ok", label)


if __name__ == "__main__":
    main()
