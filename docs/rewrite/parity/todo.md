# Parity: What to run next (`/todo/`, spec section 7)

| ID | status | note |
|---|---|---|
| TODO-URL-01 | changed: B-01, B-02 | Query `?suite=&mode=&sort=&all=1` (same names), written with `replaceState`; no hash, no `hashchange`. Back does not step through control changes. |
| TODO-URL-02 | pass | `sort` in easiest (omitted) / fewest / time / score / model; unknown = easiest. |
| TODO-URL-03 | pass | `all=1` only. |
| TODO-URL-04 | pass | Unknown or absent `mode` = first section with scored tasks; changing suite clears it. |
| TODO-CTRL-01 | pass | `SuiteBar` and breadcrumb "Crucible > What to run next". |
| TODO-CTRL-02 | pass | Radiogroup only when more than one section has tasks; Combined never offered (OQ-08). |
| TODO-CTRL-03 | pass | "Sort by" select with the five labels. |
| TODO-CTRL-04 | pass | Checkbox "Every setup, not just each model's best". |
| TODO-CTRL-05 | pass | State is read from the URL on mount and on in-app navigation. |
| TODO-DATA-01 | pass | `all`: setups with counted runs; else each row's best setup, no filters. |
| TODO-DATA-02 | pass | Entry only if a scored task has no counted mean; complete ones are counted in the line. |
| TODO-DATA-03 | changed: B-06 | Derived from the cell block (no raw statuses). A single failure reads "timed out" or "harness error"; other raw statuses (e.g. context limit) are no longer named. Legacy took the text from an arbitrary counted run, which could say "finished". |
| TODO-DATA-04 | pass | Typical time and pace from `tasks/<task>.json` (fetched after first render). Finished runs in cell states only. |
| TODO-DATA-05 | pass | Effort = tasks to run plus min(fails, 3) each. |
| TODO-DATA-06 | pass | Five comparators as specified. |
| TODO-DATA-07 | pass | "scoring only", "—", "≈ time + n untimed task(s)". |
| TODO-DATA-08 | pass | Counts line. |
| TODO-PICK-01 | pass | |
| TODO-PICK-02 | pass | |
| TODO-PICK-03 | pass | |
| TODO-PICK-04 | pass | |
| TODO-PICK-05 | pass | Footnote prose kept (hard-coded copy). |
| TODO-PICK-06 | pass | Shown with `Empty`. |
| TODO-TABLE-01 | pass | Columns Setup, Done, Left, Estimated, "<Overall> so far", Tasks left. |
| TODO-TABLE-02 | pass | Coverage bar with in-progress pill; overall `TierCell`. |
| TODO-TABLE-03 | pass | `ResponsiveTable` cards below 640 px; tasks limited to 4 with "...and n more". Card also shows the overall score. |
| TODO-TABLE-04 | pass | `is-<slug>` class per task item. |

Added behaviour: if a task file fails to load, that task is untimed and a notice says so; while times load the blocks show `Loading`.
