#!/usr/bin/env bash
# Packages the native client as a macOS .app bundle in dist/ (gitignored).
#
# The game title is defined in a single place, src/game/config.rs (GAME_TITLE); this script
# reads it from there, so renaming the game only means editing that one constant: the window
# title, the bundle name, Info.plist and the per-user support directory all follow. The
# bundle identifier is intentionally independent of the title, because it must stay stable;
# override it with BUNDLE_ID. The icon defaults to packaging/game.icns, committed in the repo;
# override it with ICON_ICNS. Regenerate the committed icon from the source art with
# scripts/build-icon.sh. Bundle version is read from Cargo.toml.
#
# Steps:
#   1. Build the release binary (same SDKROOT guard as run-native.sh).
#   2. Lay out <Title>.app/Contents/{MacOS,Resources}: the renamed binary, content/ and the icon.
#   3. Write Info.plist, lint it and ad-hoc sign the bundle (so macOS treats it as coherent).
#
# Run from anywhere: lib/scripts/build-macos.sh [output-dir]   (default: dist)

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$script_dir/.."

compatible_sdk=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk
if [[ "$(uname -s)" == Darwin && -z "${SDKROOT:-}" && -d "$compatible_sdk" ]]; then
  export SDKROOT="$compatible_sdk"
fi

out_dir="${1:-dist}"

GAME_TITLE="$(sed -n 's/.*pub const GAME_TITLE[^=]*=[^=]*"\([^"]*\)".*/\1/p' src/game/config.rs | head -n1)"
if [[ -z "$GAME_TITLE" || "$GAME_TITLE" == */* || "$GAME_TITLE" == *..* ]]; then
  echo "error: GAME_TITLE in src/game/config.rs must be a plain display name (no slashes)" >&2
  exit 1
fi
EXE_NAME="$(printf '%s' "$GAME_TITLE" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"
VERSION="$(sed -n 's/^version = "\(.*\)"/\1/p' Cargo.toml | head -n1)"
BUNDLE_ID="${BUNDLE_ID:-com.armada-io.yorch-adventure}"
ICON_ICNS="${ICON_ICNS:-packaging/game.icns}"
if [[ ! -f "$ICON_ICNS" ]]; then
  echo "error: $ICON_ICNS not found; regenerate it with scripts/build-icon.sh" >&2
  exit 1
fi

app="$out_dir/$GAME_TITLE.app"

echo "==> Compiling the release binary"
cargo build --release --locked --bin iso-core

echo "==> Assembling $app"
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "target/release/iso-core" "$app/Contents/MacOS/$EXE_NAME"
cp -R content "$app/Contents/Resources/content"
cp "$ICON_ICNS" "$app/Contents/Resources/game.icns"

cat > "$app/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleName</key>
	<string>$GAME_TITLE</string>
	<key>CFBundleDisplayName</key>
	<string>$GAME_TITLE</string>
	<key>CFBundleExecutable</key>
	<string>$EXE_NAME</string>
	<key>CFBundleIdentifier</key>
	<string>$BUNDLE_ID</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleVersion</key>
	<string>1</string>
	<key>CFBundleShortVersionString</key>
	<string>$VERSION</string>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleIconFile</key>
	<string>game</string>
	<key>LSMinimumSystemVersion</key>
	<string>11.0</string>
	<key>LSApplicationCategoryType</key>
	<string>public.app-category.role-playing-games</string>
	<key>NSHighResolutionCapable</key>
	<true/>
</dict>
</plist>
EOF
plutil -lint "$app/Contents/Info.plist"

if ! codesign --force --deep --sign - "$app"; then
  echo "warning: ad-hoc signing failed; the bundle still runs on this machine." >&2
fi

echo "==> Done: $app"
echo "Run it with: open \"$app\""
