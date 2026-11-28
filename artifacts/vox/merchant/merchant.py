#!/usr/bin/env python3
# merchant.py — the market merchant NPC (a tanuki): its voxel model in every pose, and (later) its sheets.
#
#   python3 artifacts/vox/merchant/merchant.py             writes the poses as .vox (artifacts/vox/models/merchant/)
#   python3 artifacts/vox/merchant/merchant.py --preview   …and renders lib/target/merchant-preview.png:
#                                                          a turnaround plus every pose, to judge the design
#
# A friendly tanuki peddler with the player's chunky proportions: a little straw hat between
# round ears, big eyes in a dark mask, a cream muzzle and belly, a striped tail and free-hanging
# arms. Facing +x, built from rounded boxes in the kit's palette, no slab of its own: it
# stands on z = 0.
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
    CREAM, PALETTE, RED, SCALE, SOOT, TANUKI, TANUKI_DARK, THATCH, TIMBER,
    WHITE, box,
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
    """The tanuki merchant facing +x in one pose, in kit units (a block is 28).
    breathe: belly swelling; stride: left leg forward and right back (negative for the other
    way), also swinging the free arm; show: the jug lifted in the right hand; bob: the whole body
    up a little between strides; tilt: the tail swaying."""
    z = bob
    out = []
    # the monkey's proportions: a head over half the height, a short body, stubby limbs
    for s in (-1, 1):
        sw = stride * s
        out.append(box(sw * 2.4, s * 3.6, z + 2.0, 5.2, 5, 3.8, TANUKI_DARK, 2.0))         # legs
        out.append(box(sw * 2.4 + 1.5, s * 3.6, z + 0, 8, 6, 2.6, TANUKI_DARK, 2.0))       # feet
    out.append(box(0, 0, z + 4.6, 11 + breathe, 13 + breathe, 7.8, TANUKI, 3))             # the body
    out.append(box(4.4 + breathe, 0, z + 4.2, 5, 9, 7.6, CREAM, 3.4))                    # the round belly
    # the arms hang free at the sides and swing with the stride, like the monkey's
    for s in (-1, 1):
        sw = -stride * s
        out.append(box(sw * 2.4, s * 6.6, z + 4.8, 4.8, 4.8, 7.6, TANUKI, 2.2))
        out.append(box(sw * 2.4 + 0.8, s * 6.6, z + 3.4, 5, 5, 3.6, TANUKI_DARK, 2.2))
    # the head: wide and round, a cream muzzle, a dark mask round big friendly eyes
    hz = z + 11.4 + breathe * 0.6
    out.append(box(0.8, 0, hz, 15.4, 17, 13, TANUKI, 4.4))
    out.append(box(8.4, 0, hz + 0.2, 3.6, 10, 6.4, CREAM, 2.8))                          # the muzzle
    out.append(box(10.4, 0, hz + 3.6, 2.2, 3.8, 2.4, SOOT, 1.1))                          # the nose
    for s in (-1, 1):
        out.append(box(7.2, s * 3.9, hz + 5.0, 3.4, 5.6, 6.6, TANUKI_DARK, 2.8))          # the mask
        out.append(box(8.8, s * 3.9, hz + 5.4, 1.8, 4.2, 5.2, WHITE, 2.1))                # the eye
        out.append(box(9.6, s * 4.0, hz + 5.4, 1.4, 3.4, 4.2, SOOT, 1.6))                 # its pupil
        out.append(box(10.4, s * 3.6, hz + 7.0, 0.8, 1.6, 1.8, WHITE, 0.8))               # its glint
        out.append(box(-0.4, s * 7.6, hz + 11.4, 4.6, 4.6, 4.2, TANUKI, 2.0))             # ear
        out.append(box(0.2, s * 7.9, hz + 11.6, 2.2, 2.8, 2.6, CREAM, 1.0))               # inside the ear
    # a little straw hat perched between the ears
    out.append(box(0.0, 0, hz + 11.9, 14.4, 14, 1.6, THATCH, 0.8))
    out.append(box(0.0, 0, hz + 13.1, 9.6, 9.4, 2.8, THATCH, 1.6))
    out.append(box(0.0, 0, hz + 15.4, 5.0, 5.0, 2.2, THATCH, 1.0))
    out.append(box(0.0, 0, hz + 12.9, 10.2, 10.0, 1.2, RED, 0.6))                         # its band
    # the fat striped tail, curled up behind
    out.append(box(-9.2 - tilt * 0.4, 0, z + 3.2, 5.4, 7.4, 6.0, TANUKI, 2.7))
    out.append(box(-10.2 - tilt * 0.8, 0, z + 8.4, 5.4, 7.0, 4.0, TANUKI_DARK, 2.0))
    out.append(box(-10.2 - tilt * 1.2, 0, z + 11.8, 5.2, 6.6, 4.0, TANUKI, 2.0))
    out.append(box(-9.4 - tilt * 1.6, 0, z + 15.0, 4.2, 5.2, 3.0, CREAM, 1.5))
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
