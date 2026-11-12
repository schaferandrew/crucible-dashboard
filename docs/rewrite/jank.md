# Crucible dashboard and data pipeline: jank audit

Audited 2026-11-10. Read-only. Site repo = `/Users/schafer/Developer/schaferandrew.github.io` (paths below are relative to it unless prefixed `crucible:`, the harness repo `/Users/schafer/Developer/crucible`). Counts come from the live `https://www.schaferandrew.com/crucible/data.json` (2,053 runs, 2,022 score records, 4 catalogs) and from `details.json`.

Headline numbers:

| artifact | raw bytes | gzip -9 | served (content-encoding: gzip) |
|---|---|---|---|
| `/crucible/data.json` | 5,142,350 | 684,175 | 734,790 |
| `/crucible/details.json` | 7,047,331 | 1,017,127 | n/a |

Projection at 2,500 runs/month (linear in runs; the current per-run cost is 2,278 B raw in data.json plus 3,485 B raw per score in details.json). Observed pace is higher: 1,154 runs in the first 10 days of Nov, 880 in Oct.

| horizon | runs | data.json raw / gzip | details.json raw / gzip |
|---|---|---|---|
| now | 2,053 | 5.1 MB / 0.68 MB | 7.0 MB / 1.0 MB |
| +6 months | ~17,000 | ~39 MB / ~5.2 MB | ~58 MB / ~8.4 MB |
| +12 months | ~32,000 | ~73 MB / ~9.8 MB | ~110 MB / ~15.9 MB |

Sorted by severity. Items that refute a suspect are marked REFUTED/PARTLY and kept short at the end of their severity band so the redesign doesn't chase them.

---

## HIGH

### J-01 data.json is one monolith that every page downloads, parses and re-joins, and it grows linearly with runs
- Evidence: all 7 pages load `data-src="/crucible/data.json?v={{ site.time | date: '%s' }}"` (`crucible.html:175`, `crucible-task.html:33`, `crucible-model.html:106`, `crucible-compare.html:80`, `crucible-run.html:46`, `crucible-todo.html:51`). Runs are 4,420,805 of 5,142,350 bytes (86%), catalogs 457,138, scores 610,344. The `?v=site.time` buster changes every deploy, so the browser cache never survives a publish. `C.data()` (`crucible-core.js:500` on, ~2,000 lines) then builds every config, variant, deployment, suite and view synchronously on the main thread on each page load.
- Impact: 0.7 MB over the wire now, ~5 MB gzipped / 39 MB parsed at +6 months, ~10 MB / 73 MB at +12. Time-to-interactive scales with total history, not with what the page shows. The runs page paints cards for every run.
- Severity: high
- Direction: precompute per-view aggregates at publish time (leaderboard, per-task, per-model JSON) and fetch only what a route needs, with content-hashed URLs.

### J-02 details.json ships every score record's full items/groups, and the whole thing is fetched to open one run
- Evidence: `crucible/details.json:5` is `{"scores": {{ site.data.crucible.scores | jsonify }}}`. `D.loadDetails` (`crucible-core.js:2156-2175`) fetches all of it then walks the entire tree to index by `uuid|rubric|method`. 2,022 records, 7,047,331 B; `items` is 5,894,832 B (84%) and `groups` 715,281 B. Header fields (`run_uuid`, `scored_at`, `rubric_version`, `method`, `score`, `scale`, `capped_at`, `passed`, `raw`) are duplicated in data.json's slim score (302 B each).
- Impact: opening one run costs a 1 MB gzip (7 MB parsed) download, and it grows to 110 MB raw/16 MB gz at +12 months. On a miss the promise resets and refetches the whole file.
- Severity: high
- Direction: one small detail document per run (or per task-month) addressed by run UUID, fetched on demand; keep only summary scores in the index.

