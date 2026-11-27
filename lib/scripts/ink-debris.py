#!/usr/bin/env python3
"""Inks the voxel pieces the player can pick up, so they stand out from the scrap that fades away.

When an entity is gathered it blows apart into its kit pieces (`iso::debris`); the ones marked
`collect` in `content/json/entity-parts.json` stay floating as the items to pick up. Those get the
same ink line the item and tool icons wear (`build-ui-icons.py`: the very `outline` function and
colour), so what can be taken reads at a glance against the decorative pieces.

The BARE renders of the collectable pieces live in artifacts/vox/debris/<p_hash>.png
(`vox_debris.py` writes them there); this draws the line and writes lib/assets/debris/i_<hash>.png,
the sprite a piece that really floats as a drop is drawn with (the p_ one, bare, is what scrap that fades uses). Changing the line never means rendering anything again:

    OUTLINE  the line's width, in pixels of the 1024-wide piece canvas (about 2 screen px at zoom 1)
    WOBBLE   how far it strays from a true offset curve

Run from anywhere: python3 lib/scripts/ink-debris.py [p_0123abcd …]   (needs Pillow, numpy)
then lib/scripts/build-atlas.sh.
"""

import importlib.util
import sys
import zlib
from pathlib import Path

from PIL import Image

OUTLINE = 10.0
WOBBLE = 2.0
WOBBLE_CELL = 30
MARGIN = round(OUTLINE + WOBBLE) + 4  # transparent border cropped around the piece for the line

lib = Path(__file__).resolve().parent.parent
source = lib.parent / "artifacts" / "vox" / "debris"
target = lib / "assets" / "debris"

_icons = importlib.util.spec_from_file_location("build_ui_icons", Path(__file__).with_name("build-ui-icons.py"))
icons = importlib.util.module_from_spec(_icons)
_icons.loader.exec_module(icons)


def ink(path):
    """The bare render at `path` with the ink line around its opaque part, on the same canvas."""
    image = Image.open(path).convert("RGBA")
    box = image.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    if box is None:
        return image
    area = (
        max(0, box[0] - MARGIN),
        max(0, box[1] - MARGIN),
        min(image.width, box[2] + MARGIN),
        min(image.height, box[3] + MARGIN),
    )
    seed = zlib.crc32(path.stem.encode())
    inked = icons.outline(image.crop(area), OUTLINE, WOBBLE, WOBBLE_CELL, seed)
    out = Image.new("RGBA", image.size, (0, 0, 0, 0))
    out.paste(inked, area[:2])
    return out


def main(names):
    paths = [source / f"{n}.png" for n in names] or sorted(source.glob("*.png"))
    for path in paths:
        ink(path).save(target / ("i_" + path.name.removeprefix("p_")), optimize=True)
    print(f"{len(paths)} pieces inked")


if __name__ == "__main__":
    main(sys.argv[1:])
