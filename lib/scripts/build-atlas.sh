#!/usr/bin/env bash
# Builds the asset atlas from the two asset trees:
#   assets/         the terrain sprites and the player's, the latter generated from the 3D model
#                   (artifacts/vox/player/);
#   assets-legacy/  the sprites still pending migration to the voxel flow.
#
# Steps:
#   1. Scale every PNG under both roots to the shared resolution with PIL (and cut the player's
#      painted sheets cell by cell).
#   2. Compile and run the pack_atlas tool to pack them into content/images/atlas.png, one
#      texture per sheet beside it, and generate content/json/assets.manifest.json.
#   3. Copy the baked cloud shadow pattern into content/images/cloud-shadow.png. It is not
#      packed as anything the artwork asks for; the packer trims every sprite's transparent
#      border, and a trimmed pattern no longer tiles (see src/cloud_shadows.rs).
#
# Requires: a Python with Pillow only. Point PYTHON=/path/to/python at one if yours is not on
# the list. Run from anywhere: lib/scripts/build-atlas.sh

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$script_dir/.."

compatible_sdk=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk
if [[ "$(uname -s)" == Darwin && -z "${SDKROOT:-}" && -d "$compatible_sdk" ]]; then
  export SDKROOT="$compatible_sdk"
fi

asset_roots=(assets assets-legacy/assets)
# The roots pack_atlas looks the sprites up in: the tree's own parent, so the paths it builds
# (/assets/…) resolve on disk.
pack_roots=(. assets-legacy)
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

pythons=()
if [ -n "${PYTHON:-}" ]; then
  pythons+=("$PYTHON")
fi
pythons+=(".venv/bin/python" python3 /usr/bin/python3)
for minor in 15 14 13 12 11 10 9; do
  pythons+=("python3.$minor")
done

python=""
for candidate in "${pythons[@]}"; do
  command -v "$candidate" >/dev/null 2>&1 || continue
  if "$candidate" -c "import PIL" >/dev/null 2>&1; then
    python="$candidate"
    break
  fi
done

if [ -z "$python" ]; then
  echo "No Python with Pillow found. Set PYTHON=/path/to/python to a Python that has it." >&2
  exit 1
fi

echo "Rasterizing PNGs with Pillow ($("$python" -V 2>&1), $(command -v "$python"))..."
for root in "${asset_roots[@]}"; do
  "$python" scripts/rasterize.py "$root" "$tmp_dir"
done
echo "Done rasterizing."

echo "Compiling pack_atlas..."
cargo build --bin pack_atlas --quiet

echo "Packing atlas..."
./target/debug/pack_atlas "$tmp_dir" content/images/atlas.png content/json/assets.manifest.json "${pack_roots[@]}"

echo "Copying the cloud shadow pattern..."
mkdir -p content/images
cp "assets-legacy/assets/cloud/cloud-shadow.png" content/images/cloud-shadow.png

echo "Done. Atlas: content/images/atlas.png, sheets: content/player_*.png, clouds: content/images/cloud-shadow.png, manifest: content/json/assets.manifest.json"
