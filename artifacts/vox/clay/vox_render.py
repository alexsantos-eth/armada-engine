#!/usr/bin/env python3
# vox_render.py — renders a MagicaVoxel .vox model into a game sprite with Blender (Cycles).
#
#   blender -b -P vox_render.py -- model.vox sprite.png [--style clay|voxel] [--samples 96]
#   python3 vox_render.py model.vox sprite.png            (with the `bpy` pip module instead)
#
# The sprite comes out on the asset's template canvas, one pixel per skill unit, so it drops
# next to (or in place of) the drawn asset: 1024 x 1194 for a 1x1x2 tree, foot at (512, 938).
#
# The model must fill the whole volume of its footprint, which is how it says where it stands:
# 128 voxels per tile along x and y, 85 per block of height (128 x 128 x 170 for a tree), the
# anchor tile first. vox_prefabs.py writes its models that way; in MagicaVoxel, set the model
# size to the volume before building in it.
#
# Camera: orthographic, turned 45° and raised 30°, which is the 2:1 projection of the tiles.
# The game's blocks are 341 units high on a 512 tile, flatter than that camera shows a cube,
# so the model is squeezed to √(2/3) of its height before rendering; with that the render
# lands on the template to the pixel.
# Light: one sun from the upper right plus an even sky, tuned so the top face keeps its palette
# colour, the right face comes out at 0.93 of it and the left face, in shade, at 0.64 (the
# values of the painted trees), with soft shadows between the pieces. Nothing is
# cast on the ground: the game draws that shadow itself.
# Finish: `clay` (the default) melts the voxel steps into round edges, adds the slight
# unevenness of hand-pressed clay, and shades it as soft matte clay; `voxel` keeps the hard
# cubes with flat matte paint. A colour marked as emissive in MagicaVoxel glows in both.
import math
import struct
import sys

import bpy
from mathutils import Vector

TILE, BLOCK = 128, 85                 # voxels per tile edge and per block of height
UNITS = 4                             # skill units (= template pixels) per voxel
Z_SQUEEZE = math.sqrt(2 / 3)          # see the header
SKY = 0.375                           # even light from everywhere: what a face in shade gets
SUN_FROM = (0.475, -0.05, 0.625)       # toward the sun, in model axes: right face lit, left in shade
SUN_SOFTNESS = math.radians(6)        # angular size of the sun: how soft the shadow edges are

# The clay finish (--style clay, the default; --style voxel keeps the hard cubes).
CLAY_SKIN = 0.8                       # voxels: fineness of the skin the cubes are rebuilt as
CLAY_SMOOTH = 8                       # smoothing passes: melts the voxel steps into round edges
CLAY_WOBBLE = 0.7                     # voxels: how far the hand-pressed unevenness pushes the surface
CLAY_WOBBLE_SIZE = 22                 # voxels: size of those dents and bulges
CLAY_ROUGHNESS = 0.62                 # matte, with a soft sheen where the sun grazes an edge
CLAY_SHEEN = 0.22                     # strength of that sheen
CLAY_SUBSURFACE = 0.12                # how much light soaks in and softens the shade lines
CLAY_GRAIN = 0.12                     # strength of the fine surface grain


def read_vox(path):
    """→ (size, [(x, y, z, colour index)], palette of 256 (r, g, b, a) bytes, {index: emission}).
    Reads the first model of the file (version 150 or 200); scene transforms are ignored."""
    data = open(path, "rb").read()
    assert data[:4] == b"VOX ", f"{path} is not a .vox file"
    size = voxels = None
    palette = [(i, i, i, 255) for i in range(256)]
    glow = {}
    at = 20                                           # past 'VOX ', version and the MAIN header
    while at < len(data):
        tag = data[at:at + 4]
        n, m = struct.unpack("<ii", data[at + 4:at + 12])
        body = data[at + 12:at + 12 + n]
        at += 12 + n + m
        if tag == b"SIZE" and size is None:
            size = struct.unpack("<3i", body)
        elif tag == b"XYZI" and voxels is None:
            count = struct.unpack("<i", body[:4])[0]
            voxels = [struct.unpack("<4B", body[4 + 4 * i:8 + 4 * i]) for i in range(count)]
        elif tag == b"RGBA":
            palette = [tuple(body[4 * i:4 * i + 4]) for i in range(256)]
        elif tag == b"MATL":
            index, props = struct.unpack("<i", body[:4])[0], {}
            pairs, p = struct.unpack("<i", body[4:8])[0], 8
            for _ in range(pairs):
                item = []
                for _ in range(2):
                    ln = struct.unpack("<i", body[p:p + 4])[0]
                    item.append(body[p + 4:p + 4 + ln].decode("ascii", "replace"))
                    p += 4 + ln
                props[item[0]] = item[1]
            if props.get("_type") == "_emit":
                glow[index] = float(props.get("_emit", 1)) * 10 ** float(props.get("_flux", 0))
    assert size and voxels, f"{path} holds no model"
    return size, voxels, palette, glow


