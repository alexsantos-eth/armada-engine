#!/usr/bin/env bash
# Builds the asset atlas from the SVG sources.
#
# Steps:
#   1. Rasterize every SVG under assets-src/assets/ with cairosvg, at a fixed number of pixels per
#      tile of world, and cut each of the player's sheets into one PNG per pose.
#   2. Compile and run the pack_atlas tool to pack them into content/atlas.png, one texture per
#      sheet beside it, and generate content/assets.manifest.json.
#   3. Rasterize the cloud shadows' pattern on its own, into content/cloud-shadow.png. It is not
#      packed: the packer trims every sprite's transparent border, and a trimmed pattern no
#      longer repeats (see src/cloud_shadows.rs), and it is softened there because cairosvg
#      ignores the blur the artwork asks for (see ../artifacts/cloud_pattern.py).
#
# Requires: a Python with cairosvg (any version: the script looks for one) and a Rust toolchain.
# Set PYTHON=/path/to/python3 to choose the interpreter yourself.
# Run from anywhere: lib/scripts/build-atlas.sh

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$script_dir/.."

compatible_sdk=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk
if [[ "$(uname -s)" == Darwin && -z "${SDKROOT:-}" && -d "$compatible_sdk" ]]; then
  export SDKROOT="$compatible_sdk"
fi

svg_dir="assets-src/assets"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

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

pythons=()
if [ -n "${PYTHON:-}" ]; then
  pythons+=("$PYTHON")
fi
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

venv_dir="${ATLAS_VENV:-.venv}"

if [ -z "$python" ] && [ -x "$venv_dir/bin/python" ] \
  && "$venv_dir/bin/python" -c "import cairosvg, numpy, PIL" >/dev/null 2>&1; then
  python="$venv_dir/bin/python"
fi

if [ -z "$python" ]; then
  base="${PYTHON:-python3}"
  echo "No Python here has cairosvg. Setting up $venv_dir with $("$base" -V 2>&1)..." >&2
  "$base" -m venv "$venv_dir"
  "$venv_dir/bin/python" -m pip install --quiet --disable-pip-version-check \
    cairosvg numpy pillow
  if "$venv_dir/bin/python" -c "import cairosvg, numpy, PIL" >/dev/null 2>&1; then
    python="$venv_dir/bin/python"
    echo "Done. Later runs reuse it; delete $venv_dir to start over." >&2
  else
    echo "" >&2
    echo "$venv_dir was created but cairosvg still does not import there:" >&2
    "$venv_dir/bin/python" -c "import cairosvg" >&2 || true
    echo "" >&2
    echo "cairosvg needs the libcairo library, which pip does not install." >&2
    echo "On macOS: brew install cairo. On Debian/Ubuntu: apt install libcairo2." >&2
    exit 1
  fi
fi

echo "Rasterizing SVGs with cairosvg ($("$python" -V 2>&1), $(command -v "$python"))..."
"$python" scripts/rasterize.py "$svg_dir" "$tmp_dir"
echo "Done rasterizing."

echo "Compiling pack_atlas..."
cargo build --bin pack_atlas --quiet

echo "Packing atlas..."
./target/debug/pack_atlas "$tmp_dir" content/atlas.png content/assets.manifest.json assets-src

echo "Rasterizing the cloud shadow pattern..."
"$python" ../artifacts/cloud_pattern.py "$svg_dir/cloud-shadow.svg" content/cloud-shadow.png

echo "Done. Atlas: content/atlas.png, sheets: content/player_*.png, clouds: content/cloud-shadow.png, manifest: content/assets.manifest.json"
