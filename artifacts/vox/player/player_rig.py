# player_rig.py — the player's sheets rendered in Blender from the rigged monkey (Meshy FBX).
#
# The model is `player_rig/rigged_character.fbx`: one textured mesh skinned to a 24-bone
# armature (Hips, three spine bones, neck, Head, shoulders, arms, forearms, hands, thighs,
# shins, feet, toes) in a T-pose, with no animation. Every sheet's poses are the ones the
# sheet generators give monkey.py's boxes (player_walk.py, player_idle.py, …), read off by
# player_rig_poses.py into `player_rig/poses.json` and put on the bones here. (Meshy's own
# walk, `walking.fbx`, bent the mesh too much, so it is not used.)
#
# Every cell is drawn through the game's camera: an orthographic view down (1, 1, 1) of the
# figure's world, squashed to the 2:1 diamond (screen x = x - y, screen y = (x + y) / 2 - z),
# so the feet land where the old sheets put them and `lib/scripts/rasterize.py` cuts the PNG
# with the same JSON sidecars (`lib/assets/player-16/<sheet>.json`: cell, frames, facings).
# Blender works in a right-handed world and the figure's x/y are left-handed on screen, so the
# figure's (x, y, z) is Blender's (y, x, z).
#
# Run it with plain Python (it runs Blender headless, $BLENDER or /Applications/Blender.app, and
# lays the cells out with Pillow); first refresh the poses if a generator changed:
#
#   python3 player_rig_poses.py
#   python3 player_rig.py [sheet ...]          -> ../../../lib/painted/player-16_<sheet>.png
#   python3 player_rig.py --cell walk 12 3 out.png
#
# A sheet named `chop_<tool id>` (player_chop.py) is the chop poses with that tool in the right
# hand: the tool is the voxel model of ../clay/vox_tools.py, drawn as rounded boxes in flat clay
# colours, held where the rig's right hand closes and pointing where the cell's `tool_dir` says.
import math
import json
import os
import sys

import subprocess
import tempfile

try:
    import bpy
    import bmesh
    from mathutils import Matrix, Quaternion, Vector
except ImportError:      # plain Python: the driver, which runs Blender and lays out the sheets
    bpy = None

HERE = os.path.dirname(os.path.abspath(__file__))
RIG = os.path.join(HERE, "player_rig")
SHEETS = os.path.join(HERE, "..", "..", "..", "lib", "assets", "player-16")
OUT = os.path.join(HERE, "..", "..", "..", "lib", "painted")
POSES = os.path.join(RIG, "poses.json")    # made by player_rig_poses.py (plain Python)
CLAY = os.path.join(HERE, "..", "clay")    # vox_tools.py: the tools' boxes
# The chop sheets are drawn in a window big enough for a tool swung overhead and out in front,
# then cropped to what every cell of the sheet actually uses (fit_sheet): canvas x, y, w, h.
CHOP_WINDOW = (188, 131, 648, 640)
FIT_MARGIN = 3          # pixels kept around the used part of a fitted sheet
GRIP_ALONG = 0.55       # where on the hand bone the fist closes on the handle (share of its length)

CX, CY = 512, 256       # the tile's centre on the template canvas (iso_lib.py)
CANVAS_TOP = -341       # the canvas's top, in the figure's screen units
OUT_SCALE = 0.5         # pixels per canvas unit in the PNG (as player_model.py)
SUPER = int(os.environ.get("PLAYER_RIG_SUPER", "2"))    # render this many times larger, then scale down
HEIGHT = 250.0          # the figure's height standing, in figure units (monkey.py's)

# The game's sun, upper right, in the figure's world; Blender's is (y, x, z).
SUN = (0.58, -0.30, 0.76)
ARM_LIMIT, ARM_SHARE = 40, 0.25    # the idle's arms: degrees from the body before easing, share kept past it
ARM_OUT = 14            # degrees the arms hang out from the sides, standing

# The monkey's frame (x forward, y its side, z up) in the rig's armature space, which faces -y:
# the monkey's +y side is the rig's right (-x). A mirror, like the game's own view of the figure.
FIG = None

