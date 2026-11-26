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
#
# A sheet named `chop_<tool id>` (player_chop.py) is the chop with that tool in the right hand:
# the tool is the voxel model of ../clay/vox_tools.py, built here as a rounded-box mesh and drawn
# with the skin; it is held where the right arm's hand is, pointing where player_chop.tool_dir
# says. Those sheets are drawn in a window big enough for a tool swung overhead and out in front,
# then cropped to what any cell uses (`fit_sheet`), which also rewrites the sheet's sidecar.
import json
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
sys.path.insert(0, os.path.join(HERE, "..", "clay"))     # vox_tools.py
OUT = os.path.join(HERE, "..", "..", "..", "lib", "painted")
MODEL = os.path.join(HERE, "player_model", "model.npz")
SIDECARS = os.path.join(HERE, "..", "..", "..", "lib", "assets", "player-16")
CANVAS_TOP = -341
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
INSIDE_SHADE = 0.62                                  # the inside of the skin: its colour, shaded
FRONT_SIGN = 1.0                 # set by which way the model's triangles wind on screen
ARM_LIMIT = math.radians(30)     # how far an arm swings from the body before it is eased
ARM_SHARE = 0.12                 # and how much of the swing past that is kept
# The final monkey's legs are short under a deep belly: tucked as far as the boxes tuck them
# (the flip, the jump's apex) they sink into it and vanish, so their swing is eased the same way.
LEG_LIMIT = math.radians(25)
LEG_SHARE = 0.15

# The window the chop sheets are drawn in (canvas x, y, w, h) before they are fitted, and the
# pixels kept around what the cells use.
CHOP_WINDOW = (188, 131, 648, 640)
FIT_MARGIN = 3
TOOL_STEPS = 6          # divisions along each edge of a tool box's faces
HAND_BAND = 0.3         # the arm's lowest share is the hand, where the fist closes on the handle

_cloud = None
_tools = {}


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
        # A model whose skin is not fused anywhere it bends (the final monkey's arms were
        # modelled away from the body) says so with stretch = 0: no triangle is a web there,
        # and dropping the ones a swing stretches only opens holes in the legs.
        stretch = float(d["stretch"]) if "stretch" in d.files else STRETCH
        _cloud = (v, d["n"].astype(np.float32), d["c"].astype(np.float32) / 255,
                  d["w"].astype(np.float32) / 255, f, longest_edge(v, f) * (stretch or 1e6),
                  d["joints"].astype(float))
    return _cloud


def tool_mesh(tool_id):
    """The tool `tool_id` of vox_tools.py as a mesh in its own frame (handle up the z axis from
    its butt, in figure units): vertices, normals, colours (0..1) and triangles, each box a
    rounded one sampled on its subdivided cube."""
    if tool_id in _tools:
        return _tools[tool_id]
    import vox_tools
    k = TOOL_STEPS
    grid = np.linspace(-1.0, 1.0, k + 1)
    verts, norms, colours, faces = [], [], [], []
    for box in vox_tools.TOOLS[tool_id]():
        h = np.array(box["h"], float)
        r = min(box["r"], *h) * 0.98
        colour = np.array([int(box["color"][i:i + 2], 16) / 255 for i in (1, 3, 5)], np.float32)
        for axis in range(3):
            for sign in (-1.0, 1.0):
                a, b = [i for i in range(3) if i != axis]
                u, w = np.meshgrid(grid, grid, indexing="ij")
                q = np.zeros((k + 1, k + 1, 3))
                q[..., axis], q[..., a], q[..., b] = sign, u, w
                q = (q * h).reshape(-1, 3)
                inner = np.clip(q, -(h - r), h - r)
                d = q - inner
                n = d / np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)
                base = sum(len(x) for x in verts)
                verts.append(inner + r * n + np.array(box["c"], float))
                norms.append(n)
                colours.append(np.tile(colour, (len(q), 1)))
                for i in range(k):
                    for j in range(k):
                        p0 = base + i * (k + 1) + j
                        faces += [(p0, p0 + 1, p0 + k + 1), (p0 + 1, p0 + k + 2, p0 + k + 1)]
    mesh = (np.concatenate(verts).astype(np.float32), np.concatenate(norms).astype(np.float32),
            np.concatenate(colours), np.array(faces, np.int64))
    _tools[tool_id] = mesh
    return mesh


