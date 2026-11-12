# Main page parity (`/`)

ID | status | note

Status: done = implemented as specified; changed = implemented, behaviour deliberately different (cite the B-item or reason); shared = lives in shared code (control panel / ContextState / core), not this phase; n/a = dropped.

Code: `src/routes/+page.svelte`, `src/lib/pages/main/*` (tests in `main.test.ts`).

| ID | status | note |
|---|---|---|
| MAIN-INTRO-01 | done | Title, static paragraph and the AI disclaimer. |
| MAIN-INTRO-02 | done | N = number of catalog sections (falls back to 2); Combined label from the catalog. |
| MAIN-INTRO-03 | done | Per section: label, its areas, blurb, harness list when more than one. |
| MAIN-INTRO-04 | done | Tier sentence with gate / headline additions; About link goes to `/about/`. |
| MAIN-INTRO-05 | done | Generated from the loaded (prerendered current-suite) catalog. |
| MAIN-URL-01..12 | shared | Query-param codec in `core/context.ts` + `ContextState` (B-01, B-02). Hash grammar is replaced by `?mode=&suite=...`. |
| MAIN-URL-13 | shared | Legacy hash and `&compare=` translation is `core/legacy.ts`. |
| MAIN-URL-14 | shared | `ContextState.init()` on mount. |
| MAIN-PANEL-01..28 | shared | `ControlPanel` (page passes `DIMS_LEADERBOARD`). |
| MAIN-PROV-01..09 | shared | Provisional switch lives in the panel; the page passes `ctx.provisional` through `scope()`; takeaways use a non-provisional scope. |
| MAIN-TAKE-01..06 | done | `takeaways.ts`; counted scores only. Filter / tier exclusion respected. |
| MAIN-TAKE-07 | done | `phrases.filterPhrase` (harness phrase dropped in Combined, B-08). |
| MAIN-TAKE-08 | done | Model names link to `/model/<id>/`. |
| MAIN-LB-01..05 | done | `leaderboardNote()`; gate sentence per gate tier; Combined pairing paragraph. |
| MAIN-LB-06 | done | Columns on `ResponsiveTable`; header titles as specified. Tier title falls back to the catalog blurb. |
| MAIN-LB-07 | done | Page-level sort fallback to Overall when the key is missing. |
| MAIN-LB-08 | done | Natural first direction; `aria-sort` and arrow from ResponsiveTable. |
| MAIN-LB-09, 10 | done | `sortRows` in core. |
| MAIN-LB-11 | changed | B-07: rank is rank by Overall and does not renumber on sort. |
| MAIN-LB-12 | done | Dimmed not-run rows; in-progress star and title. |
| MAIN-LB-13 | changed | Maker and model are links to their pages; no "inferred" marker (the data does not say). Compare button only on section rows (Combined rows have no single setup, as before). |
| MAIN-LB-14 | changed | "best of N setups" is a disclosure list (setup, counted runs, Overall) rather than full sub-rows with every tier cell; open state is per row and not persisted across re-renders. |
| MAIN-LB-15 | done | Shared `TierCell`; excluded tiers dimmed only with an Overall column. |
| MAIN-LB-16 | changed | Cost titles for cloud and local; the watts / price wording is the generic sentence (the index carries no per-setup watts in the row). |
| MAIN-LB-17 | done | `emptyText()` with the filter phrase. |
| MAIN-LB-18 | changed | Cards come from `ResponsiveTable` (one layout in the DOM once mounted). "Sort by" select lists the sortable column headers (e.g. "Model and best setup", "tok/s"). Rank is a "#n" line in the card title. |
| MAIN-LB-19 | changed | One row per column in the shared card; the sorted column is not moved first or highlighted, and time / decode / cost are separate rows rather than one line. |
| MAIN-LB-20 | done | 640 px breakpoint via `CARD_QUERY`. |
| MAIN-BARS-01..05 | done | `bars.ts` + `Bars.svelte`: Overall plotted (B-15), geometry, hatch, in-progress fade and star. |
| MAIN-BARS-06 | done | Tooltip on hover and focus, flips to the left in the right half, 250 ms linger, stays while hovered. |
| MAIN-BARS-07 | done | Focusable hit areas with the spec labels; SVG `role=img`; plus a visually hidden table of the same numbers. |
| MAIN-BARS-08 | changed | Redraws reactively (container width binding and window width), no debounce needed. |
| MAIN-SCAT-01..12 | done | `scatter.ts` + `Scatter.svelte`. Dots are also keyboard-focusable; visually hidden data table added. |
| MAIN-MATRIX-01 | done | Heading and sub-text. |
| MAIN-MATRIX-02 | done | Matrix and heatmap are not rendered in Combined. |
| MAIN-MATRIX-03..05 | done | Tier-grouped task columns, task links, row header with setup line. Task link `title` is the task name only (the catalog has no summary). |
| MAIN-MATRIX-06 | changed | B-21: a scored cell is a link to `/run/<uuid>/` (the leaderboard-scored run). Integer text, heat colour, x n, timeout ring, empty "·", "—" outlined for uncounted. |
| MAIN-MATRIX-07, 08 | changed | B-21: no run panel; the run page lists siblings. |
| MAIN-MATRIX-09 | done | Empty message. |
| MAIN-MATRIX-10 | done | Cards below 640 px, one group per tier, one-decimal scores, "not run". Tapping navigates to the run page. |
| MAIN-MATRIX-11 | done | The wide table scrolls in its own box; verified no page overflow at 375 px. |
| MAIN-HEAT-01..05 | done | `Heatmap.svelte`; provisional tasks fold into area means when the preview is on. |
| MAIN-COMB-01..07, 09, 10 | shared | Pairing, sums, verdicts, progress, availability in `core/scoring.ts`. |
| MAIN-COMB-08 | done | Combined shows takeaways, leaderboard, bars, scatter only; harness filter ignored; "of N" numbers. |
| MAIN-FOOT-01 | changed | Method counts come from the catalog's active tasks, counting only methods that have at least one scored cell in the index (the index does not list "published score records"). |
| MAIN-FOOT-02 | done | Footnote with suite, cut date and Crucible version from meta. |
| MAIN-TRAY-01 | done | `CompareTray`: fixed bottom-right, full width below 640 px; link to `/compare/?s=<setups>`. |
| MAIN-TRAY-02 | changed | Picks are setup ids (not slugs), `sessionStorage['crucible-compare']`, max 4, oldest dropped. |
| MAIN-TRAY-03 | done | Picks persist across section, suite and filter changes. |
| MAIN-RENDER-01 | done | Order: takeaways, leaderboard note, bars, table, caveat, scatter, matrix, heatmap, footnote. The caveat sits under the leaderboard as before. |
| MAIN-RENDER-02 | shared | Stats cache in core. |
| MAIN-RESP-01..03 | done | 640 px cards, chart widths (bars narrow under 640 or viewport narrow; scatter narrow under 500), scrolling in own containers. |
