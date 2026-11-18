#!/usr/bin/env python3
# crab.py — the beach crab NPC: its voxel model in every pose, and its two sprite sheets.
#
#   python3 artifacts/vox/crab/crab.py            writes the poses as .vox (artifacts/vox/models/crab/)
#   python3 artifacts/vox/crab/crab.py --render   …and renders the sheets with Blender (the `bpy` module)
#
# The crab is built from rounded boxes like every kit piece (vox_prefabs.box), in the palette of
# the kit, facing +x: shell, three legs a side, two claws and two eyes on stalks. It has no slab
# of its own and stands on z = 0. Unlike a prop it is drawn from a sheet, as the player is: one
# row per facing (the 16 of PLAYER_FACINGS, east first, counter-clockwise) and one column per
# pose. Every cell is a clay render of the same model turned on its foot, so the sun stays
# where it is for every facing, exactly as vox_render.py lights the props.
#
#   idle  8 poses   the claws open and close, the shell bobs, the eyes peek (one cycle of
#                   the client's idle period, 0.9 s)
#   walk  9 poses   column 0 stands; 1–8 are two strides of the scuttle: three legs lift while
#                   the other three push, the shell rocks between them. The crab walks sideways,
#                   so these poses are drawn with the crab facing across its way.
#
# Out: lib/painted/crab_{idle,walk}.png (the rendered sheets, cut into cells by
# lib/scripts/rasterize.py) and lib/assets/crab/{idle,walk}.json (their sidecars: cell, frames
# and facings, the grid the packer and the client read). Rebuild the atlas afterwards
# (lib/scripts/build-atlas.sh) and recompile the game.
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CLAY = os.path.join(HERE, "..", "clay")
sys.path.insert(0, CLAY)

import vox_lib  # noqa: E402
from vox_prefabs import (BIRCH_MARK, PALETTE, RED, SCALE, STONE_CLAY, WHITE,  # noqa: E402
                         box)

ROOT = os.path.normpath(os.path.join(HERE, "..", "..", ".."))
MODELS_OUT = os.path.join(HERE, "..", "models", "crab")
PAINTED = os.path.join(ROOT, "lib", "painted")
SIDECARS = os.path.join(ROOT, "lib", "assets", "crab")

SHELL, LIMB, EYE, GLINT = RED, STONE_CLAY, BIRCH_MARK, WHITE

FACINGS = [
    "east", "east-north-east", "north-east", "north-north-east", "north", "north-north-west",
    "north-west", "west-north-west", "west", "west-south-west", "south-west", "south-south-west",
    "south", "south-south-east", "south-east", "east-south-east",
]

# The cell of every pose on the 1x1x1 template canvas (1024 x 853, the foot at 512, 597), in
# canvas pixels: x, y, width, height. Wide enough for the claws and legs in every facing.
CELL = (352, 437, 320, 220)
# Rendered at half the canvas resolution: twice what the atlas keeps (320 px a tile), so the
# rasterizer scales every cell down and the edges stay clean.
RENDER_PERCENT = 50
SAMPLES = 48

LEG_X = (-7, 0, 7)                     # the three legs of a side, back to front


def crab(lift=(0, 0, 0, 0, 0, 0), bob=0.0, claw=0.0, eyes=0.0, rock=0.0, claws_up=0.0):
    """The crab facing +x in one pose.
    lift: how far each leg's foot is off the ground (left side back to front, then right).
    bob: the shell up or down; claw: how far the pincers stand open; eyes: the stalks up;
    rock: the shell leant towards +y (negative: −y); claws_up: the arms raised."""
    z = 6 + bob
    out = [box(rock, 0, z, 18, 24, 9, SHELL, 4.2),                     # the shell
           box(rock - 1, 0, z + 6, 13, 17, 5, SHELL, 2.4)]             # its domed back
    for side, s in enumerate((-1, 1)):
        for n, x in enumerate(LEG_X):
            up = lift[side * 3 + n]
            splay = (n - 1) * 1.5
            out.append(box(x + splay * .5, s * 14, z + 2, 3.5, 7, 3.5, LIMB, 1.4))           # thigh
            out.append(box(x + splay, s * 18, up, 3.5, 3.5, z + 4 - up, LIMB, 1.4))         # shin
        y = s * 7
        arm = z + 1 + claws_up
        out.append(box(10, y, arm, 6, 4, 4, LIMB, 1.6))                                   # arm
        out.append(box(15, y * 1.15, arm - 1, 7, 7, 6, SHELL, 2.8))                       # palm
        out.append(box(20, y * 1.15, arm - 1, 5, 4, 3, SHELL, 1.4))                       # fixed finger
        out.append(box(19.5, y * 1.15, arm + 3 + claw, 5, 4, 3, SHELL, 1.4))              # moving finger
        stalk = z + 7
        out.append(box(7 + rock, s * 3.5, stalk, 2, 2, 4 + eyes, LIMB, 0.9))              # eye stalk
        out.append(box(7.5 + rock, s * 3.5, stalk + 3 + eyes, 4, 4, 4, EYE, 1.8))         # eye
        out.append(box(9 + rock, s * 3.5, stalk + 5 + eyes, 1.6, 1.6, 1.6, GLINT, 0.7))   # glint
    return out