R2, R6 = math.sqrt(2), math.sqrt(6)
if bpy is not None:
    FIG = Matrix(((0, -1, 0), (-1, 0, 0), (0, 0, 1)))


def blender(v):
    """A vector of the figure's world in Blender's."""
    return Vector((v[1], v[0], v[2]))


def facing_yaw(index, count):
    """Yaw of facing `index` in the figure's world (player_walk.facing_yaw)."""
    d = math.radians(360 * index / count)
    right, up = math.cos(d), math.sin(d)
    return math.atan2((-right - up) / 2, (right - up) / 2)


def pose_sheet(name):
    """The poses a sheet is drawn from: the chop sheets of every tool share the chop's."""
    return "chop" if name.startswith("chop_") else name


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def sheet_of(name):
    with open(os.path.join(SHEETS, name + ".json"), encoding="utf-8") as file:
        sheet = json.load(file)
    x, y, w, h = CHOP_WINDOW if name.startswith("chop_") else sheet["cell"]
    return (x, y + CANVAS_TOP, w, h), sheet["frames"], len(sheet["facings"])


class Stage:
    """The scene: the rig, the camera through the game's projection, the sun."""

    def __init__(self):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        scene = bpy.context.scene
        self.scene = scene
        bpy.ops.import_scene.fbx(filepath=os.path.join(RIG, "rigged_character.fbx"))
        self.arm = next(o for o in scene.objects if o.type == "ARMATURE")
        self.mesh = next(o for o in scene.objects if o.type == "MESH")
        self.arm.animation_data_create()
        self.arm.animation_data.action = None
        # The rig's own forward (headfront points out of the face) and its scale to the figure.
        hf = self.arm.data.bones["headfront"]
        f = (self.arm.matrix_world.to_3x3() @ (hf.tail_local - hf.head_local))
        self.forward_angle = math.atan2(f.y, f.x)
        # An empty above the armature carries the turn and scale; the armature keeps its own
        # transform (the FBX's centimetres).
        self.root = bpy.data.objects.new("root", None)
        scene.collection.objects.link(self.root)
        self.arm.parent = self.root
        self.arm.matrix_parent_inverse = Matrix.Identity(4)
        self.unit = 1.0
        self.anchor = Vector((0, 0, 0))
        with open(POSES, encoding="utf-8") as file:
            self.poses = json.load(file)
        self.learn_rest()
        # Standing: the walk sheet's column 0. Its height sets the scale, its feet the ground.
        self.retarget(self.poses["sheets"]["walk"][0][0])
        low, high = self.bounds()
        self.unit = HEIGHT / (high.z - low.z)
        hips = self.arm.matrix_world @ self.arm.pose.bones["Hips"].matrix.translation
        self.anchor = Vector((hips.x, hips.y, low.z))
        self.setup_render()

    def make_tool(self, tool_id):
        """Builds the tool `tool_id` of vox_tools.py as rounded clay boxes under one empty (in the
        figure's units, handle up the z axis from its butt), parented to the armature."""
        sys.path.insert(0, CLAY)
        import vox_tools
        boxes = vox_tools.TOOLS[tool_id]()
        self.tool = bpy.data.objects.new("tool", None)
        self.scene.collection.objects.link(self.tool)
        self.tool.parent = self.arm
        self.tool.matrix_parent_inverse = Matrix.Identity(4)
        self.grip = vox_tools.GRIP * 4
        materials = {}
        for number, box in enumerate(boxes):
            color = box["color"]
            if color not in materials:
                material = bpy.data.materials.new("tool" + color)
                material.use_nodes = True
                shader = material.node_tree.nodes["Principled BSDF"]
                rgb = [srgb_to_linear(int(color[i:i + 2], 16) / 255) for i in (1, 3, 5)]
                shader.inputs["Base Color"].default_value = (*rgb, 1.0)
                shader.inputs["Roughness"].default_value = 0.55
                materials[color] = material
            mesh = bpy.data.meshes.new("box%d" % number)
            maker = bmesh.new()
            bmesh.ops.create_cube(maker, size=2.0)
            hx, hy, hz = box["h"]
            cx, cy, cz = box["c"]
            for v in maker.verts:
                v.co = Vector((v.co.x * hx + cx, v.co.y * hy + cy, v.co.z * hz + cz))
            maker.to_mesh(mesh)
            maker.free()
            for polygon in mesh.polygons:
                polygon.use_smooth = True
            mesh.materials.append(materials[color])
            piece = bpy.data.objects.new("box%d" % number, mesh)
            self.scene.collection.objects.link(piece)
            piece.parent = self.tool
            bevel = piece.modifiers.new("round", "BEVEL")
            bevel.width = min(box["r"], hx, hy, hz) * 0.98
            bevel.segments = 4
            bevel.limit_method = "NONE"

    def drop_tool(self):
        for piece in list(self.tool.children):
            bpy.data.objects.remove(piece)
        bpy.data.objects.remove(self.tool)

    def hold(self, cell):
        """Puts the tool in the right hand of the rig as it is posed for `cell`."""
        bones = self.arm.pose.bones
        hand = bones["RightHand"]
        grip = hand.head + (hand.tail - hand.head) * GRIP_ALONG
        z = Vector(cell["tool_dir"])
        y = Vector((0.0, 1.0, 0.0))
        x = y.cross(z)
        y = z.cross(x)
        basis = Matrix(((x.x, y.x, z.x), (x.y, y.y, z.y), (x.z, y.z, z.z)))
        frame = (FIG @ basis).to_4x4() @ Matrix.Scale(100 / self.unit, 4)
        self.tool.matrix_local = Matrix.Translation(grip) @ frame @ Matrix.Translation((0, 0, -self.grip))
        bpy.context.view_layer.update()

    def learn_rest(self):
        """The rest pose's bones, the arms' turn from the T-pose down to the sides, and how
        much longer the rig's leg is than the monkey's."""
        bones = self.arm.data.bones
        self.rest = {b.name: b.matrix_local.to_3x3().normalized() for b in bones}
        self.hang = {}
        for side in ("Left", "Right"):
            arm, hand = bones[side + "Arm"], bones[side + "Hand"]
            along = (hand.tail_local - arm.head_local).normalized()
            out = 1 if along.x > 0 else -1
            down = Vector((out * math.sin(math.radians(ARM_OUT)), 0, -math.cos(math.radians(ARM_OUT))))
            self.hang[side] = along.rotation_difference(down).to_matrix()
        leg = bones["LeftUpLeg"].head_local - bones["LeftFoot"].head_local
        monkey_leg = self.poses["hip"][2] - self.poses["ankle"][2]
        self.leg_scale = leg.length / monkey_leg

    def clear_pose(self):
        self.arm.animation_data.action = None
        for pb in self.arm.pose.bones:
            pb.matrix_basis = Matrix.Identity(4)
        bpy.context.view_layer.update()

    def aim(self, name, rotation, at=None):
        """Sets bone `name` to `rotation` (armature space) at its posed head, or at `at`."""
        pb = self.arm.pose.bones[name]
        head = at if at is not None else pb.head
        pb.matrix = Matrix.Translation(head) @ rotation.to_4x4()
        bpy.context.view_layer.update()

    def retarget(self, cell, ease_arms=False):
        """Puts the rig in a pose of the monkey's boxes (one cell of poses.json)."""
        self.clear_pose()
        bones = self.arm.data.bones
        turn = lambda key: FIG @ Matrix(cell[key]["turn"]) @ FIG.transposed()
        body = cell["body"]
        rest_hip = Vector(self.poses["hip"])
        # The turn moves the hips as far as it moved the monkey's (the two are the same height);
        # a lift or a crouch moves them by as much more as the rig's legs are longer, so the
        # knees take it and the feet stay where the monkey's are.
        moved = (FIG @ (Vector(body["hip"]) - rest_hip) * (100 / self.unit)
                 + Vector((0, 0, body["lift"] * self.leg_scale)))
        self.aim("Hips", turn("body") @ self.rest["Hips"], bones["Hips"].head_local + moved)
        self.aim("Head", turn("head" if "head" in cell else "body") @ self.rest["Head"])
        for figure_side, side in ((1, "Right"), (-1, "Left")):
            swing = turn("arm%+d" % figure_side)
            if ease_arms:
                swing = eased(swing, turn("body"))
            arm = swing @ self.hang[side]
            hand = turn(("hand%+d" if "hand%+d" % figure_side in cell else "arm%+d") % figure_side) @ self.hang[side]
            self.aim(side + "Arm", arm @ self.rest[side + "Arm"])
            self.aim(side + "ForeArm", arm @ self.rest[side + "ForeArm"])
            self.aim(side + "Hand", hand @ self.rest[side + "Hand"])
            # The leg: the thigh's turn, the knee bent so the ankle lands where the monkey's did
            # (measured from the body's hip socket, so a crouch bends the knee).
            leg = turn("leg%+d" % figure_side)
            up, low = self.arm.pose.bones[side + "UpLeg"], bones[side + "Leg"]
            hip = up.head.copy()
            reach = Vector(cell["leg%+d" % figure_side]["ankle"]) - Vector(body["socket%+d" % figure_side])
            target = hip + FIG @ reach * self.leg_scale
            a = (bones[side + "UpLeg"].tail_local - bones[side + "UpLeg"].head_local).length
            b = (bones[side + "Foot"].head_local - low.head_local).length
            span = target - hip
            d = min(max(span.length, abs(a - b) + 1e-3), (a + b) * 0.999)
            u = span.normalized()
            pole = leg @ Vector((0, -1, 0))
            pole = (pole - u * pole.dot(u)).normalized()
            cos = (a * a + d * d - b * b) / (2 * a * d)
            knee = hip + a * (u * cos + pole * math.sqrt(max(0.0, 1 - cos * cos)))
            ankle = hip + u * d
            for name, start, end in ((side + "UpLeg", hip, knee), (side + "Leg", knee, ankle)):
                base = leg @ self.rest[name]
                now = base @ Vector((0, 1, 0))
                self.aim(name, now.rotation_difference(end - start).to_matrix() @ base)
            foot = turn(("foot%+d" if "foot%+d" % figure_side in cell else "leg%+d") % figure_side)
            self.aim(side + "Foot", foot @ self.rest[side + "Foot"])

    def bounds(self):
        dg = bpy.context.evaluated_depsgraph_get()
        m = self.mesh.evaluated_get(dg)
        mw = m.matrix_world
        vs = [mw @ v.co for v in m.data.vertices]
        low = Vector([min(v[i] for v in vs) for i in range(3)])
        high = Vector([max(v[i] for v in vs) for i in range(3)])
        return low, high

    def setup_render(self):
        scene = self.scene
        r = scene.render
        for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
            try:
                r.engine = engine
                break
            except TypeError:
                continue
        r.film_transparent = True
        r.image_settings.file_format = "PNG"
        r.image_settings.color_mode = "RGBA"
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "None"
        try:
            scene.eevee.taa_render_samples = int(os.environ.get("PLAYER_RIG_TAA", "32"))
        except AttributeError:
            pass
        world = bpy.data.worlds.new("world")
        scene.world = world
        world.use_nodes = True
        bg = world.node_tree.nodes["Background"]
        bg.inputs[0].default_value = (0.82, 0.86, 0.95, 1.0)
        bg.inputs[1].default_value = 0.55
        sun = bpy.data.lights.new("sun", "SUN")
        sun.energy = 3.2
        sun.color = (1.0, 0.95, 0.86)
        sun.angle = math.radians(12)
        self.sun = bpy.data.objects.new("sun", sun)
        scene.collection.objects.link(self.sun)
        z = blender(SUN).normalized()
        self.sun.rotation_euler = z.to_track_quat("Z", "Y").to_euler()
        cam = bpy.data.cameras.new("camera")
        cam.type = "ORTHO"
        cam.sensor_fit = "HORIZONTAL"
        cam.clip_start, cam.clip_end = 1.0, 5000.0
        self.camera = bpy.data.objects.new("camera", cam)
        scene.collection.objects.link(self.camera)
        scene.camera = self.camera

    def frame_cell(self, cell):
        """Points the camera at the window `cell` (x, y, w, h) of the canvas."""
        x0, y0, w, h = cell
        right = Vector((-1, 1, 0)) / R2
        up = Vector((-1, -1, 2)) / R6
        toward = Vector((1, 1, 1)) / math.sqrt(3)
        uc, vc = x0 + w / 2 - CX, y0 + h / 2 - CY
        centre = right * (uc / R2) - up * (vc / (R6 / 2))
        self.camera.matrix_world = Matrix.Translation(centre + toward * 1500) @ Matrix(
            (right, up, toward)).transposed().to_4x4()
        self.camera.data.ortho_scale = w / R2
        r = self.scene.render
        r.resolution_x = round(w * OUT_SCALE) * SUPER
        r.resolution_y = round(h * (2 / R6) * OUT_SCALE * R2) * SUPER
        r.resolution_percentage = 100
        return round(w * OUT_SCALE), round(h * OUT_SCALE)

    def place(self, yaw):
        """Turns the figure to face `yaw` of the figure's world, feet on the origin."""
        self.root.matrix_world = Matrix.Identity(4)
        bpy.context.view_layer.update()
        f = blender((math.cos(yaw), math.sin(yaw), 0))
        turn = math.atan2(f.y, f.x) - self.forward_angle
        self.root.matrix_world = (Matrix.Rotation(turn, 4, "Z") @ Matrix.Scale(self.unit, 4)
                                  @ Matrix.Translation(-self.anchor))
        bpy.context.view_layer.update()

    def shoot(self, path):
        self.scene.render.filepath = path
        bpy.ops.render.render(write_still=True)


