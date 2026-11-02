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

if ! command -v qlmanage >/dev/null 2>&1; then
  echo "error: qlmanage not found (macOS only)" >&2
  exit 1
fi

echo "Rasterizing SVGs..."
count=0
for f in $(find "$svg_dir" -name "*.svg" | sort); do
  base=$(basename "$f")
  name=$(echo "$f" | sed 's|../public/assets/||; s|/|_|g; s|.svg$||')
  qlmanage -t -s 128 -o "$tmp_dir" "$f" >/dev/null 2>&1
  if [ -f "$tmp_dir/${base}.png" ]; then
    mv "$tmp_dir/${base}.png" "$tmp_dir/${name}.png"
    count=$((count + 1))
  else
    echo "warning: failed to rasterize $f" >&2
  fi
done
echo "Rasterized $count SVGs."

echo "Compiling pack_atlas..."
cargo build --bin pack_atlas --quiet

echo "Packing atlas..."
./target/debug/pack_atlas "$tmp_dir" content/atlas.png content/assets.manifest.json

echo "Done. Atlas: content/atlas.png, Manifest: content/assets.manifest.json"