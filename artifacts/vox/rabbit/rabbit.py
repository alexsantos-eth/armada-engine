#!/usr/bin/env python3
# rabbit.py — the meadow rabbit NPC: its voxel model in every pose, and its three sprite sheets.
#
#   python3 artifacts/vox/rabbit/rabbit.py             writes the poses as .vox (artifacts/vox/models/rabbit/)
#   python3 artifacts/vox/rabbit/rabbit.py --render    …and renders the sheets with Blender (the `bpy` module)
#   python3 artifacts/vox/rabbit/rabbit.py --preview   …renders one facing (south-east) of every pose
#                                                      into lib/target/rabbit-preview.png, to judge the model
#
# The rabbit is built from rounded boxes like every kit piece (vox_prefabs.box), in the palette of
# the kit, facing +x: a round body over big haunches, long hind feet, small front paws, a head
# with a pale muzzle, two long ears and a white scut. It has no slab of its own and stands on
# z = 0. Like the crab it is drawn from sheets: one row per facing (the 16 of PLAYER_FACINGS,
# east first, counter-clockwise) and one column per pose, every cell a clay render of the same
# model turned on its foot so the sun stays where it is.
#
#   idle  8 poses   sitting up: the nose twitches, the ears flick, the flanks breathe (one cycle of
#                   the client's idle period, 0.9 s)
#   walk  9 poses   column 0 sits; 1–8 are two little hops, four poses each: gather, push off
#                   the hind feet, stretched in the air, land on the front paws. The hop is low
#                   and lives in the sprite: the game keeps the rabbit's feet on the ground.
#   jump  5 poses   takeoff, rise, apex, fall, landing: the bigger hop the game lifts off the
#                   ground now and then (the client's jump phases, in the player's order)
#
# Out: lib/painted/rabbit_{idle,walk,jump}.png (the rendered sheets, cut into cells by
# lib/scripts/rasterize.py) and lib/assets/rabbit/{idle,walk,jump}.json (their sidecars). Rebuild
# the atlas afterwards (lib/scripts/build-atlas.sh) and recompile the game.
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CLAY = os.path.join(HERE, "..", "clay")
sys.path.insert(0, CLAY)

import vox_lib  # noqa: E402
from vox_prefabs import FUR, PALETTE, PINK, SCALE, SOOT, WHITE, box  # noqa: E402

ROOT = os.path.normpath(os.path.join(HERE, "..", "..", ".."))
MODELS_OUT = os.path.join(HERE, "..", "models", "rabbit")
PAINTED = os.path.join(ROOT, "lib", "painted")
SIDECARS = os.path.join(ROOT, "lib", "assets", "rabbit")

BELLY, EAR, EYE, GLINT = WHITE, PINK, SOOT, WHITE

FACINGS = [
    "east", "east-north-east", "north-east", "north-north-east", "north", "north-north-west",
    "north-west", "west-north-west", "west", "west-south-west", "south-west", "south-south-west",
    "south", "south-south-east", "south-east", "east-south-east",
]

# The cell of every pose on the 1x1x1 template canvas (1024 x 853, the foot at 512, 597), in
# canvas pixels: x, y, width, height. Wide enough for the stretched body in every facing and
# tall enough for the ears of a rabbit at the top of a sprite hop.
CELL = (352, 357, 320, 300)
# Rendered at half the canvas resolution: twice what the atlas keeps (320 px a tile).
RENDER_PERCENT = 50
SAMPLES = 48