def eased(turn, body):
    """`turn` with its swing away from `body` eased: past ARM_LIMIT only ARM_SHARE of the rest.

    The model's head is wide, so an arm lifted as far as the monkey's boxes lift it (the idle
    dance, far out to the side) would go into the ear (as player_model.py eases it)."""
    swing = (turn @ body.transposed()).to_quaternion()
    limit = math.radians(ARM_LIMIT)
    if swing.angle <= limit:
        return turn
    swing = Quaternion(swing.axis, limit + (swing.angle - limit) * ARM_SHARE)
    return swing.to_matrix() @ body


def pose_cell(stage, name, row, column, rows):
    """Puts the rig in the pose of cell (row, column) of sheet `name` (with its tool in hand)."""
    yaw = facing_yaw(row, rows)
    cell = stage.poses["sheets"][pose_sheet(name)][row][column]
    stage.retarget(cell, ease_arms=name == "idle")
    if name.startswith("chop_"):
        stage.hold(cell)
    stage.place(yaw)


def render_cells(argv):
    """Inside Blender: renders the cells named on the command line, full size, one PNG each.

    argv: out_dir, then sheet names; or --cell sheet row column path."""
    stage = Stage()
    if argv[0] == "--cell":
        name, row, column, path = argv[1], int(argv[2]), int(argv[3]), os.path.abspath(argv[4])
        if name.startswith("chop_"):
            stage.make_tool(name[len("chop_"):])
        cell, frames, rows = sheet_of(name)
        stage.frame_cell(cell)
        pose_cell(stage, name, row, column, rows)
        stage.shoot(path)
        return
    out = argv[0]
    for name in argv[1:]:
        if name.startswith("chop_"):
            stage.make_tool(name[len("chop_"):])
        cell, frames, rows = sheet_of(name)
        stage.frame_cell(cell)
        for row in range(rows):
            for column in range(frames):
                pose_cell(stage, name, row, column, rows)
                stage.shoot(os.path.join(out, name, "%d-%d.png" % (row, column)))
        if name.startswith("chop_"):
            stage.drop_tool()


