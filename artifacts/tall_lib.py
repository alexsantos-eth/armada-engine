# tall_lib.py — shared pieces for tall voxel clay buildings (4+ blocks).
# Everything is written in a.local coordinates (u along the long axis, v across it,
# +u and +v are the visible sides), so each script renders any orientation.
from iso_lib import *

PLINTH = 30


def part(a, g, u, v, z0, hu, hv, hz, color, r=None, **kw):
    cx, cy, hx, hy = a.local(u, v, hu, hv)
    g.place(cx, cy, z0, hx, hy, hz, color, r=r, **kw)


def ground(a, hu, hv):
    """Stone plinth over the whole footprint and the building's cast shadow on it."""
    cx, cy, hx, hy = a.local(0, 0, hu, hv)
    a.voxel(cx, cy, 0, hx, hy, PLINTH / 2, STONE, r=12)
    cx, cy, hx, hy = a.local(-10, 0, hu - 34, hv - 34)
    a.flat(cx - 12, cy + 22, PLINTH, hx, hy, 40, STONE, face="left", zshade=PLINTH)
    return VoxelGrid(a, u=100)


def ribbon_tier(a, g, uc, hu, hv, z0, storeys, pitch, glass, band, band_h=34, inset=16):
    """Modern storeys: per storey, a band slab and a slightly inset glass core on top of it
    (ribbon windows). Every piece is z-separated, so the paint order is exact.
    Returns the z where the tier ends (top of its last glass core + gap)."""
    z = z0
    for _ in range(storeys):
        part(a, g, uc, 0, z, hu, hv, band_h / 2, band, r=12)
        gz, gt = z + band_h + 4, z + pitch - 4
        part(a, g, uc, 0, gz, hu - inset, hv - inset, (gt - gz) / 2, glass, r=16)
        z += pitch
    return z
