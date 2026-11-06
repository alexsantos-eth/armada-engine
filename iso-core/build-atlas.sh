#!/usr/bin/env bash
# Builds the asset atlas from the SVG sources.
#
# Steps:
#   1. Rasterize every SVG under public/assets/ with cairosvg, at a fixed number of pixels per
#      tile of world, and cut each of the player's sheets into one PNG per pose.
#   2. Compile and run the pack_atlas tool to pack them into content/atlas.png, one texture per
#      sheet beside it, and generate content/assets.manifest.json.
#   3. Rasterize the cloud shadows' pattern on its own, into content/cloud-shadow.png. It is not
#      packed: the packer trims every sprite's transparent border, and a trimmed pattern no
#      longer repeats (see src/cloud_shadows.rs), and it is softened there because cairosvg
#      ignores the blur the artwork asks for (see cloud_pattern.py).
#
# Requires: python3 with cairosvg and a working Rust toolchain.
# Run from iso-core/:  ./build-atlas.sh

set -euo pipefail

cd "$(dirname "$0")"

# Prefer the compatible SDK on macOS.
compatible_sdk=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk
if [[ "$(uname -s)" == Darwin && -z "${SDKROOT:-}" && -d "$compatible_sdk" ]]; then
  export SDKROOT="$compatible_sdk"
fi

svg_dir="../public/assets"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

# cairosvg needs libcairo; the poppler runtime ships one.
cairo_lib=/Users/alex/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/poppler/lib
if [ -d "$cairo_lib" ]; then
  export DYLD_LIBRARY_PATH="$cairo_lib:${DYLD_LIBRARY_PATH:-}"
fi

echo "Rasterizing SVGs with cairosvg..."
python3 rasterize.py "$svg_dir" "$tmp_dir"
echo "Done rasterizing."

echo "Compiling pack_atlas..."
cargo build --bin pack_atlas --quiet

echo "Packing atlas..."
./target/debug/pack_atlas "$tmp_dir" content/atlas.png content/assets.manifest.json ../public

# The cloud shadows' pattern, whole and untrimmed: one texel per SVG unit, so a copy is
# 1920 x 960 and spans the twelve tiles the pattern repeats over. It goes through
# cloud_pattern.py rather than rasterize.py, which scales by tile of world and would give the
# pattern the resolution of a sprite, and which would also leave the artwork's blur unapplied.
echo "Rasterizing the cloud shadow pattern..."
python3 cloud_pattern.py "$svg_dir/cloud-shadow.svg" content/cloud-shadow.png

echo "Done. Atlas: content/atlas.png, sheets: content/player_*.png, clouds: content/cloud-shadow.png, manifest: content/assets.manifest.json"