def blender_binary():
    return os.environ.get("BLENDER", "/Applications/Blender.app/Contents/MacOS/Blender")


def run_blender(args):
    if bpy is not None:      # the bpy module: render in this very process
        render_cells(args)
        return
    subprocess.run([blender_binary(), "-b", "-noaudio", "--python", os.path.abspath(__file__), "--"] + args,
                   check=True, stdout=subprocess.DEVNULL)


def fit_sheet(name, sheet, frames, rows, w, h):
    """Crops a freshly drawn chop sheet to the part of its cell any pose uses, and writes the
    sidecar (cell and ink) to match. Returns the cropped sheet."""
    from PIL import Image
    box = None
    for row in range(rows):
        for column in range(frames):
            cell = sheet.crop((column * w, row * h, (column + 1) * w, (row + 1) * h))
            found = cell.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
            if found:
                box = found if box is None else (min(box[0], found[0]), min(box[1], found[1]),
                                                 max(box[2], found[2]), max(box[3], found[3]))
    x0 = max(0, box[0] - FIT_MARGIN)
    y0 = max(0, box[1] - FIT_MARGIN)
    x1 = min(w, box[2] + FIT_MARGIN)
    y1 = min(h, box[3] + FIT_MARGIN)
    fitted = Image.new("RGBA", ((x1 - x0) * frames, (y1 - y0) * rows), (0, 0, 0, 0))
    for row in range(rows):
        for column in range(frames):
            cell = sheet.crop((column * w + x0, row * h + y0, column * w + x1, row * h + y1))
            fitted.paste(cell, (column * (x1 - x0), row * (y1 - y0)))
    # The window in canvas units, and the sidecar the packer and the engine read.
    wx, wy, ww, wh = CHOP_WINDOW
    cell = [wx + x0 / OUT_SCALE, wy + y0 / OUT_SCALE, (x1 - x0) / OUT_SCALE, (y1 - y0) / OUT_SCALE]
    path = os.path.join(SHEETS, name + ".json")
    with open(path, encoding="utf-8") as file:
        data = json.load(file)
    data["cell"] = cell
    data["ink"] = {"x": round((cell[0] - CX) / 1024, 6), "y": round((cell[1] + CANVAS_TOP - CY) / 1024, 6),
                   "width": round(cell[2] / 1024, 6), "height": round(cell[3] / 1024, 6)}
    with open(path, "w", encoding="utf-8") as file:
        json.dump(data, file, indent=2)
        file.write("\n")
    return fitted


