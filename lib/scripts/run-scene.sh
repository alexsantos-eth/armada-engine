#!/usr/bin/env bash
set -euo pipefail

if (($# == 0)); then
  echo "usage: $(basename "$0") <scene.json> [cargo arguments…]" >&2
  exit 64
fi

scene="$1"
shift

if [[ ! -f "$scene" ]]; then
  echo "no scene at $scene" >&2
  exit 66
fi

scene="$(cd "$(dirname "$scene")" && pwd)/$(basename "$scene")"
script_dir="$(cd "$(dirname "$0")" && pwd)"

exec "$script_dir/run-native.sh" run --locked "$@" -- --scene "$scene"
