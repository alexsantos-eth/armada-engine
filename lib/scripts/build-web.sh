#!/usr/bin/env bash
# Builds the browser version of the Rust client and assembles the static site
# that gets published (Netlify's build command, and the one to serve locally).
#
# It needs no Node and no Python: only rustup and cargo, which Netlify's build
# image preinstalls. The asset atlas is NOT rebuilt here, because that needs
# python3 with cairosvg and the native pack_atlas binary (see build-atlas.sh);
# content/ is committed instead, and this script just copies it.
#
# Steps:
#   1. Install the toolchain rust-toolchain.toml pins, with its wasm32 target.
#      Netlify ships rustup and cargo but no toolchain at all, so this is what
#      makes the build work there; locally it is a no-op.
#   2. Compile the client to WebAssembly (release, locked).
#   3. Copy the loader page, content/ and the .wasm into the output directory.
#
# Run from anywhere: lib/scripts/build-web.sh [output-dir]   (default: dist)

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$script_dir/.."

out_dir="${1:-dist}"
target=wasm32-unknown-unknown

echo "==> Toolchain"
# With no argument this installs exactly what rust-toolchain.toml asks for,
# including its `targets`. Already installed: it only prints the version.
rustup toolchain install --no-self-update
# Belt and braces, in case the pin ever stops listing the target.
rustup target add "$target"
cargo --version
rustc --version

echo "==> Compiling the client to WebAssembly"
# Only the client binary: pack_atlas and remeasure_atlas are native build tools
# and have no business being compiled for the browser.
cargo build --release --locked --target "$target" --bin iso-core

echo "==> Assembling $out_dir"
rm -rf "$out_dir"
mkdir -p "$out_dir"
cp web/index.html "$out_dir/index.html"
cp -R content "$out_dir/content"
cp "target/$target/release/iso-core.wasm" "$out_dir/iso-core.wasm"

echo "==> Done"
du -h -d 1 "$out_dir" | sort -h