def drive(argv):
    """Plain Python: renders each sheet in Blender and lays its cells out as one PNG."""
    from PIL import Image
    if argv and argv[0] == "--cell":
        name, row, column, path = argv[1], argv[2], argv[3], os.path.abspath(argv[4])
        run_blender(["--cell", name, row, column, path])
        cell, _, _ = sheet_of(name)
        size = (round(cell[2] * OUT_SCALE), round(cell[3] * OUT_SCALE))
        Image.open(path).resize(size, Image.LANCZOS).save(path)
        return
    names = argv or ["idle", "walk", "jump", "climb", "flip", "swim", "gather"]
    os.makedirs(OUT, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        run_blender([tmp] + names)
        for name in names:
            cell, frames, rows = sheet_of(name)
            w, h = round(cell[2] * OUT_SCALE), round(cell[3] * OUT_SCALE)
            sheet = Image.new("RGBA", (w * frames, h * rows), (0, 0, 0, 0))
            for row in range(rows):
                for column in range(frames):
                    image = Image.open(os.path.join(tmp, name, "%d-%d.png" % (row, column)))
                    sheet.paste(image.resize((w, h), Image.LANCZOS), (column * w, row * h))
            if name.startswith("chop_"):
                sheet = fit_sheet(name, sheet, frames, rows, w, h)
            path = os.path.join(OUT, "player-16_%s.png" % name)
            sheet.save(path, optimize=True)
            print("ok", os.path.relpath(path, HERE), sheet.size, "%d cells of %dx%d" % (frames * rows, w, h))


if __name__ == "__main__":
    if "--" in sys.argv:
        render_cells(sys.argv[sys.argv.index("--") + 1:])
    else:
        drive(sys.argv[1:])