def hand_rest():
    """Where the right hand rests in the model: the middle of the lowest part of the +y arm."""
    p, _, _, w, _, _, _ = cloud()
    arm = p[w[:, 2] > 0.5]
    low = arm[arm[:, 2] < arm[:, 2].min() + HAND_BAND * np.ptp(arm[:, 2])]
    return low.mean(axis=0)


def held(tool_id, turn, shift, direction, yaw):
    """The tool's vertices and normals in the figure's world: gripped where the arm's own turn and
    shift carry the rest hand, its handle pointing along `direction` (before the facing `yaw`)."""
    import vox_tools
    v, n, colour, faces = tool_mesh(tool_id)
    grip = hand_rest() @ turn.T + shift
    c, s = math.cos(yaw), math.sin(yaw)
    z = np.array([direction[0] * c - direction[1] * s, direction[0] * s + direction[1] * c, direction[2]])
    y = np.array([-s, c, 0.0])
    x = np.cross(y, z)
    y = np.cross(z, x)
    frame = np.stack([x, y, z], axis=1).astype(np.float32)
    at = (v - np.array([0, 0, vox_tools.GRIP * 4], np.float32)) @ frame.T + grip.astype(np.float32)
    return at, n @ frame.T, colour, faces


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


def motions(parts, yaw, ease_arms=False, ease_legs=False):
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
        if (ease_arms and bone in (2, 3)) or (ease_legs and bone in (4, 5)):
            # Turn about the figure's joint, so easing the turn does not move the shoulder.
            joint = o + turn @ (np.array(FIGURE_JOINT[bone], float) - c)
            turn = (eased(turn, body, ARM_LIMIT, ARM_SHARE) if bone in (2, 3)
                    else eased(turn, body, LEG_LIMIT, LEG_SHARE))
            o, c = joint, np.array(FIGURE_JOINT[bone], float)
        figure, model = np.array(FIGURE_JOINT[bone], float), cloud()[6][bone]
        # Where the figure's joint goes, moved to the model's joint as the body carries it.
        at = o + turn @ (figure - c) + body @ (model - figure)
        out.append((turn.astype(np.float32), (at - turn @ model).astype(np.float32)))
    return out


def render(parts, yaw, cell, ease_arms=False, ease_legs=False, tool=None):
    """`tool` is (tool id, handle direction) to put in the right hand, or None."""
    p, n, tint, w, faces, rest_edge, _ = cloud()
    pos = np.zeros_like(p)
    nor = np.zeros_like(n)
    moved = motions(parts, yaw, ease_arms, ease_legs)
    for bone, (turn, shift) in enumerate(moved):
        wb = w[:, bone:bone + 1]
        pos += wb * (p @ turn.T + shift)
        nor += wb * (n @ turn.T)
    skin = len(pos)
    if tool is not None:
        tv, tn, tc, tf = held(tool[0], *moved[2], tool[1], yaw)
        pos = np.concatenate([pos, tv])
        nor = np.concatenate([nor, tn])
        tint = np.concatenate([tint, tc])
        faces = np.concatenate([faces, tf + skin])
        rest_edge = np.concatenate([rest_edge, np.full(len(tf), 1e9, np.float32)])

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
    whole = ~((edge > rest_edge) & (edge > WEB))
    a, b, c = faces[whole, 0], faces[whole, 1], faces[whole, 2]
    area = ((sx[b] - sx[a]) * (sy[c] - sy[a]) - (sx[c] - sx[a]) * (sy[b] - sy[a])) / 2
    front = area * FRONT_SIGN > 0
    if tool is not None:
        # The tool's triangles wind their own way: they face the camera when their normals do.
        mine = np.nonzero(whole)[0] >= len(faces) - len(tf)
        facing = (nor[a] + nor[b] + nor[c]) @ VIEW.astype(np.float32) > 0
        front = np.where(mine, facing, front)
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
    # The inside of the skin, where a gap opens, in its own colour in deep shade: a dark crease,
    # not a black hole.
    shaded[inner] = colour[inner] * INSIDE_SHADE

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
    tool = None
    if name.startswith("chop_"):
        import player_chop
        cell = (CHOP_WINDOW[0], CHOP_WINDOW[1] + CANVAS_TOP, CHOP_WINDOW[2], CHOP_WINDOW[3])
        tool = (name[len("chop_"):], player_chop.tool_dir(column, name))
    parts, yaw = poses_of("chop" if tool else name, frames)(row, column)
    return row, column, render(parts, yaw, cell, ease_arms=name == "idle", ease_legs=name in ("flip", "jump"),
                               tool=tool)


