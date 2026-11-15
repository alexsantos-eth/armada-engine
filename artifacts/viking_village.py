# viking_village.py — base shapes of the viking settlement: huts, trades, landmarks and halls.
# Each is the massing a repaint keeps (silhouette, proportions, camera), not the finished art.
#   python3 viking_village.py <out_dir>  → one SVG per building
import sys
from iso_lib import *

DARK, PLANK, BEAM = "#4f3a2b", "#5d4532", "#8a6038"
MOSS_A, MOSS_B, THATCH, STRAW = "#6f8f4a", "#86a657", "#b08a3c", "#d2b05a"
DAUB, TILE_A, TILE_B = "#d8c9a0", "#c8643a", "#b4532f"
ROCK, ROCK_D, SHRINE_A, SHRINE_B = "#9a9a96", "#7c7c7a", "#8a5a52", "#74483f"
RED, CREAM, DOOR, IRON, EMBER = "#b4483c", "#d9cdb4", "#6b4a30", "#4a4c52", "#f08a2e"
SHINGLE_A, SHINGLE_B = "#7a5234", "#8f6340"


class Build:
    """One building: an asset, its voxel grid and a `put` in the asset's own long/short axes."""

    def __init__(self, tiles):
        self.a = Asset(tiles=tiles)
        self.g = VoxelGrid(self.a, u=100)
        self.HU, self.HV, self.TOP = self.a.envelope(1.0, 1.0, 1.0)

    def put(self, u, v, z0, hu, hv, hz, color, r=8):
        cx, cy, hx, hy = self.a.local(u, v, hu, hv)
        self.g.place(cx, cy, z0, hx, hy, hz, color, r=r)

    def plinth(self, hu, hv, height=28, color=STONE):
        self.put(0, 0, 0, hu, hv, height / 2, color, r=12)
        return height

    def walls(self, hu, hv, z0, z1, colors=(DARK, PLANK), board=52, posts=BEAM):
        """Boarded walls on the two visible faces over a solid core, with corner posts."""
        self.put(0, 0, z0, hu - 10, hv - 10, (z1 - z0) / 2, colors[0], r=6)
        n = int(hu // board)
        for i in range(-n, n + 1):
            if abs(i * board) + board / 2 <= hu:
                self.put(i * board, hv - 6, z0, board / 2 - 3, 10, (z1 - z0) / 2, colors[i % 2], r=6)
        n = int(hv // board)
        for i in range(-n, n + 1):
            if abs(i * board) + board / 2 <= hv:
                self.put(hu - 6, i * board, z0, 10, board / 2 - 3, (z1 - z0) / 2, colors[i % 2], r=6)
        if posts:
            for su in (-1, 1):
                for sv in (-1, 1):
                    self.put(su * hu, sv * hv, z0 - 4, 17, 17, (z1 - z0) / 2 + 8, posts, r=8)

    def gable(self, hu, hv, z0, z1, colors, steps=6, eave=None, turned=False, ridge=24, barge=BEAM):
        """A stepped gable roof, ridge along u (or along v when `turned`), with barge boards."""
        put = (lambda u, v, z, a, b, c, col, r=10: self.put(v, u, z, b, a, c, col, r)) if turned else self.put
        dz = (z1 - z0) / steps
        for i in range(steps):
            t = i / (steps - 1)
            half = hv * (1 - t) + ridge * t
            band = hv / steps * 1.2
            color = eave if (eave and i == 0) else colors[i % len(colors)]
            for s in (-1, 1):
                put(0, s * (half - band / 2), z0 + i * dz, hu, band / 2, dz / 2 + 4, color, r=10)
                if barge:
                    for su in (-1, 1):
                        put(su * (hu + 3), s * (half - band / 2), z0 + i * dz - 3, 10, band / 2 + 2, dz / 2 + 5, barge, r=7)
        put(0, 0, z1 - 22, hu - 8, ridge + 8, 16, colors[0], r=10)

    def gable_wall(self, hu, hv, z0, z1, colors=(DARK, PLANK), steps=6, turned=False):
        """The triangle of wall that closes a gable roof at both ends."""
        put = (lambda u, v, z, a, b, c, col, r=7: self.put(v, u, z, b, a, c, col, r)) if turned else self.put
        dz = (z1 - z0) / steps
        for su in (-1, 1):
            for i in range(steps):
                t = i / steps
                put(su * hu, 0, z0 + i * dz, 14, hv * (1 - t) + 14 * t, dz / 2 + 3, colors[i % 2], r=7)

    def dragon(self, u, v, z, facing=1, turned=False, color=BEAM):
        """A carved dragon-head post rising from a gable end."""
        put = (lambda uu, vv, zz, a, b, c, col, r=8: self.put(vv, uu, zz, b, a, c, col, r)) if turned else self.put
        put(u, v, z, 16, 16, 44, color, r=8)
        put(u + facing * 14, v, z + 84, 26, 15, 19, color, r=9)
        put(u + facing * 40, v, z + 92, 15, 11, 11, color, r=7)
        put(u - facing * 6, v, z + 118, 12, 9, 12, color, r=6)

    def cross(self, u, z, spread=60, turned=False):
        """Crossed gable beams standing over the ridge."""
        put = (lambda uu, vv, zz, a, b, c, col, r=7: self.put(vv, uu, zz, b, a, c, col, r)) if turned else self.put
        for s in (-1, 1):
            put(u, s * spread / 2, z, 11, 11, 40, BEAM, r=6)

    def door(self, u, v, z0, wide=44, high=150, on_v=True, color=DOOR):
        if on_v:
            self.put(u, v, z0, wide, 10, high / 2, color, r=9)
            self.put(u, v + 3, z0 + high, wide + 10, 9, 10, BEAM, r=7)
        else:
            self.put(u, v, z0, 10, wide, high / 2, color, r=9)
            self.put(u + 3, v, z0 + high, 9, wide + 10, 10, BEAM, r=7)

    def shield(self, u, v, z, c1=RED, c2=CREAM, on_v=True, size=40):
        if on_v:
            self.put(u, v, z, size, 9, size, c1, r=size - 2)
            self.put(u, v + 6, z + size - 12, 12, 5, 12, c2, r=11)
        else:
            self.put(u, v, z, 9, size, size, c1, r=size - 2)
            self.put(u + 6, v, z + size - 12, 5, 12, 12, c2, r=11)

    def barrel(self, u, v, z=0, size=34, color=BEAM):
        self.put(u, v, z, size, size, size * 0.62, color, r=size - 4)
        self.put(u, v, z + size * 0.5, size + 2, size + 2, 6, IRON, r=size - 2)

    def save(self, path):
        self.g.draw()
        return self.a.save(path)


def hut_moss():
    """A small tarred-plank hut under a steep moss roof."""
    b = Build((1, 1, 2))
    p = b.plinth(236, 236)
    b.walls(190, 160, p, 250)
    b.gable_wall(190, 156, 240, 470)
    b.gable(214, 206, 236, 500, (MOSS_A, MOSS_B), eave=THATCH)
    b.cross(196, 480)
    b.cross(-196, 480)
    b.door(-60, 164, p)
    b.shield(90, 166, 110)
    b.barrel(196, 204, p - 6, 26)
    return b


def hut_thatch():
    """A low wattle-and-daub hut under a big hipped thatch roof."""
    b = Build((1, 1, 2))
    p = b.plinth(232, 232, 22)
    b.walls(176, 176, p, 200, colors=(DAUB, "#cdbc90"), board=58, posts=BEAM)
    for i, (half, color) in enumerate(zip((226, 196, 162, 126, 88, 50), (STRAW, THATCH, STRAW, THATCH, STRAW, THATCH))):
        b.put(0, 0, 188 + i * 44, half, half, 26, color, r=20)
    b.put(0, 0, 446, 22, 22, 22, BEAM, r=10)
    b.door(40, 180, p, wide=40, high=130)
    b.put(-196, 204, p - 4, 30, 22, 18, PLANK, r=8)      # woodpile
    b.put(-196, 204, p + 30, 24, 18, 12, BEAM, r=8)
    return b


def cottage_tile():
    """A timber-framed cottage with a steep clay-tile roof and a stone chimney."""
    b = Build((1, 1, 2))
    p = b.plinth(236, 236)
    b.walls(160, 190, p, 262, colors=(DAUB, "#cfc097"), board=64, posts=DARK)
    for z in (p + 108, 250):                            # timber rails across the daub
        b.put(0, 186, z, 162, 9, 9, DARK, r=5)
        b.put(166, 0, z, 9, 190, 9, DARK, r=5)
    b.gable_wall(156, 190, 250, 500, colors=(DAUB, "#cfc097"), turned=True)
    b.gable(214, 206, 246, 530, (TILE_A, TILE_B), turned=True, barge=DARK)
    b.put(-90, -60, 300, 34, 34, 150, ROCK, r=10)        # chimney
    b.put(-90, -60, 596, 40, 40, 10, ROCK_D, r=8)
    b.door(170, -40, p, on_v=False, high=140)
    b.put(60, 194, p + 120, 30, 8, 30, "#f2d48a", r=6)   # lit window
    return b


def smithy():
    """An open-sided forge: stone hearth and chimney, anvil, lean-to plank roof."""
    b = Build((1, 1, 2))
    p = b.plinth(236, 236, 20, color=ROCK_D)
    for su in (-1, 1):
        for sv in (-1, 1):
            b.put(su * 196, sv * 196, p, 16, 16, 120 if sv > 0 else 150, BEAM, r=8)
    b.put(-110, -110, p, 80, 80, 60, ROCK, r=12)         # hearth
    b.put(-110, -110, p + 120, 60, 60, 8, EMBER, r=10)
    b.put(-150, -150, p + 120, 44, 44, 190, ROCK, r=12)  # chimney
    b.put(-150, -150, p + 500, 50, 50, 12, ROCK_D, r=8)
    for i in range(6):                                   # lean-to roof falling toward +v
        b.put(0, -190 + i * 76, 326 - i * 12, 214, 42, 12, (SHINGLE_A, SHINGLE_B)[i % 2], r=8)
    b.put(70, 60, p, 30, 30, 34, PLANK, r=12)            # stump
    b.put(70, 60, p + 68, 46, 22, 18, IRON, r=7)         # anvil
    b.put(-60, 150, p, 46, 26, 26, PLANK, r=8)           # quench trough
    b.put(-60, 150, p + 46, 38, 18, 4, "#6fa8c8", r=6)
    b.barrel(170, -90, p, 30)
    b.put(180, 150, p, 10, 44, 60, IRON, r=4)            # weapon rack
    b.put(180, 150, p + 120, 14, 50, 8, BEAM, r=4)
    return b


def market_stall():
    """A trader's stall under a striped sailcloth awning, with barrels and crates."""
    b = Build((1, 1, 1))
    p = b.plinth(232, 232, 16, color="#a08a6a")
    for su in (-1, 1):
        for sv in (-1, 1):
            b.put(su * 180, sv * 150, p, 13, 13, 118 if sv > 0 else 140, BEAM, r=6)
    b.put(0, 120, p, 170, 34, 46, PLANK, r=8)            # counter
    b.put(-90, 120, p + 92, 30, 24, 14, "#c9a23a", r=9)  # goods
    b.put(0, 120, p + 92, 30, 24, 16, RED, r=9)
    b.put(90, 120, p + 92, 30, 24, 12, "#7da44e", r=9)
    for i in range(6):                                   # striped awning falling toward +v
        for j in range(5):
            b.put(-190 + j * 95, -170 + i * 66, 296 - i * 11, 46, 34, 9, (RED, CREAM)[j % 2], r=6)
    b.barrel(-150, -90, p, 32)
    b.put(140, -100, p, 42, 42, 34, PLANK, r=7)          # crate
    b.put(140, -100, p + 68, 30, 30, 22, BEAM, r=7)
    return b


def healer_hut():
    """The seer's round turf hut: a stone ring wall under a tall conical moss roof."""
    b = Build((1, 1, 2))
    p = b.plinth(232, 232, 20, color=ROCK_D)
    b.put(0, 0, p, 178, 178, 84, ROCK, r=170)
    for i, half in enumerate((220, 196, 168, 138, 108, 78, 48)):
        b.put(0, 0, 176 + i * 48, half, half, 28, (MOSS_A, MOSS_B)[i % 2], r=half - 4)
    b.put(0, 0, 520, 16, 16, 40, BEAM, r=8)              # smoke-hole post
    b.put(0, 0, 596, 34, 10, 8, BEAM, r=5)
    b.put(60, 176, p, 42, 12, 66, DOOR, r=12)
    b.put(60, 180, p + 132, 54, 10, 10, BEAM, r=7)
    b.put(-150, 190, p, 36, 36, 26, IRON, r=30)          # cauldron
    b.put(-150, 190, p + 46, 28, 28, 5, "#7fd08a", r=24)
    b.put(192, 60, p, 8, 8, 110, BEAM, r=4)              # herb pole
    b.put(192, 60, p + 150, 20, 20, 30, MOSS_B, r=12)
    return b


def stave_temple():
    """A stave temple: three stacked tiers of steep shingle roof, dragon heads on the ridges."""
    b = Build((1, 1, 3))
    p = b.plinth(236, 236, 30)
    b.walls(190, 190, p, 210, board=56)
    b.gable(226, 226, 196, 380, (SHINGLE_A, SHINGLE_B), steps=5, ridge=120, barge=None)
    b.walls(120, 120, 366, 500, board=48)
    b.gable_wall(120, 116, 492, 650)
    b.gable(150, 150, 486, 680, (SHINGLE_A, SHINGLE_B), steps=5, ridge=60)
    b.walls(50, 50, 660, 760, board=40, posts=None)
    b.gable(72, 72, 750, 900, (SHINGLE_A, SHINGLE_B), steps=4, ridge=10, barge=None)
    b.put(0, 0, 890, 9, 9, 50, BEAM, r=5)                # spire
    b.dragon(150, 0, 640, 1)
    b.dragon(-150, 0, 640, -1)
    b.door(0, 196, p, wide=48, high=140)
    b.put(0, 226, 0, 70, 20, 14, STONE, r=8)             # step
    return b


def watchtower():
    """A stone watchtower: battered stone shaft, overhanging timber gallery, moss gable roof."""
    b = Build((1, 1, 3))
    p = b.plinth(232, 232, 26, color=ROCK_D)
    for i, half in enumerate((176, 168, 160, 152)):
        b.put(0, 0, p + i * 128, half, half, 66, (ROCK, "#a6a6a2")[i % 2], r=14)
    for z in (190, 400):                                 # arrow slits
        b.put(40, 172, z, 10, 6, 34, "#3a3c42", r=4)
        b.put(172, -30, z, 6, 10, 34, "#3a3c42", r=4)
    b.put(0, 0, 540, 214, 214, 14, BEAM, r=8)            # gallery floor
    b.walls(206, 206, 566, 640, board=46, posts=BEAM)    # palisade rail
    b.walls(120, 120, 566, 720, board=44, posts=BEAM)    # cabin
    b.gable_wall(120, 116, 712, 880)
    b.gable(168, 168, 706, 910, (MOSS_A, MOSS_B), steps=5, eave=THATCH)
    b.cross(150, 890)
    b.door(-40, 176, p, wide=40, high=130)
    b.put(214, 214, 566, 8, 8, 110, BEAM, r=4)           # banner pole
    b.put(214, 190, 760, 6, 26, 36, RED, r=4)
    return b


def stone_shrine():
    """A stepped shrine of red-brown stone with an offering fire on top."""
    b = Build((1, 1, 2))
    for i, half in enumerate((232, 190, 148, 106)):
        b.put(0, 0, i * 96, half, half, 48, (SHRINE_A, SHRINE_B)[i % 2], r=12)
        if i < 3:
            b.put(0, half - 8, i * 96 + 20, 34, 12, 30, SHRINE_B if i % 2 == 0 else SHRINE_A, r=6)
            b.put(half - 8, 0, i * 96 + 20, 12, 34, 30, SHRINE_B if i % 2 == 0 else SHRINE_A, r=6)
    b.put(0, 0, 384, 60, 60, 22, SHRINE_B, r=10)         # altar
    b.put(0, 0, 428, 30, 30, 20, EMBER, r=18)            # fire
    b.put(0, 0, 464, 16, 16, 16, "#f6c24a", r=12)
    return b


def runestone():
    """Carved standing stones: one tall runestone and two smaller ones on a patch of pebbles."""
    b = Build((1, 1, 1))
    b.put(0, 0, 0, 170, 150, 10, "#8f8a78", r=40)
    b.put(-10, -20, 14, 70, 30, 150, ROCK, r=26)
    b.put(-10, 12, 150, 26, 5, 40, "#3f6f9e", r=6)       # painted rune
    b.put(-10, 12, 240, 34, 5, 8, "#3f6f9e", r=4)
    b.put(110, 70, 10, 44, 24, 80, "#a6a6a2", r=20)
    b.put(110, 96, 90, 16, 4, 26, RED, r=4)
    b.put(-120, 90, 8, 36, 30, 40, ROCK_D, r=20)
    return b


def mead_hall(tiles):
    """The great mead hall: low walls, a vast shingle roof, a gabled porch, shields and dragons."""
    b = Build(tiles)
    HU, HV = b.HU, b.HV
    p = b.plinth(HU, HV, 34)
    b.walls(HU - 130, HV - 70, p, 240)
    b.gable_wall(HU - 132, HV - 74, 232, 560, steps=7)
    b.gable(HU - 84, HV - 30, 224, 590, (SHINGLE_A, SHINGLE_B), steps=7, eave=STRAW)
    b.dragon(HU - 100, 0, 560, 1)
    b.dragon(-(HU - 100), 0, 560, -1)
    for u in (-240, 0, 240):
        b.cross(u, 580, spread=70)
    # the porch on the long front
    b.put(-HU + 250, HV - 60, p, 80, 40, 110, PLANK, r=8)
    for i, half in enumerate((104, 78, 52, 26)):
        b.put(-HU + 250, HV - 62, 250 + i * 34, half, 50, 20, (SHINGLE_B, SHINGLE_A)[i % 2], r=9)
    b.door(-HU + 250, HV - 18, p, wide=50, high=170)
    for sv in (-1, 1):
        b.put(-HU + 250 + sv * 78, HV - 22, p, 13, 13, 108, BEAM, r=6)
    for i, u in enumerate((-40, 80, 200, 320)):
        b.shield(u, HV - 62, 110, *((RED, CREAM) if i % 2 == 0 else (CREAM, RED)))
    b.put(-HU + 250, HV - 26, 34, 96, 20, 8, ROCK_D, r=6)  # step
    return b


def boathouse(tiles):
    """A boathouse: tarred shed under a turf roof, open at one gable, a longship's prow inside."""
    b = Build(tiles)
    HU, HV = b.HU, b.HV
    p = b.plinth(HU, HV - 6, 18, color="#a08a6a")
    L, W = HU - 190, HV - 70
    b.put(0, -W, p, L, 12, 100, DARK, r=6)                # back wall
    n = int(L // 52)
    for i in range(-n, n + 1):                            # front wall boards
        b.put(i * 52, W, p, 23, 11, 100, (DARK, PLANK)[i % 2], r=6)
    for su in (-1, 1):
        for sv in (-1, 1):
            b.put(su * L, sv * W, p - 4, 17, 17, 108, BEAM, r=8)
    b.put(-L, 0, p, 12, W, 100, DARK, r=6)                # closed far gable
    b.gable_wall(L, W, 208, 440)
    b.gable(L + 30, HV - 30, 204, 470, (MOSS_A, MOSS_B), eave=THATCH)
    b.cross(L + 20, 450)
    # the ship: hull and prow reaching out of the open gable
    b.put(L - 110, 0, p + 10, 190, 64, 36, "#7a4a2a", r=30)
    b.put(L + 90, 0, p + 40, 40, 30, 60, "#7a4a2a", r=14)
    b.put(L + 112, 0, p + 150, 22, 18, 44, "#7a4a2a", r=10)
    b.put(L + 138, 0, p + 220, 22, 14, 14, "#7a4a2a", r=8)
    for i, u in enumerate((L - 60, L + 10)):
        b.shield(u, 70, p + 34, *((RED, CREAM) if i % 2 == 0 else (CREAM, RED)), size=28)
    b.barrel(-L + 40, HV - 40, p, 26)
    b.put(60, W + 20, p, 8, 8, 120, BEAM, r=4)            # oars leaning on the wall
    b.put(100, W + 20, p, 8, 8, 110, BEAM, r=4)
    return b


VILLAGE = {
    "house/block_hut_moss": hut_moss,
    "house/block_hut_thatch": hut_thatch,
    "house/block_cottage_tile": cottage_tile,
    "building/block_smithy": smithy,
    "building/block_market_stall": market_stall,
    "building/block_healer_hut": healer_hut,
    "building/block_stave_temple": stave_temple,
    "building/block_watchtower": watchtower,
    "building/block_stone_shrine": stone_shrine,
    "building/block_runestone": runestone,
    "building/block_mead_hall_2x1": lambda: mead_hall((2, 1, 2)),
    "building/block_mead_hall_1x2": lambda: mead_hall((1, 2, 2)),
    "building/block_boathouse_2x1": lambda: boathouse((2, 1, 2)),
    "building/block_boathouse_1x2": lambda: boathouse((1, 2, 2)),
}

if __name__ == "__main__":
    import os
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    for name, make in VILLAGE.items():
        path = os.path.join(out, name.replace("/", "_") + ".svg")
        print(name, "top sy =", round(make().save(path), 1))
