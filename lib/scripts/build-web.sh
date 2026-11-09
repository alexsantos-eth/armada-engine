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
#   3. Copy the loader page, its adapter, content/ and the .wasm into the output directory.
#   4. Emit the same loader page also at playground/index.html: `/playground` is the
#      development surface with the GUI; `/` paints no GUI at all. The page's
#      <base href="/"> makes every relative URL resolve against the site root, so the
#      two copies share the same .wasm and content/.
#
# Run from anywhere: lib/scripts/build-web.sh [output-dir]   (default: dist)

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$script_dir/.."

out_dir="${1:-dist}"
target=wasm32-unknown-unknown

echo "==> Toolchain"
rustup toolchain install --no-self-update
rustup target add "$target"
cargo --version
rustc --version

echo "==> Compiling the client to WebAssembly"
cargo build --release --locked --target "$target" --bin iso-core

echo "==> Assembling $out_dir"
rm -rf "$out_dir"
mkdir -p "$out_dir"
cp web/index.html "$out_dir/index.html"
mkdir -p "$out_dir/playground"
cp web/index.html "$out_dir/playground/index.html"
cp web/mq_js_bundle.js "$out_dir/mq_js_bundle.js"
cp web/adapter.js "$out_dir/adapter.js"
cp -R content "$out_dir/content"
cp "target/$target/release/iso-core.wasm" "$out_dir/iso-core.wasm"

echo "==> Done"
du -h -d 1 "$out_dir" | sort -h
