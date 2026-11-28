#!/usr/bin/env python3
# merchant.py — the market merchant NPC: its voxel model in every pose, and (later) its sheets.
#
#   python3 artifacts/vox/merchant/merchant.py             writes the poses as .vox (artifacts/vox/models/merchant/)
#   python3 artifacts/vox/merchant/merchant.py --preview   …and renders lib/target/merchant-preview.png:
#                                                          a turnaround plus every pose, to judge the design
#
# A gnome peddler built with the player's chunky proportions: a tall red cap pulled down over
# the eyes, a huge ruddy nose and a white moustache, a teal tunic with a belt and a coin purse, and a
# pack of wares with a rolled blanket. Facing +x, built from rounded boxes in the kit's palette, no slab of
# its own: it stands on z = 0.
#
#   idle  4 poses   hands on the apron, then one hand lifted showing a coin (the stall pitch)
#   walk  4 poses   the two strides of a slow, heavy-footed shuffle
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CLAY = os.path.join(HERE, "..", "clay")
sys.path.insert(0, CLAY)

import vox_lib  # noqa: E402
from vox_prefabs import (  # noqa: E402
    DOOR, NET, NOSE, PALETTE, RED, SCALE, SKIN, TIMBER, TUNIC, TUNIC_DARK, WHITE, WOOD, YELLOW, box,
)

ROOT = os.path.normpath(os.path.join(HERE, "..", "..", ".."))
MODELS_OUT = os.path.join(HERE, "..", "models", "merchant")

FACINGS = [
    "east", "east-north-east", "north-east", "north-north-east", "north", "north-north-west",
    "north-west", "west-north-west", "west", "west-south-west", "south-west", "south-south-west",
    "south", "south-south-east", "south-east", "east-south-east",
]
CELL = (352, 297, 320, 360)
RENDER_PERCENT = 100 if "--preview" in sys.argv else 50
SAMPLES = 48


def merchant(breathe=0.0, stride=0.0, show=0.0, bob=0.0, tilt=0.0):
    """The gnome merchant facing +x in one pose, in kit units (a block is 28).
    breathe: chest swelling; stride: left leg forward and right back (negative for the other
    way), also swinging the arms; show: the right hand lifted with a coin; bob: the whole body
    up a little between strides; tilt: the tip of the cap swaying."""
    z = bob
    out = []
    for s in (-1, 1):
        sw = stride * s
        out.append(box(sw * 2.4, s * 3.4, z + 1.8, 5, 5, 6, TUNIC_DARK, 2.0))             # trousers
        out.append(box(sw * 2.4 + 1.4, s * 3.4, z + 0, 7.5, 5.6, 2.8, WOOD, 1.8))          # boots
    out.append(box(0, 0, z + 7, 10.5 + breathe, 12 + breathe, 9, TUNIC, 4))                # the tunic
    out.append(box(0, 0, z + 10.6, 11, 12.6, 1.6, TIMBER, 0.7))                           # the belt
    out.append(box(5.6, 0, z + 10.3, 1.4, 3, 2.2, YELLOW, 0.6))                           # its buckle
    out.append(box(2.2, 7.4, z + 7.6, 3.6, 3.4, 4.4, NET, 1.6))                           # the coin purse
    for s in (-1, 1):
        if s > 0 and show > 0:
            out.append(box(1.4, 7.4, z + 10.6 + show * 1.5, 4, 4, 6.5, TUNIC, 1.8))       # raised sleeve
            out.append(box(3.2, 7.4, z + 15.6 + show * 2, 4.4, 4.4, 4, SKIN, 1.8))          # hand
            out.append(box(4.6, 7.4, z + 19.4 + show * 2, 1.2, 3.6, 3.6, YELLOW, 0.6))      # the coin
        else:
            sw = -stride * s
            out.append(box(sw * 2.4, s * 7.4, z + 7.6, 4, 4, 8, TUNIC, 1.8))
            out.append(box(sw * 2.4 + 0.6, s * 7.4, z + 5.8, 4.4, 4.4, 3.4, SKIN, 1.8))
    # the head: a round pale face, a huge ruddy nose and a white moustache; the cap hides the eyes
    hz = z + 15.8 + breathe * 0.6
    out.append(box(0.8, 0, hz, 14, 15, 12, SKIN, 5.4))
    out.append(box(10.0, 0, hz + 1.6, 6, 6, 6, NOSE, 3.0))                                # the nose
    out.append(box(8.8, 0, hz - 0.2, 3.4, 12, 2.8, WHITE, 1.3))                           # the moustache
    for s in (-1, 1):
        out.append(box(8.4, s * 5.6, hz - 1.6, 3.2, 3.4, 3.4, WHITE, 1.5))                # its drooping ends
        out.append(box(0.4, s * 8.4, hz + 2.4, 3.2, 3.4, 4.2, SKIN, 1.6))                 # ear
    # the classic gnome cap: a deep brim down over the eyes, then a tall cone with a bent tip
    out.append(box(0.8, 0, hz + 5.0, 15.6, 16.6, 5.4, RED, 2.6))
    out.append(box(0.6, 0, hz + 9.4, 14.8, 15.8, 5.2, RED, 4.2))
    out.append(box(-0.6, 0, hz + 13.6, 10.4, 11.4, 5, RED, 3.6))
    out.append(box(-2.6 - tilt * 0.6, 0, hz + 17.6, 5.4, 6, 3.6, RED, 2.4))
    out.append(box(-4.8 - tilt, 0, hz + 20.4, 3.4, 3.8, 3.2, RED, 1.6))
    # a smaller pack of wares with a rolled blanket
    out.append(box(-7.2, 0, z + 4.6, 5.4, 10, 8, DOOR, 2.4))
    out.append(box(-7.4, 0, z + 11.8, 5, 11.4, 3.4, WHITE, 1.6))
    out.append(box(-8.0, -6.0, z + 6.0, 4.2, 4.0, 4.6, NET, 1.8))
    return out