### J-03 Corrections are applied at page runtime by mutating run records, in a pipeline that never fixes the data
- Evidence: `applyCorrections` (`crucible-core.js:453-492`) rewrites `model.base`, `model.variant_key`, `model.origin`, `model.publisher`, `model.format` in place on every page load and stashes the originals in `m.recorded`/`m.correction`. `_data/crucible/corrections.json` has 12 base rewrites + 2 publisher spellings; 279 of 2,053 runs (13.6%) are hit by a base rewrite. `crucible: docs/bundle-format.md` ("Corrections") says runs are immutable, so the bug stays in every consumer forever. Only the JS reader applies them; any other consumer (export, a SvelteKit loader, analytics) must re-implement them.
- Impact: derived truth lives in the browser, is re-derived per page view, and can differ between readers. The `variant_key` string is edited by array index (`vk[0]`, `vk[1]`, `vk[2]`).
- Severity: high
- Direction: resolve corrections once at build time into a canonical `model` entity (stable model ID, maker, packager, format, quant) and join runs to it by ID; keep "as recorded" as an audit field.

### J-04 Model identity is a string-keyed, fuzzy-merged inference, not an entity
- Evidence: `variant_key` is a `|`-joined string parsed with `split('|')` in three places (`crucible-core.js:469`, `553`, `909`) by position (`vk[1]` publisher, `vk[2]` format, `vk[3]` quant); every run has exactly 3 pipes (2,053/2,053). `buildConfigs` (`crucible-core.js:601-614`) groups runs by a 7-field identity, then merges groups with unrecorded fields into a "better recorded" group by `compatible()`/`strictlyMoreKnown()`, and silently leaves them separate if 2+ candidates match. Today: 186 raw identity groups over 44 distinct `model.base` values. Slugs are built from display text (`[shortName, level, quant, hw, harness].map(slugify).join('~')`, dedup with `~2`, `~3`, `crucible-core.js:622-629`) and are used in URLs and `sessionStorage`, so they can shift when data arrives.
- Impact: a setup's identity (and its URL) can change after a later run adds a previously-null field; merges are order- and history-dependent. Nothing guarantees two machines' runs of the same weights unify.
- Severity: high
- Direction: publisher assigns stable IDs (model, weights/variant, deployment) at ingest; the page never infers identity.

### J-05 Maker is inferred from `model.base` prefixes, with a hand-kept override table that disagrees with corrections.json (CONFIRMED)
- Evidence: `makerFromBase` (`crucible-core.js:139-144`) takes the text before `/` (dropping `~`, rejecting `PACKAGERS`). `KNOWN_BASE_MAKERS` (`crucible-core.js:128-135`) hand-lists 6 bases. It duplicates `corrections.json` and already disagrees: `'granite-4.2-3b-mlx@4bit': 'ibm'` vs corrections `maker: "ibm-granite"`; `'mlx-community/muse-glimmer-30b': 'meta'` in both. `makerInfo` (`crucible-core.js:914-922`) ranks: run's `model.origin.maker`, then majority vote of other runs of the same base (`RECORDED`, `crucible-core.js:891-902`), then prefix inference. Coverage: only 1,253 of 2,053 runs (61%) have `origin.maker`; 257 of the rest have no `/` in the base at all. `origin.source` values: lmstudio-key 893, none/null 673, openrouter 360, gguf 121, ollama 6.
- Impact: the same model can be filed under `ibm` or `ibm-granite` depending on which path wins; "unknown maker" is a real bucket (`UNKNOWN_MAKER = '-'`, `crucible-core.js:312`) that doubles as a URL segment (`#-/...`).
- Severity: high
- Direction: maker is a required field on the model entity, resolved once in the harness (`crucible: origin.py`), with an explicit "unknown" value; delete the JS tables.

### J-06 "publisher" means three different things across layers (CONFIRMED)
- Evidence: schema: `model.publisher` is "who packaged the weights" (`crucible: docs/data-model.md:37,48`). Data: 1,650 of 1,721 non-null publisher values are NOT packagers (`qwen` 461, `openai` 239, `google` 121, `deepseek` 116, ...), only 71 are in the 4-name PACKAGERS list; 1,204 runs have `publisher == origin.maker`, i.e. for cloud and many local runs it is the maker. UI: `crucible-model.js:6` says "'Publisher' is the maker ... never the weight packager"; the route/breadcrumb is `publisherUrl(maker)` (`crucible-core.js:307`). Core then re-maps `model.publisher` to `cfg.packager` (`crucible-core.js:626, 768`) and `D.packagerOf` (`:851`) with a comment "Never call the packager the publisher". `publisher` appears 29 times in core and 18 in model.js. The `Qwen`/`qwen` spelling split needs a correction entry (47 runs).
- Impact: the field name actively misleads every consumer; filters ("packager") run on a field that is often a maker.
- Severity: high
- Direction: rename in the new model: `maker` (lab) and `packager` (weights repackager, nullable); never reuse "publisher".

