# player_model.py — the player's sheets drawn from a 3D model of the monkey.
#
# The model is a single textured mesh in a rest pose (standing, arms at its sides), kept with
# a colour and a weight for each of six bones per vertex: body, head, two arms, two legs
# (`player_model/model.npz`, made from the GLB by `player_model/build.py`). The sheet
# generators (player_walk.py, player_idle.py, …) already pose monkey.py's boxes for every
# cell; here each bone takes the motion of the box that stands for it — the body box, the
# head box, each arm's and each thigh's — turning about the model's own joints, and the skin
# is carried along, blended across the joints so it bends instead of tearing. It is then
# drawn through the game's camera with one sun from the upper right.
#
# The model has no tail, so neither do the sheets. The SVG sheets stay the source of each
# sheet's grid and poses; this writes one PNG per sheet for `lib/scripts/rasterize.py` to cut.
#
#   python3 player_model.py [sheet ...]      -> ../../../lib/painted/player-16_<sheet>.png
#   python3 player_model.py --cell idle 11 0 out.png
import math
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np
from PIL import Image

import monkey
from iso_lib import CX, CY
from player_render import poses_of, grid_of

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "..", "lib", "painted")
MODEL = os.path.join(HERE, "player_model", "model.npz")
DENSITY = 3.0           # points drawn per sample of screen a triangle covers
OUT_SCALE = 0.5         # pixels per canvas unit in the PNG: 1.6 times what the atlas stores
SUPER = 3               # samples per pixel side, averaged down

SUN = np.array([0.58, -0.30, 0.76]); SUN = SUN / np.linalg.norm(SUN)
VIEW = np.array([1.0, 1.0, 1.0]) / math.sqrt(3)
HALF = (SUN + VIEW) / np.linalg.norm(SUN + VIEW)

# The joint each bone turns about in monkey.py's figure, where the boxes turn; the model's
# own shoulders, hips and neck come with it (`joints` in model.npz). Bones: body, head,
# arm +y, arm -y, leg +y, leg -y.
FIGURE_JOINT = [(0, 0, 90), (0, 0, monkey.HEAD), (0, 58, 132), (0, -58, 132), (0, 38, 48), (0, -38, 48)]

STRETCH = 1.7                    # times its own size at which a triangle counts as a web
WEB = 4.0                        # and the least length, in figure units, it must reach
INSIDE = np.array([0.30, 0.165, 0.10], np.float32)   # the inside of the skin: fur in deep shade
FRONT_SIGN = 1.0                 # set by which way the model's triangles wind on screen
ARM_LIMIT = math.radians(30)     # how far an arm swings from the body before it is eased
ARM_SHARE = 0.12                 # and how much of the swing past that is kept

_cloud = None


def longest_edge(v, f):
    """The longest side of every triangle."""
    a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
    return np.maximum(np.maximum(np.linalg.norm(b - a, axis=1), np.linalg.norm(c - b, axis=1)),
                      np.linalg.norm(a - c, axis=1))


def cloud():
    global _cloud
    if _cloud is None:
        d = np.load(MODEL)
        v, f = d["v"].astype(np.float32), d["f"]
        _cloud = (v, d["n"].astype(np.float32), d["c"].astype(np.float32) / 255,
                  d["w"].astype(np.float32) / 255, f, longest_edge(v, f), d["joints"].astype(float))
    return _cloud


def bone_of(part):
    """Which bone a box of monkey.py stands for, or None."""
    h = tuple(round(v) for v in part.h)
    side = 2 if part.c[1] > 0 else 3
    if part.color == monkey.FUR and h[0] == 76:
        return 1
    if part.color == monkey.FUR and h[1] >= 60 and h[0] < 70:
        return 0
    if h == (22, 22, 42):
        return side
    if h == (30, 30, 26):
        return side + 2
    return None


def eased(turn, body, limit, share):
    """`turn` with its swing away from `body` eased: past `limit` radians only `share` of it.

    The model's head is wider than monkey.py's, so an arm lifted as far as the boxes lift it
    (the idle dance, 150 degrees out to the side) would go into the ear.
    """
    swing = turn @ body.T
    angle = math.acos(max(-1.0, min(1.0, (np.trace(swing) - 1) / 2)))
    if angle <= limit:
        return turn
    axis = np.array([swing[2, 1] - swing[1, 2], swing[0, 2] - swing[2, 0], swing[1, 0] - swing[0, 1]])
    axis /= max(np.linalg.norm(axis), 1e-9)
    a = limit + (angle - limit) * share
    k = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]])
    return (np.eye(3) + math.sin(a) * k + (1 - math.cos(a)) * (k @ k)) @ body


