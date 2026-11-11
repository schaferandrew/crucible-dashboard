# Runs page parity (`/runs`)

| ID | status | note |
| --- | --- | --- |
| RUN-PAGE-01 | changed: B-05 | Title "Runs", breadcrumb "Crucible > Runs". Only the shared panel's choices are in the URL (suite, section, facets); outcome, state, sort, page size and loaded months are restored on Back through the page snapshot. |
| RUN-PAGE-02 | changed: B-05 | Suite select comes from the shared panel ("(current)" mark kept). Sort select: newest, oldest, model, score high/low. The old "Filter" select is split into Outcome (finished / timed out / error) and State (every state present, with counts). |
| RUN-PAGE-03 | changed: B-05 | The list is filtered by the chosen suite's state of each run. Invalid/withdrawn runs are kept, with a badge. The task-version check is the suite's "older" state; every state is filterable. |
| RUN-PAGE-04 | changed: B-05 | Outcome uses one core class: timed_out is timeout, finished is finished, anything else (including harness_error) is error. |
| RUN-PAGE-05 | changed: B-05 | Score is the suite's chosen score (`states[suite].score`, pinned rubric), not the max over rubrics. Dates sort as ISO strings; model by label then id. Runs without a date or score go last in both directions. |
| RUN-PAGE-06 | changed: B-05 | One row/card per run via ResponsiveTable (cards below 640px): model, task, setup (harness, reasoning, quant, provider or hardware), outcome tag, state, score (heat), time, cost, start date. Panel facets filter on the run's setup, section on its task mode, tier toggles on its task tier. |
| RUN-PAGE-07 | changed: B-12 | Dates are `YYYY-MM-DD` read as UTC from the ISO string (`fmtDate`). |
| RUN-PAGE-08 | changed: B-05 | Rows link to `/run/<uuid>` (suite kept when not current), no `?run=` query. |
| RUN-PAGE-09 | changed: B-05 | "No run matches these filters" (with a note when older months are not loaded); count line "Showing n of m runs from <month range>". |
| RUN-PAGE-10 | changed: B-05 | The panel's suite line and notes now fill in (they come from the suite's catalog). |