### J-07 Corrections-free fields are filled by guesswork: format inferred from quant strings, reasoning "resolved" fallback, base fallbacks (CONFIRMED)
- Evidence: `formatOfQuant` (`crucible-core.js:460-465`): `/^i?q\d(_[a-z0-9]+)*$/` becomes gguf, `/^(mlx-)?\d+bit$/` becomes mlx. Local runs with no `format`: 250 (of 1,546); 148 are fillable by the regex, 102 stay unrecorded; the cloud has 0 formats. In `identityOf` (`crucible-core.js:551-575`) `known()` coerces `''`, `'-'`, `null` all to "unrecorded"; `base: m.base || vk[0] || m.id || 'unknown'`. A 4th copy of the same idea is at `:909`.
- Impact: derived columns (format filter, variant weights key) are partly synthetic; the same regex must be reimplemented anywhere else.
- Severity: high
- Direction: the harness records `format` at run time from the runtime (LM Studio/Ollama/gguf metadata); the page never parses quant strings.

---

## MED

### J-08 Rules duplicated between crucible-core.js and page scripts, with divergences
Each item names the core site and the duplicate(s).
1. Run outcome classification. Core: `runOutcome` (`crucible-core.js:702-708`: timed_out / `completed` => finished / else error). Duplicate: `crucible-run.js:101-107` (filter: `completed`||`ok`, `timed_out`, `error`||`failed`) and `crucible-run.js:235-243` (CSS class from `completed|ok|error|failed|TIMEOUT`). `ok`, `failed`, `TIMEOUT` never occur in the data (outcome.status values are completed/timeout/harness_error). The filter "error" therefore misses `harness_error`.
2. Which score a run has. Core: score at the task's pinned `rubric_version` (`crucible-core.js:1105-1109`). Duplicate: `crucible-run.js:154-163 getBestScore` takes the max over all score records (2,022 scores for 1,914 runs, so 108 runs have 2+ rubric versions), so the runs page can show a different score from the leaderboard.
3. Which runs belong to a suite. Core: task id/alias/version/harness match (`:1096-1110`). Duplicate: `crucible-run.js:90-95` matches only `task.id` against `suite.catalog.tasks` and is dead (see J-17).
4. Provisional/active predicate. Core: `t.status === 'active'` / `'provisional'` (`crucible-core.js:1570-1572`). Duplicates: `crucible-task.js:16` `isProv = status !== 'active' && status !== 'retired'`; `crucible.js:227, 1044, 1070, 1079, 1140`; `crucible-compare.js:174, 656`; `crucible-todo.js:49`; `crucible-model.js` via S. Two different definitions of "provisional" (`=== 'provisional'` vs "not active, not retired").
5. Head/stretch tier selection. Same expression written three times: `crucible-core.js:1049-1052` (S), `:1309-1310` (CV), `:1593-1594` (V).
6. "Finished and scored" filters: `crucible-compare.js:165-166`, `crucible-todo.js:27,39,53-54`, `crucible-model.js:586`, all re-deriving `runOutcome(...) === 'finished'` over `i.run`.
7. Local vs cloud: `cfg.local ? 'local' : 'cloud'` is rebuilt in `crucible.js:276,771-772,831,840,897`, `crucible-model.js:505,568`, `crucible-task.js:628`; `where || (hw.key ? 'local' : 'cloud')` also at `crucible-core.js:555`.
8. PACKAGERS list: `crucible-core.js:125` "Mirrors Crucible's origin.PACKAGERS" (`crucible: crucible/origin.py:29`); a third copy exists in `runrecord.implied_variant` per its comment.
9. Coverage/threshold fallbacks: `0.75` hard-coded as the final fallback twice (`crucible-core.js:1022-1023`), also in `_data/crucible_fallbacks.yml:8-9`, and in every catalog's `scoring_policy`.
10. Paired-comparison thresholds `MIN_PAIRED_TASKS = 5`, `MAX_TASK_SHARE = 0.5` (`crucible-core.js:27-28`) are JS constants, not catalog policy.
- Impact: three pages can disagree about the same run.
- Severity: med
- Direction: one rule module (or, better, precomputed `state` fields at publish time) that every view imports.