def motions(parts, yaw, ease_arms=False):
    """For each bone, the turn and shift that take a rest point of the model to the pose."""
    found = {}
    for part, lift in parts:
        bone = bone_of(part)
        if bone is None or bone in found:
            continue
        o = np.array(part.world((0, 0, 0), yaw, lift), float)
        turn = np.array([part.normal(e, yaw) for e in ((1, 0, 0), (0, 1, 0), (0, 0, 1))], float).T
        found[bone] = (turn, o, np.array(part.c, float))
    body = found[0][0]
    out = []
    for bone in range(6):
        turn, o, c = found[bone]
        if ease_arms and bone in (2, 3):
            # Turn about the figure's joint, so easing the turn does not move the shoulder.
            joint = o + turn @ (np.array(FIGURE_JOINT[bone], float) - c)
            turn = eased(turn, body, ARM_LIMIT, ARM_SHARE)
            o, c = joint, np.array(FIGURE_JOINT[bone], float)
        figure, model = np.array(FIGURE_JOINT[bone], float), cloud()[6][bone]
        # Where the figure's joint goes, moved to the model's joint as the body carries it.
        at = o + turn @ (figure - c) + body @ (model - figure)
        out.append((turn.astype(np.float32), (at - turn @ model).astype(np.float32)))
    return out


