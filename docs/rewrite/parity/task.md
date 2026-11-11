# Task page parity (spec section 8)

ID | status | note
---|---|---
TASK-URL-01 | changed: B-01 | `/task/` and `/task/<id>/`; `suite`, `provisional`, `mode` are query params; links keep suite and provisional. Every task of every visible suite is prerendered.
TASK-URL-02 | pass | id or alias resolves through the suite catalog; aliases are served by the SPA fallback.
TASK-URL-03 | pass | "<Task> · Crucible", "Task not found · Crucible", "Crucible tasks · Crucible" (shared title helper adds the site suffix).
TASK-URL-04 | pass | Crucible > Tasks > name, keeping suite and provisional.
TASK-CTRL-01 | changed: B-18 | Index: suite select, section chips (Combined = all sections, default), "Show provisional tasks" with the same notes. Detail: the shared ControlPanel (suite, filters, provisional include) over the setups that ran the task.
TASK-CTRL-02 | pass | any status but active/retired.
TASK-INDEX-01 | pass | intro line and empty text as spec; provisional listed only when on.
TASK-INDEX-02 | pass | section heading with count and blurb, areas in catalog order.
TASK-INDEX-03 | changed: proposed B-22 | sorted by tier then name, tier and Provisional tags; the first line of `summary` is not in index.json, so each item shows "Scored by <method>, <total> <unit>" from the catalog. Needs `summary` in `catalog.tasks` (see report).
TASK-MISSING-01 | pass | exists-in links (other suites' indexes fetched on demand), up to 5 similar, See all tasks.
TASK-MISSING-02 | pass | retired stub.
TASK-MISSING-03 | pass | a provisional task opens from a direct link and is marked throughout; its provisional runs are used.
TASK-MISSING-04 | changed: B-16 | dead path not ported.
TASK-HEAD-01 | pass | pills, meta list.
TASK-HEAD-02 | pass | provisional banner.
TASK-EMPTY-01 | pass | plus a distinct message when the filters leave nothing.
TASK-ENTRY-01 | pass | from the task file's slim runs (mean score, median time, mean cost, newest run). Median tokens is not in the slim run: see TASK-PERF-02.
TASK-TILES-01 | pass | four tiles.
TASK-ASKS-01 | pass | collapsed over 12 lines / 1100 chars.
TASK-HOW-01 | pass | rules, criteria, footer.
TASK-CHECKS-01 | changed: proposed B-22 | no `details.json`; checks come from the run files (`runs/<uuid>.json`), fetched after first paint for each setup's newest counted run only (not every run). Loading, error and empty states as spec.
TASK-SPREAD-01 | pass | SVG plus a table alternative; dots link to the run (B-21).
TASK-PERF-01 | pass | best per model via betterConfig on the section view; toggle.
TASK-PERF-02 | changed: proposed B-22 | tokens out is the newest run's, from its run file, shown once loaded (slim runs carry no tokens). Setup column uses the setup's labels.
TASK-PERF-03 | pass | squares from the newest counted run, after the run files load.
TASK-PERF-04 | changed: B-21 | no inline run panel: the score (and every dot) links to `/run/<uuid>`.
TASK-PERF-05 | pass | Compare top n.
TASK-PERF-06 | pass | cards below 640 px (ResponsiveTable).
TASK-EFFORT-01 | changed: B-21 | dots link to the run instead of opening a panel; tokens as in PERF-02; table alternative added.
TASK-HARNESS-01 | pass | only when the section has more than one harness.
TASK-HARNESS-02 | pass | dumbbells with table alternative.
TASK-HARNESS-03 | pass | catalog label else id.
TASK-RESIZE-01 | pass | charts follow their box width (no timer); table/cards switch at 640 px.
