#!/usr/bin/env python3
"""Rasterize all SVGs under a directory to PNGs using cairosvg."""
import os, sys, glob

# Find cairosvg
cairosvg_path = None
for root, dirs, files in os.walk('/'):
    if 'cairosvg' in dirs and os.path.exists(os.path.join(root, 'cairosvg', '__init__.py')):
        cairosvg_path = root
        break
if cairosvg_path:
    sys.path.insert(0, cairosvg_path)

import cairosvg

svg_dir = sys.argv[1]
out_dir = sys.argv[2]
os.makedirs(out_dir, exist_ok=True)

count = 0
for f in sorted(glob.glob(os.path.join(svg_dir, '**', '*.svg'), recursive=True)):
    rel = os.path.relpath(f, svg_dir)
    name = rel.replace(os.sep, '_').replace('.svg', '')
    out = os.path.join(out_dir, f"{name}.png")
    try:
        cairosvg.svg2png(url=f, write_to=out, output_width=512)
        count += 1
    except Exception as e:
        print(f"warning: failed to rasterize {f}: {e}", file=sys.stderr)

print(f"Rasterized {count} SVGs.")