"""Reads a Mixamo punch (Standing Melee Punch.fbx) into player_punch.json, the gather sheet's
poses (player_gather.py).

The player model has no rig, only the six parts monkey.py's boxes stand for, so this keeps
what those parts can show, frame by frame, in the figure's frame (+x forward, +y its left,
z up):

  body    the chest's turn from its rest (lean and twist), from mixamorig:Spine2
  head    the head's turn, from mixamorig:Head
  arm     the direction from each shoulder to its hand (the arm is one rigid piece)
  leg     the direction from each hip to its ankle
  lift    how far the hips rose from where they rest, in the hips' heights

The clip's stance stands side-on, so it is first turned about z until the chest faces
forward on average; the impact is the frame where a hand reaches furthest from the hips. Runs inside Blender:

  Blender -b -noaudio --python player_punch_extract.py -- <punch.fbx> <player_punch.json>
"""
import json
import math
import sys

import bpy
from mathutils import Matrix, Vector

src, out = sys.argv[sys.argv.index("--") + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
action = arm.animation_data.action
first, last = (int(f) for f in action.frame_range)
W = arm.matrix_world
bones = arm.data.bones
rest_hips = (W @ bones["mixamorig:Hips"].head_local).z

# The figure's frame from Blender's, for a figure facing -y: x = -Y, y = X, z = Z.
C = Matrix(((0, -1, 0), (1, 0, 0), (0, 0, 1)))


def at(name):
    return W @ arm.pose.bones["mixamorig:" + name].head


def turn(name):
    pb, rest = arm.pose.bones["mixamorig:" + name], bones["mixamorig:" + name]
    now = (W @ pb.matrix).to_3x3().normalized()
    was = (W @ rest.matrix_local).to_3x3().normalized()
    return now @ was.inverted()


frames = list(range(first, last))          # the last frame repeats the first: a loop
scene = bpy.context.scene
reach = []
for f in frames:
    scene.frame_set(f)
    hips = at("Hips")
    for side in ("Left", "Right"):
        d = at(side + "Hand") - hips
        reach.append((Vector((d.x, d.y)).length, f, side, d))
_, impact, hand, d = max(reach, key=lambda r: r[0])
# Turn the clip so the chest, on average over the clip, faces -y (the figure's forward): the
# stance stands side-on, and the monkey should face where it is walking.
facing = Vector((0, 0, 0))
for f in frames:
    scene.frame_set(f)
    facing += turn("Spine2") @ Vector((0, -1, 0))
spin = Matrix.Rotation(math.atan2(-1, 0) - math.atan2(facing.y, facing.x), 3, "Z")
to_figure = C @ spin


def direction(a, b):
    v = to_figure @ (b - a)
    return list(v.normalized())


def figure_turn(m):
    # The rest faces -y already; the spin turns the posed chest with the rest of the clip.
    r = to_figure @ m @ C.transposed()
    return [list(row) for row in r]


poses = []
for f in frames:
    scene.frame_set(f)
    poses.append({
        "body": figure_turn(turn("Spine2")),
        "head": figure_turn(turn("Head")),
        "arm+1": direction(at("LeftArm"), at("LeftHand")),
        "arm-1": direction(at("RightArm"), at("RightHand")),
        "leg+1": direction(at("LeftUpLeg"), at("LeftFoot")),
        "leg-1": direction(at("RightUpLeg"), at("RightFoot")),
        "lift": (at("Hips").z - rest_hips) / rest_hips,
    })
with open(out, "w", encoding="utf-8") as file:
    json.dump({"source": "Mixamo: Standing Melee Punch", "fps": scene.render.fps,
               "impact": frames.index(impact), "hand": hand, "frames": poses}, file, indent=1)
print("ok", len(poses), "frames, impact at", frames.index(impact), "with the", hand, "hand")
