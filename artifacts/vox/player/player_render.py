# player_render.py — the player's sheets as soft, lit 3D renders instead of flat voxel facets.
#
# The monkey of monkey.py is a handful of rounded boxes, and every sheet generator
# (player_walk.py, player_idle.py, player_jump.py, player_climb.py, player_flip.py,
# player_swim.py, player_gather.py) already poses those boxes for each cell. This takes the very same poses and
# draws them as one smooth clay toy: the boxes are blended into each other where they meet, lit
# by one warm sun from the upper right with soft occlusion in the creases, and given a tuft of
# hair on the head. The look was approved by Alex on 2026-11-15 from an AI repaint of one pose;
# drawing it here instead keeps every frame the same character in exactly the pose the sheet
# asks for, at no cost per frame.
#
# The JSON sidecars beside the sheets are the source of the grid geometry (`cell`, `frames`,
# `facings`, `poses`) and of the poses; this writes one PNG per sheet, a plain grid of cells
# with no gap, that `lib/scripts/rasterize.py` cuts:
#
#   python3 player_render.py [sheet ...]      -> ../../../lib/painted/player-16_<sheet>.png
#   python3 player_render.py --cell idle 11 0 out.png      one cell, for looking at
#
# Requires numpy and Pillow, and shapely only because the pose modules import it.
import math
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np
from PIL import Image

import monkey
import player_walk
import player_idle
import player_jump
import player_climb
import player_flip
import player_swim
import player_gather
import player_chop
from iso_lib import CX, CY

HERE = os.path.dirname(os.path.abspath(__file__))
SHEETS = os.path.join(HERE, "..", "..", "..", "lib", "assets", "player-16")
OUT = os.path.join(HERE, "..", "..", "..", "lib", "painted")
CANVAS_TOP = -341
OUT_SCALE = 0.5         # pixels per canvas unit in the PNG: 1.6 times what the atlas stores
SUPER = 2               # rays per pixel side, averaged down: the edge's anti-aliasing

BLEND = 1.6             # units over which two parts melt into each other
STEPS = 56
HIT = 0.25              # units from the surface at which a ray has arrived

# Where the light comes from, in the figure's world (x right-down, y left-down, z up on screen):
# the game's sun, upper right, so +x faces are bright, +y faces shaded and tops brightest.
SUN = np.array([0.58, -0.30, 0.76])
SUN = SUN / np.linalg.norm(SUN)
VIEW = (np.array([1.0, 1.0, 1.0]) / math.sqrt(3)).astype(np.float32)
HALF = (SUN + VIEW) / np.linalg.norm(SUN + VIEW)

# The approved colours, by the part colours monkey.py names: (albedo, gloss, shine power).
MATERIAL = {
    monkey.FUR: ((0.640, 0.365, 0.215), 0.10, 18.0),
    monkey.DARK: ((0.520, 0.285, 0.165), 0.10, 18.0),
    monkey.FACE: ((0.985, 0.820, 0.630), 0.12, 22.0),
    monkey.SHADE: ((0.900, 0.700, 0.500), 0.10, 22.0),
    monkey.EYE: ((0.085, 0.068, 0.066), 0.16, 26.0),
    monkey.SHINE: ((1.0, 1.0, 1.0), 0.0, 1.0),
}
TUFT = ((0.560, 0.305, 0.175), 0.10, 18.0)
# The tuft of hair: three small locks on the top of the head, in the head's own frame
# (offset from the head's centre, half sizes, rounding).
LOCKS = [((8, 0, 78), (9, 8, 17), 8), ((3, -13, 72), (8, 8, 12), 7.5), ((1, 13, 72), (8, 8, 12), 7.5)]
HEAD_HALF = (76, 84, 66)
KNUCKLES = (6, 18, 4)    # left out: at this softness they read as a plate stuck to the hand
PLATES = {(30, 62, 54), (32, 50, 44)}
PROUD = 5


def poses_of(name, frames):
    """For sheet `name`, a function (row, column) -> (parts, yaw) from its own generator."""
    def walk(r, c):
        yaw = player_walk.facing_yaw(r)
        return (player_walk.pose(0.0, False) if c == 0 else player_walk.pose((c - 1) / player_walk.FRAMES, True)), yaw

    def idle(r, c):
        yaw = player_walk.facing_yaw(r)
        return player_idle.pose(c / player_idle.FRAMES, yaw), yaw

    def by_index(module):
        return lambda r, c: (module.pose(c), player_walk.facing_yaw(r))

    return {"walk": walk, "idle": idle, "jump": by_index(player_jump), "climb": by_index(player_climb),
            "flip": by_index(player_flip), "swim": by_index(player_swim),
            "gather": by_index(player_gather), "chop": by_index(player_chop)}[name]


