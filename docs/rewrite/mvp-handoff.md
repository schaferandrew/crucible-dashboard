# MVP handoff and portfolio dashboard cutover

Audited November 17, 2026. Scope: replace the portfolio's Crucible dashboard; keep the rest of the portfolio.
Starting dashboard revision: `afec3df0bd06819e3c2647e56ce4fb9c7c637b4a` (PR #6, `phase-4`).

## What exists

- This repository is the static SvelteKit dashboard. PR #6 includes Phases 1, 3 and 4; all pages are implemented.
- [Crucible PR #75](https://github.com/schaferandrew/crucible/pull/75) supplies the registry, format 4 and `crucible site-data`. It is still open as of this audit. `.crucible-version` currently names its mutable `phase-2` branch; it does not pin a release or commit.
- The portfolio is [schaferandrew/schaferandrew.github.io](https://github.com/schaferandrew/schaferandrew.github.io), with `master` serving [www.schaferandrew.com](https://www.schaferandrew.com/). Its existing dashboard is [/crucible/](https://www.schaferandrew.com/crucible/).
- The real input bundle and outputs still live in that portfolio repository. This repo has **no `bundle/` yet**. `scripts/gen-data.sh` clones the portfolio and Crucible, generates `.cache/site-data/`, and links it to the ignored `static/data/`.
- The generated data used here comes from Crucible `a7846b8e82736db23b57cdb1baa3f83ce9be1df3` and portfolio `70b5371e9e1e93643ddc9064a23acad2e25a079a`: 2,053 runs, visible suites v4/v3, 2,258 generated files. Do not edit those records or generated files to fix a display problem.

## Code map

| Location | Responsibility |
| --- | --- |
| `src/routes/` | Routing, loaders, prerender entries and small view wrappers. The Runs wrapper forwards SvelteKit's snapshot API to its view. |
| `src/lib/pages/main/` | Leaderboard view, bars, scatter, matrix, heatmap, takeaways and compare tray. |
| `src/lib/pages/{task,model,compare,run,runs,todo,about}/` | Each page's views, shaping helpers and adjacent unit tests. Compare has separate `Summary`, `TaskCharts` and `Reliability` components. |
| `src/lib/ui/controls/` | Shared filters, section picker, suite controls, URL-backed `ContextState`, provisional preference. |
| `src/lib/ui/layout/` | Headers, breadcrumbs, tabs, document titles and navigation state. |
| `src/lib/ui/feedback/` | Loading, empty, error and omitted-run messages. |
| `src/lib/ui/tables/` | Responsive table/cards, column types, score and coverage cells. |
| `src/lib/ui/{tokens.css,heat.ts}` and `src/app.css` | Shared visual tokens, accessible heat colours and global styles. |
| `src/lib/core/` | Pure types, normalization, scope, scoring, context/URL and legacy URL rules. No DOM or Svelte. |
| `src/lib/{data.ts,paths.ts,nav.ts,labels.ts}` | Data access, app-base-aware links, route navigation and shared labels. |
| `tests/` | Fixed legacy leaderboard scenarios and the explicit difference allowlist. |
| `scripts/check-ui.mjs` | Repeatable desktop/mobile browser smoke checks against a running app. |

Keep page-specific components and helpers in their page folder. Reuse shared controls and tables; use `$lib/paths` for internal links and the catalog for tasks, areas, tiers and thresholds. A visual fix must not reimplement the record joins.

## Fixed in this pass

- Runs `outcome`, `state` and `sort` now restore from shareable URLs and write back as controls change. The handoff's `outcome=failed` example maps to the UI's `error` class. Other context/query parameters survive these changes. SvelteKit snapshots retain loaded months and pagination when returning from a run.
- Mobile tabs measure their position relative to the scrolling nav, so the active tab remains visible on load and client navigation. Runs is back before What to run next, matching the portfolio tab order.
- One shared section picker replaces the panel/task/compare copies. It offers a single tab stop and arrow/Home/End keyboard selection, including optional task counts.
- A slower suite request cannot overwrite a newer selection in `ContextState`.
- Compare's empty shared-task case no longer claims that every setup finished the shared tasks.
- Compare only offers setups with counted scores on active tasks in the chosen section; invalid, older, wrong-harness and provisional-only cells cannot create an eligible option. Its task reads now use the shared loader and cache.
- Switching run repeats resets the output disclosure; the old run's text cannot carry over. Repeat links no longer nest anchors inside the table's row link. Compare check results are keyed by run UUID and suite, so changing sides cannot reuse another run's checks.
- Page markup now lives with its components and helpers. Removed the unused placeholder component and duplicate leaderboard dimensions file.

## Parity findings

The reference is the portfolio's existing Crucible pages, not its blog or landing page. The legacy checklist is a snapshot; the data model deliberately changes several behaviours.

| Area | Difference or gap | Disposition |
| --- | --- | --- |
| Site shell | The new app has its own Crucible header, system fonts and wider content. The portfolio's Andrew Schafer header, culture/technology/travel links, footer and typography are absent. The AI disclaimer is plain muted prose rather than the portfolio's callout. | Visual integration remains. Decide how much portfolio branding to carry over before cutover. |
| Defaults and layout | Live starts in Chat. New starts in Combined, and shows its matrix/heatmap. Run detail is a dedicated page rather than an inline panel. Model variant/deployment selections are filters. Mobile cards arrange values differently. | Deliberate B-18, B-19, B-21, B-23 and per-page parity notes. Keep these changes. |
| Scores and identity | Removing fuzzy setup merges changes some rows, ranks, coverage and timing. Registry maker/case and Eclipse hardware/cost corrections also differ. | Existing golden allowlist measures these; this cleanup does not change scoring. See `golden-diff.md`. |
| Filter values | Legacy quant/format/packager strings do not always equal the canonical registry values. | A cutover redirect must translate values that changed grammar, not merely copy the old hash. Golden parity intentionally excludes these filter grammars. |
| Old links | The translator in `core/legacy.ts` is implemented, but the old portfolio pages are not redirect stubs. Generated data does not include `legacy-slugs.json`; compare attempts to load it when an ID is unknown. Legacy `variant=` selections can be reported as dropped by the translator. | **Cutover blocker.** Generate a reviewed mapping from old setups/variants/deployments to stable IDs and install compatibility stubs. Test existing shared links. Do not silently discard an unresolved selection. |
| Hosting run links | Prerendered pages exist as HTML; `/run/<uuid>/` uses `404.html` plus the client router. Its initial HTTP response on Pages is 404, even when the run renders. | Documented B-21 tradeoff. Verify direct and refreshed run URLs on the real Pages host before redirects go live. |
| Data publication | Current generation reads the portfolio bundle; deployment only runs on dashboard `main` pushes or manual dispatch. Publishing a new result to the portfolio alone does not rebuild this app. | **Cutover blocker.** Move the bundle/output destination as designed, or explicitly trigger dashboard data rebuilds while the portfolio remains the source. |
| Test baseline | Golden assertions read newly generated data but expect the fixed November legacy numbers. Correctly adding new runs can change scores and fail parity. | Preserve a frozen generated baseline for parity or retire the migration-only assertions when adopting a changing production bundle; retain scoring unit tests. |

The page-level parity reports still record smaller presentation choices, such as the simplified "best of N setups" disclosure and card ordering. They are not proof of pixel parity or exhaustive browser coverage.

## Validation

Run the normal checks with generated data:

```sh
npm ci
npm run data:gen
npm run check
npm run lint
npm test
npm run build
npm run size
```

Final local checks: `npm run check` reports 0 errors and 0 warnings; lint, all 203 tests (including golden parity), build and size checks pass. Current-suite index: 48.4 KB gzip; first-load JS/CSS: 84.1 KB gzip (100/150 KB budgets). The browser smoke suite passes at 1400 and 375 px with no runtime errors, including output and check identity after navigation.

The initial revision passed type checking and all 199 tests. This pass adds URL and comparison eligibility regression tests and a browser smoke script, run against the built site in CI. The browser script covers all top-level pages at 1400/375 px, task and model detail, two-sided comparison/check expansion, repeated-run output switching, Runs URL reload/control/suite/Back behaviour, active-tab visibility, section-picker keyboard behaviour, dark-mode layout, and a delayed suite request. Run it against an independently running server (do not build while the dev server is being tested):

```sh
npm run dev -- --host 0.0.0.0 --port 5173
# in another shell; install Playwright Chromium first if none is available
npm run test:ui -- http://localhost:5173
# or use an installed browser:
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:ui
```

The comparison identity regression marks fetched check labels in the test browser only; it does not modify records or files.

Live HTML, scripts and JSON were inspected for all seven legacy pages, with desktop/mobile screenshots of the live main page. Browser checks are a smoke suite, not full coverage of every task/check/output or a complete accessibility audit.

## Recommended switch

Use the existing two-repository plan: publish this static app at `/crucible-dashboard/`, then replace only the old `/crucible/*` documents with compatibility redirects. This isolates the new app's deploys and gives rollback by restoring the old dashboard documents. The portfolio domain, posts, assets and Jekyll build can stay as they are. Avoid an iframe: these pages already have shareable URLs, navigation and responsive layouts.

1. Merge/release Crucible #75 and pin `.crucible-version` to the exact release or commit. Verify the version actually contains `site-data`; the latest existing release tag at audit time is v3.9.0.
2. Review the cleanup against `phase-4`, then merge the MVP to `main`. Enable this repo's GitHub Pages source as GitHub Actions, as PR #6 describes. Confirm `/crucible-dashboard/` is reachable on the portfolio domain and that another repo's Pages configuration/domain does not get replaced.
3. Preview all pages on the deployed host. Test run deep links and refreshes, a bad UUID, a missing task, past/unknown suites, provisional state, Compare sharing/check expansion, output loading and Back. Resolve the portfolio-shell decision and legacy mappings.
4. Move records and outputs with Crucible's sanctioned `publish --from-bundle` flow, verify hashes/counts, and change future `publish --to` destinations. Update generation paths in both `scripts/gen-data.sh` and `.github/actions/site-data/action.yml`. Keep the old files until rollback and source compatibility are proven. A bundle move requires the matching test-baseline decision above.
5. In a separate portfolio PR, replace only the old dashboard documents with tested compatibility stubs that translate browser hashes and query parameters to the new URLs. Preserve `noindex` and keep Crucible out of the portfolio navbar. Deploy that PR after the new app and current data are verified.
6. Verify representative old shared links end to end, then retire legacy dashboard JS/styles and redundant data after the rollback window. Restore the old dashboard documents to roll back; don't undo immutable published records.

No merge, production deployment, bundle move or portfolio edit is part of this cleanup pass.
