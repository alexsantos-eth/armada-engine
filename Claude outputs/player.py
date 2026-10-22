# player.py — voxel clay player character, 1x1, one block (static, no animation).
# Defaults: 1 tile, ~95 % of the block high, compact (~50 % of the footprint), facing +x
# (the lit lower-right face). No cast shadow: the engine projects shadows.
from iso_lib import *

a = Asset()

SKIN = "#f2c79b"
SHIRT = "#e8574a"      # the accent: red reads well on grass and sand
PANTS = "#4f6aa8"
HAIR = "#6b4a2f"
EYE = "#3a2c2a"

g = VoxelGrid(a, u=100)

# legs, side by side across the body (along y), from the floor
for s in (-1, 1):
    g.place(0, s * 38, 0, 34, 32, 48, PANTS, r=16)
# body on the legs
g.place(0, 0, 100, 58, 82, 52, SHIRT, r=24)
# arms beside the body (separated along y → clean paint order)
for s in (-1, 1):
    g.place(0, s * 110, 110, 24, 24, 46, SHIRT, r=11)
# big round head and a hair cap on top
g.place(0, 0, 208, 66, 66, 46, SKIN, r=28)
g.place(-8, 0, 302, 60, 62, 19, HAIR, r=16)
# eyes pressed into the face (+x)
for s in (-1, 1):
    g.place(64, s * 24, 246, 8, 10, 13, EYE, r=6)
g.draw()

print("ok player.svg top sy =", round(a.save("player.svg"), 1))
