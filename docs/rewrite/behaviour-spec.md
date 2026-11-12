# Crucible dashboard: behaviour spec (parity checklist)

Source of truth: the Jekyll + vanilla JS site in `/Users/schafer/Developer/schaferandrew.github.io` (read-only). Code is authoritative where it disagrees with `AGENTS.md` (disagreements are listed under "Open questions").

How to use: every `- [ ]` item is one testable behaviour with a stable ID and a `file:line` pointer. Tick it when the SvelteKit rewrite reproduces it (or the item is consciously dropped and noted). Items tagged `[HARDCODED]` are literals in the legacy code or markup that the rewrite must source from data (catalog, fallbacks, display settings) or consciously keep as a documented constant. Items tagged `[BUG?]` look accidental; see Open questions.

## Source key

| Short | File |
|---|---|
| `core` | `assets/js/crucible-core.js` (shared join, rules, router, run detail) |
| `main` | `assets/js/crucible.js` (main page) |
| `todo` / `task` / `run` / `cmp` / `model` | `assets/js/crucible-todo.js` / `-task.js` / `-run.js` / `-compare.js` / `-model.js` |
| `main.html` | `crucible.html` |
| `todo.html` / `task.html` / `run.html` / `cmp.html` / `model.html` / `about.html` | `crucible-todo.html` / `-task.html` / `-run.html` / `-compare.html` / `-model.html` / `-about.html` |
| `nav.html` | `_includes/crucible-nav.html` |
| `cat.html` | `_includes/crucible-catalog.html` |
| `data.json` | `crucible/data.json` (Liquid template that builds the payload) |
| `fb.yml` / `disp.yml` | `_data/crucible_fallbacks.yml` / `_data/crucible_display.yml` |
| `scss` / `scss-<page>` | `_sass/pages/_crucible.scss` / `_crucible-<page>.scss` |
| `head` | `_includes/head.html` |

Terminology: **section** = catalog "mode" (Chat, Agentic ...). **Setup** = a `cfg` (one model at one reasoning level on one endpoint/hardware/harness). **Row** = base model at a reasoning level, scored by its best setup. **Variant** = weights + reasoning (+ harness when a section has several). **Deployment** = machine or provider. **Cell** = one setup on one task: `{all, counted, provisional}` runs.

---

## 1. Data contract and loading (all pages)

### 1.1 Payload and fetching

- [ ] DATA-FETCH-01 The data payload is not inlined; it is fetched after first paint from `/crucible/data.json` with a cache-busting `?v=<build time>`. `core:2511-2513`, `main.html:179`
- [ ] DATA-FETCH-02 Payload shape: `{format, catalogs, runs, status, scores[], corrections, fallbacks, display}`. Catalogs/runs/status keep Jekyll's nested folder structure (keys are file names and are ignored); score records are slimmed to totals (no per-item results). `data.json:1-20`
- [ ] DATA-FETCH-03 The reader finds records by walking the payload recursively and identifying them by their own fields: `record === 'run'|'score'|'status'`; a catalog is any object with `suite` and a `tasks` array. Folder/file keys are never read. `core:389-421`
- [ ] DATA-FETCH-04 A duplicate `run_uuid` keeps the first run seen; a duplicate score key (`run_uuid|rubric_version|method`) keeps the last one seen. `core:394,400`
- [ ] DATA-FETCH-05 `details.json` (full score records with per-check `items`/`groups`) is fetched only when a run is opened (or, on the task and compare pages, when a page section needs check results), at most once, and the promise is cached; a failed fetch clears the cache so a later open retries. `core:2156-2175`
- [ ] DATA-FETCH-06 Model output text is fetched from `/crucible-data/<run.output_ref>` only when the user opens the "Model output" disclosure; it is fetched once per open panel; a failure resets so reopening retries. `core:2259-2272`
- [ ] DATA-FETCH-07 Status records for a run are sorted by `at` ascending and the last one wins. `core:422-425`

### 1.2 Loading, error and empty states

- [ ] DATA-STATE-01 While loading, a status line reads "Loading results…" (run page: "Loading runs…" in markup, replaced by the same core text immediately) and the results region is `hidden`. `core:2512`, `main.html:38`, `run.html:12`
- [ ] DATA-STATE-02 If the fetch fails or returns non-2xx: status reads "Couldn’t load the results." followed by a "Try again" button that re-runs the load (status text goes back to "Loading results…"). `core:2496-2535`
- [ ] DATA-STATE-03 If joining/rendering throws on first load: status reads "Something went wrong drawing the results." with a "Try again" button, and the error is logged to console. `core:2528-2531`
- [ ] DATA-STATE-04 If there are no usable catalogs after filtering: status shows the skipped-format notice if any records were skipped, else "No results have been published yet."; the page body is not drawn. `core:2522-2525`
- [ ] DATA-STATE-05 On a route change (todo/task) a render exception shows "Something went wrong drawing this page." / "Something went wrong drawing this task." in the status line (no retry button) and does not crash the page. `todo:206-209`, `task:746-749`
- [ ] DATA-STATE-06 After a successful draw the status line is cleared, or shows the skipped-format notice if there is one. `core:2527`

### 1.3 `format_version` handling

- [ ] DATA-FMT-01 The highest understood `format_version` is 3 (`SUPPORTED_FORMAT`). A run, score, catalog or corrections node with `format_version > 3` is skipped (counted in `skipped`), never an error. `core:11,42,392-420,454`
- [ ] DATA-FMT-02 Any other object node whose `format_version` is above 3 is skipped with its whole subtree during the walk. `core:419`
- [ ] DATA-FMT-03 If one or more records were skipped, a one-line notice is shown in the status line on every page: "Some results were published with a newer Crucible than this page understands, so they are not shown." `core:508,2527`
- [ ] DATA-FMT-04 A higher `format_revision` is always accepted; between two catalogs with the same suite id, the one with the higher `format_revision` wins. `core:430`
- [ ] DATA-FMT-05 Missing/non-numeric `format_version` is treated as supported (not newer). `core:42`
- [ ] DATA-FMT-06 Status records are not version-checked (they are always read). `core:404-407` `[BUG?]` see OQ-02.
- [ ] DATA-FMT-07 The Liquid-built intro/about content applies the same rule with its own constant (`cr_supported = 3`): a catalog above it is skipped; a catalog without `tasks` is skipped. `cat.html:9,13-14` (rewrite: one constant).

### 1.4 Suites

- [ ] DATA-SUITE-01 One catalog per suite id (`suite.id`, falling back to `suite.version`, then `'?'`). `core:429`
- [ ] DATA-SUITE-02 Suites are ordered newest first by dotted `suite.version` (leading `v` stripped, numeric parts compared left to right), ties by `cut_at` descending. `core:432-441`
- [ ] DATA-SUITE-03 Suites listed in `display.hidden_suites` (`disp.yml`) are not selectable; if that would hide every suite, all stay visible. `core:512-515`, `disp.yml:9`
- [ ] DATA-SUITE-04 The "current" suite is the visible suite whose `suite.status === 'current'`, else the first visible (newest) suite. `core:516`
- [ ] DATA-SUITE-05 A `suite=<id>` hash param that is hidden or unknown falls back to the current suite everywhere (`D.suite(id)`). `core:519,2025-2028`
- [ ] DATA-SUITE-06 Display name: `Suite v<id>` (a leading `v`/`V` in the id is not doubled). `core:122`
- [ ] DATA-SUITE-07 A suite's built context (tasks, tiers, modes, join) is computed once per suite id and cached. `core:2023-2029`

### 1.5 Fallbacks and unknown data

- [ ] DATA-FB-01 Catalog fields always win; `fallbacks` (from `fb.yml`) only fill missing label/blurb/order/role/gate/coverage numbers, keyed by id. `core:1022-1034,1060-1066`
- [ ] DATA-FB-02 Fallback sections used: `scoring_policy` (`coverage_min`, `in_progress_below`, default 0.75 each), `modes`, `combined` (label/blurb), `aggregate.label`, `tiers`, `areas` (blurb, examples), `scoring_methods` (label, blurb, criteria_label). `core:502-507,1021-1023`, `fb.yml`
- [ ] DATA-FB-03 `[HARDCODED]` Literal defaults when even the fallback is missing: coverage_min = 0.75, in_progress_below = 0.75; overall label "Overall"; combined label "Combined"; single-tier placeholder tier `{id:'all', label:'Score'}`. `core:507,1022-1023,1045,1300`
- [ ] DATA-UNK-01 An unknown tier id (only a task mentions it) is appended after known tiers with `label = Capitalized id`, no role, order 1000+position; it is shown but never headlines and never gates. `core:1027-1046`
- [ ] DATA-UNK-02 An unknown mode (only a task mentions it) is added as a section with `label = Capitalized id`, no blurb, harnesses taken from harness declarations, order 1000+position. `core:1058-1069`
- [ ] DATA-UNK-03 A task whose area is not in its mode's area list adds an area with label from fallback or Capitalized id, order 1000. `core:1070-1076`
- [ ] DATA-UNK-04 Unknown harness id renders as its raw id; a harness the catalog does not declare for any mode never counts toward any section. `core:1078-1081,1103`
- [ ] DATA-UNK-05 Unknown enum values (where, outcome status, scoring method) render as the raw id (`where`: Capitalized; outcome status: underscores to spaces; method: raw id when no fallback label). `core:186,712,2209`
- [ ] DATA-UNK-06 Unknown/absent fields never throw: numeric reads go through `num()` (non-finite becomes `null`), objects default to `{}`; absent values render as "—". `core:33,69-85`
- [ ] DATA-UNK-07 A catalog with no tiers and no task tier gets one synthetic tier; a task with no `tier` still renders (tier label of `undefined` id is capitalized). `core:1045,1128`
- [ ] DATA-UNK-08 A run whose task is not in the selected suite's catalog (by id, alias, or `task.alias`) is kept, not counted anywhere, and is reported under "Other runs" on the model page. `core:1096-1097`, `model:905-926`
- [ ] DATA-UNK-09 A task with `status` other than `active` or `retired` (e.g. `provisional`, anything unknown) is treated as provisional. `core:1098,1104-1105`, `task:16`
- [ ] DATA-UNK-10 A retired task's runs are dropped from the join entirely; its task page shows a stub. `core:1098`, `task:722`

### 1.6 Corrections (model fields recorded badly)

- [ ] DATA-CORR-01 `corrections` (`record:'corrections'`, not newer than 3) is applied once, as runs are loaded, by one function; nothing else re-implements it. `core:453-494`
- [ ] DATA-CORR-02 A run whose `model.base` is listed in `corrections.models[].base` is read under `to_base`; its `variant_key` first segment is rewritten with it. `core:457,471-474`
- [ ] DATA-CORR-03 A listed `maker` fills `model.origin.maker` (with `source:'correction'`) only when the run has none; a listed `publisher` fills `model.publisher` (and `variant_key` segment 1) only when empty. `core:475-479`
- [ ] DATA-CORR-04 `corrections.publishers[]` maps a `from` packager spelling to `to` on every run. `core:458,480-483`
- [ ] DATA-CORR-05 An empty `model.format` on a local run is filled from the quant when only one format uses it: `/^i?q\d(_[a-z0-9]+)*$/` gives `gguf`, `/^(mlx-)?\d+bit$/` gives `mlx`; anything else stays unrecorded. `core:460-465,484-488`
- [ ] DATA-CORR-06 When anything changed, the original values are kept as `model.recorded` and the reason as `model.correction`; the run detail says what was recorded (see RUNDETAIL-09). `core:490-491,2285-2293`

### 1.7 Run validity

- [ ] DATA-VALID-01 A run's standing comes from its last status record: `withdrawn` (never shown), `invalid` (shown flagged, never counted), `valid:true`; with no status record, `run.outcome.invalid` makes it invalid, else valid. `core:957-966`
- [ ] DATA-VALID-02 Invalid reason text = last status `invalid.reason|detail`, else `outcome.invalid.reason|detail`. `core:967-971`

---

## 2. The join and counting rules (core; every page depends on these)

### 2.1 A run counts in a suite

- [ ] JOIN-COUNT-01 A run counts in a suite when: its task is in the suite catalog (by `task.id`, alias list, or `task.alias`); the task is `active`; the run's `task.version` equals the catalog task `version` (or the catalog version is null/undefined); the run's setup harness is declared for the task's mode (`catalog.harnesses[].modes`); and the run is not invalid/withdrawn. `core:1090-1105`
- [ ] JOIN-COUNT-02 A run has exactly one non-counted `state` when it does not count: `invalid`, `older` (task version differs), `harness` (harness not scored for that mode), `provisional` (task not active). Precedence: invalid, then older, then harness, then active/provisional. `core:1100-1105`
- [ ] JOIN-COUNT-03 A run's score is the score record at `(run_uuid, task.rubric_version, task.scoring_method)`; else any record of that run at the pinned rubric version; for non-counted runs only, fall back to the newest rubric version's record. A counted run with no record is tallied in `S.unscored`. `core:1106-1113`
- [ ] JOIN-COUNT-04 `task.scoring_method` is `task.scoring.method` when `scoring` is an object, else the `scoring` string. `core:1013`
- [ ] JOIN-COUNT-05 A cell keeps `all` runs (sorted newest `started_at` first), `counted` (state counted and score is a number), `provisional` (state provisional and score is a number). A counted run with no score is in `all` but not `counted`. `core:1113-1125`
- [ ] JOIN-COUNT-06 A cell's value: mean of counted scores (kind `counted`); else mean of provisional scores (kind `provisional`); else kind `uncounted` with no mean. `core:983-988`
- [ ] JOIN-COUNT-07 Repeats are aggregated as mean with `n`, `min`, `max` (never best or latest). `core:56-60`

### 2.2 Tier and overall scoring

