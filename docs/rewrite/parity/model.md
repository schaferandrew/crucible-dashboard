# Parity: model pages (spec section 10)

Routes `/model/`, `/model/<maker>/`, `/model/<maker>/<name>/`, all prerendered (entries from every suite). Code: `src/lib/pages/model/`.
Status: done | changed (B-xx) | dropped.

| ID | Status | Note |
|---|---|---|
| MODEL-URL-01 | changed B-01/B-19 | Path routes. Unknown maker is `unknown`. `suite`, `mode` kept; `variant=`/`setup=` (ids) are translated into filters by `params.ts`, `deployment=` is a filter. Old slugs map via the redirect stub (`legacy.ts`). |
| MODEL-URL-02 | done | Unknown model renders the index with "No model “x” has results on Crucible. Pick one below." |
| MODEL-URL-03 | done | Case-insensitive maker match; unknown maker message. "No model is missing a maker" not needed (no `-` route; it is `unknown`). |
| MODEL-URL-04 | changed B-02/B-19 | Variant, deployment and section changes are filters/context: `replaceState`. Links push. |
| MODEL-URL-05 | done | Titles "<Name> · Models · Crucible"; breadcrumbs Crucible > Models > Maker > Model. |
| MODEL-URL-06 | done | Maker links go to the maker; "publisher" is never used. The "inferred" marker is gone (makers come from the registry; B-14). |
| MODEL-IDX-01..03 | done | Makers alphabetical, unknown last; models alphabetical with variant count and local/cloud tags. |
| MODEL-PUB-01 | changed | Meta: models, local, cloud, suite. No inferred marker. Unknown-maker message kept. |
| MODEL-PUB-02 | changed B-17/B-18 | Shared ControlPanel section chips (Combined default), in the URL. The "remembered across pages" variable is dropped (OQ-13). |
| MODEL-PUB-03 | done | Same sub-text. |
| MODEL-PUB-04 | done | Ranked by Overall, then rest by betterConfig, then not run. |
| MODEL-PUB-05 | changed | Columns kept. "main of n deployments" is "best of n deployments" (the best setup's deployment). Median time is the setup's pooled median (no all-runs fallback). |
| MODEL-PUB-06 | done | ResponsiveTable cards below 640 px. |
| MODEL-PUB-07 | done | "Compare these": top ranked models' best setups, 4 setups at most (Combined: both members). |
| MODEL-PUB-08 | done | Hand-written SVG, local/cloud/pale legend, narrow layout; the table above is its text alternative. Redraws from container width. |
| MODEL-PAGE-01 | done | Meta line. "Packaged by" is the best setup's local packager when not the maker. |
| MODEL-PAGE-02 | done | "No run of this model counts in Suite vN yet." |
| MODEL-PAGE-03 | changed B-17/B-18/B-19 | Section = `mode`, else Combined, else the only section the model ran in. No variant/deployment fallbacks: the selection is the filters. Ticks reset on section/suite change. |
| MODEL-PICK-01 | changed B-19 | The picker is the shared ControlPanel (section, reasoning, quant, packager, format, harness, where, hardware, provider). |
| MODEL-PICK-02 | changed B-19 | Closest-variant jump and dashed chips gone. Options that leave nothing are disabled with a count of 0. |
| MODEL-TILES-01 | done | Tiles of the best setup in scope. |
| MODEL-AREAS-01 | done | Bars with text values (measured on x of y, few, not run, none count). |
| MODEL-DEP-01 | changed B-19/B-20 | Row = `deployment` filter; click again clears; others dimmed with a count; disabled when it would leave nothing. Real buttons. Hardware label with machine credit. |
| MODEL-DEP-02 | done | Median over tasks of task medians; "(none finished)"; cost mean of task means. |
| MODEL-DEP-03 | done | Collapsed list (can be 50 long); scoped to in-scope setups. |
| MODEL-VAR-01 | changed B-19 | Row = filters for the dims the variants differ in (plus `where` when local and cloud both exist). Each variant shows its best setup in scope. |
| MODEL-VAR-02 | done | Tick 2-4, compare link with each variant's shown setup; none in Combined. |
| MODEL-AB-01 | changed B-19 | Partner = another in-scope setup on the same recorded deployment, one dimension apart (weights, reasoning, harness when the section has several), sharing a task. Radiogroup for several. |
| MODEL-AB-02 | changed | Dumbbells (SVG) with a table alternative, PAIR-05/06 sentence, speed phrase, "didn't finish". "Left out: unrecorded machine" dropped: those runs are their own `unrecorded` setups (B-03) and never partner. |
| MODEL-TASKS-01 | changed | Scores and time/cost are the best setup's (not pooled over deployments). Groups closed by default, state in sessionStorage. |
| MODEL-TASKS-02 | changed B-21 | Score links to `/run/<uuid>` (newest counted scored run, from the model file). |
| MODEL-OTHER-01 | changed B-19 | From `index.other`; with filters on, counted from the model's runs over in-scope setups. |
| MODEL-COMB-01 | done | Combined from site-data entities; areas prefixed with section; no A/B or compare ticks. |
| MODEL-RESP-01 | done | Tables are cards below 640 px. |

Note: task links appear after hydration, because the prerender crawl fails on a task route that does not exist in this branch; remove the `linksReady` gates once the task page is merged.
