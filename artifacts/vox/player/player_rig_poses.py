# player_rig_poses.py — the poses of every player sheet, read off monkey.py's boxes for the rig.
#
# The sheet generators (player_idle.py, player_jump.py, player_climb.py, player_flip.py,
# player_swim.py, player_gather.py) pose monkey.py's boxes for every cell. The rigged model
# (player_rig.py) has real bones instead, so this reads, for every cell, how each box that
# stands for a bone has turned from the standing monkey and where its joints went:
#
#   body    turn, where its hips (HIP) went by that turn, and how far it was lifted (a
#           crouch is a negative lift: the body sinks onto the legs)
#   head    turn
#   arm     turn of each arm (its shoulder is the rig's), and of each hand
#   leg     turn of each thigh and foot, where each ankle went and where the body's hip
#           socket for that leg went (the rig's knee bends to keep the ankle there)
#
# all in the figure's frame facing +x (the facing is the renderer's). Runs in plain Python
# (the pose modules need shapely), and writes player_rig/poses.json for Blender:
#
#   python3 player_rig_poses.py
import json
import os

import monkey
from player_render import poses_of, grid_of
from player_walk import FACINGS

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "player_rig", "poses.json")
SHEETS = ["idle", "walk", "jump", "climb", "flip", "swim", "gather", "chop"]
# Sheets whose geometry (cell, frames, facings) is read off another sheet's sidecar: the chop
# poses are shared by one sheet per tool (`chop_<tool id>`).
GRID = {"chop": "chop_flint_axe"}
ANKLE = (4, 16)


def role(part):
    """Which bone a box of monkey.py stands for, with its side (+1 / -1), or None."""
    h = tuple(round(v) for v in part.h)
    side = 1 if part.c[1] > 0 else -1
    if part.color == monkey.FUR and h[0] == 76:
        return "head", 0
    if part.color == monkey.FUR and h[1] >= 60 and h[0] < 70:
        return "body", 0
    if part.color == monkey.FUR and h == (22, 22, 42):
        return "arm", side
    if part.color == monkey.FACE and h == (24, 22, 22):
        return "hand", side
    if part.color == monkey.FUR and h == (30, 30, 26):
        return "leg", side
    if part.color == monkey.FACE and h == (38, 29, 13):
        return "foot", side
    return None


def point(part, lift, at):
    """Where the figure's point `at` (as it stood) goes with `part`."""
    x, y, z = part.world(tuple(a - c for a, c in zip(at, part.c)), 0.0, lift)
    return [x, y, z]


def turn(part):
    """The part's turn from standing, as rows of a 3x3 matrix."""
    cols = [part.normal(e, 0.0) for e in ((1, 0, 0), (0, 1, 0), (0, 0, 1))]
    return [[cols[j][i] for j in range(3)] for i in range(3)]


def cell_pose(parts):
    out = {}
    for part, lift in parts:
        found = role(part)
        if found is None:
            continue
        kind, side = found
        key = kind if not side else "%s%+d" % (kind, side)
        if key in out:
            continue
        entry = {"turn": turn(part)}
        if kind == "body":
            entry["hip"] = point(part, 0.0, (monkey.HIP[0], 0, monkey.HIP[1]))
            entry["lift"] = lift
            for s in (-1, 1):
                entry["socket%+d" % s] = point(part, lift, (monkey.HIP[0], s * 38, monkey.HIP[1]))
        if kind == "leg":
            entry["ankle"] = point(part, lift, (ANKLE[0], side * 38, ANKLE[1]))
        out[key] = entry
    return out


def main(names):
    """Writes the poses of `names` (every sheet when none): the other sheets already in the file
    are kept, so one sheet can be added without redoing the rest."""
    data = {"facings": len(FACINGS), "hip": [monkey.HIP[0], 0, monkey.HIP[1]],
            "ankle": [ANKLE[0], 0, ANKLE[1]], "sheets": {}}
    if names and os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as file:
            data = json.load(file)
    for name in names or SHEETS:
        _, frames, rows = grid_of(GRID.get(name, name))
        pose = poses_of(name, frames)
        data["sheets"][name] = [[cell_pose(pose(r, c)[0]) for c in range(frames)] for r in range(rows)]
        if name == "chop":
            import player_chop
            for row in data["sheets"][name]:
                for column, cell in enumerate(row):
                    cell["tool_dir"] = list(player_chop.tool_dir(column))
        missing = {k for row in data["sheets"][name] for cell in row
                   for k in ("body", "head", "arm+1", "arm-1", "leg+1", "leg-1") if k not in cell}
        print("ok", name, rows, "x", frames, "missing" if missing else "", *sorted(missing))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as file:
        json.dump(data, file)


if __name__ == "__main__":
    import sys
    main(sys.argv[1:])