def tiles_of(size):
    nx, ny, nz = size[0] / TILE, size[1] / TILE, size[2] / BLOCK
    assert nx == int(nx) and ny == int(ny) and nz == int(nz) and min(nx, ny, nz) >= 1, (
        f"the model is {size[0]} x {size[1]} x {size[2]} voxels; it must fill its footprint's volume: "
        f"{TILE} per tile along x and y and {BLOCK} per block of height (a 1x1x2 tree is 128 x 128 x 170)")
    return int(nx), int(ny), int(nz)


# the six sides of a voxel: (neighbour offset, its four corners, counter-clockwise seen from outside)
SIDES = (
    ((1, 0, 0), ((1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1))),
    ((-1, 0, 0), ((0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0))),
    ((0, 1, 0), ((0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0))),
    ((0, -1, 0), ((0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1))),
    ((0, 0, 1), ((0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1))),
    ((0, 0, -1), ((0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0))),
)


def linear(c):
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def build_mesh(size, voxels, palette, glow, ny, clay):
    """One mesh of the visible voxel sides, a material per colour, placed so that the anchor
    tile's foot is the origin: model x → right-down on screen, model −y → left-down."""
    filled = {(x, y, z): i for x, y, z, i in voxels}
    verts, index, faces, colours = [], {}, [], []
    for (x, y, z), i in filled.items():
        for (dx, dy, dz), corners in SIDES:
            if (x + dx, y + dy, z + dz) in filled:
                continue
            face = []
            for cx, cy, cz in corners:
                v = (x + cx, y + cy, z + cz)
                if v not in index:
                    index[v] = len(verts)
                    verts.append((v[0] - TILE / 2, v[1] - (TILE * ny - TILE / 2), v[2]))
                face.append(index[v])
            faces.append(face)
            colours.append(i)
    mesh = bpy.data.meshes.new("model")
    mesh.from_pydata(verts, [], faces)
    slots = {}
    for i in sorted(set(colours)):
        r, g, b, _ = palette[i - 1]
        mat = bpy.data.materials.new(f"colour_{i}")
        mat.use_nodes = True
        shader = mat.node_tree.nodes["Principled BSDF"]
        rgba = (linear(r), linear(g), linear(b), 1)
        shader.inputs["Base Color"].default_value = rgba
        shader.inputs["Roughness"].default_value = CLAY_ROUGHNESS if clay else 1
        for name in ("Specular IOR Level", "Specular"):          # no highlight on the hard cubes
            if name in shader.inputs:
                shader.inputs[name].default_value = CLAY_SHEEN if clay else 0
        if clay:
            clay_surface(mat, shader, rgba)
        if i in glow:
            shader.inputs["Emission Color"].default_value = rgba
            shader.inputs["Emission Strength"].default_value = glow[i]
        slots[i] = len(mesh.materials)
        mesh.materials.append(mat)
    mesh.polygons.foreach_set("material_index", [slots[i] for i in colours])
    mesh.update()
    model = bpy.data.objects.new("model", mesh)
    bpy.context.collection.objects.link(model)
    if clay:
        clay_shape(model, filled, slots, ny)
    model.scale = (1, 1, Z_SQUEEZE)


