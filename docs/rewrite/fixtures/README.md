# Fixtures (live Crucible JSON)

Fetched with curl on 2026-11-11T05:44:56Z (UTC) from https://www.schaferandrew.com/crucible/

| File | URL | Bytes | sha256 |
|---|---|---|---|
| data.json | /crucible/data.json | 5142350 | 08e6880309e418657cb6077c9984569185ab531b7afa42e700d93cb068a3e0f4 |
| details.json | /crucible/details.json | 7047331 | fe0b9e4d06826f934af80f00926b625a7382efa593a44957074f839e09e9e013 |

The page also lazily fetches `/crucible-data/<output_ref>` (run outputs) when a run is opened; not captured.
Total fixtures 12 MB (< 25 MB), so no .gitignore entry was added.
`verification.json` holds the Playwright spot-check results and the live-vs-local-repo drift check; `fixtures.meta.json` the fetch time.
Regenerate numbers: `node ../scripts/golden.mjs` (uses schaferandrew.github.io assets/js/crucible-core.js).
