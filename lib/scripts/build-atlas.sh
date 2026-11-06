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
# Requires: a Python with cairosvg (any version: the script looks for one) and a Rust toolchain.
# Set PYTHON=/path/to/python3 to choose the interpreter yourself.
# Run from anywhere: lib/scripts/build-atlas.sh

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$script_dir/.."

# Prefer the compatible SDK on macOS.
compatible_sdk=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk
if [[ "$(uname -s)" == Darwin && -z "${SDKROOT:-}" && -d "$compatible_sdk" ]]; then
  export SDKROOT="$compatible_sdk"
fi

svg_dir="../web/public/assets"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

# cairosvg needs libcairo, which is not always where the loader looks. Add the places that
# ship one: Homebrew, /usr/local, and the poppler that comes with the codex runtime.
for cairo_lib in \
  /opt/homebrew/lib \
  /usr/local/lib \
  "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/poppler/lib"
do
  if [ -d "$cairo_lib" ]; then
    export DYLD_LIBRARY_PATH="$cairo_lib:${DYLD_LIBRARY_PATH:-}"
    export LD_LIBRARY_PATH="$cairo_lib:${LD_LIBRARY_PATH:-}"
  fi
done

# Pick an interpreter that can actually rasterize. cairosvg is often installed for just one of
# the Pythons on a machine, and its compiled parts (cffi, cairocffi) only load under that one:
# borrowing another version's copy fails with "No module named '_cffi_backend'".
pythons=()
if [ -n "${PYTHON:-}" ]; then
  pythons+=("$PYTHON")
fi
# /usr/bin/python3 matters on macOS: it is Apple's own, and a `pip install --user` run against
# it puts the package under ~/Library/Python/<its version>/, where a Homebrew python3 on the
# PATH will never look.
pythons+=(python3 /usr/bin/python3)
for minor in 15 14 13 12 11 10 9; do
  pythons+=("python3.$minor")
done

python=""
for candidate in "${pythons[@]}"; do
  command -v "$candidate" >/dev/null 2>&1 || continue
  if "$candidate" -c "import cairosvg" >/dev/null 2>&1; then
    python="$candidate"
    break
  fi
done

# None has it installed: fall back to the chosen interpreter and let rasterize.py look for a
# copy that came with some other runtime. If it finds none, it says what it tried and stops.
if [ -z "$python" ]; then
  python="${PYTHON:-python3}"
  echo "No Python here imports cairosvg directly; searching for a copy off the import path." >&2
fi

echo "Rasterizing SVGs with cairosvg ($("$python" -V 2>&1), $(command -v "$python"))..."
"$python" scripts/rasterize.py "$svg_dir" "$tmp_dir"
echo "Done rasterizing."

echo "Compiling pack_atlas..."
cargo build --bin pack_atlas --quiet

echo "Packing atlas..."
./target/debug/pack_atlas "$tmp_dir" content/atlas.png content/assets.manifest.json ../web/public

# The cloud shadows' pattern, whole and untrimmed: one texel per SVG unit, so a copy is
# 1920 x 960 and spans the twelve tiles the pattern repeats over. It goes through
# cloud_pattern.py rather than rasterize.py, which scales by tile of world and would give the
# pattern the resolution of a sprite, and which would also leave the artwork's blur unapplied.
echo "Rasterizing the cloud shadow pattern..."
"$python" scripts/cloud_pattern.py "$svg_dir/cloud-shadow.svg" content/cloud-shadow.png

echo "Done. Atlas: content/atlas.png, sheets: content/player_*.png, clouds: content/cloud-shadow.png, manifest: content/assets.manifest.json"
