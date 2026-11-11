# crucible-dashboard

The results dashboard for [Crucible](https://github.com/schaferandrew/crucible), a harness that runs local and
cloud LLMs on real-world tasks. It is a static SvelteKit app served at
[schaferandrew.com/crucible-dashboard/](https://www.schaferandrew.com/crucible-dashboard/), and it replaces the
Jekyll dashboard at [/crucible/](https://www.schaferandrew.com/crucible/).

> **Status:** rewrite in progress. Phase 3 is the SvelteKit skeleton, the typed scoring core and a first
> leaderboard page; the other routes are "coming soon" placeholders. Design and pages follow in Phase 4. See
> [docs/rewrite/](docs/rewrite/).

## How it fits together

```
crucible run  ──►  crucible publish  ──►  bundle/          immutable run, score, status and catalog records
                                            │
                          crucible site-data│ (CI)          resolves models, makers, setups and run state
                                            ▼
                                     static/data/           per-suite index + cells, per-run detail files
                                            │
                                  vite build│ (CI)          prerendered SvelteKit pages
                                            ▼
                                     GitHub Pages  /crucible-dashboard/
```

- **Records are never hand-edited.** Fixes go into Crucible's registry and are applied by `crucible site-data`,
  or a run is republished.
- **Data-driven.** Tasks, areas, sections, tiers, labels and thresholds come from the suite catalogs. Unknown
  data renders generically and never throws.
- **Filters drill down.** The first view shows everything (Combined by default); filters narrow on demand.
- `noindex`, and not linked from the portfolio navbar.

## Repository layout

| Path                | What                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/lib/core/`     | typed, pure scoring (no DOM, no Svelte): types, context + URL codec, scope, scoring, format, normalize |
| `src/lib/`          | UI pieces (filter bar, leaderboard, tier cell) and the data loader                                     |
| `src/routes/`       | pages: leaderboard (`/`) and placeholders for task, model, compare, runs, todo, about                  |
| `tests/`            | golden parity tests and their allowlist (`allowlist.ts`)                                               |
| `scripts/`          | `link-data.mjs` (dev data link), `check-size.mjs` (size budget)                                        |
| `static/data/`      | generated site data (gitignored)                                                                       |
| `docs/rewrite/`     | behaviour spec, data inventory, jank audit, golden numbers and diff, data model                        |
| `.crucible-version` | the Crucible ref CI installs `crucible site-data` from                                                 |

## Development

Node 20 or newer (CI uses 22), SvelteKit 2, Svelte 5 (runes), TypeScript strict, Vitest.

```bash
npm install
npm run data:gen  # generate static/data from GitHub (needs git + uv; see below)
npm run dev       # http://localhost:5173/crucible-dashboard/
npm run check     # svelte-check (types)
npm run lint      # prettier --check and eslint
npm test          # unit tests plus parity with docs/rewrite/golden-numbers.json (needs static/data)
npm run build     # prerendered static site in build/
npm run size      # size budget on the build: index.json <= 100 KB, first-load JS+CSS <= 150 KB (gzip)
```

**Data.** `static/data/` is generated, never committed. `npm run data:gen` works on any machine, cloud
sessions included: it shallow-clones Crucible at the ref in `.crucible-version` and the published bundle
(`schaferandrew.github.io`) into `.cache/`, runs `crucible site-data` into `.cache/site-data`, and links
`static/data` to it. Rerun it to refresh. If you already have a `crucible site-data` output folder, point at it
instead: `CRUCIBLE_SITE_DATA=<folder> npm run data`. CI runs the same command from `.github/actions/site-data`.
The contract is `docs/site-data-format.md` in Crucible.

**URLs.** Everything is served under `/crucible-dashboard/`, in dev too. View state is query parameters with
today's names: `?mode=chat&suite=v3&exclude=forge&harness=pi&where=local&hw=m5-pro-48gb&quant=q4_k_m&provisional=1`.
No `mode` means Combined (when a suite has two or more sections).

**Parity.** `tests/parity.test.ts` rebuilds the golden leaderboards from the real `index.json` files. Differences
are allowed only through a rule in `tests/allowlist.ts` that says why; `WRITE_GOLDEN_DIFF=1 npm test` rewrites
`docs/rewrite/golden-diff.md`.

**CI.** `.github/workflows/ci.yml` (pull requests) lints, type-checks, tests, builds and checks the size budget.
`deploy.yml` does the same on `main` and publishes to GitHub Pages. Both generate the data first, and both need
read access to the Crucible and site repos (a `CRUCIBLE_READ_TOKEN` secret while those are private).

Work happens on branches, with one PR per phase.

## Run pages and the SPA fallback

`/run/<uuid>/` is **not prerendered** (B-21). There are thousands of runs and each is one small JSON file, so
prerendering them all would add thousands of near-identical HTML files to every deploy for no reader benefit.
Instead `adapter-static` is configured with `fallback: '404.html'`: GitHub Pages serves `404.html` for any path it
doesn't have, and SvelteKit's client router then renders the run route from the URL, so
`https://<host>/crucible-dashboard/run/<uuid>/` works as a deep link.

Trade-offs: the first response for a run link has HTTP status 404 (the page still renders; browsers and people don't
care, crawlers would, and every page is `noindex` anyway); the run page needs JavaScript and shows nothing before it
runs; a real typo in any URL gets the same shell and then the in-app "Page not found". Everything else is prerendered
as before.

## Screenshots

`npm run shots -- --page <name> --new <path> --live <url> --port <dev-port>` (see docs/rewrite/phase-4-guide.md).