def boxes(parts, yaw):
    """Every part as a posed rounded box: centre, axes (columns), half sizes, rounding, material.

    A Part only offers `world` and `normal`, which are a rigid motion, so its frame is read
    back from them: where the centre lands and where the three axes point.
    """
    centre, axes, half, rounding, material = [], [], [], [], []
    for part, lift in parts:
        o = np.array(part.world((0, 0, 0), yaw, lift), float)
        frame = np.array([part.normal(e, yaw) for e in ((1, 0, 0), (0, 1, 0), (0, 0, 1))], float).T
        if part.color == monkey.SHADE and tuple(part.h) == KNUCKLES:
            continue
        # The light plates (face mask, belly) stand a little proud of the fur, so they read
        # as raised pads with a crease round them and not as paint on the same surface.
        proud = PROUD if part.color == monkey.FACE and tuple(part.h) in PLATES else 0
        entries = [((proud, 0, 0), part.h, part.r, MATERIAL[part.color])]
        if part.color == monkey.FUR and tuple(part.h) == HEAD_HALF:
            entries += [(at, h, r, TUFT) for at, h, r in LOCKS]
        for at, h, r, mat in entries:
            centre.append(o + frame @ np.array(at, float))
            axes.append(frame)
            half.append(h)
            rounding.append(min(r, *h))
            material.append(mat)
    return (np.array(centre, np.float32), np.array(axes, np.float32), np.array(half, np.float32),
            np.array(rounding, np.float32), material)


def distances(p, scene):
    """Distance from each point of `p` (N, 3) to each box: (N, M)."""
    centre, axes, half, rounding, _ = scene
    local = np.einsum("nmi,mij->nmj", p[:, None, :] - centre[None, :, :], axes)
    q = np.abs(local) - (half - rounding[:, None])[None, :, :]
    outside = np.sqrt((np.maximum(q, 0.0) ** 2).sum(axis=2))
    inside = np.minimum(q.max(axis=2), 0.0)
    return outside + inside - rounding[None, :]


def surface(p, scene):
    """The blended distance to the whole figure: a smooth minimum, so parts melt together."""
    d = distances(p, scene)
    low = d.min(axis=1)
    return low - BLEND * np.log(np.exp(-(d - low[:, None]) / BLEND).sum(axis=1)), d