def clay_shape(model, filled, slots, ny):
    """Melts the voxel steps into round edges and adds the unevenness of hand-pressed clay.
    The cubes are first rebuilt as one closed skin (voxels that only touch along an edge make
    a mesh that smoothing would fold), then smoothed; the rebuilt skin has lost its colours,
    so every face takes the colour of the voxel it lies on."""
    remesh = model.modifiers.new("skin", "REMESH")
    remesh.mode, remesh.voxel_size, remesh.adaptivity = "VOXEL", CLAY_SKIN, 0
    smooth = model.modifiers.new("smooth", "SMOOTH")
    smooth.factor, smooth.iterations = 0.5, CLAY_SMOOTH
    skin = bpy.data.meshes.new_from_object(model.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    model.modifiers.clear()
    for mat in model.data.materials:
        skin.materials.append(mat)
    model.data = skin

    near = sorted(((dx, dy, dz) for dx in range(-3, 4) for dy in range(-3, 4) for dz in range(-3, 4)),
                  key=lambda d: d[0] ** 2 + d[1] ** 2 + d[2] ** 2)
    index = []
    for poly in skin.polygons:
        p = poly.center - poly.normal * 0.6
        cell = (math.floor(p.x + TILE / 2), math.floor(p.y + TILE * ny - TILE / 2), math.floor(p.z))
        colour = next((filled[c] for c in ((cell[0] + d[0], cell[1] + d[1], cell[2] + d[2]) for d in near)
                       if c in filled), None)
        index.append(slots[colour] if colour else 0)
    skin.polygons.foreach_set("material_index", index)
    skin.polygons.foreach_set("use_smooth", [True] * len(index))
    skin.update()

    clouds = bpy.data.textures.new("wobble", "CLOUDS")
    clouds.noise_scale = CLAY_WOBBLE_SIZE
    wobble = model.modifiers.new("wobble", "DISPLACE")
    wobble.texture, wobble.texture_coords = clouds, "GLOBAL"
    wobble.strength, wobble.mid_level = CLAY_WOBBLE, 0.5


def clay_surface(mat, shader, rgba):
    """Soft clay: a little light soaking in and a fine grain in the surface."""
    tree = mat.node_tree
    for name in ("Subsurface Weight", "Subsurface"):
        if name in shader.inputs:
            shader.inputs[name].default_value = CLAY_SUBSURFACE
    if "Subsurface Radius" in shader.inputs:
        shader.inputs["Subsurface Radius"].default_value = (3, 3, 3)       # voxels
    if "Subsurface Color" in shader.inputs:
        shader.inputs["Subsurface Color"].default_value = rgba
    coords = tree.nodes.new("ShaderNodeTexCoord")
    noise = tree.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 0.45
    noise.inputs["Detail"].default_value = 5
    bump = tree.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = CLAY_GRAIN
    bump.inputs["Distance"].default_value = 1
    tree.links.new(coords.outputs["Object"], noise.inputs["Vector"])
    tree.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    tree.links.new(bump.outputs["Normal"], shader.inputs["Normal"])


def canvas(nx, ny, nz):
    """Template canvas of a footprint in pixels, and the ground point (model axes, voxels) at its centre."""
    width, height = 512 * (nx + ny), 256 * (nx + ny) + 341 * nz
    diff, total = 256 * (nx - ny), 256 * (nx + ny) - 341 * nz - 512        # x − y and x + y, in units
    x, y = (total + diff) / 2 / UNITS, (total - diff) / 2 / UNITS
    return width, height, Vector((x, -y, 0))


def setup_scene(nx, ny, nz, samples):
    scene = bpy.context.scene
    width, height, centre = canvas(nx, ny, nz)
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 3
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"              # palette colours stay what they are
    scene.view_settings.look = "None"

    toward = Vector((math.cos(math.radians(30)) * math.sqrt(.5),
                     -math.cos(math.radians(30)) * math.sqrt(.5), math.sin(math.radians(30))))
    cam = bpy.data.cameras.new("camera")
    cam.type = "ORTHO"
    cam.ortho_scale = max(width, height) * math.sqrt(.5) / UNITS  # a template pixel is √½ / 4 voxels across
    cam.clip_start, cam.clip_end = 1, 5000
    eye = bpy.data.objects.new("camera", cam)
    eye.location = centre + toward * 1500
    eye.rotation_euler = (-toward).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(eye)
    scene.camera = eye

    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = SUN_ENERGY
    sun.angle = SUN_SOFTNESS
    lamp = bpy.data.objects.new("sun", sun)
    lamp.rotation_euler = Vector(SUN_FROM).to_track_quat("Z", "Y").to_euler()
    scene.collection.objects.link(lamp)

    world = bpy.data.worlds.new("sky")
    world.use_nodes = True
    back = world.node_tree.nodes["Background"]
    back.inputs["Color"].default_value = (1, 1, 1, 1)
    back.inputs["Strength"].default_value = SKY
    scene.world = world


# A sun of energy E lights a matte face that looks straight at it to E / π times its colour.
# The top face looks up, not at the sun, and must end at its palette colour: sky + sun = 1.
SUN_ENERGY = math.pi * (1 - SKY) / Vector(SUN_FROM).normalized().z


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    options = {"--samples": "96", "--style": "clay"}
    for name in options:
        if name in args:
            at = args.index(name)
            options[name] = args[at + 1]
            del args[at:at + 2]
    samples, clay = int(options["--samples"]), options["--style"] == "clay"
    assert options["--style"] in ("clay", "voxel") and len(args) == 2, \
        "usage: vox_render.py model.vox sprite.png [--style clay|voxel] [--samples N]"
    source, target = args

    bpy.ops.wm.read_factory_settings(use_empty=True)
    size, voxels, palette, glow = read_vox(source)
    nx, ny, nz = tiles_of(size)
    build_mesh(size, voxels, palette, glow, ny, clay)
    setup_scene(nx, ny, nz, samples)
    bpy.context.scene.render.filepath = target
    bpy.ops.render.render(write_still=True)
    print(f"ok {target}: {nx}x{ny}x{nz}, {len(voxels)} voxels")


if __name__ == "__main__":
    main()
