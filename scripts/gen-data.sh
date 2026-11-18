#!/usr/bin/env bash
# Generates static/data the same way CI does (.github/actions/site-data), for any machine,
# cloud sessions included: shallow-clones schaferandrew/crucible at the ref in .crucible-version
# and the published bundle (schaferandrew/schaferandrew.github.io), then runs `crucible site-data`.
# Needs git and uv. Output: .cache/site-data, linked to static/data. Rerun to refresh.
set -euo pipefail
site_repo="${CRUCIBLE_SITE_REPO:-}"
if [[ -n "$site_repo" ]]; then
  site_repo="$(cd -- "$site_repo" && pwd -P)"
  if [[ ! -d "$site_repo/_data/crucible" ]]; then
    echo "No Crucible bundle at $site_repo/_data/crucible" >&2
    exit 1
  fi
fi
cd "$(dirname "$0")/.."
ref="$(grep -v '^[[:space:]]*#' .crucible-version | grep -v '^[[:space:]]*$' | head -n 1 | tr -d '[:space:]')"
mkdir -p .cache
fetch() { # repo dir ref
  if [ -d "$2/.git" ]; then git -C "$2" fetch -q --depth 1 origin "$3" && git -C "$2" checkout -q FETCH_HEAD
  else git clone -q --depth 1 --branch "$3" "https://github.com/$1.git" "$2"; fi
}
fetch schaferandrew/crucible .cache/crucible "$ref"
if [[ -z "$site_repo" ]]; then
  fetch schaferandrew/schaferandrew.github.io .cache/site master
  site_repo=.cache/site
fi
rm -rf .cache/site-data
uv run --project .cache/crucible crucible site-data \
  --bundle "$site_repo/_data/crucible" --outputs "$site_repo/crucible-data/outputs" \
  --display "$site_repo/_data/crucible_display.yml" --fallbacks "$site_repo/_data/crucible_fallbacks.yml" \
  --out .cache/site-data
CRUCIBLE_SITE_DATA="$PWD/.cache/site-data" node scripts/link-data.mjs
