#!/usr/bin/env python3
# tanuki_sheets.py — the merchant's sprite sheets, posed and rendered from the image-to-3D model.
#
#   python3 artifacts/vox/merchant/tanuki_sheets.py MODEL.glb --debug      parts + one pose, to check the split
#   python3 artifacts/vox/merchant/tanuki_sheets.py MODEL.glb --preview    one facing of every pose
#   python3 artifacts/vox/merchant/tanuki_sheets.py MODEL.glb              the two sheets → lib/painted/
#
# MODEL.glb is the Hunyuan 3D tanuki, T-pose, already fattened by tanuki_fatten.py (28 MB, kept out
# of git like the player's rigged model). The mesh is cut into rigid parts (head, body, two arms with
# their hands, two legs) at the joints; the arms are shortened and hung at the sides, then each pose
# turns the parts about their joints. Each cell is a clay-lit render of the same model, turned on
# its foot so the sun stays where it is, in the sheet layout of the rabbit and the crab: one row per
# facing (the 16 of PLAYER_FACINGS, east first, counter-clockwise), one column per pose.
#
#   idle  8 poses   a slow breath: the body swells, the head bobs, the arms sway a little
#   walk  8 poses   two strides of four poses: the legs and arms swing, the body bobs
#
# Out: lib/painted/merchant_{idle,walk}.png and lib/assets/merchant/{idle,walk}.json.
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "clay"))
ROOT = os.path.normpath(os.path.join(HERE, "..", "..", ".."))
PAINTED = os.path.join(ROOT, "lib", "painted")
SIDECARS = os.path.join(ROOT, "lib", "assets", "merchant")

FACINGS = [
    "east", "east-north-east", "north-east", "north-north-east", "north", "north-north-west",
    "north-west", "west-north-west", "west", "west-south-west", "south-west", "south-south-west",
    "south", "south-south-east", "south-east", "east-south-east",
]
CELL = (352, 297, 320, 360)          # on the 1x1x1 template canvas, like the rabbit's
RENDER_PERCENT = 50
SAMPLES = 48
HEIGHT_VOXELS = 29.0                 # the voxel merchant stood 29 voxels tall (a kit unit is a voxel)

# the model's measures, in its own units (height 0.846): the joints and the cuts between parts
SHOULDER_X, SHOULDER_Z = 0.19, 0.285
HIP_X, HIP_Z = 0.10, 0.117
ARM_LEN = 0.56                       # the arm is shortened to this share of its length
SIDE_X = 0.19                        # beyond this |x| (between legs and head) the mesh is an arm
HEAD_Z = 0.288                       # the head starts here
ARM_TOP = 0.40                       # the arms (in the T) end below this
LEG_Z = 0.15                         # the legs and feet end here
HANG = math.radians(82)              # how far the arms are turned down from the T


def sheets():
    out = {"idle": [], "walk": []}
    for n in range(8):
        t = n / 8
        out["idle"].append(dict(breathe=math.sin(math.tau * t), swing=0.0, bob=0.0, sway=math.sin(math.tau * t)))
    for n in range(8):
        t = n / 8
        out["walk"].append(dict(breathe=0.0, swing=math.sin(math.tau * t), bob=abs(math.cos(math.tau * t)), sway=0.0))
    return out


def build(path, debug=False):
    """Imports the model, cuts it into parts and returns {name: object or empty}."""
    import bpy
    import bmesh
    from mathutils import Vector

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    body = next(o for o in bpy.context.scene.objects if o.type == "MESH")
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for slot in body.data.materials:                        # clay: no gloss, no metal
        shader = slot.node_tree.nodes.get("Principled BSDF")
        if shader:
            shader.inputs["Metallic"].default_value = 0
            shader.inputs["Roughness"].default_value = 0.7

    def region(face):
        x, y, z = face.calc_center_median()
        if z < LEG_Z:
            return "legR" if x > 0 else "legL"
        if abs(x) > SIDE_X and z < ARM_TOP:
            return "armR" if x > 0 else "armL"
        return "head" if z >= HEAD_Z else "torso"

    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.faces.ensure_lookup_table()
    names = {}
    for f in bm.faces:
        names.setdefault(region(f), []).append(f.index)
    bm.free()

    parts = {}
    for name, idx in names.items():
        piece = body.copy()
        piece.data = body.data.copy()
        bpy.context.scene.collection.objects.link(piece)
        bm = bmesh.new()
        bm.from_mesh(piece.data)
        bm.faces.ensure_lookup_table()
        keep = set(idx)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context="FACES")
        bm.to_mesh(piece.data)
        bm.free()
        piece.name = name
        parts[name] = piece
    fur, paw = limb_colours(body)
    bpy.data.objects.remove(body, do_unlink=True)
    for name in ("armR", "armL", "handR", "handL"):
        if name in parts:
            bpy.data.objects.remove(parts.pop(name), do_unlink=True)
    for s, side in ((1, "R"), (-1, "L")):
        parts["arm" + side] = clean_arm(s, fur, paw)
    return parts