def render(parts, yaw, cell, ease_arms=False):
    p, n, tint, w, faces, rest_edge, _ = cloud()
    pos = np.zeros_like(p)
    nor = np.zeros_like(n)
    for bone, (turn, shift) in enumerate(motions(parts, yaw, ease_arms)):
        wb = w[:, bone:bone + 1]
        pos += wb * (p @ turn.T + shift)
        nor += wb * (n @ turn.T)

    x0, y0, cw, ch = cell
    out_w, out_h = round(cw * OUT_SCALE), round(ch * OUT_SCALE)
    nx, ny = out_w * SUPER, out_h * SUPER
    sx = (CX + pos[:, 0] - pos[:, 1] - x0) * nx / cw
    sy = (CY + (pos[:, 0] + pos[:, 1]) / 2 - pos[:, 2] - y0) * ny / ch
    depth = pos @ VIEW.astype(np.float32)

    # The skin is drawn as points, each triangle getting as many as the screen it covers
    # asks for: a triangle stretched across a bent joint is filled like any other, so the
    # skin has no pinholes however far a limb swings. Triangles facing away are left out.
    #
    # The mesh is one fused skin: where a hand rests on the hip the two are joined by
    # triangles, which a lifted arm would pull into a web. A triangle stretched far past its
    # own size is such a bridge and is dropped; what shows through the gap is the inside of
    # the skin, drawn dark (below), which reads as the shade of a crease.
    edge = longest_edge(pos, faces)
    whole = ~((edge > rest_edge * STRETCH) & (edge > WEB))
    a, b, c = faces[whole, 0], faces[whole, 1], faces[whole, 2]
    area = ((sx[b] - sx[a]) * (sy[c] - sy[a]) - (sx[c] - sx[a]) * (sy[b] - sy[a])) / 2
    front = area * FRONT_SIGN > 0
    inner = ~front
    area = np.abs(area)
    count = np.clip(np.ceil(area * DENSITY), 1, 4000).astype(np.int64)
    which = np.repeat(np.arange(len(a)), count)
    rng = np.random.default_rng(11)
    u, v = rng.random(len(which), dtype=np.float32), rng.random(len(which), dtype=np.float32)
    over = u + v > 1
    u[over], v[over] = 1 - u[over], 1 - v[over]
    a, b, c, inner = a[which], b[which], c[which], inner[which]
    t = 1 - u - v

    def across(values):
        if values.ndim == 1:
            return t * values[a] + u * values[b] + v * values[c]
        return t[:, None] * values[a] + u[:, None] * values[b] + v[:, None] * values[c]

    px, py = np.floor(across(sx)).astype(np.int32), np.floor(across(sy)).astype(np.int32)
    inside = (px >= 0) & (px < nx) & (py >= 0) & (py < ny)
    a, b, c, t, u, v, px, py, inner = (k[inside] for k in (a, b, c, t, u, v, px, py, inner))
    depth = across(depth)
    nor = across(nor)
    nor /= np.maximum(np.linalg.norm(nor, axis=1, keepdims=True), 1e-6)
    colour = across(tint)

    lit = nor @ SUN.astype(np.float32)
    wrap = np.clip((lit + 0.45) / 1.45, 0, 1) ** 1.1
    sky = 0.5 + 0.5 * nor[:, 2:3]
    dark = colour ** 1.35 * np.array([0.80, 0.72, 0.70], np.float32) * (0.80 + 0.25 * sky)
    shaded = dark + (colour * 1.12 - dark) * wrap[:, None]
    glance = np.clip(nor @ HALF.astype(np.float32), 0, 1)
    shaded += (glance ** 10 * 0.07 + glance ** 60 * 0.10)[:, None]
    shaded = np.clip(shaded, 0, 1)
    shaded[inner] = INSIDE

    def layer(mine):
        """The points of `mine` on the sample grid, the nearest winning, pinholes closed."""
        # Written far to near, so the last write to a sample is the nearest point.
        order = np.argsort(depth[mine], kind="stable")
        index = (py[mine] * nx + px[mine])[order]
        image = np.zeros((ny * nx, 3), np.float32)
        cover = np.zeros(ny * nx, np.float32)
        deep = np.full(ny * nx, -1e9, np.float32)
        image[index] = shaded[mine][order]
        cover[index] = 1.0
        deep[index] = depth[mine][order]
        image, cover, deep = image.reshape(ny, nx, 3), cover.reshape(ny, nx), deep.reshape(ny, nx)
        # An empty sample with covered neighbours on three sides takes the nearest of them.
        for _ in range(2):
            pad_c, pad_d = np.pad(cover, 1), np.pad(deep, 1, constant_values=-1e9)
            pad_i = np.pad(image, ((1, 1), (1, 1), (0, 0)))
            around = [(pad_c[1 + dy:ny + 1 + dy, 1 + dx:nx + 1 + dx], pad_i[1 + dy:ny + 1 + dy, 1 + dx:nx + 1 + dx],
                       pad_d[1 + dy:ny + 1 + dy, 1 + dx:nx + 1 + dx]) for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0))]
            depths = np.stack([k[2] for k in around])
            fill = (cover == 0) & (sum(k[0] for k in around) >= 3)
            chosen = np.choose(np.argmax(depths, axis=0)[..., None], [k[1] for k in around])
            image[fill] = chosen[fill]
            deep[fill] = depths.max(axis=0)[fill]
            cover[fill] = 1.0
        return image, cover

    # The skin's outside over its inside: the inside only shows where the outside has a gap.
    image, cover = layer(~inner)
    under, under_cover = layer(inner)
    gap = (cover == 0) & (under_cover > 0)
    image[gap] = under[gap]
    cover[gap] = 1.0
    alpha = cover.reshape(out_h, SUPER, out_w, SUPER).mean(axis=(1, 3))
    rgb = (image * cover[..., None]).reshape(out_h, SUPER, out_w, SUPER, 3).mean(axis=(1, 3))
    rgb = rgb / np.maximum(alpha[..., None], 1e-6)
    return (np.dstack([rgb, alpha]) * 255).round().astype(np.uint8)


def render_cell(job):
    name, row, column = job
    cell, frames, _ = grid_of(name)
    parts, yaw = poses_of(name, frames)(row, column)
    return row, column, render(parts, yaw, cell, ease_arms=name == "idle")


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
        with ProcessPoolExecutor(max_workers=4) as pool:
            for row, column, pixels in pool.map(render_cell, jobs, chunksize=4):
                sheet.paste(Image.fromarray(pixels, "RGBA"), (column * w, row * h))
        path = os.path.join(OUT, "player-16_%s.png" % name)
        sheet.save(path, optimize=True)
        print("ok", os.path.relpath(path, HERE), sheet.size, "%d cells of %dx%d" % (len(jobs), w, h), flush=True)


if __name__ == "__main__":
    main()
