#!/usr/bin/env bash
# Publishes a PR's shots to the `pr-screenshots` branch and writes the PR comment.
#
#   publish-pr-screenshots.sh <shots-dir> <pr-number> <head-sha> <comment-file>
#
# The branch is orphan and holds only images: pr-<n>/<short-sha>/<scene>/<shot>.png. The
# comment links them by the commit that published them, so an old comment keeps showing the
# shots of its own push even after the PR folder is cleaned up.
set -euo pipefail

shots="$(realpath "$1")"
pr="$2"
sha="$3"
comment="$4"
short="${sha:0:7}"
branch="pr-screenshots"
repo="${GITHUB_REPOSITORY:?}"
server="${GITHUB_SERVER_URL:-https://github.com}"
run_url="$server/$repo/actions/runs/${GITHUB_RUN_ID:-0}"

work="$(mktemp -d)"
git -C "$work" init -q
git -C "$work" remote add origin "$(git remote get-url origin)"
# Reuse the checkout's credentials (actions/checkout persists them as an extraheader).
header="$(git config --get-all http.https://github.com/.extraheader || true)"
[[ -n "$header" ]] && git -C "$work" config http.https://github.com/.extraheader "$header"
git -C "$work" config user.name "github-actions[bot]"
git -C "$work" config user.email "41898282+github-actions[bot]@users.noreply.github.com"

dest="pr-$pr/$short"
published=""
for attempt in 1 2 3 4 5; do
  if git -C "$work" fetch -q --depth 1 origin "$branch" 2>/dev/null; then
    git -C "$work" checkout -q -B "$branch" FETCH_HEAD
  else
    git -C "$work" checkout -q --orphan "$branch"
    git -C "$work" rm -rqf . 2>/dev/null || true
    printf '# PR screenshots\n\nWritten by `.github/workflows/pr-screenshots.yml`. Not code: do not merge.\n' >"$work/README.md"
  fi
  rm -rf "${work:?}/$dest"
  mkdir -p "$work/$dest"
  (cd "$shots" && find . -name '*.png' -exec cp --parents {} "$work/$dest/" \;)
  git -C "$work" add -A
  git -C "$work" commit -qm "screenshots: PR #$pr at $short" || true
  if git -C "$work" push -q origin "HEAD:$branch"; then
    published="$(git -C "$work" rev-parse HEAD)"
    break
  fi
  sleep $((attempt * 3))
done

{
  echo '<!-- pr-screenshots -->'
  echo "### Capturas del juego · \`$short\`"
  echo
  echo "Escenas de \`lib/scenes/pr-*.json\` más las que este PR añade o cambia en \`lib/scenes/\`, corridas con \`--scene\` en Linux (Xvfb). [Corrida y artefacto]($run_url)"
  echo
  echo '| Escena | Resultado | Capturas | Tiempo | Notas |'
  echo '| --- | --- | --- | --- | --- |'
  cat "$shots/summary.md"
  echo
  if [[ -z "$published" ]]; then
    echo "> No se pudieron subir las imágenes a la rama \`$branch\`; están en el artefacto de la corrida."
  else
    for dir in "$shots"/*/; do
      scene="$(basename "$dir")"
      mapfile -t pngs < <(cd "$dir" && find . -name '*.png' -printf '%T@ %P\n' | sort -n | cut -d" " -f2-)
      ((${#pngs[@]} == 0)) && continue
      echo "#### \`$scene\`"
      echo
      for png in "${pngs[@]}"; do
        url="https://raw.githubusercontent.com/$repo/$published/$dest/$scene/$png"
        echo "<img src=\"$url\" alt=\"$scene/$png\" width=\"640\">"
      done
      echo
    done
  fi
} >"$comment"
