#!/usr/bin/env bash
# Runs the scripted scenes a pull request is checked against and gathers their shots.
#
#   pr-screenshots.sh <binary> <out-dir> [base-ref]
#
# Scenes run, in order:
#   1. every lib/scenes/pr-*.json (the fixed set every PR gets: spawn and a village);
#   2. every other lib/scenes/*.json the PR adds or changes against <base-ref>, so a PR can
#      bring its own scene that frames its feature.
#
# Each scene is copied into its own folder under <out-dir>, so its `out` lands there too.
# The run never fails on a scene: a scene that crashes or times out is listed in
# <out-dir>/summary.md and the rest still run. The script exits non-zero only when no scene
# produced a single PNG.
set -uo pipefail

binary="$(realpath "$1")"
out="$(mkdir -p "$2" && realpath "$2")"
base="${3:-}"
repo="$(git rev-parse --show-toplevel)"
scene_timeout="${SCENE_TIMEOUT:-300}"

cd "$repo/lib" || exit 1

scenes=()
for scene in scenes/pr-*.json; do
  [[ -f "$scene" ]] && scenes+=("$scene")
done
if [[ -n "$base" ]]; then
  while IFS= read -r changed; do
    changed="${changed#lib/}"
    [[ "$changed" == scenes/pr-* ]] && continue
    [[ -f "$changed" ]] && scenes+=("$changed")
  done < <(git diff --name-only --diff-filter=AM "$base"...HEAD -- 'lib/scenes/*.json')
fi

summary="$out/summary.md"
: >"$summary"
total=0

for scene in "${scenes[@]}"; do
  name="$(basename "$scene" .json)"
  dir="$out/$name"
  mkdir -p "$dir"
  cp "$scene" "$dir/scene.json"

  echo "::group::scene $name"
  started=$SECONDS
  # The game reads its content from the CWD (lib/), so it runs from here.
  timeout "$scene_timeout" xvfb-run -a -s "-screen 0 1600x1000x24" \
    "$binary" --scene "$dir/scene.json" >"$dir/run.log" 2>&1
  status=$?
  elapsed=$((SECONDS - started))
  grep -v -e 'Audio thread died' -e '^ALSA lib' -e 'PCM device' "$dir/run.log" | tail -n 40
  echo "::endgroup::"

  shots=$(find "$dir" -name '*.png' | wc -l)
  total=$((total + shots))
  notes=""
  report="$(find "$dir" -name report.json | head -n 1)"
  if [[ -n "$report" ]]; then
    notes="$(python3 -c 'import json,sys; print("; ".join(json.load(open(sys.argv[1])).get("notes", [])))' "$report" 2>/dev/null)"
  fi
  if ((status == 124)); then
    verdict="timed out after ${scene_timeout}s"
  elif ((status != 0)); then
    verdict="exited with $status"
  else
    verdict="ok"
  fi
  printf '| `%s` | %s | %d | %ds | %s |\n' "$name" "$verdict" "$shots" "$elapsed" "${notes:-}" >>"$summary"
done

if ((total == 0)); then
  echo "no scene produced a screenshot" >&2
  exit 1
fi
