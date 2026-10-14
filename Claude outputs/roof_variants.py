# roof_variants.py — builds colorReplacements maps for a recolourable material of an asset.
# For every fill/stroke colour in the SVG that is a shade tint(base, f) of the base, emits
# source → [tint(v, f) for v in variants], so all cel-shading levels recolour consistently.
import re, json, sys
from iso_lib import tint

def shades(svg_paths, base):
    found = {}
    for p in svg_paths:
        for c in set(re.findall(r'(?:fill|stroke)="(#[0-9a-f]{6})"', open(p).read())):
            rgb = [int(c[i:i+2], 16) for i in (1, 3, 5)]
            b = [int(base[i:i+2], 16) for i in (1, 3, 5)]
            k = max(range(3), key=lambda i: b[i])
            f0 = rgb[k] / b[k]
            for step in sorted(range(-200, 201), key=abs):
                f = f0 + step / 20000
                if tint(base, f) == c:
                    found[c] = f
                    break
    return dict(sorted(found.items(), key=lambda kv: -kv[1]))

def table(svg_paths, base, variants):
    return {c: [tint(v, f) for v in variants] for c, f in shades(svg_paths, base).items()}

SETS = {
    "HOUSE_BALCONY_ROOF": (["house_balcony.svg"], "#4f78b0", ["#4f78b0", "#b5473a", "#3f8a6a", "#c08a2e"]),
    "TOWER_ROOF": (["tower.svg"], "#7a5aa8", ["#7a5aa8", "#2f7d86", "#a8433f", "#3b5f9e"]),
    "APARTMENTS_ROOF": (["apartments_2x1.svg", "apartments_1x2.svg"], "#6f7d8c", ["#6f7d8c", "#4f9a94", "#a5543f", "#c7a25f"]),
}
out = {name: table(*args) for name, args in SETS.items()}
json.dump(out, open("roof_variants.json", "w"), indent=1)
for name, t in out.items():
    print(name, len(t))