### J-09 Hard-coded display constants and magic values in JS/HTML that the "never hard-code" rule says shouldn't exist
- Evidence: `MAX_COMPARE = 4` (`crucible-core.js:23`, used in `crucible.js:64,564,569,588`, `crucible-model.js:249,609,638,671,678`, `crucible-task.js:464`); chart colors `C.COLORS`, `C.SERIES`, and 6 raw hex literals in `crucible-task.js:632,635`, `crucible-model.js:272,745,746`, `crucible-core.js:115` (`#fff`/`#2b2537`); metric label strings (`'time'`, `'cost'`, `'tok/s'`, `'electricity'`); `OUTPUTS_BASE = '/crucible-data/'` and `DETAILS_PAGE = '/crucible/task/'` duplicated in `crucible-run.js:15-16` and `data-outputs` attrs in 7 HTMLs; filter ids/labels `FILTERS` (`crucible.js`); "Tick two to N variants" copy; `harnessLabel`. The strongest data-driven discipline holds for tasks, areas, tiers and modes (no hard-coded `spark|temper|forge|chat|agentic` in JS or HTML outside comments; grep confirmed), so this item is about the leftover cases above.
- Impact: moderate; theming and limits can't change without a code edit.
- Severity: med
- Direction: move limits, palette, and copy into a typed config/theme; keep the catalog as the only source for tasks/tiers/modes.

### J-10 `_data/crucible_fallbacks.yml` shadows the catalog, so the same facts live in two places
- Evidence: tiers (labels, blurbs, `role`, `gate: {mean: 8, min: 5}`), modes (labels, blurbs, order), `scoring_policy.coverage_min 0.75` are all in both the catalog (`catalog.tiers[].gate`, `scoring_policy`) and `_data/crucible_fallbacks.yml:8-9,12-21,40-60`. `areas` blurbs and examples (9 areas, 91-line file) exist ONLY in fallbacks, not in the catalog. Merge happens per-field in JS (`crucible-core.js:1020-1035`: `o.role || fb.role`, `o.gate || fb.gate`) and again in Liquid (`crucible.html:21-40`, `crucible-about.html`, `_includes/crucible-catalog.html`). Display text is therefore not versioned with a suite: a past suite (v1-v3) renders today's blurbs.
- Impact: silent drift; unknown IDs "render generically" (label = capitalized ID, `cap()`), hiding authoring errors.
- Severity: med
- Direction: the catalog carries all display text per suite; no fallback layer, validate at publish.

