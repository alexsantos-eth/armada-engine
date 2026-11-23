#!/usr/bin/env bash
# Keeps the "Juego (iso-core)" version row of the root README.md in sync with the
# iso-core version declared in lib/Cargo.toml.
#
# Usage:
#   bash .github/scripts/sync-readme-version.sh          # edit README.md if out of date
#   bash .github/scripts/sync-readme-version.sh --check  # exit 1 if out of date, no edits
#
# .github/workflows/update-readme.yml runs the script on every push and commits
# + pushes the result back, so the README is always current.
set -euo pipefail

cd "$(dirname "$0")/../.."

version="$(awk -F'"' '/^version = /{print $2; exit}' lib/Cargo.toml)"
if [[ -z "$version" ]]; then
  echo "error: no version line found in lib/Cargo.toml" >&2
  exit 1
fi

readme="README.md"
row="$(grep -n 'Juego (iso-core)' "$readme" | cut -d: -f1 | head -n 1 || true)"
if [[ -z "$row" ]]; then
  echo "error: row 'Juego (iso-core)' not found in $readme" >&2
  exit 1
fi

current="$(sed -n "${row}p" "$readme" | grep -oE '[0-9]+[.][0-9]+[.][0-9]+' | head -n 1 || true)"
if [[ -z "$current" ]]; then
  echo "error: row 'Juego (iso-core)' in $readme has no version number" >&2
  exit 1
fi

if [[ "$current" == "$version" ]]; then
  echo "README.md is up to date (iso-core ${version})"
  exit 0
fi

if [[ "${1:-}" == "--check" ]]; then
  echo "README.md is stale: shows ${current}, lib/Cargo.toml has ${version}" >&2
  exit 1
fi

tmp="${readme}.tmp"
trap 'rm -f "$tmp"' EXIT
sed "${row}s/[0-9][0-9]*[.][0-9][0-9]*[.][0-9][0-9]*/${version}/" "$readme" > "$tmp"
cat "$tmp" > "$readme"
rm -f "$tmp"

after="$(sed -n "${row}p" "$readme" | grep -oE '[0-9]+[.][0-9]+[.][0-9]+' | head -n 1 || true)"
if [[ "$after" != "$version" ]]; then
  echo "error: could not write version ${version} into $readme (line ${row})" >&2
  exit 1
fi
echo "README.md updated: iso-core ${current} -> ${version}"