def fit_sheet(name, sheet, frames, rows, w, h):
    """Crops a freshly drawn chop sheet to the part of its cell any pose uses, and writes the
    sidecar (cell and ink) to match. Returns the cropped sheet."""
    box = None
    for row in range(rows):
        for column in range(frames):
            cell = sheet.crop((column * w, row * h, (column + 1) * w, (row + 1) * h))
            found = cell.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
            if found:
                box = found if box is None else (min(box[0], found[0]), min(box[1], found[1]),
                                                 max(box[2], found[2]), max(box[3], found[3]))
    x0, y0 = max(0, box[0] - FIT_MARGIN), max(0, box[1] - FIT_MARGIN)
    x1, y1 = min(w, box[2] + FIT_MARGIN), min(h, box[3] + FIT_MARGIN)
    fitted = Image.new("RGBA", ((x1 - x0) * frames, (y1 - y0) * rows), (0, 0, 0, 0))
    for row in range(rows):
        for column in range(frames):
            cell = sheet.crop((column * w + x0, row * h + y0, column * w + x1, row * h + y1))
            fitted.paste(cell, (column * (x1 - x0), row * (y1 - y0)))
    wx, wy = CHOP_WINDOW[0], CHOP_WINDOW[1]
    cell = [wx + x0 / OUT_SCALE, wy + y0 / OUT_SCALE, (x1 - x0) / OUT_SCALE, (y1 - y0) / OUT_SCALE]
    path = os.path.join(SIDECARS, name + ".json")
    with open(path, encoding="utf-8") as file:
        data = json.load(file)
    data["cell"] = cell
    data["ink"] = {"x": round((cell[0] - CX) / 1024, 6), "y": round((cell[1] + CANVAS_TOP - CY) / 1024, 6),
                   "width": round(cell[2] / 1024, 6), "height": round(cell[3] / 1024, 6)}
    with open(path, "w", encoding="utf-8") as file:
        json.dump(data, file, indent=2)
        file.write("\n")
    return fitted


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--cell":
        name, row, column, path = sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
        Image.fromarray(render_cell((name, row, column))[2], "RGBA").save(path)
        return
    os.makedirs(OUT, exist_ok=True)
    for name in sys.argv[1:] or ["idle", "walk", "jump", "climb", "flip", "swim"]:
        cell, frames, rows = grid_of(name)
        if name.startswith("chop_"):
            cell = CHOP_WINDOW
        w, h = round(cell[2] * OUT_SCALE), round(cell[3] * OUT_SCALE)
        sheet = Image.new("RGBA", (w * frames, h * rows), (0, 0, 0, 0))
        jobs = [(name, r, c) for r in range(rows) for c in range(frames)]
        with ProcessPoolExecutor(max_workers=4) as pool:
            for row, column, pixels in pool.map(render_cell, jobs, chunksize=4):
                sheet.paste(Image.fromarray(pixels, "RGBA"), (column * w, row * h))
        if name.startswith("chop_"):
            sheet = fit_sheet(name, sheet, frames, rows, w, h)
        path = os.path.join(OUT, "player-16_%s.png" % name)
        sheet.save(path, optimize=True)
        print("ok", os.path.relpath(path, HERE), sheet.size, "%d cells of %dx%d" % (len(jobs), w, h), flush=True)


if __name__ == "__main__":
    main()