### J-11 Liquid builds the JSON, with shape-sniffing and double work
- Evidence: `crucible/data.json:12-17` branches on `month[1].record` vs `pair[1]` to guess whether a month folder is one record or a map (Jekyll's `site.data` shape changes with file count). It hand-writes 10 `jsonify` calls per score and runs `jsonify` over `cr.catalog`, `cr.runs`, `cr.status`, `cr.corrections`, plus `details.json` re-serialises all of `site.data.crucible.scores` (12 MB of YAML-parsed JSON). The score list is rebuilt from scratch on every build with an `n` counter and manual comma logic. The client then re-flattens the result with a shape-agnostic `walk()` (`crucible-core.js:389-430`, `2162-2169`) because "keys are folder and file names; the page reads the records, not the keys" (template comment). CI: GitHub "pages build and deployment" takes 37-50 s per run for the whole site (8 recent runs). It isn't isolated per template, but Jekyll must parse ~4,100 data files (`_data/crucible/{runs,scores}`: 1,154+880+19 run files and ~2,000 score files, plus 20 status and 4 catalogs).
- Impact: escaping is delegated to `jsonify` (no hand-escaped strings found, so no injection hazard today), but any new field must be added in the template by hand (score fields are whitelisted, `data.json:15`) or it silently never reaches the page, and build time and memory scale with file count.
- Severity: med
- Direction: generate JSON in the pipeline (Python/Node) and let SvelteKit import it; drop Liquid as a serialiser.

### J-12 Per-run records carry large always-null/constant/redundant payload
Counts are over 2,053 runs (1,546 local, 507 cloud).
- Always empty: `endpoint.app` (2053 null), `provenance.submitter` (2053), `provenance.verification` (2053), `endpoint.upstream` (null in 1,820; sub-key `upstream.quant` null in 233 of 233), `hardware.offload` (null 1,546 of 1,546 local), `model.origin.base_repo` (null in 1,457 of 1,457), `local.environment.machine.gpu`, `local.environment.inference.endpoint_host`, `outcome.invalid` (null 2,010), `outcome.leaks` (`[]` 2,050), `metrics.tests_passed/failed` (null 1,961), `task.version` null 6.
- Constants: `record`, `format_version` (3 in all 2,053), `harness.version` null, `score.scale = 10` (2,022 of 2,022), `score.format_version`, `score.record`.
- Redundant: `model.id` (`provider/base`, derivable), `model.display` equals the short name of `base` for 569 runs, `run_path` embeds task id and start time (also in `task.id`/`started_at`), `legacy_run_id` (377 runs, all migrated), `variant_key` is a re-encoding of `base|publisher|format|quant` (also in separate fields), `local.legacy_meta` duplicates `local.environment`/`checks`/`tools`/`metrics` for the 19 runs that have it, and `provenance.machine_label` vs `endpoint.device` vs `hardware.label` name the same machine in three fields (see J-14). `capped_at` is null in 1,759 of 2,022 scores. `metrics.output_tokens_per_s` is derivable from `tokens_out`/`elapsed_s`.
- Bytes: `model` 856 KB, `provenance` 618 KB, `metrics` 578 KB, `task` 314 KB, `endpoint` 299 KB, `hardware` 267 KB, `outcome` 262 KB, `run_path` 150 KB, `output_ref` 92 KB (of 4.42 MB). Note `hardware` is a full object (4 distinct values repeated 1,546 times) and `task` repeats id/alias/version/hashes per run.
- Impact: roughly a third of data.json is repeated or empty.
- Severity: med
- Direction: normalise to entity tables (model, machine/hardware, task) and reference by ID; drop empty/constant fields from the page payload.

### J-13 Full catalogs for every suite, including hidden ones, are shipped with every page; prompts and rules included
- Evidence: 4 catalogs (v1, v2, v3, v4) = 457,138 B. `hidden_suites: [v1, v2]` (`_data/crucible_display.yml:9`) hides two from the UI, yet both (~102 KB each) are still in data.json and still run through `collect`/`buildSuite`. The current catalog (v4) is 133,364 B, of which task `prompt` text is 65,998 B and `rules` 14,111 B (61 tasks) - only the task detail page uses these. v1 and v2 are nearly identical (101,903 vs 101,866 B).
- Impact: ~460 KB raw on every page for ~1 page's needs; the 3 past suites each add ~100 KB.
- Severity: med
- Direction: split catalog index (ids, labels, tiers, weights) from per-task detail; load detail with the task page; ship only visible suites.

### J-14 Machine/hardware identity is three parallel concepts, incompletely recorded (PARTLY CONFIRMED)
- Evidence: all 507 cloud runs have `hardware: null` (correct); all 1,546 local runs have a hardware object, but 67 of those have `key: null` (and 4 have no `label`): `{key: null, class: null, accelerators: [], system_memory_gb: null, cpu: null, label: null}`. `provenance.machine_id` is null for 48 runs; `machine_label` null for 48. They disagree: `machine_label` "Ironwood" is 1,594 runs but `hardware.label` "Ironwood" is 474, because `machine_label` is the machine that ran the harness while `hardware.label`/`endpoint.device` is the machine that served the weights (an LM Link peer); `endpoint.served_via = "LM Link"` for 737 runs. `identityOf` resolves device as `e.device || (hw && hw.label)` (`crucible-core.js:568-570`) and a `device_source: "backfilled"` marker exists in `local.environment` for 10 runs. Energy cost needs `hardware.key` in `crucible_display.yml: energy.watts` (3 hard-coded keys), so the 67 key-less local runs show a dash for cost.
- Impact: cost, grouping and "where it ran" answers differ by which field a view reads; a new machine needs a display-YAML edit before cost works.
- Severity: med
- Direction: first-class `machine` entity (id, label, class, watts) separate from `harness_host` vs `serving_host`; reject local runs without it at publish.

### J-15 String-keyed joins and compound string IDs throughout
- Evidence: `scoreKey = uuid + '|' + rubric + '|' + method` (`crucible-core.js:41`); `variant_key` `|` strings (J-04); `rowKey = base + '#' + level` (`:621`); combined keys `'combined:' + members.map(v => v.key).join(',')` and `slug.join('+')` (`:1465-1471`); `pairKey`, `variantPairKey = [base, weights.key || 'unrecorded:' + key, level].join('|')` (`:1316, 1460`); `parseModelId` splits `<maker>/<model>` and treats `-` as null (`:313-329`); `taskRef.id` vs `aliasOf[taskRef.alias]` joins runs to tasks by id or by alias (`:1009-1017, 1096`); hash-route params split on `,` and `+`. There are 377 runs whose task is joined via the legacy alias (`TASK-n`), and run ids exist in 3 forms (`run_uuid`, `run_path`, `legacy_run_id`).
- Impact: a `|` or `/` in a model name breaks parsing; IDs are not stable keys and are not typed.
- Severity: med
- Direction: opaque stable IDs per entity with typed foreign keys; no composite string keys.

### J-16 Global mutable state and a 2,500-line closure
- Evidence: `window.CrucibleCore = {}` (`crucible-core.js:10`); `C.data` is a single closure from `:500` to ~`:2160` creating `CONFIGS`, `SLUGS`, `BASES`, `VARIANTS`, `DEPLOYMENTS`, `CONFIG_OF_RUN`, `IDENT_OF_CFG`, `RECORDED`, `D.store` and attaching 80 `D.*`, 32 `S.*` members; `S.cells`, `S.cfgModes`, `S.other`, `S.unscored` mutated during `buildSuite` (`:1086-1130`). `applyCorrections` mutates the loaded records in place. Pages hold module-level mutable state: `crucible-run.js:21-24` (`currentSuite`, `currentSort`, `currentFilter`), `crucible-task.js:11` (`state`), `crucible.js:24` (`state`), `:149` (`labelCache`), `:563` (`picked`, synced to `sessionStorage`); `detailsPromise` (`crucible-core.js:2156`) is a hidden singleton. 6 `document.currentScript` lookups read config from `data-*` attributes. Every page also re-registers `hashchange` and relayout listeners (`:284-285`, `:235-250`).
- Impact: untestable without a DOM and a full payload; order-of-initialisation bugs; no way to share work across routes.
- Severity: med
- Direction: pure derive functions (data in, view-model out) tested in isolation; stores for UI state.

### J-17 crucible-run.js is largely a dead/forked page (suite filter never runs, wrong fields)
- Evidence: `D.catalogById()` returns the catalog object itself (keys: `suite`, `tasks`, ...; no `catalog` key), but `crucible-run.js:87-88` reads `suite.catalog`, so the suite filter at `:90-95` never executes and the page shows every run from every suite (including v1/v2 that are hidden everywhere else). `suiteLine.textContent = ... (cat.description || '')` (`:81`) reads a field no catalog has. The suite selector is therefore cosmetic. The page also bypasses the join: `getBestScore` (J-08.2), its own status classes (J-08.1), its own header/label logic (`model.base || model.id || 'Unknown'`, `quant || 'N/A'`) instead of `D.CONFIGS`, and renders one DOM card per run (2,053 now, 17,000 at +6 months) with no pagination or virtualisation. Its own header comment says "year, base model, version ..." which no longer matches.
- Impact: a live page with wrong behaviour and cost that grows with history; it is also the route most exposed to data growth.
- Severity: med
- Direction: rebuild as a paginated, server-filtered table over the same view-model as the other pages.

---

## LOW

### J-18 Catch-all error handling hides data problems; unknown data is skipped rather than surfaced
- Evidence: the only throw sites are the three `throw new Error('HTTP ' + status)` (`crucible-core.js:2160, 2268, 2515`) - the "throw-on-unknown" suspicion is REFUTED for domain data. The risk is the opposite: one `try/catch` around `opts.ready(D)` (`:2525-2531`) turns any bug in joining 2,000 records into "Something went wrong drawing the results." with only `console.error`. Records with `format_version > 3` are silently counted in `skipped` (`newer()`, `:42`) and shown as one line. Unknown task IDs go to `S.other` (`:1097`) and are never displayed on the main page. The shape-agnostic `walk()` accepts any nested shape and drops anything without a recognised `record`.
- Impact: bad data is invisible; failures are all-or-nothing page-wide.
- Severity: low
- Direction: validate at publish and at load with a typed schema; per-view error boundaries; show "N runs unmatched" explicitly.

### J-19 Performance hot spots (none quadratic in runs yet, but several in setups x tasks)
- Evidence: `buildConfigs` candidate scan is O(G^2) over identity groups (`crucible-core.js:608-611`, G = 186 now, ~34k `compatible()` calls, grows with models x machines x harnesses, not runs). `S.modeInfo`, `S.tierById`, `catalogById`, `taskById` fallback use `Array.filter(...)[0]` linear scans called inside render loops (`:1128-1129`, `:513`, ~40 `.filter(function ... )[0]` call sites in the 6 scripts). `store.scoresByRun[uuid].filter(...)` per run (`:1107`). `RECORDED` maker lookup per `makerInfo` call re-sorts keys (`:898-902`). Every view re-runs `buildView` per mode/provisional combination (`:1566`), and the combined view builds pairs by `combos(perPart)` (`:1322-1371`, cartesian). 24 `indexOf`-membership checks on arrays in core, 13 in `crucible.js`. `D.loadDetails` indexes 2,022 records by walking 7 MB.
- Impact: fine at 2k runs; the synchronous main-thread join is the bottleneck as runs and setups grow (no web worker, no memoisation across pages).
- Severity: low
- Direction: build indexes (Map by id) once; do aggregation at publish time; keep render loops O(rows).

### J-20 Accessibility gaps
- Evidence (static review): `crucible-run.js` and `crucible-todo.js` contain 0 `aria-*`/`role` attributes; run cards are click targets via `window.location.href = ...` (`crucible-run.js:333`) and are likely not focusable/keyboard operable (no `tabindex`/button/anchor check found). Charts are SVG with `role="img"` + a single `aria-label` (`crucible.js:796,815,924`, `crucible-model.js:281`, `crucible-task.js:366,501,619`), with the hit targets as `rect tabindex=0` (`crucible.js:849`) and circle `role="button"` (`crucible-task.js:543`) - interactive SVG with focus order = DOM order, no arrow-key handling or visible-focus audit found. Heat-map cells are coloured by `heatStyle` (`crucible-core.js:110-116`, computed RGB and `#fff`/`#2b2537` text chosen at threshold 0.55): no contrast guarantee, and hatched/pale "partial" is conveyed by fill-opacity and pattern. Non-text status: `✓/✕` spans (`crucible-core.js:2223`) use `aria-label` on a `span` (not exposed without a role). 25+ `innerHTML` sites (`crucible-compare.js` 18, `crucible-model.js` 23, `crucible.js` 23 per grep count) must be reviewed for escaping. Table rows use `tabindex="0"` with `aria-selected` (`crucible-model.js:549,632`) - `aria-selected` is invalid on a plain `<tr>` without `role="row"` inside a grid. `role="status"` live region is the only announcement on route change; hash routing gives no focus management. Not tested with a screen reader or axe.
- Impact: partial keyboard/AT access; page transitions and filters are silent.
- Severity: low (medium for the runs page)
- Direction: semantic table/link elements, route focus management, an axe pass in CI, tested colour tokens.

### J-21 Dead and suspect code
- Evidence: exports assigned but never referenced outside their definition (static grep, verify before deleting): `C.SUPPORTED_FORMAT`, `C.UNKNOWN_MAKER`, `C.collect`, `C.applyCorrections`; `D.DEPLOYMENTS`, `D.VARIANTS`, `D.SLUGS`, `D.DISPLAY`, `D.ENERGY`, `D.STATE_TEXT`, `D.baseOf`, `D.cellValue`, `D.configOf`, `D.costOf`, `D.timeOf`, `D.hardwareText`, `D.invalidReason`, `D.isLocalRun`, `D.wattsOf`, `D.validity`; `S.STRETCH`, `S.taskById`, `S.tierRole`; `V.hasToolCalls`, `V.inMode`, `V.pairedComparison`. Plus `crucible-run.js:15 OUTPUTS_BASE` (unused), the dead suite branch of J-17, `crucible-run.js:211-213` reasoning "(resolved)" formatting that duplicates `model.reasoning` handling, and a stale header comment. Legacy compatibility baggage: `legacy_run_id`, `task.alias`, `S.task` alias fallback (`:1017`), `local.legacy_meta` and the "format 2" export, which `crucible: docs/bundle-format.md` says is "removed once the page reads format 3".
- Impact: ~10% of the surface area is unreferenced and misleading when reading the code.
- Severity: low
- Direction: delete in the rewrite; migrate legacy ids once at ingest.

### J-22 Cache-busting and delivery
- Evidence: `?v={{ site.time | date: '%s' }}` on `crucible-core.js`, each page script, `data.json` and `details.json` (all 7 HTMLs) means every deploy invalidates all caches; 7 pages each load the same 2,538-line `crucible-core.js` (no bundling or minification, ~7,000 lines of unminified JS in total, `wc -l`). No `Cache-Control` control (GitHub Pages `max-age=600`).
- Impact: repeat visitors re-download the 735 KB data file after every publish (~2,500 runs/month implies several publishes a week).
- Severity: low
- Direction: hashed asset names from the SvelteKit build; immutable per-month shards.

### J-23 Hash-based routing and URL-encoded state
- Evidence: 7 separate HTML pages with `#...&suite=&mode=&provisional=` hash params (`crucible-core.js:259-335`), re-parsed by each page; the provisional toggle is also in `localStorage` (`crucible.js:34-35`), the compare picks in `sessionStorage` (`:564`), and the model route uses `-` for unknown maker. Setup slugs (J-04) are in URLs, so links break when data changes.
- Impact: not crawlable (page is `noindex`), no server-side render, links are not stable.
- Severity: low
- Direction: path-based routes over stable IDs; state in URL search params with typed parsing.

### J-24 Suspect refuted: "runs with no machine/hardware recorded"
- Evidence: the 507 runs with `hardware: null` are exactly the cloud runs (`where: "cloud"`); 0 local runs lack a hardware object. The real gap is 67 local runs with an empty hardware object (`key: null`) and 48 runs with `provenance.machine_id: null` (see J-14).
- Severity: low (as stated)
- Direction: validate "local requires machine id + hardware key" at publish.

---

## Summary table

| ID | Severity | Title |
|---|---|---|
| J-01 | high | monolithic data.json loaded and re-joined on every page |
| J-02 | high | details.json ships all score items, fetched whole |
| J-03 | high | corrections patched at page runtime |
| J-04 | high | model identity is string-keyed fuzzy inference |
| J-05 | high | maker inferred from base prefix + conflicting override table |
| J-06 | high | "publisher" means three things |
| J-07 | high | format/quant/reasoning guesses |
| J-08 | med | duplicated rules across core and page scripts |
| J-09 | med | residual hard-coded constants |
| J-10 | med | fallbacks.yml shadows catalogs |
| J-11 | med | Liquid builds the JSON |
| J-12 | med | always-empty, constant, redundant run fields |
| J-13 | med | all catalogs (incl. hidden) with prompts shipped everywhere |
| J-14 | med | machine/hardware identity in three fields, partly missing |
| J-15 | med | string-keyed joins and composite IDs |
| J-16 | med | global mutable state, giant closure |
| J-17 | med | runs page forked and partly dead |
| J-18 | low | catch-all errors, silent skips |
| J-19 | low | perf hot spots |
| J-20 | low | accessibility |
| J-21 | low | dead code |
| J-22 | low | cache-busting and delivery |
| J-23 | low | hash routing |
| J-24 | low | refuted: runs with no hardware |