def limb_colours(body):
    """The tawny fur and the dark paw colours, read off the model's own texture at the arms."""
    import bmesh

    image = next(n.image for n in body.data.materials[0].node_tree.nodes if n.type == "TEX_IMAGE")
    w, h = image.size
    pixels = list(image.pixels)
    bm = bmesh.new()
    bm.from_mesh(body.data)
    uv = bm.loops.layers.uv.active
    fur, paw = [], []
    for f in bm.faces:
        x, y, z = f.calc_center_median()
        if z < LEG_Z or z > ARM_TOP or abs(x) <= SIDE_X:
            continue
        u = sum(l[uv].uv.x for l in f.loops) / len(f.loops)
        v = sum(l[uv].uv.y for l in f.loops) / len(f.loops)
        i = (min(h - 1, int(v * h)) * w + min(w - 1, int(u * w))) * 4
        (paw if abs(x) > 0.52 else fur).append(tuple(pixels[i:i + 3]))
    bm.free()
    mean = lambda c: tuple(sum(p[i] for p in c) / len(c) for i in range(3))
    return srgb_to_linear((0xc2, 0x96, 0x68)), srgb_to_linear((0x5b, 0x46, 0x36))   # tawny sleeves, dark paws like the feet


def srgb_to_linear(rgb):
    out = []
    for c in rgb:
        c /= 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


def clean_arm(s, fur, paw):
    """A stubby rounded arm hanging from the shoulder, with a dark paw, as one mesh."""
    import bpy

    pieces = []
    for name, centre, size, colour in (
        ("sleeve", (s * (SHOULDER_X + 0.03), 0.0, 0.2), (0.14, 0.14, 0.17), fur),
        ("paw", (s * (SHOULDER_X + 0.035), 0.0, 0.095), (0.15, 0.15, 0.1), paw),
    ):
        bpy.ops.mesh.primitive_cube_add(size=1, location=centre)
        o = bpy.context.object
        o.scale = size
        bpy.ops.object.transform_apply(scale=True)
        bev = o.modifiers.new("b", "BEVEL")
        bev.width, bev.segments, bev.limit_method = 0.045, 6, "NONE"
        bpy.ops.object.modifier_apply(modifier="b")
        bpy.ops.object.shade_smooth()
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        shader = m.node_tree.nodes["Principled BSDF"]
        shader.inputs["Base Color"].default_value = (*colour, 1)
        shader.inputs["Roughness"].default_value = 0.7
        o.data.materials.append(m)
        pieces.append(o)
    bpy.ops.object.select_all(action="DESELECT")
    for o in pieces:
        o.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]
    bpy.ops.object.join()
    arm = bpy.context.object
    arm.name = "arm" + ("R" if s > 0 else "L")
    return arm


def rig(parts):
    """Recentres the parts on the middle of the feet, hangs the arms, and parents everything to
    joints (empties) at the rest positions. Returns the joints and the model's root."""
    import bpy
    from mathutils import Vector

    feet = [v.co for n in ("legR", "legL") for v in parts[n].data.vertices]
    fx = (min(c.x for c in feet) + max(c.x for c in feet)) / 2
    fy = (min(c.y for c in feet) + max(c.y for c in feet)) / 2
    for part in parts.values():
        for v in part.data.vertices:
            v.co.x -= fx
            v.co.y -= fy

    def empty(name, loc, parent=None):
        e = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(e)
        if parent:
            e.parent = parent
        e.location = loc
        return e

    holder = empty("model", (0, 0, 0))
    root = empty("root", (0, 0, 0), holder)
    joints = {"root": root}
    for s, side in ((1, "R"), (-1, "L")):
        arm = parts["arm" + side]
        ay = 0.0
        sh = Vector((s * SHOULDER_X, ay, SHOULDER_Z))
        j = empty("shoulder" + side, sh, root)
        joints["shoulder" + side] = j
        arm.parent = j
        arm.location = -sh                           # the vertices stay in model space
        leg = parts["leg" + side]
        ly = sum(v.co.y for v in leg.data.vertices) / len(leg.data.vertices)
        hp = Vector((s * HIP_X, ly, HIP_Z))
        h = empty("hip" + side, hp, root)
        joints["hip" + side] = h
        leg.parent = h
        leg.location = -hp
    for name in ("torso", "head"):
        parts[name].parent = root
    return joints, holder