def rabbit(lift=0.0, gather=0.0, stretch=0.0, rear=0.0, front=0.0, ears=0.0, flick=0.0,
           nose=0.0, breathe=0.0, look=0.0):
    """The rabbit facing +x in one pose. Every argument is in kit units (a block is 28).
    lift: the whole body off the ground (a sprite hop); gather: the body bunched over its feet;
    stretch: the body drawn out, hind feet back and front paws forward (in the air);
    rear: the hind feet off the ground; front: the front paws off the ground;
    ears: the ears laid back; flick: one ear dropped a little; nose: the nose up a little;
    breathe: the flanks swelling; look: the head turned up."""
    z = lift
    long = 13 + 3 * stretch - 2 * gather
    tall = 9 - 1.5 * stretch + 1.0 * gather + breathe
    head_x = 7.5 + 2.5 * stretch - 1.5 * gather
    head_z = z + 7.5 - 1.2 * stretch + 0.8 * gather + look
    out = [
        box(-2, 0, z + 2.5, long, 11 + breathe, tall, FUR, 4.6),               # the body
        box(1.5 + stretch, 0, z + 3, 5, 8, 6, BELLY, 2.4),                     # the chest
        box(-9.5 - 1.5 * stretch + gather, 0, z + 6 - stretch, 4, 4, 4, WHITE, 2.0),  # the scut
    ]
    for s in (-1, 1):
        out.append(box(-5.5 + gather, s * 4.5, z + 1.5, 8, 4, 7.5, FUR, 3.4))        # haunch
        out.append(box(-5 - 3 * stretch + 2 * gather, s * 4, z + rear, 8, 3, 2.5, FUR, 1.2))  # hind foot
        out.append(box(5 + 2.5 * stretch - gather, s * 2.5, z + front, 3, 2.5, 4.5, FUR, 1.2))  # front paw
        out.append(box(head_x + 3, s * 3.6, head_z + 3.2, 1.4, 1.2, 1.8, EYE, 0.6))  # eye
        out.append(box(head_x + 3.5, s * 3.6, head_z + 4.2, 0.6, 0.6, 0.6, GLINT, 0.3))  # its glint
        lean = ears + (0.8 * flick if s > 0 else 0.0)
        ear_x = head_x - 0.5 - lean
        out.append(box(ear_x, s * 2, head_z + 7, 2.5, 3, 5, FUR, 1.2))               # ear, low
        out.append(box(ear_x - 1.2 * lean, s * 2.2, head_z + 11, 2.5, 3, 5, FUR, 1.2))  # ear, high
        out.append(box(ear_x + 1.2, s * 2, head_z + 8, 0.8, 2, 4, EAR, 0.4))         # inside, low
        out.append(box(ear_x + 1.2 - 1.2 * lean, s * 2.2, head_z + 11, 0.8, 2, 4, EAR, 0.4))  # inside, high
    out.append(box(head_x, 0, head_z, 9, 8, 8, FUR, 3.6))                            # the head
    out.append(box(head_x + 4, 0, head_z + 0.5 + nose * 0.4, 3, 5, 3.5, BELLY, 1.4))  # the muzzle
    out.append(box(head_x + 5.2, 0, head_z + 2.8 + nose, 1, 1.6, 1, EAR, 0.4))       # the nose
    return out


def idle_poses():
    """One cycle of sitting about: the nose twitches twice, an ear flicks, the flanks breathe."""
    out = []
    for n in range(8):
        t = n / 8
        out.append(rabbit(nose=0.6 * max(0.0, math.sin(2 * math.tau * t)),
                          breathe=0.5 * math.sin(math.tau * t),
                          flick=1.0 if n in (5, 6) else 0.0,
                          look=0.4 * (1 - math.cos(math.tau * t))))
    return out


def hop(phase):
    """One of the four poses of a little hop: gather, push off, stretched in the air, land."""
    return [
        dict(gather=1.0, ears=0.6),
        dict(lift=1.0, stretch=0.6, front=1.5, ears=1.2, look=-0.3),
        dict(lift=2.5, stretch=1.0, rear=1.0, front=0.6, ears=1.6),
        dict(lift=0.6, stretch=0.3, rear=1.8, ears=1.0, look=-0.6),
    ][phase]


def walk_poses():
    """Sitting, then two little hops of four poses each."""
    return [rabbit()] + [rabbit(**hop(phase)) for _ in range(2) for phase in range(4)]


def jump_poses():
    """The five phases of the bigger hop, in the player's order: takeoff, rise, apex, fall,
    landing. The game lifts the rabbit off the ground; the poses only bend its body."""
    return [
        rabbit(gather=1.4, ears=0.8, look=-0.4),                      # takeoff: bunched to spring
        rabbit(stretch=1.0, front=2.0, ears=1.8, look=0.8),           # rise: drawn out, ears back
        rabbit(stretch=0.6, rear=1.5, front=1.5, ears=1.4, look=0.4),  # apex: tucked a little
        rabbit(stretch=0.8, rear=2.5, ears=1.0, look=-0.8),           # fall: paws reaching down
        rabbit(gather=0.8, rear=0.8, ears=0.4, look=-0.4),            # landing: the haunches give
    ]