def idle_poses():
    """One cycle of standing about: the claws open and shut, the shell breathes, the eyes peek."""
    out = []
    for n in range(8):
        t = n / 8
        out.append(crab(bob=0.6 * math.sin(math.tau * t),
                        claw=1.5 - 1.5 * math.cos(math.tau * t),
                        eyes=0.6 + 0.6 * math.sin(math.tau * t + 1.2),
                        claws_up=0.8 * (1 - math.cos(math.tau * t))))
    return out


# The two tripods of the gait: the left back and front legs with the right middle one, and
# the other three. A lifted foot comes up this many voxels.
TRIPOD_A = (1, 0, 1, 0, 1, 0)
TRIPOD_B = (0, 1, 0, 1, 0, 1)
LIFT = 3.5


def walk_poses():
    """Standing, then two strides of the scuttle, four poses each: one tripod up, all down,
    the other tripod up, all down. The shell rocks over the feet that push."""
    out = [crab()]
    for stride in range(2):
        for phase in range(4):
            if phase == 0:
                lift, rock, bob = tuple(LIFT * a for a in TRIPOD_A), 0.6, 0.6
            elif phase == 2:
                lift, rock, bob = tuple(LIFT * b for b in TRIPOD_B), -0.6, 0.6
            else:
                lift, rock, bob = (0,) * 6, 0.0, -0.4
            out.append(crab(lift=lift, rock=rock, bob=bob, claws_up=1.0, claw=0.8))
    return out


SHEETS = {"idle": idle_poses, "walk": walk_poses}


def volume():
    return (-64, -64, 0), (128, 128, 85)


def write_models():
    """Every pose as a .vox on its tile's volume; returns {sheet: [paths]}."""
    os.makedirs(MODELS_OUT, exist_ok=True)
    written = {}
    for sheet, poses in SHEETS.items():
        written[sheet] = []
        for n, boxes in enumerate(poses()):
            cells = vox_lib.shell(vox_lib.voxelise(boxes, SCALE, bake=False))
            path = os.path.join(MODELS_OUT, f"crab_{sheet}_{n}.vox")
            size, count, _ = vox_lib.write_vox(path, cells, palette=PALETTE, bounds=volume())
            written[sheet].append(path)
            print(f"{os.path.basename(path):24} {count:6} voxels")
    return written


def write_sidecar(sheet, frames):
    os.makedirs(SIDECARS, exist_ok=True)
    x, y, w, h = CELL
    data = {
        "frames": frames,
        "gap": 0.0,
        "cell": [float(x), float(y), float(w), float(h)],
        "facings": FACINGS,
    }
    import json
    with open(os.path.join(SIDECARS, sheet + ".json"), "w", encoding="utf-8") as file:
        json.dump(data, file, indent=2)
        file.write("\n")


def render(written):
    """Renders every pose in every facing and lays the cells out as one sheet per animation."""
    import bpy
    from PIL import Image

    import vox_render as vr

    os.makedirs(PAINTED, exist_ok=True)
    import tempfile
    scratch = tempfile.mkdtemp(prefix="crab-cells-")
    x, y, w, h = CELL
    for sheet, paths in written.items():
        rows = []
        for column, path in enumerate(paths):
            bpy.ops.wm.read_factory_settings(use_empty=True)
            size, voxels, palette, glow = vr.read_vox(path)
            vr.build_mesh(size, voxels, palette, glow, 1, True)
            vr.setup_scene(1, 1, 1, SAMPLES)
            scene = bpy.context.scene
            width, height = scene.render.resolution_x, scene.render.resolution_y
            scene.render.resolution_percentage = RENDER_PERCENT
            scene.render.use_border = True
            scene.render.use_crop_to_border = True
            scene.render.border_min_x, scene.render.border_max_x = x / width, (x + w) / width
            scene.render.border_min_y = 1 - (y + h) / height
            scene.render.border_max_y = 1 - y / height
            model = bpy.data.objects["model"]
            cells = []
            for row in range(len(FACINGS)):
                # Facing `row` heads at row · 22.5° on the ground, counted from the screen's right
                # towards its top; the model's +x heads that way once turned 45° more.
                model.rotation_euler = (0, 0, math.radians(row * 22.5 + 45))
                out = os.path.join(scratch, f"{sheet}_{row}_{column}.png")
                scene.render.filepath = out
                bpy.ops.render.render(write_still=True)
                cells.append(out)
            rows.append(cells)
            print(f"{sheet} pose {column}: {len(cells)} facings", flush=True)
        first = Image.open(rows[0][0])
        cw, ch = first.size
        image = Image.new("RGBA", (cw * len(rows), ch * len(FACINGS)))
        for column, cells in enumerate(rows):
            for row, cell in enumerate(cells):
                image.paste(Image.open(cell).convert("RGBA").resize((cw, ch)), (column * cw, row * ch))
        target = os.path.join(PAINTED, f"crab_{sheet}.png")
        image.save(target)
        print(f"ok {target}: {len(rows)} poses x {len(FACINGS)} facings, cell {cw} x {ch}")


def main():
    written = write_models()
    for sheet, paths in written.items():
        write_sidecar(sheet, len(paths))
    if "--render" in sys.argv:
        render(written)


if __name__ == "__main__":
    main()
