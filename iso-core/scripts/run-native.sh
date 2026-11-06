#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$script_dir/.."

# This macOS Command Line Tools installation ships an SDK 27 that the installed
# linker cannot parse. Prefer its compatible SDK when no SDK was chosen by the user.
compatible_sdk=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk
if [[ "$(uname -s)" == Darwin && -z "${SDKROOT:-}" && -d "$compatible_sdk" ]]; then
  export SDKROOT="$compatible_sdk"
fi

if (($# == 0)); then
  set -- run --locked
fi

exec cargo "$@"
