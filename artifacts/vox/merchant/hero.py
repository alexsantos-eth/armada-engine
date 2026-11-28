#!/usr/bin/env python3
# hero.py — one large smooth render of the merchant, in the 3/4 view of the character reference.
#   python3 artifacts/vox/merchant/hero.py out.png
# The same rounded boxes as the sprite model, drawn as smooth bevelled solids (no voxel grid).
import math
import sys
import os

HERE = os.path.dirname(os.path.abspath(__file__))
sys.argv, args = sys.argv[:1], sys.argv[1:]
sys.path.insert(0, HERE)
import merchant as m  # noqa: E402


def srgb(hexcolor):
    h = hexcolor.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1]


def main(out, yaw_deg=30, pitch_deg=78, tpose=False, scale=215):
    import bpy
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = {}
    for b in m.merchant(tpose=tpose):
        col = b["color"]
        if col not in mats:
            mat = bpy.data.materials.new(col)
            mat.use_nodes = True
            bsdf = mat.node_tree.nodes["Principled BSDF"]
            bsdf.inputs["Base Color"].default_value = srgb(col)
            bsdf.inputs["Roughness"].default_value = 0.55
            mats[col] = mat
        cx, cy, cz = b["c"]; hx, hy, hz = b["h"]
        bpy.ops.mesh.primitive_cube_add(size=2, location=(cx, cy, cz))
        o = bpy.context.object
        o.scale = (hx, hy, hz)
        bpy.ops.object.transform_apply(scale=True)
        o.data.materials.append(mats[col])
        bev = o.modifiers.new("b", "BEVEL")
        bev.width = b["r"] * 0.98; bev.segments = 8; bev.limit_method = "NONE"
        bpy.ops.object.shade_smooth()
    # camera: the character faces the viewer's lower left, seen from a little above
    cam = bpy.data.cameras.new("c"); cam.type = "ORTHO"; cam.ortho_scale = scale
    co = bpy.data.objects.new("c", cam); bpy.context.scene.collection.objects.link(co)
    yaw, pitch, dist = math.radians(yaw_deg), math.radians(pitch_deg), 900  # in front, a little to the side
    target = (0, 0, 76)
    co.location = (target[0] + dist * math.sin(pitch) * math.cos(yaw), target[1] + dist * math.sin(pitch) * math.sin(yaw), target[2] + dist * math.cos(pitch))
    co.rotation_euler = (pitch, 0, yaw + math.pi / 2)
    bpy.context.scene.camera = co
    sun = bpy.data.lights.new("s", "SUN"); sun.energy = 3.0; sun.angle = math.radians(25)
    so = bpy.data.objects.new("s", sun); so.rotation_euler = (math.radians(50), math.radians(10), math.radians(-30))
    bpy.context.scene.collection.objects.link(so)
    world = bpy.data.worlds.new("w"); world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (1, 1, 1, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.1
    bpy.context.scene.world = world
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"; sc.cycles.samples = 128; sc.cycles.device = "CPU"
    sc.render.resolution_x, sc.render.resolution_y = 1200, 1400
    sc.view_settings.view_transform = "Standard"
    sc.render.film_transparent = False
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    tp = "--tpose" in args
    pos = [a for a in args if not a.startswith("--")]
    main(pos[0], *( (0, 88, True, 260) if tp else () ))
