#!/usr/bin/env bash
# Builds the asset atlas from the SVG sources.
#
# Steps:
#   1. Rasterize every SVG under public/assets/ to a 128x128 PNG using qlmanage.
#   2. Compile and run the pack_atlas tool to pack them into content/atlas.png
#      and generate content/assets.manifest.json.
#
# Requires: macOS with qlmanage (Quick Look) and a working Rust toolchain.
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
./target/debug/pack_atlas "$tmp_dir" content/atlas.png content/assets.manifest.json

echo "Done. Atlas: content/atlas.png, Manifest: content/assets.manifest.json"