def render(parts, yaw, cell):
    """One cell as an RGBA array, `cell` being its window (x, y, w, h) in canvas units."""
    scene = boxes(parts, yaw)
    x0, y0, w, h = cell
    out_w, out_h = round(w * OUT_SCALE), round(h * OUT_SCALE)
    nx, ny = out_w * SUPER, out_h * SUPER
    u = x0 + (np.arange(nx) + 0.5) * w / nx - CX
    v = y0 + (np.arange(ny) + 0.5) * h / ny - CY
    uu, vv = np.meshgrid(u, v)
    # The point of the plane through the origin, square to the view, that lands on (u, v):
    # screen x = x - y, screen y = (x + y) / 2 - z.
    base = (uu[..., None] / 2) * np.array([1.0, -1.0, 0.0]) + vv[..., None] * np.array([1 / 3, 1 / 3, -2 / 3])
    base = base.reshape(-1, 3).astype(np.float32)
    reach = (scene[0] @ VIEW)
    radius = np.linalg.norm(scene[2], axis=1)
    near, far = (reach + radius).max() + 4, (reach - radius).min() - 4
    # Only the rays that pass near some part are worth marching.
    across = base[:, None, :] - (scene[0] - np.outer(reach, VIEW))[None, :, :]
    live = np.where((np.linalg.norm(across, axis=2) < radius[None, :] + 2).any(axis=1))[0]
    depth = np.full(len(live), near, np.float32)
    hit = np.zeros(len(live), bool)
    going = np.arange(len(live))
    for _ in range(STEPS):
        if not len(going):
            break
        p = base[live[going]] + depth[going, None] * VIEW
        d, _ = surface(p, scene)
        arrived = d < HIT
        hit[going[arrived]] = True
        depth[going] -= np.maximum(d, HIT * 0.5) * 0.92
        going = going[~arrived & (depth[going] > far)]
    rays = live[hit]
    p = base[rays] + depth[hit, None] * VIEW
    d0, each = surface(p, scene)
    which = each.argmin(axis=1)
    # The surface's normal, from how the distance changes around the point.
    e = 0.7
    corners = np.array([[1, -1, -1], [-1, -1, 1], [-1, 1, -1], [1, 1, 1]], float)
    n = sum(k[None, :] * surface(p + e * k, scene)[0][:, None] for k in corners)
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-6)
    # Occlusion: how crowded the space just off the surface is.
    occlusion = np.ones(len(p))
    for reach_out, weight in ((4.0, 0.50), (11.0, 0.42), (26.0, 0.30)):
        occlusion -= weight * np.clip(1 - surface(p + n * reach_out, scene)[0] / reach_out, 0, 1)
    occlusion = np.clip(occlusion, 0.0, 1.0)

    albedo = np.array([m[0] for m in scene[4]])[which]
    gloss = np.array([m[1] for m in scene[4]])[which]
    power = np.array([m[2] for m in scene[4]])[which]
    lit = n @ SUN
    # Form first: a clear lit side and a clear shaded side, softened where the light wraps.
    wrap = np.clip((lit + 0.35) / 1.35, 0, 1) ** 1.15
    sky = 0.5 + 0.5 * n[:, 2]
    # Shade is a deeper, warmer tone of the same colour rather than a grey veil over it.
    deep = albedo ** 1.7 * np.array([0.92, 0.84, 0.80])
    dark = deep * (0.74 + 0.30 * sky[:, None])
    bright = albedo * 1.10
    colour = dark + (bright - dark) * wrap[:, None]
    colour *= (0.40 + 0.60 * occlusion[:, None] ** 1.3)
    # A broad soft sheen and a tighter highlight, like polished clay.
    facing = np.clip(n @ HALF, 0, 1)
    sheen = facing ** 6 * 0.10 + facing ** power * gloss * 2.2
    colour += (sheen * occlusion)[:, None] * np.array([1.0, 0.96, 0.90])
    rim = np.clip(1 - n @ VIEW, 0, 1) ** 2.5 * np.clip(lit, 0, 1) * 0.16
    colour += rim[:, None] * (0.5 + 0.5 * albedo)
    white = np.array([m[0] == (1.0, 1.0, 1.0) for m in scene[4]])[which]
    colour[white] = 1.0

    image = np.zeros((ny * nx, 4))
    image[rays, :3] = np.clip(colour, 0, 1)
    image[rays, 3] = 1.0
    image = image.reshape(ny, nx, 4)
    # Average the rays of each pixel; colour is weighted by coverage so edges do not darken.
    cover = image[:, :, 3].reshape(out_h, SUPER, out_w, SUPER).mean(axis=(1, 3))
    rgb = (image[:, :, :3] * image[:, :, 3:]).reshape(out_h, SUPER, out_w, SUPER, 3).mean(axis=(1, 3))
    rgb = rgb / np.maximum(cover[:, :, None], 1e-6)
    return (np.dstack([rgb, cover]) * 255).round().astype(np.uint8)


def grid_of(name):
    """The cell size, column count and row count of a player sheet, from its JSON sidecar
    (cell edge sizes, frame count, facings order). The sheet itself is painted from the
    3D model, but this geometry is what the cutouts and the atlas both share."""
    with open(os.path.join(SHEETS, name + ".json"), encoding="utf-8") as file:
        sheet = json.load(file)
    x, y, w, h = sheet["cell"]
    return (x, y + CANVAS_TOP, w, h), sheet["frames"], len(sheet["facings"])


def render_cell(job):
    name, row, column = job
    cell, frames, _ = grid_of(name)
    parts, yaw = poses_of(name, frames)(row, column)
    return row, column, render(parts, yaw, cell)


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--cell":
        name, row, column, path = sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
        Image.fromarray(render_cell((name, row, column))[2], "RGBA").save(path)
        return
    os.makedirs(OUT, exist_ok=True)
    for name in sys.argv[1:] or ["idle", "walk", "jump", "climb", "flip", "swim"]:
        cell, frames, rows = grid_of(name)
        w, h = round(cell[2] * OUT_SCALE), round(cell[3] * OUT_SCALE)
        sheet = Image.new("RGBA", (w * frames, h * rows), (0, 0, 0, 0))
        jobs = [(name, r, c) for r in range(rows) for c in range(frames)]
        with ProcessPoolExecutor() as pool:
            for row, column, pixels in pool.map(render_cell, jobs, chunksize=2):
                sheet.paste(Image.fromarray(pixels, "RGBA"), (column * w, row * h))
        path = os.path.join(OUT, "player-16_%s.png" % name)
        sheet.save(path, optimize=True)
        print("ok", os.path.relpath(path, HERE), sheet.size, "%d cells of %dx%d" % (len(jobs), w, h), flush=True)


if __name__ == "__main__":
    main()