SHEETS = {"idle": idle_poses, "walk": walk_poses, "jump": jump_poses}


def volume():
    return (-64, -64, 0), (128, 128, 112)


def write_models():
    """Every pose as a .vox on its tile's volume; returns {sheet: [paths]}."""
    os.makedirs(MODELS_OUT, exist_ok=True)
    written = {}
    for sheet, poses in SHEETS.items():
        written[sheet] = []
        for n, boxes in enumerate(poses()):
            cells = vox_lib.shell(vox_lib.voxelise(boxes, SCALE, bake=False))
            path = os.path.join(MODELS_OUT, f"rabbit_{sheet}_{n}.vox")
            _, count, _ = vox_lib.write_vox(path, cells, palette=PALETTE, bounds=volume())
            written[sheet].append(path)
            print(f"{os.path.basename(path):26} {count:6} voxels")
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
    with open(os.path.join(SIDECARS, sheet + ".json"), "w", encoding="utf-8") as file:
        json.dump(data, file, indent=2)
        file.write("\n")


def render_cells(path, rows, scratch, name):
    """Renders the pose at `path` in the facings `rows`; returns the cell images in that order."""
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
        # Facing `row` heads at row · 22.5° on the ground, counted from the screen's right
        # towards its top; the model's +x heads that way once turned 45° more.
        model.rotation_euler = (0, 0, math.radians(row * 22.5 + 45))
        out = os.path.join(scratch, f"{name}_{row}.png")
        scene.render.filepath = out
        bpy.ops.render.render(write_still=True)
        cells.append(out)
    return cells


def lay_out(columns, target):
    """One image of `columns` (each a list of cell paths, top to bottom), side by side."""
    from PIL import Image

    first = Image.open(columns[0][0])
    cw, ch = first.size
    image = Image.new("RGBA", (cw * len(columns), ch * len(columns[0])))
    for column, cells in enumerate(columns):
        for row, cell in enumerate(cells):
            image.paste(Image.open(cell).convert("RGBA").resize((cw, ch)), (column * cw, row * ch))
    image.save(target)
    return cw, ch


def render(written):
    """Renders every pose in every facing and lays the cells out as one sheet per animation."""
    import tempfile

    os.makedirs(PAINTED, exist_ok=True)
    scratch = tempfile.mkdtemp(prefix="rabbit-cells-")
    for sheet, paths in written.items():
        columns = []
        for column, path in enumerate(paths):
            columns.append(render_cells(path, range(len(FACINGS)), scratch, f"{sheet}_{column}"))
            print(f"{sheet} pose {column}: {len(FACINGS)} facings", flush=True)
        target = os.path.join(PAINTED, f"rabbit_{sheet}.png")
        cw, ch = lay_out(columns, target)
        print(f"ok {target}: {len(columns)} poses x {len(FACINGS)} facings, cell {cw} x {ch}")


def preview(written):
    """Every pose of every sheet in one facing, side by side: a quick look at the model."""
    import tempfile

    scratch = tempfile.mkdtemp(prefix="rabbit-preview-")
    south_east = FACINGS.index("south-east")
    columns = [render_cells(path, [south_east, FACINGS.index("east")], scratch, f"{sheet}_{n}")
               for sheet, paths in written.items() for n, path in enumerate(paths)]
    target = os.path.join(ROOT, "lib", "target", "rabbit-preview.png")
    os.makedirs(os.path.dirname(target), exist_ok=True)
    lay_out(columns, target)
    print(f"ok {target}")


def main():
    written = write_models()
    for sheet, paths in written.items():
        write_sidecar(sheet, len(paths))
    if "--preview" in sys.argv:
        preview(written)
    if "--render" in sys.argv:
        render(written)


if __name__ == "__main__":
    main()