def idle_poses():
    out = []
    for n in range(4):
        t = n / 4
        out.append(merchant(breathe=0.5 * math.sin(math.tau * t), show=1.0 if n in (2, 3) else 0.0))
    return out


def walk_poses():
    return [merchant(stride=1.0, tilt=0.8), merchant(bob=0.6), merchant(stride=-1.0, tilt=-0.4), merchant(bob=0.6)]


SHEETS = {"idle": idle_poses, "walk": walk_poses}


def volume():
    return (-64, -64, 0), (128, 128, 112)


def write_models():
    os.makedirs(MODELS_OUT, exist_ok=True)
    written = {}
    for sheet, poses in SHEETS.items():
        written[sheet] = []
        for n, boxes in enumerate(poses()):
            cells = vox_lib.shell(vox_lib.voxelise(boxes, SCALE, bake=False))
            path = os.path.join(MODELS_OUT, f"merchant_{sheet}_{n}.vox")
            _, count, _ = vox_lib.write_vox(path, cells, palette=PALETTE, bounds=volume())
            written[sheet].append(path)
            print(f"{os.path.basename(path):26} {count:6} voxels")
    return written


def render_cells(path, rows, scratch, name):
    import bpy

    import vox_render as vr

    x, y, w, h = CELL
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
    for row in rows:
        model.rotation_euler = (0, 0, math.radians(row * 22.5 + 45))
        out = os.path.join(scratch, f"{name}_{row}.png")
        scene.render.filepath = out
        bpy.ops.render.render(write_still=True)
        cells.append(out)
    return cells


def lay_out(rows, target):
    """One image of `rows` (each a list of cell paths, left to right), every cell cropped to the
    union of the figures so they keep their relative size."""
    from PIL import Image

    cells = [Image.open(c).convert("RGBA") for row in rows for c in row]
    boxes = [c.getbbox() for c in cells]
    left, top = min(b[0] for b in boxes) - 6, min(b[1] for b in boxes) - 6
    right, bottom = max(b[2] for b in boxes) + 6, max(b[3] for b in boxes) + 6
    cw, ch = right - left, bottom - top
    width = max(len(r) for r in rows)
    image = Image.new("RGBA", (cw * width, ch * len(rows)), (214, 208, 190, 255))
    for y, row in enumerate(rows):
        for x, cell in enumerate(row):
            c = Image.open(cell).convert("RGBA").crop((left, top, right, bottom))
            image.paste(c, (x * cw, y * ch), c)
    image.save(target)
    return cw, ch


def preview(written):
    """Row 1: the idle pose turned through four facings. Row 2: every pose facing south-east."""
    import tempfile

    scratch = tempfile.mkdtemp(prefix="merchant-preview-")
    turn = [FACINGS.index(f) for f in ("south-east", "south-west", "north-west", "north-east")]
    rows = [render_cells(written["idle"][0], turn, scratch, "turn")]
    south_east = FACINGS.index("south-east")
    rows.append([render_cells(path, [south_east], scratch, f"{sheet}_{n}")[0]
                 for sheet, paths in written.items() for n, path in enumerate(paths)])
    target = os.path.join(ROOT, "lib", "target", "merchant-preview.png")
    os.makedirs(os.path.dirname(target), exist_ok=True)
    lay_out(rows, target)
    print(f"ok {target}")


def main():
    written = write_models()
    if "--preview" in sys.argv:
        preview(written)


if __name__ == "__main__":
    main()
