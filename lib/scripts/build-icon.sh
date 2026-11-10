#!/usr/bin/env bash
# Regenerates packaging/game.icns, the committed icon of the macOS bundle, from the committed
# source art packaging/icon-player.png. Run it when the icon art changes and commit the result.
# Pass another source PNG with: scripts/build-icon.sh <source.png>

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$script_dir/.."

src="${1:-packaging/icon-player.png}"
out="packaging/game.icns"
iconset="$(mktemp -d)/game.iconset"
mkdir -p "$iconset"

while read -r pixels name; do
  sips -z "$pixels" "$pixels" "$src" --out "$iconset/$name.png" >/dev/null
done <<'EOF'
16 icon_16x16
32 icon_16x16@2x
32 icon_32x32
64 icon_32x32@2x
128 icon_128x128
256 icon_128x128@2x
256 icon_256x256
512 icon_256x256@2x
512 icon_512x512
1024 icon_512x512@2x
EOF

iconutil -c icns "$iconset" -o "$out"
echo "==> $out"