- [ ] JOIN-SCORE-01 A task's weight within its tier is `task.weight` if numeric, else its category's weight (`catalog.categories[].weight`) divided by the number of active tasks of that category in that tier/section. If the tier's weights sum to 0, active tasks weigh equally. `core:1018-1019,1605-1618`
- [ ] JOIN-SCORE-02 Tier score = weighted mean of per-task means over the tasks the setup has a counted mean for (rescaled over scored tasks); `null` when none scored. Also returns `coverage` (scored weight / total weight), `scored`, `total` (active task count), `min` (lowest task mean). `core:1649-1674`
- [ ] JOIN-SCORE-03 A tier score is `partial` when its coverage is below `coverage_min` (comparison treats exactly-equal as meeting it: `share + 1e-9 >= min`). `core:39,1672`
- [ ] JOIN-SCORE-04 Overall score = sum of the included tiers' 0-10 scores (each tier max 10), out of `10 x included tiers`. It is `partial` when any included tier is partial or unscored, so a setup that skipped a tier is not ranked until that tier is excluded. `core:1716-1735`
- [ ] JOIN-SCORE-05 `exclude` removes tiers from the overall; at least one tier always remains (if all are excluded, all are used). `core:1702-1705`
- [ ] JOIN-SCORE-06 A section with one tier has no Overall column/toggle: that tier is the overall score and uses the tier's own label. `core:1708-1710`
- [ ] JOIN-SCORE-07 Gate tier: a tier with `role:'gate'` and a numeric `gate.mean`/`gate.min` yields a verdict per setup: `null` (no score), `partial`, `pass` (score >= gate.mean and min task score >= gate.min), else `fail`. A gate tier with no valid thresholds has no verdict. `core:1131-1134,1683-1687`
- [ ] JOIN-SCORE-08 The headline tier = first tier with `role:'headline'`, else first non-gate tier, else the first tier. "Stretch" tiers = every tier that is neither the headline nor a gate. `core:1049-1052`
- [ ] JOIN-SCORE-09 A setup's `progress` = counted-active tasks done / active tasks in the section; `inProgress` = share below `in_progress_below`. Provisional tasks never change progress/coverage. `core:1744-1746,1766,1648`
- [ ] JOIN-SCORE-10 `ran` = the setup has any run (any state) of a task shown in the section. A row with no counted run (`runs === 0` for all its setups) is dropped from the board entirely. `core:1758,1779-1781`
- [ ] JOIN-SCORE-11 Best setup of a row (`betterConfig`): among setups whose overall is non-null and not partial, highest overall (ties: more tasks done, then more counted runs); only if none is complete: most tasks done, then higher overall, then more runs. Every number shown for a row belongs to that single setup (never stitched per task). `core:1186-1199`
- [ ] JOIN-SCORE-12 Rows group setups by `rowKey = base#reasoningLevel` across local and cloud. `core:622,1773-1786`
- [ ] JOIN-SCORE-13 Per-setup stats also carry median time (`elapsed_s`), median decode speed (`metrics.output_tokens_per_s`, only >0 counts), mean cost over counted runs. `core:94-99,534-535,1765`
- [ ] JOIN-SCORE-14 A row is "ranked" only if it ran, is not in progress, and has a full (non-partial) overall score. `core:1826`
- [ ] JOIN-SCORE-15 Provisional-fold view (`S.view(mode,{provisional:true})`): active + provisional tasks are in `orderedTasks`; provisional tasks count toward tier/overall only where run (using their provisional-run means); `total`, `coverage`, `scored`, `progress` ignore them; `prov:{scored,total}` is attached to tier/overall results; provisional weight = catalog weight, else the mean weight of active same-category tasks in the tier, else tier mean, else 1. `core:1570-1665`
- [ ] JOIN-SCORE-16 Task display order inside a section: tier order, then the section's area order, then catalog order. A tier with no shown task in the section has no column there. `core:1577-1592`
- [ ] JOIN-SCORE-17 Per-area result for a setup: mean of the per-task means over the area's tasks that have a mean; `n` = tasks with a mean; `null` score when none. `core:1835-1839`

### 2.3 Setup identity (what makes two runs one setup)

- [ ] IDENT-CFG-01 A setup's identity: base model, where (local/cloud), harness id, publisher (packager), format, quant, reasoning, provider (cloud only), hardware key (local only), device (local only), plus whether reasoning was merely the default. Parsed from `model.variant_key` (`base|publisher|format|quant`) when present, else from the model fields. `core:550-575`
- [ ] IDENT-CFG-02 `where` = `endpoint.where`, else `local` if a hardware key exists, else `cloud`. `core:555`
- [ ] IDENT-CFG-03 Empty, `-`, null values are "not recorded" (null), never a distinct value. Reasoning: an explicitly requested non-default level is known; `default` is known only if `resolved` exists. `core:554-560`
- [ ] IDENT-CFG-04 OpenRouter's upstream provider never splits a setup (it is only shown in a run's detail as "routed to ..."). `core:547-549,2280`
- [ ] IDENT-CFG-05 A group of runs with some unrecorded identity fields is merged into the single better-recorded group it is compatible with (same base/where/harness, every both-recorded field equal); if two or more candidate groups remain, it stays its own setup. `core:580-615`
- [ ] IDENT-CFG-06 Each setup gets a stable unique slug: `<model-short-name>~[reasoning-<level>]~[quant (local)]~<hwKey|device|local | provider|cloud>~<harness>` slugified (lowercase, `[a-z0-9.]` runs joined by `-`); collisions get `~2`, `~3`... in load order. Slugs are the compare page's URL ids. `core:119,628-634`
- [ ] IDENT-CFG-07 Setup label shown under rows: local: `[<packager> ]<quant|"quant not recorded"> · <hwKey (device,...)|device|"hardware not recorded"> · <harness>`; cloud: `via <provider|cloud> · <harness>`. Row label = model short name, plus ` (reasoning <level>)` when level is not `default`. `core:654-666`
- [ ] IDENT-CFG-08 Model short name = text after the last `/` of `base`; maker-stripped name = text after the first `/`; a leading `~` (provider "latest" alias) is dropped. `core:118,146-149`
- [ ] IDENT-VAR-01 A variant = base + weights (packager/format/quant for local; "api" for cloud) + reasoning level + harness. A local setup with no quant recorded is its own variant, never pooled. `core:758-779`
- [ ] IDENT-VAR-02 Variant slug: `<quant|"quant-not-recorded"|"api">~reasoning-<level>~<harness>` slugified, unique per base with `~2` suffixes. `core:771-776`
- [ ] IDENT-VAR-03 Variant label: `<quant> · reasoning <level>[ · <harness>]`; model name first when asked; for cloud the weights part is omitted (text would be "provider's weights"). Harness part appears only when the section (or any section, in Combined) has more than one harness. `core:825-842,1140-1144`
- [ ] IDENT-VAR-04 Two variants differ on dimension `model`, `weights`, `reasoning`, `harness` (the answer-changing ones). `core:844-848`
- [ ] IDENT-DEP-01 A deployment per run: local with hardware key `local~<slug(hwKey)>`; else local with device `local~device-<slug>`; else `local~unrecorded` ("machine not recorded"); cloud `cloud~<slug(provider)>`; else `cloud~unrecorded` ("provider not recorded"). Label: local `hwKey (device names)`; cloud `via <provider>`. `core:716-753`
- [ ] IDENT-DEP-02 Cost kind per deployment: local = `electricity`, cloud = `billed`. `core:729`
- [ ] IDENT-DEP-03 Deployments come from each run's own record (not merged), so an unrecorded-machine run that a setup absorbed still counts toward the variant's quality but sits in its own "machine not recorded" deployment and is excluded from A/Bs, speed and cost comparisons. `core:680-683,1996`
- [ ] IDENT-MAKER-01 Maker (publisher) of a run = `model.origin.maker` (not inferred). For a base/setup/row: the maker most often recorded by that base's runs (ties alphabetical), else inferred from the base. Inferred shows a small "inferred" marker (title: "Inferred from the model name: the runs didn't record who made the model."). `core:889-922,358-359`
- [ ] IDENT-MAKER-02 Inference: text before the first `/` of base (leading `~` dropped, lowercased); null if no `/` or the prefix is a packager. `core:139-144`
- [ ] IDENT-MAKER-03 `[HARDCODED]` Packager prefix list `mlx-community, lmstudio-community, unsloth, bartowski` (never a maker). `core:125`
- [ ] IDENT-MAKER-04 `[HARDCODED]` Hand-kept base-to-maker table: `laguna-xs-2.1`->poolside, `qwen2.5-0.5b-instruct`->qwen, `qwen2.5-1.5b-instruct`->qwen, `granite-4.2-3b-mlx@4bit`->ibm, `deepseek-v4.1-flash-free`->deepseek, `mlx-community/muse-glimmer-30b`->meta. Rewrite must move this to data (corrections or fallbacks). `core:128-135`
- [ ] IDENT-MAKER-05 Makers are shown exactly as recorded (no label map); no maker shows "unknown maker". `core:925`
- [ ] IDENT-MAKER-06 Model key (model page id) = `<maker>/<model name>` or just the name when no maker. A model key may span several base strings. "Packaged by <packager>" is shown only when a packager is recorded and differs from the maker. `core:927-932,856-860`
- [ ] IDENT-COST-01 Cloud run cost = `metrics.cost_usd`. Local run cost = `elapsed_s x display.energy.watts[hardware.key] / 3600000 x energy.usd_per_kwh`; null when watts/time/price missing (shown as "—" and the setup is left off the cost scatter). `core:521-530`, `disp.yml:26-32`
- [ ] IDENT-COST-02 Local costs are always prefixed `≈`. `core:83`

### 2.4 Paired comparison rules (used by compare page and model-page A/B)

- [ ] PAIR-01 Two sides are compared only on tasks both ran as counted runs at the suite's task version, on active tasks. A task enters the score difference only when both sides have a finished, scored run. `core:2042-2072`
- [ ] PAIR-02 Run outcome classes: `timed_out` (`outcome.timed_out` or status `timeout`), `finished` (status `completed`), else `error`. Only finished runs' scores count in a comparison; timed-out/errored runs are listed as reliability and never scored 0. `core:702-707`
- [ ] PAIR-03 Outcome text: finished / timed out / harness error; for other error statuses the status with underscores replaced by spaces. `core:709-713`
- [ ] PAIR-04 Differences are `b - a`; a difference below 0.05 is "the same"; "differing" tasks are those with |diff| >= 0.05. `core:2075-2077`
- [ ] PAIR-05 `[HARDCODED]` Rule 5: a "scores X higher/lower" headline is allowed only with at least `MIN_PAIRED_TASKS = 5` paired tasks and when no single task accounts for more than `MAX_TASK_SHARE = 0.5` of the summed difference (unless the sides score the same); otherwise the sentence is "A and B differ on k of n shared finished tasks[ (Task accounts for most of the difference)]." `core:27-28,2078-2084,2136-2145`
- [ ] PAIR-06 Sentences: no shared task -> "No task in common."; shared but none both finished -> "No task both finished, of the N both ran."; same -> "B scores the same as A on n shared finished tasks."; else "B scores 0.4 higher|lower than A on average on n shared finished tasks." (singular "task" for n=1). `core:2136-2145`
- [ ] PAIR-07 A difference is an "A/B" only when the variants differ in exactly one answer-changing dimension that is in the section's variant dims and both sides are on the same recorded deployment. Otherwise a note says "These differ in X and Y: a difference can't be put down to either." `core:2123-2129`
- [ ] PAIR-08 Speed comparison is allowed only when both deployments are recorded and either (same deployment, different variants) or (same variant, different deployments); ratio = median of per-task time ratios (b/a), plus counts of tasks where b was faster/slower. Cost comparable only when speed is and the cost kind matches. `core:2086-2107`
- [ ] PAIR-09 Runs on unrecorded deployments are set aside in `unrecorded` and never compared. `core:1996,2114-2122`

---

## 3. Formatting and shared presentation

- [ ] FMT-01 Score: one decimal (`7.5`), `—` when null. `core:69`
- [ ] FMT-02 Seconds: `<10s` one decimal (`4.2s`), `<60s` integer (`42s`), `<1h` `Xm YYs` (seconds zero-padded), else `Xh YYm`; `—` when null. `core:70-75`
- [ ] FMT-03 USD: null `—`; 0 `$0`; `<0.0001` -> `<$0.0001`; `<0.01` two significant digits; `<1` three decimals; else two decimals. `core:76-81`
- [ ] FMT-04 Cost with local flag prefix `≈` only when the value exists. `core:83`
- [ ] FMT-05 Integer: locale-grouped (`toLocaleString`), `—` when null. Date: first 10 chars of the ISO string (`YYYY-MM-DD`), `—` when missing. `core:84-85`
- [ ] FMT-06 Repeats text: `1 run`; else `n runs, all 7.0` (min==max) or `n runs, 6.0–8.0`. `core:86-90`
- [ ] FMT-07 Decode speed: `<10` one decimal else rounded integer, suffix ` tok/s` (bare in table cells). Title: "Decode speed: median of the N[ of M] run(s) that recorded it (output tokens per second of generation, prompt processing excluded)" or "Decode speed wasn't recorded for these runs". `core:100-104`
- [ ] FMT-08 Percent: `Math.round(v*100)%`. List phrase: `a and b`, `a, b and c`. `core:40,105-107`
- [ ] FMT-09 Heat colour: linear from `rgb(234,242,251)` (score 0) to `rgb(24,86,163)` (score 10) on `score/10` clamped; text colour white when t > 0.55 else `#2b2537`; null score gets no heat. `[HARDCODED]` palette. `core:110-116`
- [ ] FMT-10 `[HARDCODED]` Local/cloud identity colours `#2a78d6` / `#eb6834`; compare/series colours `#1856a3, #eb6834, #2f8a4a, #8a4fbf` (wrap past 4). `core:22,356-357`
- [ ] FMT-11 Model names never break inside the slug; a line break is allowed only before ` (reasoning …)`. `core:176-184`
- [ ] FMT-12 Where-tag: "local" or "cloud" (lowercase) for those values, Capitalized otherwise; local tag styled distinctly. `core:185-187`
- [ ] FMT-13 Score button: heat-coloured; null = uncounted style; `×n` superscript when repeats > 1. `core:362-370`
- [ ] FMT-14 Coverage bar: `done/total` text, a bar with fill = share (low style when in progress), and an "in progress" pill (title: "Fewer than 75% of this section's scored tasks have a counted run, so the score may still move", % from the suite). `core:373-383`
- [ ] FMT-15 Tier cell (shared by leaderboard/model/todo): bar (width = score / max; max = result.max for counted, else 10), score, `scored/total tasks`, markers: gate verdict `✓ pass` / `✕ fail` (title "<Tier> gate: pass|fail"), `partial` note (title: "Fewer than N% of this tier's tasks were scored" / for overall "A tier in this score has fewer than N% of its tasks scored"), `provisional` note (title "Provisional tasks don't count toward rankings"), `+n provisional` note (title "n of m provisional task(s) included in this score (not in the suite as cut)"); null score shows "—". Partial bars hatched; local fill distinct. `core:1204-1235`

---

## 4. Shared chrome: routes, nav, suite bar, router

### 4.1 Routes (all `noindex`, none in the site navbar)

- [ ] ROUTE-01 Seven routes: `/crucible/` (main), `/crucible/task/`, `/crucible/model/`, `/crucible/compare/`, `/crucible/run/`, `/crucible/todo/`, `/crucible/about/`. Each page is its own document in the legacy site; in SvelteKit they are routes sharing one data/join layer. `AGENTS.md`, `nav.html:6`
- [ ] ROUTE-02 Every Crucible page emits `<meta name="robots" content="noindex">` (front matter `noindex: true`). `main.html:4`, `head:5-7`
- [ ] ROUTE-03 No Crucible page appears in the site-wide navbar; Crucible has its own tab strip only. `AGENTS.md` (no references in `_layouts/`/`_includes/` other than `crucible-*`)
- [ ] ROUTE-04 Data endpoints are excluded from the sitemap (`sitemap: false`). `data.json:4`, `crucible/details.json:4`
- [ ] ROUTE-05 State lives in the URL hash for all pages (the deep-link grammar below). The rewrite may use real paths/query but must keep old hash links working (see ROUTE-12).
- [ ] ROUTE-06 Hash grammar: `#<id>&key=value&key=value`; the single part with no `=` is the page's id (mode, task id, `maker/model`, comma list of setup slugs); everything else is params. Id is URI-decoded; params URI-decoded. `core:257-268`
- [ ] ROUTE-07 Building a hash: id encoded segment by segment so `/` and `,` stay literal; params with null/undefined/empty values are omitted; params order is insertion order. `core:270-282`
- [ ] ROUTE-08 Page-to-page links keep the `suite` param (when one is present in the current hash); when absent the target link has none. `core:289-296`
- [ ] ROUTE-09 Route table with params: main `#<mode>&suite&exclude&harness&where&hw&format&quant&packager&reasoning&provisional`; task `#<task-id>&suite&provisional`; model `#<maker>[/<model>]&suite&variant&deployment&mode` (+ legacy `setup`); compare `#<slug>,<slug>…&mode&suite`; todo `#&suite&mode&sort&all`; run: none; about: none. See per-page sections.
- [ ] ROUTE-10 Pages that use `onRoute` (todo, task, model, compare) re-render on every `hashchange` and also on first load; the rendering reads only the hash. `core:284-287`
- [ ] ROUTE-11 Link navigation creates history entries on every page except the main page, which rewrites its own hash with `history.replaceState` (no entry, no `hashchange`). `main:88`, `todo:18`, `task:734`, `model:24`, `cmp:70` `[BUG?]` inconsistent back-button behaviour, see OQ-09.
- [ ] ROUTE-12 Legacy deep links to keep working: `#chat&compare=a,b` on the main page redirects (replace) to the compare page with the first 4 slugs and the suite; `&setup=<slug>` on the model page maps to its variant + deployment; `?provisional=1` query on the main page. `main:62-65,1252`, `core:862-885`

