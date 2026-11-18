#!/usr/bin/env bash
# Generates static/data from the local bundle, using the Crucible ref in .crucible-version.
# Needs git and uv. Output: .cache/site-data, linked to static/data.
set -euo pipefail
cd "$(dirname "$0")/.."
ref="$(grep -v '^[[:space:]]*#' .crucible-version | grep -v '^[[:space:]]*$' | head -n 1 | tr -d '[:space:]')"
mkdir -p .cache
if [[ -d .cache/crucible/.git ]]; then
  git -C .cache/crucible fetch -q --depth 1 origin "$ref"
  git -C .cache/crucible checkout -q FETCH_HEAD
else
  git clone -q --depth 1 --branch "$ref" https://github.com/schaferandrew/crucible.git .cache/crucible
fi
rm -rf .cache/site-data
uv run --project .cache/crucible crucible site-data \
  --bundle bundle --outputs bundle/outputs \
  --display bundle/display.yml --fallbacks bundle/fallbacks.yml \
  --out .cache/site-data
CRUCIBLE_SITE_DATA="$PWD/.cache/site-data" node scripts/link-data.mjs