def pose(joints, holder, p):
    """One pose: arms and legs swing about x (forward is −y), the body lifts and breathes."""
    swing = math.radians(26) * p["swing"]
    sway = math.radians(6) * p["sway"]
    for s, side in ((1, "R"), (-1, "L")):
        joints["shoulder" + side].rotation_euler = (swing * -s + sway, 0, 0)
        joints["hip" + side].rotation_euler = (swing * s, 0, 0)
    root = joints["root"]
    root.location.z = 0.014 * p["bob"] + 0.005 * p["breathe"]
    k = 1 + 0.012 * p["breathe"]
    root.scale = (k, k, 1 + 0.01 * p["breathe"])


def prepare(path):
    import bpy

    parts = build(path)
    joints, holder = rig(parts)
    scale = HEIGHT_VOXELS / 0.846
    holder.scale = (scale, scale, scale)
    for part in parts.values():
        for slot in part.data.materials:
            pass
    return parts, joints, holder


def render_cells(joints, holder, p, rows, scratch, name):
    """Renders pose `p` in the facings `rows`; returns the cell images in that order."""
    import bpy

    pose(joints, holder, p)
    x, y, w, h = CELL
    scene = bpy.context.scene
    width, height = scene.render.resolution_x, scene.render.resolution_y
    scene.render.resolution_percentage = RENDER_PERCENT
    scene.render.use_border = True
    scene.render.use_crop_to_border = True
    scene.render.border_min_x, scene.render.border_max_x = x / width, (x + w) / width
    scene.render.border_min_y = 1 - (y + h) / height
    scene.render.border_max_y = 1 - y / height
    cells = []
    for row in rows:
        # the model's front is −y; +x heads where facing `row` heads once turned 45° more
        holder.rotation_euler = (0, 0, math.radians(row * 22.5 + 45 + 90))
        out = os.path.join(scratch, f"{name}_{row}.png")
        scene.render.filepath = out
        bpy.ops.render.render(write_still=True)
        cells.append(out)
    return cells


def lay_out(columns, target, crop=False):
    from PIL import Image

    first = Image.open(columns[0][0])
    cw, ch = first.size
    image = Image.new("RGBA", (cw * len(columns), ch * len(columns[0])))
    for column, cells in enumerate(columns):
        for row, cell in enumerate(cells):
            image.paste(Image.open(cell).convert("RGBA"), (column * cw, row * ch))
    image.save(target)
    return cw, ch


def write_sidecar(sheet, frames):
    os.makedirs(SIDECARS, exist_ok=True)
    x, y, w, h = CELL
    data = {"frames": frames, "gap": 0.0, "cell": [float(x), float(y), float(w), float(h)], "facings": FACINGS}
    with open(os.path.join(SIDECARS, sheet + ".json"), "w", encoding="utf-8") as file:
        json.dump(data, file, indent=2)
        file.write("\n")


def main():
    import tempfile

    import bpy

    import vox_render as vr

    path = sys.argv[1]
    parts, joints, holder = prepare(path)
    vr.setup_scene(1, 1, 1, SAMPLES)
    scratch = tempfile.mkdtemp(prefix="tanuki-")
    poses = sheets()
    if "--preview" in sys.argv or "--debug" in sys.argv:
        south_east = FACINGS.index("south-east")
        east = FACINGS.index("east")
        columns = [render_cells(joints, holder, p, [south_east, east], scratch, f"{sheet}_{n}")
                   for sheet, plist in poses.items() for n, p in enumerate(plist)]
        target = os.path.join(ROOT, "lib", "target", "tanuki-preview.png")
        os.makedirs(os.path.dirname(target), exist_ok=True)
        lay_out(columns, target)
        print("ok", target)
        return
    os.makedirs(PAINTED, exist_ok=True)
    for sheet, plist in poses.items():
        columns = []
        for n, p in enumerate(plist):
            columns.append(render_cells(joints, holder, p, range(len(FACINGS)), scratch, f"{sheet}_{n}"))
            print(f"{sheet} pose {n}: {len(FACINGS)} facings", flush=True)
        target = os.path.join(PAINTED, f"merchant_{sheet}.png")
        cw, ch = lay_out(columns, target)
        write_sidecar(sheet, len(plist))
        print(f"ok {target}: {len(columns)} poses x {len(FACINGS)} facings, cell {cw} x {ch}")


if __name__ == "__main__":
    main()
