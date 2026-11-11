# crucible-dashboard

The results dashboard for [Crucible](https://github.com/schaferandrew/crucible), a harness that runs local and
cloud LLMs on real-world tasks. It is a static SvelteKit app served at
[schaferandrew.com/crucible-dashboard/](https://www.schaferandrew.com/crucible-dashboard/), and it replaces the
Jekyll dashboard at [/crucible/](https://www.schaferandrew.com/crucible/).

> **Status:** rewrite in progress. Phase 0 (inventory) and Phase 1 (data model, awaiting approval) are docs
> only; there is no app code yet. See [docs/rewrite/](docs/rewrite/).

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

## Repository layout (planned)

| Path | What |
|---|---|
| `src/lib/core/` | typed, pure scoring and aggregation (tier scores, gate, overall, Combined, comparisons) |
| `src/routes/` | pages: leaderboard, task, model, compare, todo, runs, run, about |
| `bundle/` | published Crucible records (written only by `crucible publish`) |
| `static/data/` | generated site data (gitignored) |
| `docs/rewrite/` | behaviour spec, data inventory, jank audit, golden numbers, data model |

## Development (once Phase 3 lands)

```bash
npm install
npm run data      # crucible site-data bundle/ static/data/
npm run dev
npm test          # unit tests against docs/rewrite/golden-numbers.json
npm run build     # static output in build/
```

Deploys run from `main` through GitHub Actions. Work happens on branches, with one PR per phase.
