"""Turn the GLB into what player_model.py draws: the mesh in the figure's space, a colour and
six bone weights per vertex.

Usage: build.py <model.glb> <out.npz>
Figure space is monkey.py's: +x forward (the face), +y to its side, z up from the feet. The
model faces +Z with Y up, so x = Z, y = X, z = Y, scaled so its ears span what the figure's do.
"""
import sys
import numpy as np
import trimesh

S = 232.0                      # figure units per model unit

scene = trimesh.load(sys.argv[1], force="scene")
mesh = scene.to_geometry() if hasattr(scene, "to_geometry") else scene.dump(concatenate=True)
v = np.asarray(mesh.vertices, np.float64)
f = np.asarray(mesh.faces, np.int32)
n = np.asarray(mesh.vertex_normals, np.float64)
uv = np.asarray(mesh.visual.uv, np.float64)
texture = np.asarray(mesh.visual.material.baseColorTexture.convert("RGB")).astype(np.float32) / 255
H, W = texture.shape[:2]
colour = texture[np.clip(((1 - uv[:, 1]) * H).astype(int), 0, H - 1), np.clip((uv[:, 0] * W).astype(int), 0, W - 1)]
X, Y, Z = v[:, 0], v[:, 1], v[:, 2]


def step(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


# Where the model's parts meet, in its own units (Y up, X to the side), read off its outline.
ARM_FROM = 0.258        # the body's side wall is at 0.25; the arms begin just outside it
HAND_END = 0.105        # the hands stop here; below it everything that far out is a foot
SHOULDER = 0.50         # where an arm joins the body
NECK = 0.52             # the chin
CROTCH = 0.235          # where the legs join the body
LEG_OUT = 0.165         # how far out the middle of a leg is
SHOULDER_OUT = 0.30     # and the middle of a shoulder

# Bones: 0 body, 1 head, 2 arm +y, 3 arm -y, 4 leg +y, 5 leg -y. The model stands with its arms
# down its sides, so planes are enough to tell them apart; each weight eases over a narrow band
# at its joint so the skin bends there instead of tearing. The feet reach further out than the
# arms' inner side, so an arm is told by how far out it is only above where the hands end.
arm = step((np.abs(X) - ARM_FROM) / 0.014) * step((Y - HAND_END) / 0.02) * (1 - step((Y - SHOULDER) / 0.04))
head = step((Y - NECK) / 0.03)
leg = step((CROTCH - Y) / 0.03) * (1 - arm)
side = step((X + 0.03) / 0.06)
w = np.zeros((len(v), 6), np.float32)
w[:, 1] = head
rest = 1 - head
w[:, 2] = rest * arm * (X > 0)
w[:, 3] = rest * arm * (X <= 0)
w[:, 4] = rest * (1 - arm) * leg * side
w[:, 5] = rest * (1 - arm) * leg * (1 - side)
w[:, 0] = 1 - w[:, 1:].sum(axis=1)

# The joint each bone turns about, in figure units: body, head, arms, legs.
joints = np.array([(0, 0, 0.40), (0, 0, NECK + 0.015), (0, SHOULDER_OUT, SHOULDER), (0, -SHOULDER_OUT, SHOULDER),
                   (0, LEG_OUT, CROTCH - 0.02), (0, -LEG_OUT, CROTCH - 0.02)], np.float32) * S

np.savez_compressed(sys.argv[2],
                    v=(np.stack([Z, X, Y], axis=1) * S).astype(np.float32),
                    n=np.stack([n[:, 2], n[:, 0], n[:, 1]], axis=1).astype(np.float16),
                    c=(colour * 255).round().astype(np.uint8),
                    w=(w * 255).round().astype(np.uint8),
                    f=f, joints=joints)
print(len(v), "vertices", len(f), "faces")
