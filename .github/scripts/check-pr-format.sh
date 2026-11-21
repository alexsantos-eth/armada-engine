#!/usr/bin/env bash
# Validates the `<type>(<scope>): <description>` format of PR titles and commit subjects.
#
#   check-pr-format.sh title "<pr title>"
#   check-pr-format.sh commits <base-sha> <head-sha>     # every non-merge commit in base..head
#
# type  : feat | docs | fix            (TYPES below is the single place to change it)
# scope : domain/module or keyword, lowercase, e.g. `npc/rabbit`, `terrain`, `ci`
# desc  : non-empty, no trailing period.
# Exit status is 1 when anything is invalid, with one explanation per offender.
set -euo pipefail

TYPES='feat|docs|fix'
PATTERN="^(${TYPES})\\(([a-z0-9]+([/_-][a-z0-9]+)*)\\)!?: [^ ].*[^ .]$|^(${TYPES})\\(([a-z0-9]+([/_-][a-z0-9]+)*)\\)!?: [^ .]$"

# Prints the reason a subject is invalid, or nothing when it is fine.
problem() {
  local s=$1
  if [[ ! $s =~ $PATTERN ]]; then
    echo "does not match <${TYPES}>(<domain/module or keyword>): <description>"
  fi
}

fail=0
check() { # label subject
  local why
  why=$(problem "$2")
  if [[ -n $why ]]; then
    echo "::error title=Invalid $1::\"$2\" $why"
    fail=1
  else
    echo "ok   $1: $2"
  fi
}

case ${1:-} in
  title)
    check "PR title" "${2:?missing title}"
    ;;
  commits)
    base=${2:?missing base} head=${3:?missing head}
    while IFS=$'\t' read -r sha subject; do
      check "commit ${sha:0:7}" "$subject"
    done < <(git log --no-merges --format='%H%x09%s' "$base..$head")
    ;;
  *)
    echo "usage: $0 title <title> | commits <base> <head>" >&2
    exit 2
    ;;
esac

if [[ $fail -ne 0 ]]; then
  {
    echo
    echo "Expected: <${TYPES}>(<domain/module or keyword>): <description>"
    echo "  feat(npc/rabbit): add hop animation"
    echo "  fix(terrain): remove cracked ground variant"
    echo "More in .claude/CLAUDE.md (Ramas y pull requests)."
  } >&2
fi
exit $fail