### 4.2 Crucible tab strip

- [ ] NAV-01 One tab strip on every Crucible page, in order: Leaderboard (`/crucible/`), Tasks (`/crucible/task/`), Models (`/crucible/model/`), Compare (`/crucible/compare/`), Runs (`/crucible/run/`), What to run next (`/crucible/todo/`), About (`/crucible/about/`). `[HARDCODED]` labels/paths (route table). `nav.html:5-7`
- [ ] NAV-02 The current page's tab has `aria-current="page"` (matched by permalink) with a bolder weight and an underline. `nav.html:6`, `scss:2272-2279`
- [ ] NAV-03 Each tab link carries the reader's `&suite=` hash param when the current hash has one; updated on load and on every `hashchange`. `core:2469-2475,2489`
- [ ] NAV-04 On the main page the tab links use the main page's selected suite state (not the hash), omitting the param when it is the current suite. `main:1171-1178`
- [ ] NAV-05 The strip never wraps: it scrolls on the x axis only (hidden scrollbar, `overscroll-behavior-x: contain`, hidden y overflow). `scss:2246-2256`
- [ ] NAV-06 On load, if the strip overflows, the current tab is scrolled into view once (left edge offset 16 px) and never again. `core:2478-2485`
- [ ] NAV-07 Every non-main page and the about page begin with a breadcrumb: `Crucible › <page> [› detail]`; the Crucible link keeps `&suite=`. About: "← Crucible results". Run: static "Crucible › Runs". `core:338-345`, `about.html:9`, `run.html:10`

### 4.3 Suite bar (task, todo, compare, model pages) and suite handling

- [ ] SUITE-01 The suite `<select>` and its label are shown only when two or more suites are visible; the suite line is always shown. Options: `Suite v3 (current)` / `Suite v2`. `core:2422-2430`
- [ ] SUITE-02 Suite line text: `Suite v3 (version 3.1) · N scored tasks · cut YYYY-MM-DD`; "N scored tasks" counts active tasks; the `(version …)` part appears only when `suite.version` exists; the `cut` part only when `cut_at` exists. `core:2434-2438`
- [ ] SUITE-03 If `suite.changelog_url` starts with `http(s):` or `/`, " · What changed" links to it (`rel=noopener`); any other value is ignored. `core:2439-2442`
- [ ] SUITE-04 For a non-current suite a note shows: "A past suite: its own tasks, tiers and weights, and only the runs that count in it (a run counts in every suite that pins its task at the version it ran)." Hidden for the current suite. `core:2444-2449`
- [ ] SUITE-05 Changing the suite select updates the hash: main page keeps all filters; task page keeps id + provisional; model page drops `variant`/`deployment`/`mode` and omits `suite` when it equals the current suite; todo drops `mode`; compare keeps slugs and the explicit `mode`, omitting `suite` for current. `main:1217`, `task:733`, `model:26-28`, `todo:201`, `cmp:773-776`

---

## 5. Run detail (shared panel, opened from main matrix, task page, model page)

There is no standalone "run" route: a run's detail is a panel opened in place. The `/crucible/run/` page is a separate card list (section 11).

### 5.1 How it opens

- [ ] RUNDETAIL-01 Opening a cell (matrix cell button, task-page row/dot/score button, model-page task score button) fills a `crucible-cell-detail` panel below the table and shows it. Title: `<row label> · <task name> · <tier label>[ (provisional)]` followed by a muted `<setup config label>` (model page overrides it with the variant label). `core:2355-2363`, `model:835-840`
- [ ] RUNDETAIL-02 The panel shows the task prompt: summary text (`task.summary`, else task name) and, when `task.prompt` exists and differs from the summary, a "Full prompt" disclosure with the prompt in a `<pre>`. `core:2191-2198`
- [ ] RUNDETAIL-03 Below the prompt: if the cell has no runs: "Not run with this setup."; else a summary line "Score 7.5, the mean of 3 runs, 6.0–8.0." / "(1 run)" / "Provisional: …" / "No run of this setup counts in this suite." `core:2297-2305`
- [ ] RUNDETAIL-04 Runs listed newest first as disclosure items: summary = score (one decimal or "—") + ` YYYY-MM-DD · <elapsed>`, plus a flag for non-counted runs: provisional / "older task version" / invalid / "not counted" (title = the full reason in STATE_TEXT). The newest run is open by default; each run's body fills lazily on first open. `core:2186-2189,2306-2322`
- [ ] RUNDETAIL-05 Wide: opening a panel does not scroll; the matrix hides the panel when the table re-renders. Narrow (<640): after opening from the main page's matrix cards the panel scrolls into view at its top; task and model pages scroll it into view "nearest, smooth". `main:1011,1076`, `task:392`, `model:839`

### 5.2 What a run shows (`runBody`)

