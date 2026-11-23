#!/usr/bin/env python3
"""Crops the item sprites in assets/items/ into the square icons the HTML UI kit shows.

Each source is a 1024 x 853 tile canvas with the item drawn small in the middle; the kit wants the
item alone, centred on a transparent square. The icons are committed (web/ui/items/<id>.png) so
build-web.sh stays free of Python; run this again whenever an item sprite changes.

Run from anywhere: python3 lib/scripts/build-ui-icons.py   (needs Pillow)
"""

from pathlib import Path

from PIL import Image

SIZE = 128
PAD = 0.08

lib = Path(__file__).resolve().parent.parent
source = lib / "assets" / "items"
target = lib / "web" / "ui" / "items"
target.mkdir(parents=True, exist_ok=True)

for path in sorted(source.glob("*.png")):
    image = Image.open(path).convert("RGBA")
    box = image.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    if box is None:
        continue
    item = image.crop(box)
    side = round(max(item.size) * (1 + 2 * PAD))
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(item, ((side - item.width) // 2, (side - item.height) // 2))
    square.resize((SIZE, SIZE), Image.LANCZOS).save(target / path.name, optimize=True)
    print(f"{path.name}: {item.size} -> {SIZE}px")
