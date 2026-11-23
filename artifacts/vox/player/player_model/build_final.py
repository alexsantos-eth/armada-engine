"""Turn the final monkey (Downloads/final_model/model.glb, no rig) into what player_model.py
draws: the mesh in the figure's space, a colour and six bone weights per vertex.

Runs inside Blender (it reads the GLB and its texture there):

  Blender -b -noaudio --python build_final.py -- <model.glb> <out.npz>

Figure space is monkey.py's: +x forward (the face), +y to its side, z up from the feet. In
Blender the model stands on z = 0 with its face towards -y, so x = -Y, y = X, z = Z, scaled to
HEIGHT figure units tall.

This model stands in a T-pose, and the box poses (player_walk.py, …) turn arms that hang down
the sides; so the arms are first let down here, each turned about its shoulder until it hangs
ARM_OUT degrees out from the body, and the mesh is kept in that rest pose.
"""
import math
import sys

import bpy
import numpy as np

HEIGHT = 225.0          # figure units, standing (monkey.py's is 250; lowered on 2026-11-23)

# Where the model's parts meet, in its own units (Blender: Z up, X to the side), read off its
# outline: the arms stick out sideways between ARM_LOW and ARM_HIGH past the body's side wall.
ARM_FROM = 0.245        # the body's side wall at the arms' height
ARM_LOW, ARM_HIGH = 0.275, 0.445
SHOULDER_OUT = 0.235    # where an arm turns about (x), at the middle of its height
NECK = 0.455            # the chin: above it is the head (ears and tuft included)
CROTCH = 0.13           # where the legs join the body
LEG_OUT = 0.11          # how far out the middle of a leg is
ARM_OUT = 15            # degrees the let-down arms hang out from the sides


def step(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    obj = next(o for o in bpy.data.objects if o.type == "MESH")
    me = obj.data
    me.calc_loop_triangles()
    n = len(me.vertices)
    world = np.array(obj.matrix_world)
    co = np.empty(n * 3)
    me.vertices.foreach_get("co", co)
    co = (np.c_[co.reshape(-1, 3), np.ones(n)] @ world.T)[:, :3]
    nor = np.empty(n * 3)
    me.vertices.foreach_get("normal", nor)
    nor = nor.reshape(-1, 3) @ world[:3, :3].T
    nor /= np.maximum(np.linalg.norm(nor, axis=1, keepdims=True), 1e-9)
    tris = np.empty(len(me.loop_triangles) * 3, np.int32)
    me.loop_triangles.foreach_get("vertices", tris)
    uvl = np.empty(len(me.loops) * 2)
    me.uv_layers.active.data.foreach_get("uv", uvl)
    lv = np.empty(len(me.loops), np.int64)
    me.loops.foreach_get("vertex_index", lv)
    uv = np.zeros((n, 2))
    uv[lv] = uvl.reshape(-1, 2)
    image = next(i for i in bpy.data.images if not any(k in i.name for k in ("normal", "metallic", "rough")))
    w, h = image.size
    px = np.empty(w * h * 4, np.float32)
    image.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    colour = px[np.clip((uv[:, 1] * h).astype(int), 0, h - 1), np.clip((uv[:, 0] * w).astype(int), 0, w - 1), :3]
    # The texture is stored as sRGB and Blender hands its pixels back as they are stored.
    return co, nor, tris.reshape(-1, 3), colour


def main():
    src, out = sys.argv[sys.argv.index("--") + 1:][:2]
    co, nor, faces, colour = load(src)
    X, Z = co[:, 0], co[:, 2]
    arm = (step((np.abs(X) - ARM_FROM) / 0.02) * step((Z - ARM_LOW) / 0.015)
           * (1 - step((Z - ARM_HIGH) / 0.015)))
    head = step((Z - NECK) / 0.02)
    leg = step((CROTCH - Z) / 0.03) * (1 - arm)
    side = step((X + 0.03) / 0.06)
    w = np.zeros((len(co), 6), np.float32)
    w[:, 1] = head
    rest = 1 - head
    w[:, 2] = rest * arm * (X > 0)
    w[:, 3] = rest * arm * (X <= 0)
    w[:, 4] = rest * (1 - arm) * leg * side
    w[:, 5] = rest * (1 - arm) * leg * (1 - side)
    w[:, 0] = 1 - w[:, 1:].sum(axis=1)

    # Let the arms down: each turned about its shoulder (about the forward axis, Blender's y),
    # blended by its weight so the shoulder bends instead of tearing.
    shoulder_z = (ARM_LOW + ARM_HIGH) / 2
    for bone, sign in ((2, 1), (3, -1)):
        a = math.radians(-sign * (90 - ARM_OUT))
        c, s = math.cos(a), math.sin(a)
        turn = np.array([[c, 0, -s], [0, 1, 0], [s, 0, c]])     # about y: x towards -z for a > 0
        pivot = np.array([sign * SHOULDER_OUT, 0, shoulder_z])
        k = w[:, bone:bone + 1]
        co = co + k * ((co - pivot) @ turn.T + pivot - co)
        nor = nor + k * (nor @ turn.T - nor)
    nor /= np.maximum(np.linalg.norm(nor, axis=1, keepdims=True), 1e-9)

    scale = HEIGHT / (co[:, 2].max() - co[:, 2].min())
    co[:, 2] -= co[:, 2].min()
    figure = np.stack([-co[:, 1], co[:, 0], co[:, 2]], axis=1) * scale
    normals = np.stack([-nor[:, 1], nor[:, 0], nor[:, 2]], axis=1)
    joints = np.array([(0, 0, 0.28), (0, 0, NECK + 0.01), (0, SHOULDER_OUT, shoulder_z),
                       (0, -SHOULDER_OUT, shoulder_z), (0, LEG_OUT, CROTCH), (0, -LEG_OUT, CROTCH)],
                      np.float32) * scale
    # Wound so the renderer's FRONT_SIGN keeps the outside: the glTF's triangles run the other way.
    np.savez_compressed(out, v=figure.astype(np.float32), n=normals.astype(np.float16),
                        c=(np.clip(colour, 0, 1) * 255).round().astype(np.uint8),
                        w=(w * 255).round().astype(np.uint8), f=faces, joints=joints)
    print("ok", len(co), "vertices", len(faces), "faces", "scale %.1f" % scale)


main()