- [ ] RUNDETAIL-06 Score sentence: with `raw.total`: "<passed> of <total> <unit>[ passed (when unit is tests)] → 7.5" (non-integer amounts one decimal; unit from record `raw.unit` else task `scoring.unit`); else "Score 7.5"; plus " (capped at X)" when `capped_at` is numeric; then ", by <method label> (rubric version N)." Missing score record: "Not scored at rubric version N." (or `?`). `core:2200-2211`
- [ ] RUNDETAIL-07 Standing line: the STATE_TEXT sentence capitalized (counts in this suite / provisional task: shown, not in tier scores / from an older version of this task: doesn't count in this suite / marked invalid: never counts[: reason] / a harness this suite doesn't score for this section: doesn't count). `core:2177-2183,2246-2248`
- [ ] RUNDETAIL-08 Checks and tests: when a score record exists, "Loading checks…" then (from `details.json`) the grouped list: group headings, ✓/✕ per item with `label` (or id) and `(detail)`; if the record has only `groups`, "n/m <id> (detail)" lines with all/partial/fail styling; with no items/groups: "No per-check results published for this score."; fetch failure: "Couldn’t load the checks." `core:2213-2255`
- [ ] RUNDETAIL-09 If `metrics.reasoning_chars` is set: "Reasoned for N characters before answering." `core:2256-2258`
- [ ] RUNDETAIL-10 If the run has `output_ref`, a "Model output" disclosure; opening it shows "Loading…" then the text (`(empty)` for empty), or "Couldn’t load the output." (retry on reopen). `core:2259-2273`
- [ ] RUNDETAIL-11 Meta line (dot-separated, skipping absent parts): `ran YYYY-MM-DD · <status with _ -> space>[ (timed out)] · time <t> · decode <tok/s> | decode speed not recorded · tool calls N (only when recorded) · tokens in N · out N · <electricity|cost> <value> · routed to <upstream> · task v<n|?> · Crucible <version> · run <first 8 chars of uuid>`. `core:2274-2284`
- [ ] RUNDETAIL-12 If the run was corrected (`model.recorded`), a line: "Recorded as model <old>, packager <old|not recorded>, format not recorded (read from the quant)[; corrected: <reason>]." listing only what changed. `core:2285-2293`

### 5.3 Matrix-cell button semantics (shared)

- [ ] RUNDETAIL-13 Cell button text: wide = rounded integer score; narrow/cards = one-decimal; "—" when the cell has no counted mean; `×n` superscript for repeats; heat-coloured; accessible label `<row label> <task>: 7.5, 3 runs, 6.0–8.0` or `... doesn't count in this suite`. Title: `7.5 · <repeats>` or the state text of the cell's newest run. A cell where any run timed out gets a timeout ring (`is-timeout`). `core:2366-2375`

---

## 6. Main page `/crucible/`

### 6.1 Intro (server-rendered in legacy; must be data-driven)

- [ ] MAIN-INTRO-01 Title "Crucible"; static intro paragraph and "Everything below was created and written by or with the help of AI." `[HARDCODED]` prose. `main.html:7-13`
- [ ] MAIN-INTRO-02 A generated paragraph from the current suite's catalog: "Crucible runs the same real-world prompts in N separate sections, each ranked on its own, with a Combined view that adds them together." N = `modes.length` (default 2 if missing); Combined label from fallbacks (default "Combined"). `[HARDCODED]` default 2 and sentence. `main.html:15-16`
- [ ] MAIN-INTRO-03 Per section: "**<label>** tasks (<area labels lowercased, comma-joined>): <blurb>[, harness: a or b when >1 harness]." Label/blurb from catalog, fallback, id. `main.html:17-25`
- [ ] MAIN-INTRO-04 Tier sentence: "Each run is scored 0–10 by automatic checks or hidden tests. Tasks come in tiers: **Label** (blurb[, pass or fail when role gate and the blurb lacks "gate"][, the headline score when role headline and the blurb lacks "headline"]), …" then a link "How Crucible works, and how to run it yourself →" to `/crucible/about/`. `[HARDCODED]` connective text. `main.html:26-34`
- [ ] MAIN-INTRO-05 The intro reads the *current* suite's catalog at build time (not the selected suite). In the rewrite it must come from the loaded catalog. `cat.html`

### 6.2 URL and state (round-trip)

- [ ] MAIN-URL-01 Hash grammar: `#<mode>[&suite=<id>][&exclude=<tier,tier>][&harness=<id>][&where=local|cloud][&hw=…][&format=…][&quant=…][&packager=…][&reasoning=…][&provisional=1]`; keys are written in exactly that order. `main:77-89`
- [ ] MAIN-URL-02 `mode` is the id part; it may be a catalog mode id or `combined`. An unknown mode (or `combined` when the suite has fewer than two sections or a catalog mode named `combined` exists) falls back to the suite's first section. `main:41,69`
- [ ] MAIN-URL-03 With no hash: first section, current suite, no filters.
- [ ] MAIN-URL-04 `suite` is written only when it differs from the current suite; read: an unknown/hidden suite id is ignored (the previous suite stays). `main:70,78`
- [ ] MAIN-URL-05 `exclude` is a comma list of tier ids; written only for tiers present in the current section and only when not "all tiers included". Unknown ids are tolerated (no effect). `main:71-72,79-80`
- [ ] MAIN-URL-06 `where` defaults `all`; `harness` defaults `best`; each is written only when non-default. `main:54-55,81-83`
- [ ] MAIN-URL-07 Multi-select filter values are comma lists of URI-encoded values; `all` entries are dropped on read; one plain value (old links) is a list of one; `-` is the "not recorded" value. `main:53,84-86`
- [ ] MAIN-URL-08 `provisional`: hash value `1` or `true` = on; any other value = off; absent = fall back to the `?provisional=` query, then to localStorage `crucible-provisional`. The hash wins over the query, the query over storage. Written to the hash as `provisional=1` only when effectively on (section has provisional tasks). `main:56-60,75,87,107`
- [ ] MAIN-URL-09 Every state change rewrites the hash with `history.replaceState`: no new history entries, no reload, no `hashchange`. Pressing Back leaves the page. `main:88`
- [ ] MAIN-URL-10 In-page links to `#<mode>&…` (e.g. pasted or clicked) fire `hashchange`; the page re-reads the hash and re-renders only if the state tuple (mode, suite, exclude, harness, where, provisional, multi filters) changed. `main:1233-1243`
- [ ] MAIN-URL-11 Not in the URL (lost on reload/share): sort column and direction, "+ In progress" toggle, scatter measure, expanded "best of N setups" rows, open filter menu, compare picks (those live in `sessionStorage`). `main:24-31`
- [ ] MAIN-URL-12 A multi-select value picked in the hash but not available given the other filters is silently dropped on render, and the hash is rewritten without it. `main:350,88`
- [ ] MAIN-URL-13 Legacy `#…&compare=a,b` (any compare param) redirects via `location.replace` to `/crucible/compare/#a,b[&suite=…]` (first 4 slugs) before anything renders. `main:62-65,1252`
- [ ] MAIN-URL-14 On first load the order is: parse hash, resolve suite, resolve mode, apply filters, show results region, render. `main:1252-1257`

### 6.3 Control panel (`#control-panel`)

- [ ] MAIN-PANEL-01 One control panel above the takeaways: row 1 Section + Suite; then the filter row; then a footer (filter chips, notes, Reset filters). `main.html:41-103`
- [ ] MAIN-PANEL-02 Section control: a radiogroup of one button per suite section in section order, label + a count of that section's *active* tasks (title "n scored tasks"); the selected one has `aria-checked`. Under it, a hint: capitalised section blurb + " · " + area labels comma-joined. `main:226-243`
- [ ] MAIN-PANEL-03 Combined tab: appended after the sections only when the suite has two or more sections and none is named `combined`; label from fallbacks; count = number of tasks across all sections; title "N scored tasks: Chat + Agentic"; hint "<Combined blurb> · Chat + Agentic". `main:245-262`, `core:1253`
- [ ] MAIN-PANEL-04 Clicking a section tab: sets the mode, resets `harness` to Best-per-model and the hardware filter to empty (other filters are kept unless they no longer apply), then re-renders; clicking the active tab does nothing. `main:232-238`, `[BUG?]` OQ-04
- [ ] MAIN-PANEL-05 Suite selector: see SUITE-01..04 (rendered into the panel). Changing it keeps filters and mode (mode falls back to the first section if absent in that suite). `main:37-43,1217-1220`
- [ ] MAIN-PANEL-06 "Overall score counts" tier toggles: a group of toggle buttons (one per tier of the section), only when the section has more than one tier (Combined: more than one tier or more than one section). Included tiers are prefixed "✓ " and `aria-pressed`. Title: "Leave X out of the Overall score" / "Add X to the Overall score". The last remaining included tier is `aria-disabled` (title "The Overall score needs at least one tier") and clicking does nothing. `main:442-462`
- [ ] MAIN-PANEL-07 Label of that group = `<aggregate label> score counts` (e.g. "Overall score counts"). `main:447`
- [ ] MAIN-PANEL-08 Models toggle: `All` | `Local (n)` | `Cloud (n)`; n is how many leaderboard rows each choice would show given the other filters; a choice with 0 rows is dimmed with title "No local|cloud models for these filters" but stays clickable. `main:276-286`
- [ ] MAIN-PANEL-09 Choosing Cloud clears every local-only filter (hardware, format, quant, packager); the reasoning filter is kept. Picking a value in a local-only filter while "Cloud" is selected switches Models to All. `main:284,388`
- [ ] MAIN-PANEL-10 Harness field: shown only when the section has more than one harness. Options: "Best per model" + one per harness with a count ("opencode (7)"); a harness with 0 rows is dimmed (title "No models with this harness for these filters"). Selecting a harness limits setups to that harness before best-setup selection. `main:266-275,164`
- [ ] MAIN-PANEL-11 With zero or one harness in the section the Harness field is hidden and a panel note reads "Every <Section> run uses the <harness> harness." (nothing for zero harnesses). In Combined the note reads "Each row pairs one setup per section that differs only in harness." `main:266-270`
- [ ] MAIN-PANEL-12 Multi-select filters: Hardware, Format, Quant, Packager, Reasoning. Each is a button showing the summary ("All machines" / "All formats" / "All quants" / "All packagers" / "All reasoning levels", the first picked value, or "<first> + n") with a ▾ caret, opening a list. `main:132-145,347-362`
- [ ] MAIN-PANEL-13 The list begins with "Show all" (checked when nothing is picked; clears the filter), then each available value: a dot (filled when picked), its text, and the row count that value alone would leave. Values are sorted case-insensitively by display text with "Not recorded" (`-`) last. `main:382-390,351-353`
- [ ] MAIN-PANEL-14 The list stays open while values are toggled; the clicked option keeps keyboard focus across the re-render; ArrowUp/ArrowDown move focus (wrapping); Escape closes and returns focus to the button; clicking anywhere else closes it. Opening focuses the first option. Only one list is open at a time. `main:363-409`
- [ ] MAIN-PANEL-15 Drill-down: each filter's options are the values left by *all other* filters (counted how the board counts, in-progress rows only when shown); an option appears only if choosing it leaves at least one row; so no pick empties the board. `main:163-195`
- [ ] MAIN-PANEL-16 A filter field is hidden when the section's setups (local only for local-only filters) have fewer than two distinct values in total, regardless of what is picked (so picking never reflows the row). `main:400-405`
- [ ] MAIN-PANEL-17 Value display text: Hardware = `<hwKey> (<device names>)`; Quant = the original-case quant (e.g. `Q4_K_M`) from the first matching setup; Format, Packager, Reasoning = raw value; `-` = "Not recorded". `main:133-155`
- [ ] MAIN-PANEL-18 Filter semantics: within one filter values are OR; across filters AND; Hardware/Format/Quant/Packager are local-only (a cloud setup fails any non-empty pick of them); Reasoning applies to both. The filters narrow *setups* before each row's best setup is chosen: a row shows its best *matching* setup or drops out. `main:126-173`
- [ ] MAIN-PANEL-19 Normalised filter values: hardware = hardware key; format; quant lowercased (`q4_k_m`); packager lowercased; reasoning = level (`default` when unrecorded). null becomes `-`. `core:626,main:133-147`
- [ ] MAIN-PANEL-20 Show toggle: `Finished` | `+ In progress (n)` where n counts hidden in-progress rows; the second is dimmed (title "Every model has finished this section" / "…every section" in Combined) when none are hidden. If no row at all has finished, in-progress rows are shown anyway and the toggle reflects "shown". `main:292-297`
- [ ] MAIN-PANEL-21 Progress note (panel footer): none finished -> "No model has finished 75% of a|this section's scored tasks yet, so everyone is shown, marked * and unranked."; showing in-progress -> "* In progress: fewer than 75% of … scored tasks done. Listed last and not ranked."; hidden -> "n model(s) with fewer than 75% of … scored tasks done is|are hidden." (percentage from the suite; "a section's" in Combined). `main:298-303`
- [ ] MAIN-PANEL-22 When the overall excludes any tier a note reads "The Overall score counts <tiers> only." Notes are joined with spaces; all three notes may be empty. `main:305,471-473`
- [ ] MAIN-PANEL-23 Active-filter chips and count: a "Showing N of M models" label (N = visible rows, M = rows without the filters but with exclude/in-progress rules) and one removable chip per active value ("Harness pi", "Local", "Hardware m5-pro-48gb (Duskfall)", "Quant Q4_K_M", …); clicking a chip clears only that value; each chip has `aria-label="Remove filter: …"`. The chip area is kept in the layout (empty) so the first pick does not shift the page. `main:413-439`
- [ ] MAIN-PANEL-24 Chips exist for harness, where, and the five multi filters only; not for tier exclusion, "+ In progress" or the provisional switch. `main:417-424`
- [ ] MAIN-PANEL-25 "Reset filters" button: hidden when nothing differs from default; otherwise clears where, harness, "+ In progress", tier exclusion and all multi-select filters; Section, Suite and the provisional switch stay. `main:471-476,1221-1225`
- [ ] MAIN-PANEL-26 "Filters (n on)": n = (where != all) + (harness != best) + (showInProgress) + (any excluded tier of the section) + (number of multi filters with picks). `main:465-469`
- [ ] MAIN-PANEL-27 Below 640 px the filter row is collapsed behind a full-width "Filters (n on)" button (aria-expanded, caret ▾/▴); Section and Suite stay visible; the chips/summary stay visible; at >=640 px the button is hidden and every field shows. `main:1227-1232`, `scss:2008-2050`
- [ ] MAIN-PANEL-28 Section toggle shrinks below 640 px (smaller padding, no wrap) and again below 360 px. `scss:1935-1957`

### 6.4 Provisional preview ("Include provisional tasks")

- [ ] MAIN-PROV-01 A separate amber "Preview" strip (`#prov-box`) between the panel and the takeaways, not part of the panel, so it never joins the Section/Suite row. Drawn only when the current section (any section in Combined) has provisional tasks. `main.html:104-117`, `main:314-320`
- [ ] MAIN-PROV-02 The strip has a switch labelled "Include n provisional task(s)" and, when off, a hint "Not yet in Suite v3's scores; off by default." `main:322-324`
- [ ] MAIN-PROV-03 Default off. Toggling stores `1`/`0` in `localStorage['crucible-provisional']` (failures swallowed), writes `provisional=1` to the hash when on, and re-renders. `main:33-35,335-339`
- [ ] MAIN-PROV-04 When on, a note appears: "Including n provisional task(s); scores aren't comparable to Suite v3. A provisional task counts toward a model's scores only if it ran it, and "in progress" is still judged on [this section's|the] N suite tasks. The takeaways keep the suite's own scores. Provisional tasks: <links>." Each task name links to its task page. `main:326-333`
- [ ] MAIN-PROV-05 When on: the matrix gets a column per provisional task (dashed outline, `is-provisional`, tagged "provisional" in the card layout); heatmap areas include them; each row shows "ran n of m provisional tasks"; tier/overall scores add them where run (with "+n provisional" markers); the board re-ranks. `core:1621-1665`, `main:609-612,1043-1044`
- [ ] MAIN-PROV-06 When on: coverage, "in progress", `scored/total` and partial stay judged on the active tasks only. `core:1648,1745-1746`
- [ ] MAIN-PROV-07 When on, the takeaways are still computed from the default view (counted scores only). `main:1201`
- [ ] MAIN-PROV-08 When off, provisional tasks' runs are in the data but produce no cells, no tier columns, no counts anywhere on the page. `core:1570`
- [ ] MAIN-PROV-09 The preview is never a filter: it does not count in "Filters (n on)", is not cleared by Reset and has no chip. `main:465-469`

### 6.5 Takeaways

- [ ] MAIN-TAKE-01 A bulleted list above the Leaderboard built from the default view (counted scores; filters and exclude respected). "Ranked" = rows with a non-null, non-partial overall that are not in progress, best first. `main:499-504`
- [ ] MAIN-TAKE-02 Line 1 (if any ranked): "A and B lead on <tier names> together[ <filter phrase>]." (two leaders) or "A leads …" (one). With a single-tier section it says "the <Tier> tasks" instead of "on … together". `main:506-510`
- [ ] MAIN-TAKE-03 Line 2: when a local row is ranked and the Models filter is not Cloud: "The best local model is X at 7.5[ of N in Combined], on <setup label>." `main:511-514`
- [ ] MAIN-TAKE-04 Line 3: when more than one ranked non-local row has a cost: the row with the highest overall/cost: "X gives the most <Overall> score per dollar ($0.01 per task)." `main:515-519`
- [ ] MAIN-TAKE-05 Line 4: using the first stretch tier: the row with the highest counted, non-partial score on it: "X scores highest on the <Tier> tasks (7.1[ of N in Combined])." `main:521-526`
- [ ] MAIN-TAKE-06 If no line: "No model has a complete <Overall> score[ <filter phrase>| in this section] yet." `main:527`
- [ ] MAIN-TAKE-07 Filter phrase = "with <harness>", "run locally"/"in the cloud", "on <hardware list>", "with format|quant|packager <list>", "at reasoning <list>", joined by spaces; lists are "a, b or c". `main:480-493`
- [ ] MAIN-TAKE-08 Model names inside takeaways are links to the model page. `main:531`

### 6.6 Leaderboard (table, cards, bars)

- [ ] MAIN-LB-01 Heading "Leaderboard" and a long explanatory paragraph composed from the section (see MAIN-LB-02..05). `main.html:120`, `main:536-553`
- [ ] MAIN-LB-02 Note part 1: with an Overall column: "Ranked by Overall score (0–N): the <tiers> scores added together, each out of 10. Choose which tiers it counts in the panel above; a model missing one of them isn't ranked until you leave that tier out." (Combined: "every section's <tiers> scores added together, each out of 10, so each tier here is out of 10 per section that has it."; one tier included: "the <tier> score alone."); without Overall: "Ranked by <label> score (0–10)." N = included tiers x 10 (Combined: x number of sections having each tier). `main:537-542`
- [ ] MAIN-LB-03 Note part 2, per gate tier: "<Tier> is also a pass/fail gate: a <Tier> score of at least <gate.mean>, with no task below <gate.min>[, in every section]." Values from the catalog. `main:543-546`
- [ ] MAIN-LB-04 Note part 3 (Combined only): "Each row joins one setup per section that matches on everything but the harness: model, packager, format, quant, reasoning, runtime or provider, and machine. A model missing a section isn't ranked. Time, decode speed and cost are over both setups' runs." `[HARDCODED]` prose. `main:547-548`
- [ ] MAIN-LB-05 Note part 4/5 always: row = one model at one reasoning level, scored by single best setup ("best of N setups" lists the others), repeats averaged, cloud serves full precision; "A hatched bar means fewer than 75% of that tier's tasks were scored[ (for Overall, that one of its tiers is short)]. Select a column to sort." `[HARDCODED]` prose. `main:549-551`
- [ ] MAIN-LB-06 Wide (>=640 px) columns: `#`, "Model and best setup", Overall (when the section has >1 tier; Combined with >1 tier or section), one per tier, "Time / task", "tok/s", "Cost / task". Every non-`#` header is a sort button. Header `title`s: Overall = "<tier names> added together, out of N" (or "alone, out of 10"; Combined variant); tier = capitalised tier blurb (Combined: "<Tier> in every section added together, out of N"); tok/s = "Decode speed: output tokens per second of generation (median)". `main:628-647`
- [ ] MAIN-LB-07 Default sort: Overall descending. After switching to a section where the saved sort key no longer exists the sort resets to the section's headline tier, descending; a sort key unknown to a new suite resets to Overall descending. `main:42,115-116`
- [ ] MAIN-LB-08 Clicking a sort header sets that key; clicking the active key flips direction. Natural first direction: score/tier/tok/s = descending (high first); time, cost, model = ascending. The active header gets `aria-sort` and an arrow ↓/↑. `main:688-693,639-642`
- [ ] MAIN-LB-09 Row ordering (any sort key): rows that ran first; in-progress rows last; for tier/overall keys, rows with a partial or null result after full ones; then by the value in the chosen direction; rows with a null value last in either direction; ties by row label (ascending). `core:1804-1823`
- [ ] MAIN-LB-10 Sort value per key: `model` = lowercase row label; `time` = median time; `tps` = median decode speed; `cost` = mean cost; Overall/tier = the tier or overall score (a provisional score if only that exists). `core:1788-1800`
- [ ] MAIN-LB-11 Rank column: numbers only rows that are ranked (JOIN-SCORE-14), counting 1,2,3 in the *displayed* order (so re-sorting renumbers them); others blank (cards show "—"). `main:558,651-666,728-732` `[BUG?]` OQ-16
- [ ] MAIN-LB-12 Not-run rows are dimmed (`is-not-run`). In-progress rows: the name has " *" appended and the row `title` reads "In progress: x of y scored tasks in this section|all sections done". `main:663-668,604`
- [ ] MAIN-LB-13 Name cell: "<maker link> / <model link>" (maker with "inferred" marker when inferred; none when no maker), where-tag, config label line, optional "ran n of m provisional task(s)" (provisional preview only), then actions: a "best of N setups ▸/▾" toggle (only when the row has two or more setups) and a "+ compare"/"picked ✓" button (only when the setup has a slug; Combined rows have none). `main:602-616`
- [ ] MAIN-LB-14 Expanding "best of N setups" inserts one sub-row per setup (best first, first labelled "best") with that setup's config line, "· n counted run(s)" and its own tier cells/time/tok/s/cost; expansion state persists across re-renders in the session (not the URL). `main:596-600,673-683`
- [ ] MAIN-LB-15 Each tier cell uses the shared tier cell (FMT-15). Excluded tiers' cells are visually dimmed (`is-excluded`) only when the section shows an Overall column. `main:654`
- [ ] MAIN-LB-16 Time cell = `fmtSeconds(median time)`; tok/s cell = bare number with the tps title; Cost cell = `fmtCost` with a title: cloud "Average API cost per counted run"; local with watts "Estimated electricity per counted run: <W> W at $<price>/kWh for the run's time. Not the hardware's cost."; local without watts "Local runs aren't billed, and this hardware has no power figure". `main:658-660`, `core:2452-2458`
- [ ] MAIN-LB-17 Empty board: a single full-width row/paragraph "No model has a counted run in this|any section of Suite v3[ <filter phrase>] yet." `main:495-497,685`
- [ ] MAIN-LB-18 Narrow (<640 px): the table is replaced (not hidden by CSS; only one layout is ever in the DOM) by cards. A "Sort by" select (options: Overall, each tier, "Time / task", "Decode speed", "Cost / task", "Model") sets direction by the same natural order. `main:696-709`, `core:222-247`
- [ ] MAIN-LB-19 Card: rank (or "—"), name block (same as table), one row per score column (the sorted-by column first, highlighted), then a line "Time <t>/task · decode <x> tok/s · <cost>/task" where the sorted metric is bold and first. Expanded setups render as nested cards with a "best" tag on the first. `main:711-749`
- [ ] MAIN-LB-20 Layout switch happens when the viewport crosses 640 px (`max-width: 639px` media query) and triggers a full re-render; resize alone within a layout does not (except charts, see below). `core:224-247`, `main:1245-1250`

#### Leaderboard column chart ("bars")

- [ ] MAIN-BARS-01 A column chart above the table plots the Overall score (the single-tier section's tier) of every shown row that has a non-null overall; sorted: in-progress last, partial after complete, then score descending. Hidden (and legend hidden) when no row qualifies. `main:758-769`, `[BUG?]` OQ-03
- [ ] MAIN-BARS-02 Legend: Local / Cloud swatches (only kinds present) and, if any bar is partial, "Partial: a tier has under 75% of its tasks scored" with a hatched swatch. `main:770-782`
- [ ] MAIN-BARS-03 Wide layout (container width >= 640 and viewport not narrow): y axis 0, max/2, max (max = overall maximum for the included tiers); bars at most 24 px wide in slots of at most 56 px (a short list stays grouped left); value printed on each bar cap; names angled -45° under the axis, kept as `model · reasoning` and cut to 29 characters + "…" past 30; rounded data end (4 px), square baseline. `main:784-829,845-846`
- [ ] MAIN-BARS-04 Narrow layout (viewport narrow or container < 640 px): one horizontal bar per row, name above, value after the bar; row height 38. `main:792-804`
- [ ] MAIN-BARS-05 Bar fill: local/cloud colour; hatched pattern when the row's overall is partial; faded (`is-in-progress`) and name starred when in progress. `main:831-848`
- [ ] MAIN-BARS-06 Hover or keyboard focus on a column shows a tooltip: maker / model link, setup label, "<Overall> 7.5 of N[ (partial)][ · in progress]", "Time per task <t> · cost <c>"; the tooltip positions right of the bar, flips left near the edge, stays visible 250 ms after leave and while hovered. `main:836-871`
- [ ] MAIN-BARS-07 Each column has a focusable hit area with `aria-label` "<name>: <Overall> 7.5[, partial]"; the SVG has role img with label "<Overall> score for each model, best first. The table below has the same numbers." `main:795,815,849`
- [ ] MAIN-BARS-08 Redraws on resize (debounced 150 ms), on every filter change and on layout switch. `main:1247-1250`

### 6.7 Quality vs time/cost (scatter)

- [ ] MAIN-SCAT-01 Heading "Quality vs <time|cost>"; a toggle "Time per task" | "Cost per task" (state not in URL, default time). `main.html:134-138`, `main:306-308`
- [ ] MAIN-SCAT-02 Points: shown rows with a non-null overall and a positive x (median time, or mean cost). In cost mode, local rows without a computable cost are left off and the sub-text adds "Local setups on hardware with no power figure are left off." `main:883-893`
- [ ] MAIN-SCAT-03 Sub-text (time): "<Overall> score[ (<tiers>)] against median time per task, for each row's best setup. Up and to the left is better: the shaded corner is faster and better than the median, and the line joins models nothing else beats on both." (cost): "… against average cost per task: the API bill for cloud models, the estimated electricity for local ones. Up and to the left is better." `main:890-893`
- [ ] MAIN-SCAT-04 Axes: x log10 with padding (at least 0.5 decades span, +-0.1 margin); gridlines/ticks at 1 and 3 times each power of ten inside the range, labelled in seconds (`fmtSeconds`) or USD; y linear 0..overall max with gridlines at 0, half, max; x axis title "Median time per task (log scale)" / "Average cost per task (log scale)". `main:910-942`
- [ ] MAIN-SCAT-05 Shaded quadrant (top-left) bounded by the median x and median score of the plotted points. `main:926-927`
- [ ] MAIN-SCAT-06 Pareto frontier: points sorted by x ascending, keep those with strictly higher score than every faster point; a line is drawn when there are at least two. `main:944-951`
- [ ] MAIN-SCAT-07 Dots: radius 6, local/cloud fill; partial rows are hollow (white fill, coloured stroke). `main:959-963`
- [ ] MAIN-SCAT-08 Labels (wide, container >= 500): all points labelled when there are <= 16, else only frontier points; a label that would pass the right edge flips to the left of its point. `main:954,966-970`
- [ ] MAIN-SCAT-09 Narrow (container < 500): points show numbers (rank by score, then x) instead of names, and an ordered key list under the chart: swatch, number, model link, "· 7.5[ (partial)] · <time|cost>". The key is hidden in wide layout. `main:955-958,964-966,991-999`
- [ ] MAIN-SCAT-10 Tooltip on dot hover: maker / model link + " · local|cloud", setup label, "<Overall> 7.5[ (partial)]", "Time per task <t> · cost <c>"; flips left near the right edge; 250 ms hide delay. `main:971-988`
- [ ] MAIN-SCAT-11 Legend (Local, Cloud) above the plot, hidden when there is nothing to plot; with no points the chart area reads "Nothing to plot for these filters yet." `main:894-908`
- [ ] MAIN-SCAT-12 SVG `aria-label`: "<Overall…> against time|cost per task. The leaderboard has the same numbers." `main:924`

### 6.8 Matrix ("Every model on every task")

- [ ] MAIN-MATRIX-01 Heading "Every model on every task" and sub-text (static): "Score per task, grouped by tier, for each model's best setup; rows keep the leaderboard's order. A score is the mean of that setup's runs (×n marks repeats). Select any cell for its runs, checks and output. An empty outlined cell has runs that don't count in this suite (an older task version, or a run marked invalid)." `[HARDCODED]` `main.html:148-151`
- [ ] MAIN-MATRIX-02 The whole per-task block (matrix + heatmap) is hidden in the Combined view. `main:1206`
- [ ] MAIN-MATRIX-03 Rows: shown leaderboard rows that ran, in the board's order (honours the sort), each row = the row's best setup. Header row 1: tier labels spanning their task columns; row 2: task names (links to the task page, `title` = "name: summary"); first column "Model". `main:1012-1032`
- [ ] MAIN-MATRIX-04 Task columns are the section's tasks, tier by tier, area order within tier; the first column of each tier has a separator (`is-tier-start`); provisional columns (preview on) are dashed (`is-provisional`). `main:1024-1029,1043-1044`
- [ ] MAIN-MATRIX-05 Row header: maker / model link + the setup's config label. `main:1037-1040`
- [ ] MAIN-MATRIX-06 Cell with runs: button per RUNDETAIL-13 (integer text, heat colour, ×n, timeout ring); clicking opens the run detail panel under the table for (that setup x that task). Cell with no runs in this suite: "·" and `is-empty` styling. A cell with runs that all fail to count: "—" button, outlined/uncounted. `main:1041-1050`
- [ ] MAIN-MATRIX-07 Clicking a matrix cell opens run detail for all runs of that setup x task (newest first, newest open), not only the latest. `main:1047`, `core:2297-2323`
- [ ] MAIN-MATRIX-08 Re-rendering the matrix hides the open detail panel. `main:1011`
- [ ] MAIN-MATRIX-09 Empty: one cell "No model has a counted run in this section of Suite v3[ …] yet." `main:1054`
- [ ] MAIN-MATRIX-10 Narrow (<640 px): the matrix becomes one card per row (maker / model, where-tag, config label); inside, one group per tier (label) and one key-value row per task: task link (+ "provisional" tag), then the cell button with one-decimal text, or "not run". Tapping a score opens the detail panel and scrolls to it. `main:1057-1083`
- [ ] MAIN-MATRIX-11 The wide table scrolls horizontally inside its own container (`crucible-scroll`); the page itself must not scroll horizontally. `main.html:152-153`

### 6.9 Heatmap ("Model × area")

- [ ] MAIN-HEAT-01 Heading "Model × area" and static sub-text "Mean score (0–10) for each area in this section, across all tiers, for each model's best setup." `[HARDCODED]` `main.html:159-161`
- [ ] MAIN-HEAT-02 Columns = the section's areas (catalog order) that have at least one shown task; rows = shown rows that ran (board order); row header = maker / model + where-tag. `main:1094-1124`
- [ ] MAIN-HEAT-03 Cell: heat-coloured mean (one decimal) of the area's per-task means, plus "n/m tasks" (tasks with a mean / tasks in the area). No tasks scored: "not run" (muted, no heat). `main:1087-1092`, `core:1835-1839`
- [ ] MAIN-HEAT-04 Narrow: one card per row; one key-value row per area with the same cell content. Nothing is drawn when no row ran. `main:1101-1112`
- [ ] MAIN-HEAT-05 With the provisional preview on, provisional tasks are part of their area's mean. `core:1644`

### 6.10 Combined view semantics

- [ ] MAIN-COMB-01 Tab id `combined` (the router id). Rows join one setup per section that agree on everything except the harness (base, where, reasoning-was-default flag, publisher, format, quant, reasoning, provider, hardware key, device, plus the set of runtime/provider names); a setup with no partner stays a candidate with the other section missing. `core:1315-1360`
- [ ] MAIN-COMB-02 Where one section has several matching setups (e.g. opencode and pi), every combination of one setup per section is its own pairing (cartesian product). `core:1322-1357`
- [ ] MAIN-COMB-03 A combined tier score = sum of the section scores for that tier (each out of 10), max = 10 x number of sections that have the tier; `partial` when any such section is missing, unscored or partial. `core:1377-1392`
- [ ] MAIN-COMB-04 Combined overall = sum of included tiers' combined scores; max = sum of the tiers' maxes; partial when any included tier is null/partial. A model missing a section has a partial overall and so is not ranked. `core:1362-1418`
- [ ] MAIN-COMB-05 Gate verdict in Combined: pass only if every section that has the gate passes; any `fail` makes fail; any `partial` makes partial; a missing section makes it null. `core:1401-1405`
- [ ] MAIN-COMB-06 Combined progress = sum of done/total across sections; in progress when any section is short of `in_progress_below`. `core:1420-1434`
- [ ] MAIN-COMB-07 Combined time/decode speed/cost are computed over the runs of all member setups; the row label uses the base; the setup line shows both harnesses joined with " + " (e.g. `direct + opencode`). `core:1352-1354,1449-1451`
- [ ] MAIN-COMB-08 Combined shows the leaderboard (table/cards), bars and scatter only; no matrix, no heatmap, no harness filter. Tier headers read "<Tier> in every section added together, out of N". Takeaway numbers read "of N". `main:1206-1210,628-631`
- [ ] MAIN-COMB-09 Combined tab availability: >= 2 sections in the suite and no catalog mode with id `combined`. `core:1253`
- [ ] MAIN-COMB-10 Combined mode count/title/hint: see MAIN-PANEL-03. Combined also drives model-page behaviour (see MODEL-COMB-*).

### 6.11 Footer, caveat, compare tray

- [ ] MAIN-FOOT-01 "How scores are made" paragraph: "Every score in Suite v3 is computed automatically, the same way every time: <n by <method label> (<blurb>)>, and … . Repeat runs of a setup are averaged." Counts = active tasks per scoring method that has at least one published score record. Tasks whose method has no published record: "n task(s) this suite pinned has|have no automatic score (<names>), so it is|they are left out of every score here." then "Each rule is listed on the About page." (link). Hidden if no method qualifies. `main:1138-1168`
- [ ] MAIN-FOOT-02 Footnote: "Suite v3[, cut <date>][; catalog published by Crucible <version>]. — means the harness didn't report that number. Cost per task is the provider's billed cost where reported; for local runs (marked ≈) it's the electricity used, estimated from the run's time, the machine's power draw and the average US price per kWh, and leaves out the hardware itself. Decode speed is output tokens (reasoning included) per second of generation, leaving out prompt processing: the median over the runs that recorded it (— when none did). Token counts aren't comparable across harnesses. Time, decode speed and cost are each setup's own: local ones depend on the hardware named." `[HARDCODED]` prose. `main:1180-1188`
- [ ] MAIN-TRAY-01 Compare tray: fixed bottom-right (full-width, space-between below 640 px), hidden when no setup is picked. One pick: "1 setup picked: pick another to compare"; two or more: link "Compare n →" to `/crucible/compare/#<slugs>[&suite]`; plus a "Clear" button. `main:574-583`, `main.html:171`, `scss:2105-2140`
- [ ] MAIN-TRAY-02 Picks (`+ compare` / `picked ✓`, `aria-pressed`, title "Add this setup to a comparison (two to 4)" / "Remove this setup from the comparison") are stored in `sessionStorage['crucible-compare']` as a JSON array of slugs, max 4; adding a fifth drops the oldest. Survive reload within the tab, not across tabs. Non-string entries are filtered on load; storage failures are swallowed. `main:562-591`
- [ ] MAIN-TRAY-03 Picked slugs persist across section/suite/filter changes; picks of setups hidden by filters stay in the tray. `main:561-573`

### 6.12 Rendering order, resize and responsive rules (main page)

- [ ] MAIN-RENDER-01 Render order: layout flags, section/view selection, hash write, rows, suite bar, controls, takeaways, leaderboard (+ cards), bars, scatter, matrix, heatmap (unless Combined), nav links, tray, caveat, footnote. Every state change re-renders everything (no partial updates required for parity). `main:1192-1215`
- [ ] MAIN-RENDER-02 Stats are independent of filters and cached per (setup, exclude set). `core:1739-1768`
- [ ] MAIN-RESP-01 Breakpoint is exactly 640 px: `<= 639px` = narrow. Narrow: leaderboard, matrix and heatmap (and model/todo/compare/task tables) become cards; the bars chart goes horizontal; the filter panel folds. Only one layout (wide or narrow) is ever present in the DOM/visible. `core:222-247`, `AGENTS.md`
- [ ] MAIN-RESP-02 Charts have their own width rules: bars narrow when viewport narrow or container < 640; scatter narrow when container < 500 (numbered points + key); both redraw 150 ms after resize. `main:785,911,1247-1250`
- [ ] MAIN-RESP-03 Wide tables scroll horizontally in their own container, never the page; long names never widen the page on a phone. `scss:2057-2062`

---

## 7. What to run next `/crucible/todo/`

### 7.1 URL and controls

- [ ] TODO-URL-01 Hash `#&suite=<id>&mode=<id>&sort=<key>&all=1` (no id part). Controls write the hash with `location.hash` (history entries; Back steps through them) and the page re-renders on `hashchange`. `todo:1-3,15-19,205`
- [ ] TODO-URL-02 `sort` is one of `easiest` (default, omitted from the hash), `fewest`, `time`, `score`, `model`; unknown value = `easiest`. `todo:11,178,202`
- [ ] TODO-URL-03 `all=1` = "Every setup, not just each model's best"; anything else = off. `todo:180,203`
- [ ] TODO-URL-04 `mode` selects the section; unknown or absent = first section that has at least one shown task (if none, first section). Changing suite clears `mode`. `todo:168-171,201`
- [ ] TODO-CTRL-01 Suite bar (SUITE-01..04) and breadcrumb "Crucible › What to run next". `todo:166-167`
- [ ] TODO-CTRL-02 A "Section" radiogroup appears only when more than one section has tasks; one button per such section (label or Capitalized id). Combined is not offered. `todo:168-177`
- [ ] TODO-CTRL-03 "Sort by" select: Easiest to finish / Fewest tasks left / Least estimated time / Best score so far / Model name. `todo.html:34-40`
- [ ] TODO-CTRL-04 Checkbox "Every setup, not just each model's best". `todo.html:41`
- [ ] TODO-CTRL-05 The suite select / sort select / checkbox state is set from the hash on every render (deep links restore it). `todo:179-181`

### 7.2 Candidate setups and entries

- [ ] TODO-DATA-01 Candidates: with `all=1`, every setup of the section with at least one counted run (`runs > 0`); otherwise each leaderboard row's best setup (`row.variants[0]`), with no filters applied. `todo:183-184`
- [ ] TODO-DATA-02 An entry exists only for a setup with at least one *active* task of the section that has no counted mean; setups with all tasks done are omitted and summarised ("; n already complete."). `todo:46-61,186,190`
- [ ] TODO-DATA-03 Why each task is missing: "awaiting score" (a counted, finished run has no score record); else a failed/timed-out/errored counted run: the outcome text if one such run, else "failed N×"; else "only older or uncounted runs" when runs exist but none count; else "not run". `todo:50-56`
- [ ] TODO-DATA-04 A task's typical time = median `elapsed_s` of finished runs of that task over every setup in the suite. A setup's pace = median of (its finished time / task typical time) over tasks, 1 when none. A missing task's estimated time = typical x pace, or unknown (null). "Awaiting score" tasks are not estimated. `todo:21-43,57-58`
- [ ] TODO-DATA-05 Effort = number of tasks to run (excluding "awaiting score"), each task the setup already failed on counting extra (+ min(fails, 3)). `todo:62-64`
- [ ] TODO-DATA-06 Comparators: `easiest` = effort, then estimated time, then higher score, then label; `fewest` = tasks left, then time, then label; `time` = estimated time, then tasks left, then label; `score` = higher overall (null = -1), then fewer tasks left, then label; `model` = label. `todo:68-78`
- [ ] TODO-DATA-07 Estimate text: "scoring only" when nothing is left to run; "—" when every task is untimed; else "≈ <time>[ + n untimed task(s)]". `todo:80-84`
- [ ] TODO-DATA-08 Counts line: "n model(s)|setup(s) with tasks left of N scored task(s)[; k already complete.]" (empty when no entries). `todo:189-191`

### 7.3 Recommended next

- [ ] TODO-PICK-01 "Recommended next" card = the first entry in the `easiest` order that still has tasks to run (else the first). `todo:102-103`
- [ ] TODO-PICK-02 Card contents: maker / model link + where-tag; setup label; "n task(s) to run · done/total done[ · n run(s) awaiting a score][ · <estimate> estimated]". `todo:104-112`
- [ ] TODO-PICK-03 "Run these, quickest and never-failed first:" list: tasks to run ordered by fewest prior failures then least time (unknown last); each item links to the task page and shows "<Tier> · <why>[ · ≈ <time>]". `todo:113-119,85-94`
- [ ] TODO-PICK-04 "Then: A (n tasks), B (…), C (…)": up to three further entries with tasks to run. `todo:120-128`
- [ ] TODO-PICK-05 Footnote explaining "easiest" (fewest tasks, failed tasks count extra, then estimated time scaled by the setup's own pace). `[HARDCODED]` prose. `todo:129`
- [ ] TODO-PICK-06 If there are no entries: "Every setup here has a counted run of every scored task. Nothing left to run." `todo:101`

### 7.4 Table / cards

- [ ] TODO-TABLE-01 Heading "Setups with tasks left"; wide table columns: Setup, Done, Left, Estimated, "<Overall label> so far", Tasks left. `todo:132-139`
- [ ] TODO-TABLE-02 Row: model ref + where-tag + setup label; coverage bar (done/total, in-progress pill); Left = count (+ " (n failed)"); Estimated; the overall tier cell for the section; comma list of linked task names (title "<tier> · <why>"). `todo:141-155`
- [ ] TODO-TABLE-03 Narrow (<640): one card per entry (model card, "done/total done · n left · <estimate>", task list limited to 4 with "…and n more"). Only one layout rendered; switches on crossing 640 px. `todo:157-160,193,204`
- [ ] TODO-TABLE-04 Task list items carry a class from the "why" (slug) for styling (failed, awaiting-score, timed-out, …). `todo:88`

---

## 8. Task page `/crucible/task/`

### 8.1 URL and chrome

- [ ] TASK-URL-01 Hash `#<task-id>[&suite=<id>][&provisional=1]`; no id = the task index. Internal links keep `suite` and `provisional`. Writes use `location.hash`; each route change scrolls to the top. `task:1-2,17-19,745-746`
- [ ] TASK-URL-02 A task id is resolved through the selected suite's `S.task(id)`: catalog id or any task alias, so old ids still open the renamed task. `core:1017`
- [ ] TASK-URL-03 The page title (`document.title`) is "<Task name> · Crucible", "Task not found · Crucible", or "Crucible tasks". `task:135-136,171-172,195,209`
- [ ] TASK-URL-04 Breadcrumb: "Crucible › Tasks" (index) or "Crucible › Tasks › <task name>"; both keep `suite` and `provisional`. `task:137,210,716`
- [ ] TASK-CTRL-01 Suite bar (SUITE-01..04) plus a checkbox "Show provisional tasks" (state from `provisional=1`) with a note: shown: "Provisional tasks are listed and marked; they never count toward any score." hidden: "n provisional task(s) is|are hidden." (nothing when none). Toggling rewrites the hash. `task:123-130,736-738`
- [ ] TASK-CTRL-02 A task is "provisional" when its status is anything but active/retired. `task:16`

### 8.2 Index (no id)

- [ ] TASK-INDEX-01 Intro line: "Every task of Suite v3, by section and area. Select one for what it asks, how it is scored and how the models did." Shown tasks = active tasks (+ provisional ones when the checkbox is on). Empty: "This suite has no tasks to list." `task:138-140`
- [ ] TASK-INDEX-02 One heading per section that has shown tasks: "<Section label> <n task(s)>" and the capitalised blurb; within it one sub-heading per area (catalog order) with a list. `task:143-155`
- [ ] TASK-INDEX-03 Within an area tasks are sorted by tier position then name (locale compare). Each item: task link, tier tag, "Provisional" tag when provisional, and the first line of `summary`. `task:153-162`

### 8.3 Missing / retired

- [ ] TASK-MISSING-01 Unknown id: title "Task not found"; message "There is no task called “<id>” in Suite v3."; if the id exists in another visible suite: "It exists in: Suite v2, …" with links (keeping provisional); up to 5 fuzzy matches (active/shown tasks whose id or name contains the id, lowercase substring) as links; a "See all tasks" link. `task:170-191`
- [ ] TASK-MISSING-02 A retired task: title = its name and the stub "<Name> is retired in Suite v3: it no longer counts, and its runs are not shown." plus "See all tasks". `task:722,193-202`
- [ ] TASK-MISSING-03 A provisional task opens from a direct link regardless of the toggle and is marked provisional throughout (the main page's matrix links here when the preview is on). `task:723-725`
- [ ] TASK-MISSING-04 `renderStub` supports a "Show provisional tasks" button (sets `provisional=1`) when given one; no current caller passes one. `task:197-200` `[BUG?]` dead path.

### 8.4 Task detail sections (when the task exists)

- [ ] TASK-HEAD-01 Header pills: tier tag; "<Section> · <Area>" tag; harness tag "a / b" (the section's harnesses; omitted when none); "Provisional" tag. Meta list: "Scored by <method label>[, <total> <unit|points>]"; "Task v<n|?>[ · rubric v<n>]"; "Formerly <aliases>" (when present); "Added in suite v<x>" (when `added_in`). `task:206-226`
- [ ] TASK-HEAD-02 Provisional tasks add: "Provisional: not scored in this suite yet. Its runs are shown here only; they never count toward any score or ranking." `task:227-229`
- [ ] TASK-EMPTY-01 With no entries: "No run of this task counts in this suite yet." plus, when runs exist, "n run(s) exist but don't count (an older task version, a harness this suite doesn't score, or marked invalid)." The prompt/scoring blocks still render; spread/performers/charts do not. `task:654-661`
- [ ] TASK-ENTRY-01 Entries = one per setup with counted runs of the task (for a provisional task: its provisional runs): mean score, median time, median tokens out, mean cost, newest run. Sorted by score descending, then time ascending (null last). `task:46-67`
- [ ] TASK-TILES-01 Four tiles: "Setups that ran it" (count; "n model(s) · a local, b cloud"); "Scored <scale>" (setups whose mean reaches `scoring.scale`, default 10; "x of n" and a bar); "Median score" (range min to top); "Fastest top score (<top>)" (shortest median time among setups with the top score; model link + harness; "no time recorded" if none). `task:243-266`
- [ ] TASK-ASKS-01 "What it asks": the task prompt (else summary) in a `<pre>`; collapsed with a "Show the full prompt"/"Collapse the prompt" toggle when over 12 lines or over 1100 characters; "The catalog has no prompt for this task." when none. `task:270-289`
- [ ] TASK-HOW-01 "How it's scored": "Rules" list (strings or label/id objects) and/or "Criteria" list (label/id with " n point(s)" from `max_score`; heading = fallback `criteria_label` else "Criteria"); "The catalog lists no rules for this task." when both absent; footer "Scored <total> <unit|points> in total[, scaled to <scale>], by <method label>." `task:291-314`
- [ ] TASK-CHECKS-01 "Which checks trip models up": per-check pass rate across the shown entries' counted runs (from `details.json`, grouped by item group/label/id; part-credit counts its share; "hardest first"); each row = name, bar, percent, "k of n runs" fully passed; criteria order from the catalog then first-seen for column order. States: "Loading per-check results…", "Couldn’t load the per-check results.", "No per-check results were published for these runs." `task:319-338,83-108`
- [ ] TASK-SPREAD-01 "Score spread": one dot per setup on a 0-10 axis (gridlines 0,2,…,10), stacked when scores coincide (binned to one decimal), local/cloud colours with legend; dot `<title>` = "label · config · score". Stack step shrinks to fit 230 px. `task:351-382,665-669`
- [ ] TASK-PERF-01 "Best performers": by default each model's best setup (the setup its leaderboard row uses: `betterConfig` over section stats among setups that ran this task), ranked by task score then time; a button toggles "Show all n setups"/"Show best setup per model" (only when there are more setups than models). `task:68-79,402-408,459-463`
- [ ] TASK-PERF-02 Table columns: #, Maker, Model, Setup (where-tag + variant label [+ harness when the section has several] + deployment label), Score (button with ×n), one column per check group (squares), Time, Tokens out (`n`, `1.2k`, `12k`), Cost. `task:410-434`
- [ ] TASK-PERF-03 Check squares come from the setup's *latest* counted run: ✓ pass, ✕ fail, ~ partial (title "partly passed (60%)"), blank = not recorded; each has `role=img` and aria-label. Check columns/squares appear only after `details.json` loads. `task:394-401`
- [ ] TASK-PERF-04 Selecting a row (click or Enter/Space; links inside the row do not trigger) or its score opens the run detail panel for that setup x task below the table, marks the row open, and scrolls the panel into view. `task:386-393,436-437`
- [ ] TASK-PERF-05 Links: "Compare top n →" (top up to 4 best-per-model setups, shown when at least two) to the compare page. `task:464-467`
- [ ] TASK-PERF-06 Narrow (<640): the table becomes cards (rank, model link, where-tag, maker, variant+deployment line, score button + "×n runs", check squares, "Time … · tokens out … · cost …"). `task:417-458`
- [ ] TASK-EFFORT-01 "Score against effort": toggle Time | Tokens out | Cost (default time; not in URL); log-x scatter of mean score (y 0-10; gridlines 0,5,10) vs median time / median tokens / mean cost per run; setups without a positive value are left off with a note naming how many and why; clicking or Enter on a dot opens its run detail; label placement tries four positions per model's best setup avoiding overlaps. Footer note: times and costs are from different machines/providers. `task:475-553,676-689`
- [ ] TASK-HARNESS-01 "Harness comparison" appears only when the task's section has more than one harness: table (Harness, Setups, Mean score, Best score, Median time; swatch per harness) of harnesses that have entries; otherwise "No harness has a counted run of this task." `task:569-591`
- [ ] TASK-HARNESS-02 "Same setup, different harness": dumbbell rows for setups identical in base, reasoning, quant, hardware, provider and where that ran on two or more harnesses; sorted by best score; name adds quant+machine or provider when a model has several pairs; markers circle/square/diamond/triangle by harness index; empty text "No model ran this task on more than one harness at the same setup, so there is nothing to compare yet." `task:593-646`
- [ ] TASK-HARNESS-03 Harness label = catalog harness `label` else id. `task:565-568`
- [ ] TASK-RESIZE-01 All charts redraw 150 ms after a resize; the performers' layout switches on crossing 640 px. `task:740-744`

---

## 9. Compare page `/crucible/compare/`

### 9.1 URL and resolution

- [ ] CMP-URL-01 Hash `#<slug>,<slug>[,<slug>…][&mode=<id>][&suite=<id>]`; slugs are setup slugs (IDENT-CFG-06). The hash is the full state; changes use `location.hash`. `cmp:1-6,67-70`
- [ ] CMP-URL-02 Copy link button ("Copy link"; hidden with no setups) copies `origin + path + hash` via the clipboard API and shows "Link copied" for 1.5 s; if the API fails/missing, a read-only URL input appears, focused and selected. `cmp:777-795`
- [ ] CMP-URL-03 `mode` is written to the hash only if it was explicitly in the hash or chosen by the user; otherwise the section is derived from the first setup. `cmp:68,691`
- [ ] CMP-RESOLVE-01 Resolution notes (listed above the controls, hidden when none): unknown mode "There is no section "x" in Suite v3."; unknown slug ""x" isn't a setup in the results, so it was left out."; setup with no scored task "… has no scored task in Suite v3, so it was left out."; setup from another section "… ran in Chat and Agentic, not Agentic. Setups from different sections can't be compared, so it was left out."; over four "Up to 4 setups can be compared; … was left out." `cmp:37-63`
- [ ] CMP-RESOLVE-02 Duplicate slugs are ignored; the first setup's first section becomes the mode when none is given. `cmp:48,52`
- [ ] CMP-RESOLVE-03 Each setup keeps its series colour while the page is open (colours `#1856a3, #eb6834, #2f8a4a, #8a4fbf`); freed colours are reused. `cmp:699-711`
- [ ] CMP-RESOLVE-04 `document.title` = "Compare A vs B vs C" when two or more are chosen, else "Compare setups". `cmp:732`

### 9.2 Controls

- [ ] CMP-CTRL-01 Suite bar (SUITE-*); breadcrumb "Crucible › Compare setups". `cmp:113,731`
- [ ] CMP-CTRL-02 Section radiogroup only when the suite has more than one section and no setup is chosen; picking one navigates to an empty comparison with `&mode=` set. `cmp:134-143`
- [ ] CMP-CTRL-03 Chips: one per chosen setup (colour bar, dot, maker / model, where-tag, "Variant <label>[ · Packaged by …]", "Deployment <label>" marked when unrecorded) with a ✕ button (aria-label "Remove <label> from the comparison") that removes it. `cmp:79-98,146-155`
- [ ] CMP-CTRL-04 "Add a setup" select: options grouped by maker (alphabetical, unknown last), each "<row label> · local|cloud · <setup label>", only setups of the current section not yet chosen; placeholder "Pick a setup…" / "No other setups ran here" / "Up to 4 setups" (select disabled when full or empty). Choosing one appends its slug. `cmp:115-132,770-772`
- [ ] CMP-CTRL-05 With fewer than two setups the result body is hidden and the sub-text reads "Pick two to four setups to see them side by side. A setup is one model at one reasoning level, quant, machine or provider and harness, local or cloud. They are scored only on the tasks all of them have counted runs of, so nobody gains from a task another skipped. Setups from different sections can't be compared[, so the picker lists only <Section> setups.][ Add one more to start.]" `[HARDCODED]` prose. `cmp:738-745`
- [ ] CMP-CTRL-06 Notes: more than one differing answer-changing setting (excluding model) -> "These differ in X and Y: a difference can't be put down to any one of them."; different deployments -> "They also run on different machines|providers|machines and providers (local and cloud), so times and decode speeds are labelled by deployment (…) and local electricity is never set against cloud billing." `cmp:713-729`
- [ ] CMP-CTRL-07 A setup whose scored tasks vanish after resolution adds a "has no scored task in <Section>" note (may duplicate resolution notes). `cmp:695-698` `[BUG?]` OQ-11

### 9.3 Numbers

- [ ] CMP-NUM-01 Sub-text: "n task(s) both|all k setups ran in <Section> of Suite v3. Scores count the p of them every setup finished (q left out); a task that timed out or errored is listed under reliability, not scored 0. Scores are the mean of repeat runs." No shared task: "These setups have no scored task in common in <Section> of Suite v3 yet, so there is nothing to compare." (summary/charts/diff hidden). `cmp:749-762`
- [ ] CMP-NUM-02 Shared tasks = active tasks of the section where every setup has a counted run on its own recorded deployment. Paired tasks = shared tasks where every setup has a finished, scored run; only paired tasks enter any score, tier, time or cost figure. `cmp:171-191`
- [ ] CMP-NUM-03 Per setup/task: finished score (mean of finished repeats), median finished time, mean cost per run, list of unfinished runs. "Top score on" = number of paired tasks where the setup is (tied) best. `cmp:176-207`
- [ ] CMP-NUM-04 Tier columns (tiers with at least one paired task) show the mean over that tier's paired tasks; header title "n shared finished task(s)". `cmp:193-196,274`

### 9.4 Summary

- [ ] CMP-SUM-01 Summary table columns: Setup, "Mean, n finished", one per tier, "Top score on" ("k of n"), Finished ("all N finished" / "didn't finish k of N", flagged), "Median time per task", "Decode speed", "≈ Electricity per task" (only when any setup is local), "Billed per task" (only when any is cloud). The best value in a column (when two or more) is highlighted; means use heat-coloured chips. `cmp:271-301`
- [ ] CMP-SUM-02 When the chosen setups run on different deployments, time and decode-speed cells add a sub-line with the deployment label; cost cells show "–" for the other kind (local vs cloud never share a column). Missing numbers show "–". `cmp:215-232,293-300`
- [ ] CMP-SUM-03 Narrow (<640): one card per setup with key-value rows for the same figures. `cmp:252-268`

### 9.5 Charts

- [ ] CMP-CHART-01 "Task by task": a row per shared task, a dot per setup on a 0-10 axis that starts at `floor(min/2)*2` (clamped to at most 8) with a note "The axis starts at N, not 0, so gaps look bigger than they would on a full scale." (or "The axis runs from 0 to 10."); two setups are joined with a line; coinciding dots are nudged vertically for 3+ setups. `cmp:380-393,344-355`
- [ ] CMP-CHART-02 A task a setup did not finish shows a coloured "×" in a column to the left of the plot (title "<setup> · <task>: didn't finish (<kinds>)[, k of n runs]") and the sub-text adds "A × is a task that setup didn't finish: left out of every score, not drawn as 0." `cmp:368-377,338-343`
- [ ] CMP-CHART-03 "Time per task": log axis with 1/2/5 x 10^n ticks (ticks closer than 34 px are dropped); legend "<setup>: <deployment>"; a caveat line (timeCaveat) when deployments differ: "These times come from local machines and a cloud provider|different machines|providers (…), so a gap in time or decode speed may be the hardware, not the model."; empty: "No run times were recorded for these tasks." `cmp:395-428,225-231`
- [ ] CMP-CHART-04 Task labels in charts are links to the task page, truncated by available width with a full-name `<title>`; below 520 px wide the label sits above its row. `cmp:308-335`
- [ ] CMP-CHART-05 Charts redraw when the container width changes by more than 8 px (debounced 150 ms) and on crossing 640 px (full re-render). `cmp:797-806`

### 9.6 Where they differ

- [ ] CMP-DIFF-01 Two setups: the paired sentence from PAIR-05/06 (bold) precedes the explanation; three or four: table only. `cmp:488-497,714`
- [ ] CMP-DIFF-02 Table of paired tasks sorted by spread (best minus worst) descending, then original order; columns Task (+ tier tag), Spread, one per setup (heat chip; best highlighted only when spread > 0). Narrow: cards. `cmp:478-562`
- [ ] CMP-DIFF-03 When more than five tasks are tied (spread < 1e-9), tied tasks fold into one line "n more tasks tied … Show them / Fold them again"; the fold state is kept for the page lifetime. `cmp:485-486,564-586`
- [ ] CMP-DIFF-04 Each task row has "Show checks"/"Hide checks" (row click also toggles unless a link/button is the target); opening shows each setup's check results side by side from its newest finished, scored run ("Newest of N counted runs, <date>" / "One counted run, <date>"), lazily fills from `details.json` ("Loading checks…", failure message, "No finished run.", "No score record for this run."), plus "Open the task page →". `cmp:432-476,520-562`

### 9.7 Reliability, unrecorded, not shared

- [ ] CMP-REL-01 "Reliability": "Every setup finished every shared task, so no task is left out of the scores." or, per setup, "<setup>: didn't finish on k of N shared tasks" with a list "<task link>: <outcome> after <t>[; …][ (k of n runs)]". `cmp:599-622`
- [ ] CMP-REL-02 "Machine not recorded" (heading shown only when any exist): per setup, runs on an unrecorded deployment are listed ("<setup>: n run(s), <deployment label>") with each task link and "finished, scored 7.5 in 4.1s" or its failure; they are never used in scores/speed. `cmp:624-649`
- [ ] CMP-REL-03 "Tasks not shared": "Every one of the N tasks in <Section> is shared by all of these setups." or "k of the N tasks … are left out of the comparison because at least one setup has no counted run of them on its recorded machine or provider. Nobody is scored on a task another skipped."; per setup a line "no counted run of k of N tasks" (or "ran all N tasks") with a "List them"/"Hide" toggle of linked task names. `cmp:653-684`

---

## 10. Model pages `/crucible/model/`

### 10.1 Routing

- [ ] MODEL-URL-01 Three levels by hash id: none = publishers index; `#<maker>` = publisher page; `#<maker>/<model>` = one model; `#-` / `#-/<model>` = unknown maker. Extra params: `suite`, `variant` (variant slug), `deployment` (deployment key), `mode`; legacy `setup` (setup slug) maps to its variant and deployment, with explicit `variant`/`deployment` winning. `core:309-324,862-885`, `model:1-8`
- [ ] MODEL-URL-02 Model key `<maker>/<model name>` must match exactly; an id with no results: renders the index with "No model “<key>” has results on Crucible. Pick one below." `model:937-941`
- [ ] MODEL-URL-03 Unknown publisher (case-insensitive match against known makers): index with "There is no publisher “x” in the results. Pick one below."; `#-` with no unmakered models: "No model is missing a publisher. Pick one below." `model:945-954`
- [ ] MODEL-URL-04 All in-page changes (variant/deployment/section picks, suite) write `location.hash`, keeping `suite`, `variant`, `deployment`, `mode`; Back steps through them. `model:23-28`
- [ ] MODEL-URL-05 `document.title`: "Crucible models" (index), "<Publisher> · Crucible models", "<Model> · Crucible models". Breadcrumbs: "Crucible › Models", "› <Publisher>", "› <Model>" with each parent linked. `model:76-77,132-134,337-339`
- [ ] MODEL-URL-06 The publisher links everywhere go to `#<maker>` (the maker, never the packager); inferred makers carry the "inferred" marker. `AGENTS.md`, `core:2379-2392`

### 10.2 Level 1: publishers index

- [ ] MODEL-IDX-01 Intro message: "Every model with results, under the lab that made it (the publisher). Select a publisher to see its models side by side, or a model for its variants and deployments." `model:78`
- [ ] MODEL-IDX-02 One block per maker (alphabetical), then an "Unknown publisher" block (`-`) for models with no maker: heading link, "n model(s)", inferred marker when any of its models' maker is inferred; a list of model links (alphabetical by name) with "n variant(s)". Empty: "No models yet." `model:79-97`
- [ ] MODEL-IDX-03 Models are grouped by model key (one model may span several base strings). `model:47-61`

### 10.3 Level 2: publisher page

- [ ] MODEL-PUB-01 Header meta: "n model(s)", "n local", "n cloud", suite name, inferred marker (title adds "(k of n models)"); message for unknown maker: "These models have no recorded maker, and none could be taken from their name." `model:130-145`
- [ ] MODEL-PUB-02 Section selector (only when the suite has >1 section; `&mode=`; remembered across publisher pages in the session; invalid falls back to first). `model:147-152`
- [ ] MODEL-PUB-03 Sub-text: "<Section> section. Each model's best variant, chosen and ranked by <Overall> score as on the leaderboard (<tiers> added together, each out of 10), and the deployment (machine or provider) it mostly ran on; time and cost belong to that deployment. Models measured on under 75% of the section's tasks run come after the rest." `model:157-159`
- [ ] MODEL-PUB-04 Ordering: ranked models (full overall, not in progress) by overall descending then name; then the rest by `betterConfig`; then models not run in the section at the end ("Not run in this section"). `model:112-119`
- [ ] MODEL-PUB-05 Table columns: Model (link + where-tag + inferred), Best variant (label + "best of n variants"), Coverage bar, Overall + each tier cell, Deployment ("main of n deployments"), Median time, Cost (title "Electricity estimate"/"Billed by the provider"), "View model →". Median time falls back to the all-runs median when none finished. `model:167-205,126-128`
- [ ] MODEL-PUB-06 Narrow (<640): cards with the same content ("On <deployment> (main of n)", "<time>/task · <cost>/task", View model button). `model:211-239`
- [ ] MODEL-PUB-07 "Compare these" link (shown when at least two ranked models): the top up to 4 ranked models' best variants on their main deployments; text "Best variants of [the top ]n ranked models in this section, on their main deployments." `model:241-254`
- [ ] MODEL-PUB-08 Chart "<Overall> score per model": horizontal bars per model (best variant), labelled "score · done/total tasks", local/cloud colours; pale (35% opacity) when in progress or partial; "no <Overall> tasks run yet" when null; legend local, cloud, "in progress (under 75% of tasks run)"; axis 0, max/2, max; narrow layout puts names above bars. Redrawn when window width changes (150 ms). `model:256-301,961-968`

### 10.4 Level 3: one model

- [ ] MODEL-PAGE-01 Meta line: "By <maker link>", "Local | Cloud | Local and cloud", "n variant(s)", "Packaged by <packager>" (selected variant, when different from the maker), section names ("Chat and Agentic"). `model:364-374`
- [ ] MODEL-PAGE-02 If the model has no counted run in any section: "No run of this model counts in Suite v3 yet." and the body is hidden (the "Other runs" note may still show). `model:343-345,376-379`
- [ ] MODEL-PAGE-03 Selection resolution: section = `mode` param if valid, else the section containing the `variant`, else the first section the model ran in; variant = slug match else best; deployment = key match else the variant's main (first) deployment. Ticked comparison variants reset when model/suite/section changes. `model:347-362`
- [ ] MODEL-PICK-01 "Variant" picker: a Section chip row (chips when the model ran in several sections, plus Combined; plain text otherwise), then one row per answer-changing dimension (Quant, Reasoning, and Harness when the section has several). A single-value dimension is plain text (the Quant row is omitted for cloud). Values are sorted by text; two weights with the same quant are disambiguated "(packager|format|other build)". `model:420-457,391-404`
- [ ] MODEL-PICK-02 Clicking a value selects the closest variant that has that value while keeping as many other current choices as possible; a value with no variant matching the other current choices is drawn dashed (title "No variant ran with this alongside your other choices; selects the nearest one"). The deployment is kept if the new variant also ran there. `model:405-418,444-454`
- [ ] MODEL-TILES-01 Tiles: Overall (when the section has >1 tier; "<tiers> added together, out of N[ (partial)]"; Combined: section names), headline tier ("<scored> of <total> tasks[ (partial)]"), every other tier (gate tiers as "<Tier> gate" with ✓ pass / ✕ fail / partial / "—", and "score x · n of m tasks"), Coverage ("done of total", pct or "in progress: under 75% of the tasks"), Counted runs ("pooled over its deployments…"). Combined tiers add "out of N". `model:461-481`
- [ ] MODEL-AREAS-01 "By area": one bar row per area with tasks: mean over the tasks with a counted run, "7.5 · measured on x of y[ (few)]"; "not run" (no run) or "none count" (runs exist but none count, tooltip "It has runs in this area, but none counts in this suite."); drawn pale when measured on fewer than half the area's tasks. `model:483-498`, `core:1919-1928`
- [ ] MODEL-DEP-01 "Deployments": table (Deployment name + where-tag [+ "not recorded" tag, tooltip "These runs didn’t record where they ran. They count toward the variant’s quality but are left out of A/Bs and speed comparisons."], Packaged by, Runs, Finished, Timed out, Errors, Median time/task, Decode speed "(n runs)", Cost/task). Selecting a row (click/Enter/Space) selects that deployment (`&deployment=`); sorted recorded first, most runs first, then label. Narrow: cards with the same fields. `model:502-577`, `core:1967-1980`
- [ ] MODEL-DEP-02 Median time = median over tasks of the task's median finished time; when none finished: "<time> (none finished)" from all runs. Cost = mean over tasks of the task's mean cost; "—" when unknown. `core:1263-1285`, `model:518-521`
- [ ] MODEL-DEP-03 "Runs that didn't finish" list (counted runs that timed out or errored, any deployment): "<task link>: <outcome> after <t> on <deployment>; the leaderboard scores it x." with a "not recorded" tag when the machine is unknown. `model:579-599`
- [ ] MODEL-VAR-01 "Every variant": table (checkbox, Coverage, variant label with only the differing dimensions, Overall + tier cells, Deployments count); selecting a row selects that variant (keeps the deployment when it exists there). Narrow: cards with a "Compare" checkbox. `model:604-665`
- [ ] MODEL-VAR-02 Tick two to four variants (the fifth tick is disabled) to enable "Compare n variants →" (to the compare page using each variant's setup on the selected deployment, else its first setup); otherwise a disabled link "Compare variants →" with "Tick two to 4 variants.". No compare checkboxes in Combined. `model:667-679,671-678`
- [ ] MODEL-AB-01 "A/B" block appears when the selected variant has candidates: other variants of the model on the *same recorded deployment* differing in exactly one section-allowed dimension and sharing at least one task. With several candidates a radiogroup chooses which; heading "A/B: <a> or <b>". If the selected deployment is unrecorded and other variants exist: "An A/B needs a recorded machine or provider. This variant’s runs are on one that wasn’t recorded, so they can’t be compared with another variant’s." `model:704-735`
- [ ] MODEL-AB-02 Content: sub-text with dimension, deployment and shared-task count; a dumbbell per shared task (0-10 axis; A vs B colours; "not scored here: a side didn’t finish" for unpaired); legend "(selected)"; the summary sentence (PAIR-06) plus, when speed is comparable, "On <dep> the median time per shared task is X with B against Y with A." and the phrase "<B> is faster|slower on every one of the n timed tasks | on k of n timed tasks, by 1.4× at the median task." / "Task by task, the two take about the same time at the median." (f < 1.05); then "Didn’t finish" and "Left out: runs on a machine that wasn’t recorded" lists. `model:736-790,694-702`
- [ ] MODEL-TASKS-01 "Tasks": per-area collapsible groups (closed by default; open state kept in session by section:area): toggle shows area name, mean-score chip (heat; "mean " prefix on narrow), "x of y counted[ · k ran but don’t count]". Open: wide table (Task + tier tag, Score (mean) button with repeats, Time [+ "timed out" flag], Cost, Runs "n" or "k of n counted"), narrow cards. Not-run tasks show "not run". Scores are pooled over all deployments; time/cost are from the selected deployment only. `model:796-901`
- [ ] MODEL-TASKS-02 Clicking a score opens the run detail panel for that variant x task (title uses the variant label), scrolls into view. `model:835-840`
- [ ] MODEL-OTHER-01 "Other runs: n run(s) of this model don’t count in Suite v3 (a from an older task version, b of tasks this suite doesn’t list, c through a harness the suite doesn’t score, d marked invalid). They aren’t in any score." Shown only when n > 0; includes runs of tasks not in the catalog (all setups of the model's bases). `model:905-926`
- [ ] MODEL-COMB-01 Combined section on a model page exists when the suite has a combined view and the model ran in more than one section: one combined variant per pair of section variants matching on model, weights (packager/format/quant) and reasoning (harness differs); Tiles/areas (with "<Section> · <area>" prefixes)/deployments (with "no <Section> runs" notes when a section never ran on it)/variants use the additive scoring; A/B and comparison checkboxes are not offered. `model:332-333,320-322`, `core:1454-1552`
- [ ] MODEL-RESP-01 Below 640 px every table on the page (publisher models, deployments, variants, tasks) is cards; layout switch triggers a full re-render. `model:961`, `scss-model:283`

---

## 11. Runs page `/crucible/run/` (as built; see Open questions, much of it is likely unfinished)

- [ ] RUN-PAGE-01 Title "Recent runs"; breadcrumb "Crucible › Runs"; status "Loading runs…" hidden on success. No URL state at all (no hash/query read or written). `run.html:10-13`, `run:44-75`
- [ ] RUN-PAGE-02 Controls: Suite select (all visible suites, plain "Suite vN" labels, no "(current)"; default current), "Sort by" select (Newest first [default], Oldest first, Model name, Score (high to low), Score (low to high)), "Filter" select (All runs, Finished only, Timeouts only, Errors only). Each change re-renders; none is stored. `run.html:19-38`, `run:46-66`
- [ ] RUN-PAGE-03 List = every loaded run (no suite filter in practice, no exclusion of invalid/withdrawn runs, no task-version check). `run:85-112` `[BUG?]` OQ-01
- [ ] RUN-PAGE-04 Filters: finished = `outcome.status` `completed` or `ok`; timeout = `outcome.timed_out`; error = status `error` or `failed`. `run:99-111` `[BUG?]` differs from core outcome classes.
- [ ] RUN-PAGE-05 Sort: date by `started_at` string compare (runs without a date last in both directions); model by base then id (string compare); score by the highest score across all of the run's score records (any rubric version); runs without a score sort to the bottom in both score directions. `run:116-163`
- [ ] RUN-PAGE-06 Card (one `<article>` per run, in a grid): status stripe (finished / timeout / error / unknown; `outcome.timed_out` wins, status `TIMEOUT` also timeout); header = model short name + best score (one decimal) or "—"; fields: Year, Base, Version (`v<task version>` or "N/A"), Reasoning (`requested` or "default", with " (resolved)"), Quant ("N/A"), Inference ("Local / provider" style: `Capitalised where [/ provider]`, or "N/A"); Task id (or "Unknown"); date. `run:185-322`
- [ ] RUN-PAGE-07 Date line uses `fmtDate(new Date(started_at))`, which stringifies a Date object (renders as the start of a locale date string, not `YYYY-MM-DD`). Year uses local-time `getFullYear()`. `run:191-199,312-318` `[BUG?]`
- [ ] RUN-PAGE-08 Clicking a card navigates (full page load) to `/crucible/task/?run=<uuid>#<task-id>`. The task page ignores the `?run=` query. `run:327-334` `[BUG?]` OQ-01
- [ ] RUN-PAGE-09 Empty: "No runs found." and an empty count; else "<n> run(s) shown". `run:171-183`
- [ ] RUN-PAGE-10 The page defines a suite line (`#suite-line`) it tries to fill with "Suite vN: <description>" but never does in practice; no suite note. `run:77-83` `[BUG?]`

---

## 12. About page `/crucible/about/`

- [ ] ABOUT-01 Static page: breadcrumb "← Crucible results", title "About Crucible", disclaimer "This page was created and written by or with the help of AI.", lede, then sections in order: How a run works, Sections and areas, Tiers, How scores are made, Versions: Crucible and the suite, Run it yourself, Share your results. `[HARDCODED]` prose (about.html is an authored page; its static text may stay static). `about.html:9-161`
- [ ] ABOUT-02 "How a run works" is a six-step ordered list (Task, Harness, Model, Run folder, Score, Publish) that names harnesses `direct`, `opencode`, `pi`, and providers LM Studio, Ollama, OpenRouter. `[HARDCODED]` `about.html:21-52`
- [ ] ABOUT-03 "Sections and areas": sentence listing the current suite's section labels ("Chat or Agentic", last joined with "or"); a table Area / What it means / Examples grouped by section (group row = "<label> · <blurb lowercased first letter>"); each area row = catalog label else id, blurb and examples from catalog else fallback else "—". `about.html:54-82`
- [ ] ABOUT-04 "Tiers": a list "<label>: <detail | blurb>" from the catalog (fallback detail/blurb); then a paragraph about the Overall score (fallback label "Overall") and Combined (label from fallbacks, default "Combined"). `about.html:83-103`
- [ ] ABOUT-05 "How scores are made": static paragraph, then for each *active* task of the current suite with `rules.length > 0`: an `<h3>` with the task name (tooltip = id) and a bullet list of its rules. `about.html:104-120`
- [ ] ABOUT-06 "Versions": text with "Crucible (<crucible_version> published this suite's catalog)" when present and "Suite <suite id, default v1>"; four static bullets; a link to the versioning doc and to the suite changelog (`suite.changelog_url`, default the GitHub SUITE_CHANGELOG URL). `[HARDCODED]` default URLs and repo links. `about.html:121-145`
- [ ] ABOUT-07 "Run it yourself": install snippet (`git clone … / uv sync / uv run crucible run`) in a code block, explanation, link to the GitHub repo; "Share your results": a "Coming soon" draft box. `[HARDCODED]` `about.html:146-163`
- [ ] ABOUT-08 About reads the *current* suite's catalog (not any selected suite); there is no suite selector or data fetch on this page in the legacy build (it is Liquid-rendered). Rewrite: load the same catalog data; no loading state is specified. `cat.html`

---

## 13. Cross-cutting accessibility and interaction details

- [ ] A11Y-01 Section/Models/Harness/Show/scatter toggles are `role="radiogroup"` with `role="radio"` + `aria-checked` buttons; tier toggles are `aria-pressed` buttons; multi-select lists are `role="group"` of `menuitemcheckbox` with `aria-checked`, button has `aria-haspopup`, `aria-expanded`, `aria-controls`. `core:188-197`, `main:359-379`
- [ ] A11Y-02 Status line has `role="status"`; filter summary and panel notes are `aria-live="polite"`. `main.html:38,95-97`
- [ ] A11Y-03 Sortable headers are buttons inside `th scope=col` with `aria-sort`; row headers use `th scope=row`; charts are `role="img"` with an `aria-label` and the same numbers exist in a table. `main:633-647`
- [ ] A11Y-04 Clickable table rows (task performers, model deployments, model variants) are focusable (`tabindex=0`) and activate with Enter or Space (only when the row itself has focus). `task:420,437`, `model:549-551,632-634`
- [ ] A11Y-05 Hidden (`hidden`) always wins over layout rules inside `.crucible` (`display:none !important`). `scss:2053-2056`
- [ ] A11Y-06 `prefers-reduced-motion: reduce` disables transitions/animations. `scss:651`

---

## 14. `[HARDCODED]` inventory (what the rewrite must source from data or keep as one documented constant)

| ID | Literal | Where | Rewrite should |
|---|---|---|---|
| HC-01 | `SUPPORTED_FORMAT = 3` (JS) and `cr_supported = 3` (Liquid) | `core:11`, `cat.html:9` | One constant |
| HC-02 | `MIN_PAIRED_TASKS = 5`, `MAX_TASK_SHARE = 0.5`, diff tie threshold `0.05` | `core:27-28,2075-2077` | Keep as documented constants (AGENTS calls them display rules) |
| HC-03 | `MAX_COMPARE = 4` | `core:23` | Constant |
| HC-04 | Local/cloud colours `#2a78d6/#eb6834`; series `#1856a3,#eb6834,#2f8a4a,#8a4fbf`; heat endpoints `[234,242,251]`->`[24,86,163]`, text flip at 0.55 | `core:22,110-116,356` | Design tokens |
| HC-05 | Breakpoint 640 px (also 359 px, 500 px scatter, 520 px compare chart, 899 px compare grid) | `core:224`, `main:911`, `cmp:312`, `scss-compare:290` | Constants |
| HC-06 | `PACKAGERS = [mlx-community, lmstudio-community, unsloth, bartowski]` | `core:125` | Data (mirrors Crucible `origin.PACKAGERS`) |
| HC-07 | `KNOWN_BASE_MAKERS` table (6 entries) | `core:128-135` | Data (corrections) |
| HC-08 | Coverage / in-progress defaults 0.75 | `core:1022-1023` (and `fb.yml`) | From catalog, then `fb.yml` |
| HC-09 | Labels "Overall", "Combined", single-tier "Score" | `core:507,1045,1300` | `fb.yml` |
| HC-10 | Default modes count "2" in intro | `main.html:15` | Remove (use catalog length) |
| HC-11 | Crucible tab list (labels, paths) | `nav.html:5` | Route table |
| HC-12 | Dimension labels Model/Quant/Reasoning/Harness/Local or cloud/Machine/Provider and kinds | `core:689-697` | Constant |
| HC-13 | Status/outcome vocab: `completed`, `timeout`, `harness_error`, `ok`, `failed`, `error`, `TIMEOUT`; states counted/provisional/older/invalid/harness; task status active/provisional/retired; suite status `current` | `core:702-713,1098-1105`, `run:99-244` | Keep as the data format's enum |
| HC-14 | STATE_TEXT sentences and all explanatory prose (leaderboard note, takeaways, panel notes, footnote, compare/model sub-texts, todo footnote) | `core:2177-2183`, `main:495-553`, `main:1180-1188`, etc. | Keep as UI copy (mark in i18n/strings file); none names a task/tier/area |
| HC-15 | Gate wording "pass/fail gate", "no task below" uses catalog numbers | `main:543-546` | Numbers from catalog (already data) |
| HC-16 | Static About prose, harness names (opencode, pi, direct), providers (LM Studio, Ollama, OpenRouter), install commands, repo + changelog URLs | `about.html` | Static content; GitHub URLs configurable |
| HC-17 | Scatter label limit 16 points, bars slot 56 px / bar 24 px / name cut 30 chars, narrow row 38 px | `main:954,785-829` | Constants |
| HC-18 | `localStorage` key `crucible-provisional`, `sessionStorage` key `crucible-compare` | `main:33,562` | Constants |
| HC-19 | Energy: price/watts come from `display.energy` (data-driven; not hard-coded) | `disp.yml:26-32` | Keep data-driven; add watts per machine in `disp.yml` |

---

## 15. Open questions (accidental or ambiguous behaviour)

- OQ-01 **Run page is largely broken/unfinished.** `D.catalogById()` returns a catalog, but the page reads `suite.catalog` (always undefined), so the suite select never filters runs, the suite line never fills and the suite note never shows; the suite selector also ignores the hash/`&suite=`; invalid/withdrawn runs and older task versions are not excluded; its "finished/error" filters do not match the core outcome classes; "best score" ignores the pinned rubric version; the date line passes a `Date` to `fmtDate` (garbled); and the card link adds a `?run=` query the task page never reads. Decide: reproduce, fix, or drop the page. (RUN-PAGE-*)
- OQ-02 **Format-version asymmetry.** `AGENTS.md` says `SUPPORTED_FORMAT` lives in `crucible.js`; it is in `crucible-core.js` (and duplicated in Liquid). Status records are never version-checked while runs/scores/catalogs/corrections are. Intended?
- OQ-03 **Bars chart metric.** `AGENTS.md` says the column chart plots the "headline score"; the code plots the Overall (aggregate) score. (MAIN-BARS-01)
- OQ-04 **Section switch resets only Harness and Hardware.** Format/Quant/Packager/Reasoning/Models/exclude/in-progress are kept (and silently pruned if the other section lacks the values). Looks accidental (`hw` reset suggests the intent was "reset the section-specific filters"). (MAIN-PANEL-04)
- OQ-05 **Bars name truncation.** A code comment says names are cut at 26 characters; the code cuts at 29 + "…" when longer than 30. (MAIN-BARS-03)
- OQ-06 **Harness filter on Combined.** The harness filter UI is hidden in Combined, but a `harness=` value from the URL or from a previous section stays in state and still filters (combined setups have harness strings like `direct + opencode`), which can empty the board with no visible control to undo it besides "Reset filters".
- OQ-07 **Dead provisional path.** `V.provisionalScore` / `provisional` tier cells ("provisional" note) cannot occur with the preview off (provisional tasks are not "in mode" then). Only the `+n provisional` path is live. Keep only if a future "show provisional alongside" mode is wanted.
- OQ-08 **Todo and Combined.** The todo page never offers Combined and has no filters; "Easiest" mixes effort units (tasks, failures x min 3) with time. Intentional product choice?
- OQ-09 **History semantics differ by page.** Main page rewrites its hash with `replaceState` (Back leaves the page), while task/model/compare/todo use `location.hash` assignments (Back steps through selections). SvelteKit: pick one policy per interaction type.
- OQ-10 **Rank numbering follows sort order.** Ranked rows are numbered 1..n in the *displayed* order, so sorting by time or name renumbers them (rank no longer means "rank by Overall"). (MAIN-LB-11)
- OQ-11 **Compare duplicate notes.** The same unscored setup can be reported by both `resolve()` and `render()`. (CMP-CTRL-07)
- OQ-12 **Task page dead branches.** `renderStub`'s "Show provisional tasks" button has no caller; the `renderHarness` conditional (`if (!isProv) … else if (several harnesses) …`) is redundant because `renderHarness` already returns when there is a single harness. (TASK-MISSING-04)
- OQ-13 **Publisher section mode persists** in a module variable across publisher pages within a session but is not in the URL unless `&mode=` is present; reloading loses it.
- OQ-14 **Unknown task status = provisional.** Any status other than `active`/`retired` (including typos/new statuses) is treated as provisional, which shows it on the task index only behind the checkbox and counts it under the preview. Should unknown statuses be hidden?
- OQ-15 **Timezone/locale.** `fmtInt` uses the browser locale; run-page year uses local time. SSR (SvelteKit) must pin a locale/timezone to avoid hydration mismatches.
- OQ-16 **Scatter y-scale vs task scatter.** The main scatter y axis is 0..overall max; the task page scatter is fixed 0..10; compare dot chart starts at an adaptive lower bound. Consistent by design?
- OQ-17 **Duplicate slug stability.** Setup slugs get `~2`, `~3` suffixes in load order when names collide; adding data can reorder/rename slugs and break old compare links. Stable ids would be safer in the rewrite.
- OQ-18 **Leaderboard note vs. cards.** The narrow card layout drops the in-progress row tooltip (`title`) and the "ran n of m provisional" note placement differs slightly; verify if parity matters.
- OQ-19 **`?provisional=1` precedence.** The hash wins over the query, but a toggle only ever writes the hash and localStorage; a stale `?provisional=1` in the query keeps overriding storage on every load until removed. (MAIN-URL-08)
- OQ-20 **Cost "per task" semantics.** Leaderboard cost is the mean over counted runs (not per task), compare uses mean of per-task means; labels say "per task" in both. (MAIN-LB-16, CMP-SUM-01)
