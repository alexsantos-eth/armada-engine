#!/usr/bin/env python3
# merchant.py — the market merchant NPC: its voxel model in every pose, and (later) its sheets.
#
#   python3 artifacts/vox/merchant/merchant.py             writes the poses as .vox (artifacts/vox/models/merchant/)
#   python3 artifacts/vox/merchant/merchant.py --preview   …and renders lib/target/merchant-preview.png:
#                                                          a turnaround plus every pose, to judge the design
#
# A chubby monkey like the player, but standing and dressed for the stall: a wide ochre hat with a
# red band, a teal tunic under a cream apron, a belt with a coin purse, and a big backpack of wares
# with a rolled blanket on top. Facing +x, built from rounded boxes in the kit's palette, no slab of
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
    BONE_EDGE, DOOR, NET, OCHRE, PALETTE, PLASTER, RED, SCALE, SOOT, TIMBER, WHITE, YELLOW, MONKEY,
    MONKEY_FACE, TUNIC, TUNIC_DARK, box,
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


def merchant(breathe=0.0, stride=0.0, show=0.0, bob=0.0):
    """The merchant facing +x in one pose, in kit units (a block is 28).
    breathe: chest and apron swelling; stride: the left leg forward and the right back (negative
    for the other way), also swinging the arms; show: the right hand lifted with a coin;
    bob: the whole body up a little between strides."""
    z = bob
    out = []
    for s in (-1, 1):
        sw = stride * s
        # legs and feet
        out.append(box(sw * 2.4, s * 3.4, z + 1.6, 5, 5, 6.5, MONKEY, 2.0))
        out.append(box(sw * 2.4 + 1.6, s * 3.4, z + 0, 7.5, 5.6, 2.4, MONKEY_FACE, 1.8))
    out.append(box(0, 0, z + 6.5, 11, 12.5, 4, TUNIC_DARK, 3))                      # the skirt of the tunic
    out.append(box(0, 0, z + 8.5, 10.5 + breathe, 12 + breathe, 8.5, TUNIC, 4))     # the body
    out.append(box(4.2 + breathe * 0.6, 0, z + 6.8, 2.6, 8.4, 8.4, PLASTER, 1.2))   # the apron
    out.append(box(0, 0, z + 11.2, 11, 12.6, 1.6, TIMBER, 0.7))                     # the belt
    out.append(box(2.2, 7.4, z + 8.4, 3.6, 3.4, 4.4, NET, 1.6))                     # the coin purse
    # arms: the left hangs and swings, the right swings or lifts a coin
    for s in (-1, 1):
        if s > 0 and show > 0:
            out.append(box(1.4, 7.2, z + 11.6 + show * 1.5, 4, 4, 6.5, MONKEY, 1.8))  # raised arm
            out.append(box(3.2, 7.2, z + 16.6 + show * 2, 4, 4, 4, MONKEY_FACE, 1.8))  # hand
            out.append(box(4.4, 7.2, z + 20.2 + show * 2, 1.2, 3.6, 3.6, YELLOW, 0.6))  # the coin
        else:
            sw = -stride * s
            out.append(box(sw * 2.4, s * 7.4, z + 7.2, 4, 4, 8, MONKEY, 1.8))
            out.append(box(sw * 2.4 + 0.6, s * 7.4, z + 5.8, 4.4, 4.2, 3.2, MONKEY_FACE, 1.8))
    # the head: round, with a pale face mask, big dark eyes, little ears
    hz = z + 15.4 + breathe * 0.6
    out.append(box(0.8, 0, hz, 14, 15, 12, MONKEY, 5.4))
    out.append(box(6.8, 0, hz + 0.8, 3, 10.6, 8.4, MONKEY_FACE, 2.8))
    out.append(box(8.4, 0, hz + 1.0, 1.6, 5, 3.4, MONKEY_FACE, 1.4))              # the muzzle
    out.append(box(9.4, 0, hz + 3.0, 1, 2.2, 1.6, SOOT, 0.5))                     # the nose
    for s in (-1, 1):
        out.append(box(8.2, s * 3.4, hz + 5.2, 2.2, 3.2, 4.4, SOOT, 1.0))           # eye
        out.append(box(0.4, s * 8.4, hz + 5.0, 3.6, 3.6, 4.6, MONKEY, 1.6))           # ear
    # the hat: a wide brim, a round crown, a red band
    out.append(box(-1.6, 0, hz + 10.4, 15, 16, 1.8, OCHRE, 0.9))
    out.append(box(-1.6, 0, hz + 11.6, 10, 10.6, 4.4, OCHRE, 3.2))
    out.append(box(-1.6, 0, hz + 11.8, 10.8, 11.4, 1.6, RED, 0.7))
    # the backpack of wares, a rolled blanket on top and a bundle at the side
    out.append(box(-7.4, 0, z + 5.4, 6, 11, 10.5, DOOR, 2.4))
    out.append(box(-7.4, 0, z + 6.0, 6.4, 11.4, 1.4, TIMBER, 0.6))                   # its strap
    out.append(box(-7.6, 0, z + 16.0, 5.4, 12.6, 3.6, RED, 1.7))                    # the rolled blanket
    out.append(box(-7.6, 0, z + 17.0, 5.8, 3.0, 2.0, BONE_EDGE, 0.8))               # its tie
    out.append(box(-8.2, -6.0, z + 6.0, 4.4, 4.0, 5.0, NET, 1.8))                   # a bundle
    return out


def idle_poses():
    out = []
    for n in range(4):
        t = n / 4
        out.append(merchant(breathe=0.5 * math.sin(math.tau * t), show=1.0 if n in (2, 3) else 0.0))
    return out


def walk_poses():
    return [merchant(stride=1.0, bob=0.0), merchant(stride=0.0, bob=0.6),
            merchant(stride=-1.0, bob=0.0), merchant(stride=0.0, bob=0.6)]


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
