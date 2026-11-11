# Crucible published results: data inventory (bundle format 3)

Snapshot taken 2026-11-10 from `/Users/schafer/Developer/schaferandrew.github.io` (site) and `/Users/schafer/Developer/crucible` (harness). Everything is measured from the files on disk or read from the code. Line numbers are `assets/js/crucible-core.js` unless stated. Percentages use all 2053 runs unless stated. "Empty" means null, "", [] or {}.

Who writes a field: **H** = harness at run/score record time (`runrecord.py`, scorer), **P** = `crucible publish` (`crucible/crucible/bundle.py`), **L** = Liquid (`crucible/data.json`, `crucible/details.json`), **JS** = page code (`crucible-core.js`).

---

## 1. File layout

### Sources
| Where | What |
|---|---|
| `crucible/docs/bundle-format.md` | the format spec |
| `crucible/crucible/schemas/{catalog,run,score,status,corrections,results}.schema.json` | JSON Schemas; `publish` validates every file before writing (`bundle.py:_write`, `record_problems`). `results.schema.json` is the frozen format 2 single-file bundle, unused by the current page |
| `crucible/corrections.yaml` (78 lines) | reviewed fixes; published whole as `corrections.json` |
| `crucible/crucible/bundle.py` (442 lines) | `publish`, `Publisher`, `catalog()`, `check_folder()`, content hash |

### Published files (site repo)
| Kind | Path | Count | Bytes on disk (pretty-printed, indent=1) | Notes |
|---|---|---|---|---|
| Run records | `_data/crucible/runs/<YYYY-MM>/<run_uuid>.json` | 2053 | 4.74 MB (avg 2.3 KB; 4.0 MB minified) | one per run, never edited |
| Score records | `_data/crucible/scores/<YYYY-MM>/<run_uuid>.r<n>.<method>.json` | 2022 | 8.41 MB (avg 4.2 KB) | `items` is 6.50 MB of it, `groups` 0.81 MB |
| Status records | `_data/crucible/status/<run_uuid>.json` | 20 | 5.7 KB | each file is an array; all 20 have exactly 1 entry |
| Catalogs | `_data/crucible/catalog/{v1,v2,v3,v4}.json` | 4 | 505 KB (113, 113, 132, 147 KB) | one per suite. bundle-format.md's example lists `v1, v2, v2.1`, which is out of date |
| Corrections | `_data/crucible/corrections.json` | 1 | 3.0 KB | 12 model entries, 2 publisher entries |
| Model outputs | `crucible-data/outputs/<run_uuid>.txt` | 1831 | 3.31 MB of text (median 899 B, max 114 KB, none empty; 8.5 MB by `du` block size) | outside `_data`; fetched on demand |
| Display YAML | `_data/crucible_display.yml` | 1 | 1.5 KB | hand-authored |
| Fallback YAML | `_data/crucible_fallbacks.yml` | 1 | 4.0 KB | hand-authored |
| `data.json` template | `crucible/data.json` | 1 | 1.6 KB | Liquid; output generated at build time |
| `details.json` template | `crucible/details.json` | 1 | 255 B | Liquid; output generated at build time |

`_data/crucible/` is 4100 files, about 13.7 MB of JSON. Month folders come from `started_at` (`bundle.py:month`); folder matches the record's month in all runs and all scores (0 mismatches).

### What the page fetches (sizes computed by re-serialising the files minified)
| Fetch | Approx size | Contents |
|---|---|---|
| `/crucible/data.json` | ~5.0 MB | runs 4.0 MB + slim scores 0.55 MB + catalogs 0.44 MB + status + corrections + fallbacks + display |
| `/crucible/details.json` | ~7.0 MB | all 2022 full score records; fetched when a run detail is first opened (`D.loadDetails`, 2157) |
| `/crucible-data/outputs/<uuid>.txt` | 0.9 KB median | fetched when the "Model output" `<details>` opens (2264) |

### Growth (runs by `started_at`)
| Month | Runs | Run-file bytes | Score files |
|---|---|---|---|
| 2026-09 | 19 | 63 KB | 5 |
| 2026-10 (from 24 Oct) | 880 | 2.01 MB | 853 |
| 2026-11 (to 11 Nov) | 1154 | 2.67 MB | 1164 |

Date range 2026-09-02 to 2026-11-11. Activity is bursty: two days in September (5 and 14 runs), nothing until 24 Oct, then days of 8 to 303 runs (31 Oct 303, 11 Nov 253, 30 Oct 219, 3-5 Nov about 185-198 each) with several empty days (28 Oct, 8 Nov, others). About 2000 runs in the 19 days since 24 Oct. There is no pagination or per-suite split; everything is one request.

Join counts: 2022 scores for 1914 distinct runs (108 runs have two score records, rubric v2 and v3); 139 runs (6.8%) have no score (115 `completed`, 12 `timeout`, 7 `harness_error`, 4 `failed`, 1 null status); 0 scores point to a missing run; 222 runs (10.8%) have no output (161 timeout, 31 harness_error, 17 completed, 9 context_limit, 3 no_answer, 1 failed; by harness 192 direct, 14 opencode, 11 pi, 5 pool).

---

## 2. Entities and fields

### 2.1 Run record (`runs/*/*.json`, 2053)

Written by H at run time (from `meta.json`). P adds `output_ref` and `provenance.content_hash`, drops the `local` key (`runrecord.published`, `bundle.py:published_run`), and back-fills `metrics.output_tokens_per_s` for old runs (`derived_metrics`). Liquid passes it through unchanged into `data.json`.

Top level:

| Field | Type | Meaning | Example | Populated | Distinct | Who / use |
|---|---|---|---|---|---|---|
| `record` | string | constant `"run"` | | 100% | 1 | H |
| `format_version` | int | constant 3 | | 100% | 1 | H |
| `run_uuid` | string | identity; file name | `000267e7-e76c-45bf-8f03-6309f5c61d5a` | 100% | 2053 | H |
| `run_path` | string | local run dir `<provider_model>/<task>/<timestamp>` | `lmstudio_nvidia_nemotron-3-nano-omni/react-lead-form/20261104_172010` | 100% | 2053 | H; never read by the page |
| `legacy_run_id` | string/null | pre-3.0 run id | | 18.4% (377) | 378 | H (migrate); never read |
| `started_at` / `ended_at` | ISO string | UTC | `2026-11-04T17:20:30.837626+00:00` | 100% | 2053 each | H; only `started_at` read (sorting, date) |
| `elapsed_s` | float | wall seconds | `335.59` | 100% | 1730 (18 runs exactly 1200.02, the timeout) | H |
| `output_ref` | string/null | `outputs/<uuid>.txt` | | 89.2% (1831) | 1832 | P; a pure function of `run_uuid` (null when no output) |
| `local` | object | local-only data that P is documented to drop | `legacy_meta`, `checks`, `environment`, `tools`, `platform`, `watch` | 0.9% (19) | | H; leaked through P: the 19 are the 2026-09 `crucible-migrate` runs; 52 KB; never read |

`task` (100%):

| Field | Meaning | Populated | Distinct / values | Use |
|---|---|---|---|---|
| `task.id` | task slug | 100% | 57 (all exist in some catalog) | join |
| `task.version` | task version at run time | 99.7% (6 null) | 1: 1076, 2: 789, 3: 182 | join (`sameVersion`, 1099) |
| `task.rubric_version` | rubric version at run time | 97.0% (62 null) | 1-5 (695/797/306/141/52) | not used; the page joins on the catalog's pinned rubric version |
| `task.content_hash` | 16-hex hash | 97.0% | 81 | never read |
| `task.rubric_hash` | 16-hex hash (repeated in score) | 97.0% | 96 | never read |
| `task.alias` | pre-3.0 id e.g. `WRIT-3` | 18.4% (377) | 48 | join fallback (1096), never needed: 0 runs have a `task.id` missing from catalog ids |

`harness` (100%): `harness.id` (`direct` 1285, `pi` 644, `opencode` 119, `pool` 5); `harness.version` 34.7% populated (`1.4.0` 577, `opencode v2.1.4` 73, `1.2.0` 58, `opencode v2.2.1` 5; null for all `direct`/`pool`, 41 opencode, 9 pi), never read.

Harness x v4 catalog mode: chat/direct 1283, agentic/pi 644, agentic/opencode 107, chat/opencode 12, agentic/pool 5, agentic/direct 2. The last three (19 runs) are harness/mode combinations the catalog does not allow.

`model` (100%):

| Field | Type | Meaning | Example | Populated | Distinct | Who / use |
|---|---|---|---|---|---|---|
| `model.id` | string | provider-qualified id the harness called | `lmstudio/nvidia/nemotron-3-nano-omni` | 100% | 47 | H; equals `<provider>/<base>` in 95.1%; last-resort fallback for base only |
| `model.base` | string | model key with provider prefix stripped = model identity | `nvidia/nemotron-3-nano-omni` | 100% | 44 raw, 40 after corrections | H (`clean_base_model`); JS corrects (section 4) |
| `model.publisher` | string/null | namespace of the repo the weights came from (a packager or the maker) | `qwen`, `bartowski`, `mlx-community` | 83.8% (1721) | 24 (`qwen` 461, `openai` 239, `google` 121, `deepseek` 116, `nvidia` 98, `anthropic` 98, `ornith-ai` 62, `Qwen` 47, ...) | H |
| `model.artifact` | string/null | packaged repo downloaded | `nvidia/nemotron-3-nano-omni` | 29.9% (614) | 25 | H; never read |
| `model.format` | string/null | weight format | | 63.1% (1296): `mlx` 709, `gguf` 544, `splash` 43; null 757 (all 507 cloud + 250 local) | 3 | H; JS may fill |
| `model.quant` | string/null | quantisation | `Q4_K_M`, `4bit` | 72.3% (1484): `4bit` 456, `Q4_K_M` 346, `6bit` 192, `MXFP4` 146, `Q4_0` 112, `Q6_K` 80, `Q8_0` 47, `Q4_K_S` 40, `2bit` 39, `8bit` 26 | 11 | H; none of the cloud runs have one |
| `model.reasoning.requested` | string | requested level | | 100%: `default` 1719, `off` 254, `high` 41, `low` 39 | 4 | H |
| `model.reasoning.resolved` | string/null | level the server used | | 53.9% (1106): `on` 763, `off` 189, `low` 64, `high` 60, `xhigh` 30 | 5 | H |
| `model.reasoning.resolved_source` | string | how `resolved` was learned (revision 2) | | 24.4% (502; key absent otherwise): `unknown` 247, `server` 220, `requested` 35 | 3 | H |
| `model.context_loaded` | int/null | context length loaded | 100352 | 67.2% (1381); 0 cloud | 26 | H; never read |
| `model.variant_key` | string | `base|publisher|format|quant` (quant lowercased, `-` for missing, format `api` for cloud) | `nvidia/nemotron-3-nano-omni|nvidia|gguf|q4_k_m` | 100% | 71 | H; JS rewrites it and reads identity from it first (559-562) |
| `model.display` | string | pre-formatted label | `nemotron-3-nano-omni · Q4_K_M` | 100% | 63 | H; never read |
| `model.origin` | object | who trained the model (revision 1) | | 71.0% (1457); absent on 596 (29.0%) | | H (3.5.0+) |
| `model.origin.maker` | string/null | maker | `qwen` | 61.0% (1253); null on 204 of the 1457 | 16 (`qwen` 413, `openai` 190, `google` 118, `anthropic` 95, `deepseek` 64, `liquid` 48, ...) | H |
| `model.origin.source` | string | how maker was learned | | 100% of origin: `lmstudio-key` 893, `openrouter` 360, `gguf` 121, `none` 77, `ollama` 6 | 5 | H; JS adds `correction` |
| `model.origin.base_repo` | string/null | | | 0% (all null) | 1 | H |
| `model.origin.params` | int/null | parameter count | 35000000000 | 6.2% (127) | 6 | H; not read in core.js |
| `model.origin.active_params` | int/null | MoE active params | 3000000000 | 1.9% (38), single value | 1 | H; not read in core.js |

`endpoint` (100%):

| Field | Meaning | Populated | Values | Who |
|---|---|---|---|---|
| `endpoint.where` | `local` or `cloud` (H derives it from the provider: lmstudio/ollama = local, `runrecord.py:154`) | 100% | `local` 1546, `cloud` 507 | H |
| `endpoint.provider` | runtime / API | 100% | `lmstudio` 1540, `openrouter` 503, `ollama` 6, `opencode` 4 (these 4 are `where: cloud`) | H |
| `endpoint.device` | machine that served the weights | 70.9% (1455) | `Duskfall` 621, `Ironwood` 398, `Whitehall` 373, `Eclipse` 63; null 598 | H |
| `endpoint.served_via` | `LM Link` when a remote peer served | 35.9% (737) | 1 value | H |
| `endpoint.resolved_model` | slug OpenRouter resolved to | 11.3% (233) | 10 | H; never read |
| `endpoint.upstream` | OpenRouter upstream | object `{name, quant}` on 233 runs (11.3%), null on 1820 | `name` 28 distinct (`OpenAI` 62, `Claude Platform on AWS` 49, `Nebius` 20, ...); `quant` always null | H; name shown in run detail |
| `endpoint.app` | | 0% (always null) | | H |

`hardware`: null on 507 runs (every cloud run); object on 1546 (every local run):

| Field | Populated within the 1546 | Values |
|---|---|---|
| `hardware.key` | 95.7% (1479); null on 67 local runs | `m5-pro-48gb` 632, `m1-pro-32gb` 474, `rtx-5070-ti-16gb` 373 |
| `hardware.class` | 95.7% | `apple_silicon` 1106, `discrete_gpu` 373 |
| `hardware.cpu` | 95.7% | `Apple M5 Pro` 632, `Apple M1 Pro` 474, `AMD Ryzen 7 7700` 373 |
| `hardware.system_memory_gb` | 95.7% | 32.0 (847), 48.0 (632) |
| `hardware.accelerators` | non-empty 373 (the RTX box) | `[{name, memory_gb, count}]` |
| `hardware.label` | 99.7% (1542) | `Duskfall` 563, `Ironwood` 474, `Whitehall` 373, `Eclipse` 63, `Mac-168` 40, `redacted-host-a` 18, `redacted-host-b` 11 (the last three are raw DHCP host names) |
| `hardware.offload` | 0% (always null) | |

Key, cpu, class, memory and accelerators form three tuples, one per key. Only `hardware.key` (and `label` as a device fallback) is read.

`outcome` (100%):

| Field | Meaning | Populated | Values |
|---|---|---|---|
| `outcome.status` | normalised result | 99.95% (1 null) | `completed` 1609, `timeout` 286, `failed` 100, `harness_error` 38, `context_limit` 12, `no_answer` 7 |
| `outcome.harness_status` | raw harness string | 99.1% | `COMPLETE` 1613, `TIMEOUT` 284, `ERROR (exit 1)` 137, null 19; never read |
| `outcome.returncode` | | 100% | 0: 1643, 1: 296, 143: 104, 130: 10; never read |
| `outcome.timed_out` | | 100% | false 1767, true 286 |
| `outcome.invalid` | harness-time invalid mark `{marked_at, reason}` | object on 43 runs (2.1%), null on 2010 | 4 reasons: harness error before the model answered 38, contaminated (agent read crucible's checkout) 3, 8192-token context 2 |
| `outcome.leaks` | paths touched outside workspace | non-empty on 3 | never read |

`metrics` (key set varies: 13 keys on 1636 runs, 12 on 315, 11 on 54, 10 on 9, 9 on 20, 3 on 19):

| Field | Key present | Non-null | Use |
|---|---|---|---|
| `tokens_in`, `tokens_out` | 99.1% | 87.6% (1799) | run detail only |
| `model_responses` | 99.1% | 95.8% (1967) | never read |
| `tool_calls` | 100% | 35.6% (730; null for chat runs) | run detail, cell numbers, `V.hasToolCalls` |
| `ttft_s`, `ttft_avg_s`, `response_time_avg_s` | 99.1% | 89.5%, 89.6%, 95.8% | never read |
| `output_tokens_per_s` | 93.5% | 79.4% (1631) | decode speed (`runTps`, 94) |
| `cost_usd` | 97.7% | 46.4% (952; 504 are exactly 0) | cloud runs only (`runCost`, 526) |
| `cost_source` | 97.7% | 46.4%: `pi_estimate` 460, `openrouter_billed` 445, `opencode_estimate` 47 | never read; the 0-cost `*_estimate` rows are local runs, whose cost the page replaces with its electricity estimate |
| `reasoning_chars` | 81.6% | 49.8% (1023) | run detail only |
| `tests_passed`, `tests_failed` | 100% | 4.5% (92) | never read (scores carry `raw`) |

`provenance` (100%):

| Field | Populated | Values | Use |
|---|---|---|---|
| `crucible_version` | 81.6% (1676); null for the 377 migrated | 13 values (`2.2.0` 1011, `3.7.4` 160, `3.8.0` 110, `3.4.2` 99, ...) | run detail line |
| `crucible_commit` | 81.6% | 22 | never read |
| `crucible_dirty` | 81.6% | false 1608, true 68 | never read |
| `machine_id` | 97.7% (2005) | 4 | never read |
| `machine_label` | 97.7% | `Ironwood` 1594, `Duskfall` 275, `Mac-168` 103, `redacted-host-x` 33 | never read |
| `source` | 100% | `crucible-run` 1676, `crucible-migrate` 377 | never read |
| `content_hash` | 99.1% (2034); null on the 19 oldest | one per record | P; never read by the page (checked by `publish --check`) |
| `submitter`, `verification` | 0% (always null) | | reserved |

### 2.2 Score record (`scores/*/*.json`, 2022)

Written by H (scorer), one per run x rubric version x method. P copies it without `checked_text`. L slims it for `data.json`, and passes it whole into `details.json`.

| Field | Type | Meaning | Populated | Distinct / values | Page use |
|---|---|---|---|---|---|
| `record`, `format_version` | | `"score"`, 3 | 100% | 1 | identifies node |
| `run_uuid` | string | join key | 100% | 1914 | yes |
| `rubric_version` | int | | 100% | 1-5 (2: 831, 1: 609, 3: 379, 4: 148, 5: 55) | join |
| `method` | string | | 100% | `checks` 1641, `hidden_tests` 381 | join (the catalog also has `judge` tasks; no score record has method `judge`) |
| `rubric_hash` | string | | 100% | 67 | no (also dropped by L) |
| `scored_at` | ISO | | 100% | 2022 | no |
| `crucible_version` | string | | 92.4% (1867) | 16 | no |
| `raw.passed`, `raw.total` | number | points or tests passed / available | 100% | total: 30 values | run detail sentence (`scoreSentence`, 2200) |
| `raw.unit` | string | | 100% | `points` 1671, `tests` 351 | yes |
| `score` | number | 0-10 | 100% | 143 values; exactly 10.0 on 996 (49.3%) | yes; drives everything |
| `scale` | number | | 100% | always 10 | no |
| `capped_at` | number/null | | non-null 13.0% (263) | 5: 113, 4: 77, 3: 34, 6: 22 | run detail |
| `passed` | bool | | 100% | true 999, false 1023 | no (the page uses `score`) |
| `items` | array | per-check results | 100% non-empty; 16,626 entries | 14 types (`hidden_test` 10954, `items` 3027, `required_patterns` 1259, `time_options` 213, `forbidden_patterns` 212, ...) | details.json only |
| `items[].id/type/group/label/passed` | | | 100% | | details |
| `items[].detail` | string/null | | 70.4% non-empty | | details |
| `items[].share` | number | | 21.4% (3554) | | not in schema; not read |
| `items[].items` | array | sub-checks of an `items`-type check | 3411 entries have it | | not in schema; not read |
| `groups` | array | `{id, passed, total, detail}` per criterion | 100% non-empty; 7644 entries | | used only when `items` is empty (never, here) |

The schema lists only `id, group, label, passed, detail` for items; `type`, `share` and nested `items` exist in the data but not in the schema.

`data.json` keeps only `record, format_version, run_uuid, rubric_version, method, score, scale, capped_at, passed, raw, scored_at`: 0.55 MB instead of 6.95 MB minified.

### 2.3 Status record (`status/<uuid>.json`, 20 files / 20 records)

Array of records, append-only. Written by `crucible status`; P copies and appends.

| Field | Meaning | Populated |
|---|---|---|
| `record`, `format_version` | `"status"`, 3 | 100% |
| `run_uuid`, `at` (ISO), `by` | `by`: `maintainer` 12, `claude` 8 | 100% |
| `invalid` | `{reason}` | 19 of 20 (reasons: "OpenRouter 402: out of credits mid-run", "the 6bit instance was unloaded mid-sweep (LM Link peer_keepalive_timeout)...", "LM Link dropped mid-run...") |
| `withdrawn` | `{reason}` | 1 of 20 (an OpenRouter `~openai/gpt-luna-latest` run) |
| `valid` | `true` undoes an earlier mark | 0 |

None of the 20 runs with a status also has the run-time `outcome.invalid`; the 43 harness-marked runs are a separate set (see 3.14).

### 2.4 Catalog (`catalog/*.json`, 4)

Written entirely by P (`bundle.py:catalog`) from the repo's suites, `taxonomy.py` and task definitions; passed through Liquid as-is. The latest suite's catalog is rewritten when it changes; a past one never changes except `suite.status`.

Top-level:

| Field | Value | Notes |
|---|---|---|
| `format_version` / `format_revision` | 3 / v1 0, v2 0, v3 1, v4 2 | page uses `format_revision` only to pick among duplicate catalogs of one suite id (429) |
| `suite.id/.version/.cut_at/.status/.changelog_url` | `v4` / `4.0` / `2026-10-31` / `current` / GitHub URL | cuts: v1 10-28, v2 10-30, v3 10-30, v4 10-31; `status` is `current` only for v4; core.js does not read `changelog_url` |
| `crucible_version` | v1, v2: 3.4.1; v3: 3.6.1; v4: 2.2.0 | v4's value is lower than v3's (it is whichever Crucible build ran publish) |
| `scoring_policy` | `{coverage_min 0.75, in_progress_below 0.75, repeat_aggregate "mean"}` | identical in all 4 and in the fallback YAML; `repeat_aggregate` unused by the page |
| `modes` | `chat`, `agentic` (`label`, `blurb`, `order`) | 2; identical in all 4 |
| `areas` | 9: writing, math, geography, history, general, evals (chat); coding, research, everyday (agentic) as `{id, label, mode, order}` | identical in all 4 |
| `categories` | 14 `{id, label, weight}` | weights sum to 1.0; `label` = `id` with `_` to space, capitalised; identical in all 4 |
| `tiers` | `spark` (role `gate`, gate `{mean 8, min 5}`), `temper` (`headline`), `forge` (`stretch`) | identical in all 4 |
| `harnesses` | `opencode` [agentic], `pi` [agentic], `direct` [chat]; `label` == `id` | identical in all 4; `pool` (5 runs) is not listed |
| `tasks` | 51 / 51 / 55 / 61 entries | below |

Task status per suite: v1 51 (active 24, provisional 21, retired 6), v2 51 (33/5/13), v3 55 (31/8/16), v4 61 (39/6/16). v4 by tier: temper 37, forge 13, spark 11; by mode: chat 32, agentic 29; by scoring method: checks 34, judge 14, hidden_tests 13.

Task fields (v4, 61 tasks):

| Field | Populated | Values |
|---|---|---|
| `id`, `name`, `mode`, `area`, `category`, `tier`, `status`, `version`, `rubric_version`, `scoring{method,unit,total,scale}`, `criteria`, `summary`, `prompt` | 100% | area 9 values, category 14, version 1 (36) / 2 (20) / 3 (5), rubric_version 1-5; `scoring.scale` always 10; `scoring.total` 28 values |
| `aliases` | non-empty 83.6% (51) | |
| `weight` | non-null 63.9% (39 = exactly the active tasks) | 8 distinct values; sums to 0.95 over active tasks (category weights sum to 1.0) |
| `criteria[].max_score` | null for all 13 hidden_tests tasks | `criteria[].label` always equals `id` |
| `rules` | non-empty 55.7% (34) | 14 KB |
| `added_in` | non-null 78.7% (48) | v1 24, v2 16, v4 8, null 13 |

Duplication: the four catalogs total 441 KB minified, 218 KB of it `prompt` text. 37 of v3's 55 tasks are byte-identical in v4. `display.hidden_suites: [v1, v2]` hides two suites from the selector, but they are still shipped and parsed.

### 2.5 Corrections (`corrections.json`, 1 file)

Source `corrections.yaml`; P copies it whole (`bundle.py:corrections`, `add_corrections`), adding `record: "corrections"` and `format_version: 3`.

```
models[]     { base, to_base, maker, publisher?, reason }    12 entries
publishers[] { from, to }                                    2 entries (Qwen->qwen, ~openai->openai)
```

`base`, `to_base`, `maker`, `reason` are on all 12; `publisher` on 3 (`mlx-community/muse-glimmer-30b` gets mlx-community, `~openai/gpt-luna-latest` gets openai, `qwen3.8-27b-splash` gets incoai). All 12 `base` values match runs: 279 runs (13.6%) are rewritten: `ornith-1.5-9b` 61, `qwen3.8-27b-splash` 43, `ornith-1.5-35b-a3b` 43, `laguna-xs-2.1` 42, `qwen2.5-0.5b-instruct` 40, `mlx-community/muse-glimmer-30b` 20, `granite-4.2-3b-mlx@4bit` 11, `qwen2.5-1.5b-instruct` 7, `lfm2.5:24b` 6, `deepseek-v4.1-flash-free` 4, `nvidia/nemotron-3-ultra-550b-a55b:free` 1, `~openai/gpt-luna-latest` 1. The `Qwen` publisher spelling occurs on 47 runs, `~openai` on 1. Distinct `model.base`: 44 raw, 40 after corrections.

### 2.6 Display YAML (`_data/crucible_display.yml`)

Read as `payload.display`.

| Key | Value | Used at |
|---|---|---|
| `hidden_suites` | `[v1, v2]` | 512 |
| `energy.usd_per_kwh` | 0.183 | `runCost`, 526 |
| `energy.watts` | `m1-pro-32gb` 40, `m5-pro-48gb` 60, `rtx-5070-ti-16gb` 350 | `wattsOf`, 524 |

The three watts keys are exactly the three hardware keys in the runs. The 67 local runs with null `hardware.key` get no cost.

### 2.7 Fallback YAML (`_data/crucible_fallbacks.yml`)

Read as `payload.fallbacks` (`FB`); a catalog's own fields win.

| Key | Content | Overlap with catalogs |
|---|---|---|
| `scoring_policy` | coverage_min, in_progress_below (0.75) | duplicates every catalog |
| `modes` | `chat`, `agentic`: label, blurb, order | duplicates catalog `modes` (blurb capitalisation differs) |
| `combined` | label "Combined", blurb | page concept, in no catalog |
| `aggregate.label` | "Overall" | page concept |
| `tiers` | per tier: label, blurb, order, role, gate, `detail` (long prose) | duplicates catalog tiers (blurbs differ: "the basics" vs "the basics, a pass/fail gate"); `detail` is fallback-only |
| `areas` | 9 areas: `blurb`, `examples` (no label) | catalog areas carry `label` only; blurb and examples are fallback-only |
| `scoring_methods` | `checks`, `hidden_tests`: label, blurb, criteria_label | no entry for `judge`, which 14 v4 tasks use (renders the raw id) |

Consumed in `buildSuite` (1015-1075).

### 2.8 `data.json` output shape (Liquid)

```
{ "format": 3,
  "catalogs":    { v1: catalog, ... },                            // site.data.crucible.catalog | jsonify
  "runs":        { "2026-10": { "<uuid>": run, ... }, ... },      // site.data.crucible.runs | jsonify
  "status":      { "<uuid>": [status, ...], ... },                // site.data.crucible.status | jsonify
  "scores":      [ {record, format_version, run_uuid, rubric_version, method, score, scale,
                    capped_at, passed, raw, scored_at}, ... ],    // built in a Liquid loop, slim
  "corrections": corrections.json,
  "fallbacks":   crucible_fallbacks.yml,
  "display":     crucible_display.yml }
```

Jekyll turns folders into nested hashes, so the page ignores keys: `collect()` (389) walks `[catalogs, runs, scores, status]` and recognises nodes by `record === 'run' | 'score' | 'status'` or `suite && tasks[]`. `details.json` is `{"scores": <full nested score tree>}` (items and groups included); `loadDetails` re-walks it and indexes by `uuid|rubric|method` (`scoreKey`, 41).

### 2.9 Outputs (`crucible-data/outputs/<uuid>.txt`)

Plain text, the model's final answer (`checks.final_answer`). 1831 files, one per run with an `output_ref`, no orphans. Included in each run's `content_hash` (SHA-256 of the canonical JSON of the record without `provenance`, a NUL byte, and the output text).

---

## 3. Derivations in the page (`crucible-core.js`)

### 3.1 Loading
- `C.boot` (2491) fetches `data.json`; `C.data(payload, urls)` (500) builds `D`.
- `collect` (389): `scores[uuid|rubric|method]` and `scoresByRun[uuid]`; `status[uuid]` sorted by `at`; records with `format_version > 3` skipped (`newer`, 42); one catalog per suite id (highest `format_revision`, 429), ordered by version parts then `cut_at` (432-449).
- Suites: catalogs minus `display.hidden_suites` (512-514); `CURRENT` = first with `suite.status === 'current'` else first (517).

### 3.2 model
- Base after corrections. `identityOf` (551): `base: m.base || vk[0] || m.id || 'unknown'` (556).
- Short name: `shortName(base)` = last `/` segment (118); `modelName(base)` strips the maker prefix and a leading `~` (146); row label `rowLabel(cfg)` = `shortName(base)` + ` (reasoning <level>)` unless level is `default` (654).
- Model page key `modelKey` (927): `(maker ? maker + '/' : '') + modelName(base)`, e.g. `qwen/qwen3.5-9b`.

### 3.3 maker
- `makerInfo(x)` (914): the run's `model.origin.maker` if set (`inferred: false`); otherwise per base: `recordedMaker(base)` (898), the most common `origin.maker` among all runs of that base (tally `RECORDED`, 891-897; ties alphabetical); otherwise `makerFromBase(base)` (139, `inferred: true`).
- `makerFromBase` (139): `b = base.replace(/^~/, ''); KNOWN_BASE_MAKERS[b]` if present, else the prefix before `/` lowercased unless it is in `PACKAGERS = ['mlx-community','lmstudio-community','unsloth','bartowski']` (125), else null.
- `KNOWN_BASE_MAKERS` (128-135): 6 hand-kept entries (`laguna-xs-2.1`, `qwen2.5-0.5b-instruct`, `qwen2.5-1.5b-instruct`, `granite-4.2-3b-mlx@4bit`, `deepseek-v4.1-flash-free`, `mlx-community/muse-glimmer-30b`); it duplicates part of `corrections.yaml` and disagrees on granite (`ibm` vs `ibm-granite`). Since corrections run first and fill `origin.maker`, the table is reached only when that did not happen.
- Coverage of recorded maker: `origin.maker` non-null on 61.0% of runs (1253); 29.0% have no `origin`; 9.9% have `origin` with maker null.

### 3.4 packager (vs publisher)
- The run's `model.publisher` is treated as the packager of the weights: `identityOf` `publisher: known(vk.length ? vk[1] : m.publisher)` (559); `cfg.publisher = id.publisherLabel || id.publisher` (624); `cfg.packager = id.publisher.toLowerCase()` (626); `variant.weights.packager = cfg.publisher` (765).
- `D.packagerOf(x)` (851): `v.weights.packager` or `x.model.publisher`. `D.packagedBy(x)` (856): `p && p !== maker ? 'Packaged by ' + p : ''` with `maker = makerOf(base)`. A packager equal to the maker is not shown.
- The word "publisher" appears in the page only in the corrections spelling map (applied 477-484) and `publisherUrl` (307, which is actually the maker page route). `model.publisher == origin.maker` on 58.6% of runs (1204); the rest are repackagers (`bartowski` 40, `incoai` 43, ...) or null (332 runs, 16.2%).

### 3.5 variant
- A variant is the answer-changing part of a setup (comment 674-679). Built at 757-778: `recorded = !cfg.local || !!id.quant` (760); `weightsKey = cfg.local ? [id.publisher||'?', id.format||'?', id.quant||'?'].join('/') : 'api'` (761); `vkey = [cfg.base, recorded ? weightsKey : 'unrecorded:' + cfg.key, cfg.level, cfg.harness].join('|')` (762). Slug: `[quant or 'api', 'reasoning-<level>', harness]` joined with `~` (771).
- Dimensions `D.DIMENSIONS` (688-696): `model`, `weights` (labelled "Quant"), `reasoning`, `harness` (variant kind) and `where`, `machine`, `provider` (deployment kind). `variantDims(mode)` (1139): weights and reasoning, plus harness when the mode has more than one harness (only agentic).
- `variantLabel` (839): `"Q4_K_M · reasoning off"`, optionally with harness and model.

### 3.6 setup (configuration)
- `cfg` built by `buildConfigs` (596-650): runs grouped by `rawKey(id)` = `base|where|harness|reqDefault|` + the 7 `FIELDS = ['publisher','format','quant','reasoning','provider','hwKey','device']` (550, 576). A group with unrecorded (`'?'`) fields is merged into the one better-recorded compatible group (`compatible` 583, `strictlyMoreKnown` 589); if two or more candidates match it stays separate (604-615). `cfg.rowKey = base + '#' + level` (619).
- Slug (628): `[shortName(base), 'reasoning-<level>' unless default, quant (local), hwKey || device || 'local' (local) or provider || 'cloud', harness]`, slugified, joined with `~`, uniquified.
- Label `configLabel` (661): local `"<publisher> <quant | 'quant not recorded'> · <hardwareText> · <harness>"`, cloud `"via <provider> · <harness>"`.

### 3.7 deployment
- `deploymentFrom(local, hwKey, device, provider)` (716): key `local~<hwKey>`, else `local~device-<device>`, else `local~unrecorded`; cloud `cloud~<provider>` else `cloud~unrecorded`. Computed per run (745-752). `costKind` is `electricity` or `billed`.
- Label `deploymentLabel` (735): local `"<hwKey> (<devices>)"`, or the devices, or "machine not recorded"; cloud `"via <provider>"` or "provider not recorded". OpenRouter's `endpoint.upstream.name` is collected into `dep.upstreams` (748-751) but never splits a deployment.
- Provider is kept only for cloud, `hwKey` and `device` only for local (`identityOf`, 569-572).

### 3.8 leaderboard row
- `V.rows(keep, exclude)` (1773): groups the mode's setups by `cfg.rowKey` (base + reasoning level), computes `V.stats(cfg)` (1740) for each, drops groups with no counted run, sorts setups with `S.betterConfig` (1186: non-partial first, higher overall, more tasks done, more runs). The best setup becomes the row: `Object.assign({}, best, { rowKey, label: rowLabel(best.cfg), variants })`.
- Row stats (1740-1770): per-tier results `tier{id}`, gate `verdict{id}`, `provisional{id}`, `overall`, `time` = median `elapsed_s` of counted runs (`timeOf`, 534), `tps` (96), `cost` = mean `runCost` (535), `runs`, `progress {done,total,share}`, `inProgress = share < in_progress_below` (0.75).
- Tier score `tierScoreBy` (1649): weighted mean of per-task means over scored tasks; `coverage` = scored weight / total weight; `partial = coverage < coverage_min` (1672); `min` = lowest task mean.
- Task weights `V.taskWeights` (1607): `t.weight` if numeric, else category weight / number of active tasks in that category; equal weights if a tier sums to 0.
- Overall `V.aggregate` (1720): sum of the included tiers' 0-10 scores (max 10 per tier); partial if any tier is missing or partial.
- Gate `gateVerdict` (1683): `partial`, else `pass` if `score >= gate.mean && min >= gate.min`, else `fail`; gate from the tier with `role === 'gate'` (`S.gateOf`, 1131). `V.isRanked` (1826): ran, not in progress, overall non-null and not partial.
- Combined view `buildCombinedView` (1296): pairs chat and agentic setups that agree on every FIELD except harness (`pairKey`, 1316); row score is the sum over sections.

### 3.9 hardware key
- Source `run.hardware.key` (null for all cloud runs and 67 local runs). `hwKey: local ? known(hw && hw.key) : null` (570). `hwValue(cfg)` (670): `cfg.hwKey || '-'` for local, `'cloud'` otherwise. Energy: `wattsOf(run.hardware.key)` (524, 528). `hardwareText` (655): `hwKey (devices)`, or devices, or "hardware not recorded". Device fallback: `endpoint.device || hardware.label` (572, 641).

### 3.10 format
- `known(vk.length ? vk[2] : m.format)` (562): the third segment of `variant_key` wins over `model.format`. Cloud runs have `variant_key[2] = 'api'`, so `cfg.format = 'api'`. Quant: `vk[3]`, else `m.quant.toLowerCase()` (563).
- Fill at correction time (`applyCorrections`, 485-489, `formatOfQuant` 460): when `!m.format` and the run is local (`!(vk[2] === 'api')`), `/^i?q\d(_[a-z0-9]+)*$/` gives `gguf`, `/^(mlx-)?\d+bit$/` gives `mlx`, anything else null; it also sets `variant_key[2]` when that was `-` or empty, so the filled format enters the setup identity. In this data: of 250 local runs with null format, 148 (`Q4_0` 86, `Q4_K_M` 62) are filled `gguf`; `MXFP4` (40) and the 62 with no quant stay null.

### 3.11 reasoning mode
- `identityOf` (557-567): `requested = known(rs.requested)`, `resolved = known(rs.resolved)`, `explicit = requested && requested !== 'default'`, `reasoning: explicit ? requested : resolved`, `reqDefault: !explicit`. `level = id.reasoning || 'default'` (620). A default-requested run whose `resolved` is null (46.1% of runs) has level `default`; otherwise the level is the requested `off/low/high` or the resolved `on/off/low/high/xhigh`. `compatible` (583-586) will not merge a default-requested run with unknown resolved level into a setup that explicitly requested one. `resolved_source` is not read.
- Label: ` (reasoning <level>)` appended unless `default` (654).

### 3.12 harness
- `harness: (r.harness && r.harness.id) || 'unknown'` (558). A harness counts for a task only if the catalog's `harnesses[].modes` contains the task's mode (`harnessCounts`, 1078; applied at 1103 as state `harness`). The harness is part of setup identity (576) and variant identity (762); the combined view ignores it when pairing (1316).

### 3.13 Run state (the join), `buildSuite` (1006-1125)
Per run, in order: `withdrawn`: dropped (1093); task lookup `taskById[task.id] || taskById[aliasOf[task.id]] || taskById[aliasOf[task.alias]]` (1096), unknown goes to `S.other` (1097); `retired`: dropped (1098); invalid gives state `invalid`; version differs gives `older` (`t.version === null || task.version === t.version`, 1099); harness does not count gives `harness`; `t.status === 'active'` gives `counted`, else `provisional`. Score record: `store.scores[uuid|t.rubric_version|t.scoring_method]`, else any score at that rubric version, else (uncounted runs only) the newest rubric version (1107-1111). A counted run with no score increments `S.unscored`; only runs with a numeric score enter `counted`/`provisional`.

Result for v4 over the 2053 runs (a Python port of the same rules): counted 1674 (1666 scored, 8 unscored), older version 166, retired 92, invalid 62, provisional 54, harness 4, withdrawn 1. The 19 runs on disallowed harness/mode combinations land in several buckets depending on their task; only 4 reach the `harness` state in v4. For `judge` tasks `t.scoring_method` is `judge`, which no score record carries, so they rely on the "any score at that rubric version" fallback (1108).

### 3.14 Validity (`validity` 957, `invalidReason` 967)
Last status record wins: `withdrawn`, then `invalid`, then `valid === true`; with no status record, `run.outcome.invalid` non-null gives `invalid`, else valid. Two independent sources: 20 status files and 43 harness marks, with no overlap.

### 3.15 Outcome (`runOutcome`, 702)
`timed_out` if `outcome.timed_out || outcome.status === 'timeout'`; `finished` if `status === 'completed'`; anything else is `error` (text via `outcomeText` 710). Only `finished` runs feed quality in comparisons.

### 3.16 Cost and speed
- `runCost` (526): cloud runs use `metrics.cost_usd`; local runs use `watts[hardware.key] * elapsed_s / 3,600,000 * usd_per_kwh`. A local run's recorded `cost_usd` (0) is ignored.
- `runTps` (94): `metrics.output_tokens_per_s` when > 0; `tpsOf` returns the median and the count `n`.

---

## 4. How corrections are applied

- **Where**: in the page. `applyCorrections(store, payload.corrections)` is called at line 505 inside `C.data` and implemented at 453-492. Neither the harness nor `publish` applies them; run files keep the recorded values.
- **When**: once, immediately after `collect`, before any setup, variant, maker or suite is built. It mutates `store.runs[uuid].model` in place.
- **Matched on**: `model.base === entry.base` exactly (map `byBase`, 459); publisher: `model.publisher === publishers[].from` exactly. A corrections file with `format_version > 3` is ignored (456).
- **Effect on a matched base** (473-480): `base := to_base`; `variant_key[0] := to_base`; `maker` fills `model.origin.maker` only when the run has none (origin becomes `{...origin, maker, source: 'correction'}`); `publisher` fills `model.publisher` only when empty (and `variant_key[1]`); `model.correction := reason`. Publisher spelling: `model.publisher := to` and `variant_key[1] := to` (481-484).
- **Format fill**: see 3.10.
- **Provenance**: when anything changed, `model.recorded = {base, publisher, format, maker}`; run detail prints "Recorded as model X, packager Y, format not recorded (read from the quant); corrected: <reason>" (2285-2292).
- **Not touched**: `endpoint`, `hardware`, `task`, `harness`, `model.id`, `model.display`, `model.quant`. After correction `model.id` and `model.display` still show the recorded name.
- **Publish side** (`bundle.py:add_corrections`): rewrites `corrections.json` whole when it differs from the YAML. `crucible publish --check` warns on published `model.base` values that look un-normalised (packager prefix, format or quant tag, `~`, `:free`, no maker) with no correction entry. 11 distinct raw bases in the current runs lack a `maker/` prefix or contain `~`, `:` or `@`; all 11 have entries.

---

## 5. Always empty, constant, redundant, duplicated

### Always empty (all records of that kind)
- Run: `endpoint.app` (2053/2053 null), `hardware.offload` (1546/1546), `model.origin.base_repo` (1457/1457), `provenance.submitter` and `.verification` (2053/2053), `endpoint.upstream.quant` (233/233).
- Status: `valid` (0 of 20).
- Catalog: `criteria[].max_score` null on all 13 hidden_tests tasks in v4; `criteria[].label == id` on every criterion.

### Constant
- `record` and `format_version` (3) on every run/score/status; score `scale` = 10 (2022/2022) and catalog `scoring.scale` = 10 (61/61); catalog `modes`, `areas`, `categories`, `tiers`, `harnesses`, `scoring_policy` byte-identical in all 4 catalogs (`modes`, `tiers`, `scoring_policy` are also in the fallback YAML); `endpoint.served_via` has one value (`LM Link`); `model.origin.active_params` one value (3e9).

### Sparse
- `harness.version` 34.7%; `model.format` 63.1%; `model.quant` 72.3%; `model.reasoning.resolved` 53.9%; `resolved_source` 24.4%; `origin.params` 6.2%; `metrics.tool_calls` 35.6%; `hardware.key` 72.0% (1479); `legacy_run_id` / `task.alias` 18.4%; `endpoint.upstream` 11.3%; `model.artifact` 29.9%.
- All 507 cloud runs (24.7%) have `hardware: null` and null `format`, `quant`, `context_loaded`.

### Redundant within a run
- `variant_key` = `base|publisher|format|quant`: matches `model.base` and `publisher` on 100% and `format` on 100% (cloud `api`); its quant segment equals the lowercased `model.quant` on 65.3% (the rest are nulls recorded as `-`). The page reads identity from `variant_key` first and the separate fields only as fallback, then rewrites `variant_key` after correction, so it is both input and derived.
- `model.display` (short name plus quant) is derivable from base and quant (contains the quant on 72.3%); never read.
- `model.id` = `<provider>/<base>` on 95.1%.
- `elapsed_s` vs `started_at`/`ended_at`; `outcome.timed_out` vs `status == 'timeout'` (both 286); `harness_status` and `returncode` vs `status`.
- Hardware: `key` determines `cpu`, `class`, `system_memory_gb`, `accelerators` (three tuples for 1479 runs). Three machine-name fields carry overlapping host names: `endpoint.device`, `hardware.label`, `provenance.machine_label`; `machine_label == hardware.label` on 39.4%, `device == hardware.label` on 67.9%.
- `task.rubric_hash` (run) and `rubric_hash` (score) carry the same hash for matching rubric versions.
- `output_ref` is `outputs/<run_uuid>.txt` or null.
- `model.publisher == origin.maker` on 58.6%.

### Duplicated across files
- Catalog `prompt`, `summary`, `criteria`, `rules` are repeated per suite: 218 KB of 441 KB minified catalog bytes are prompts; 37 of 55 tasks identical between v3 and v4.
- Fallback YAML repeats catalog modes, tiers, scoring_policy. `KNOWN_BASE_MAKERS` in JS repeats part of `corrections.yaml`. The page also hard-codes `PACKAGERS` (mirroring Crucible's `origin.PACKAGERS`) and treats `direct`/`opencode`/`pi` through catalog `harnesses` only.
- Scores are on the wire twice: slim in `data.json` (0.55 MB) and full in `details.json` (7.0 MB).
- The 19 runs carrying `local` repeat their data: `local.legacy_meta` restates `run_id`, `run_uuid`, status, metrics, test info, environment; `environment`, `tools`, `watch`, `platform` appear both under `local` and under `local.legacy_meta`.
- Score `items[]` (16,626 entries) and `groups[]` (7644) restate checks that the catalog `criteria` and `rules` describe.

### Run fields the page never reads
`run_path`, `legacy_run_id`, `ended_at`, `harness.version`, `model.id`, `model.artifact`, `model.display`, `model.context_loaded`, `model.origin.base_repo/params/active_params`, `endpoint.resolved_model`, `endpoint.app`, `hardware.class/cpu/accelerators/system_memory_gb/offload`, `outcome` except `status`, `timed_out`, `invalid`, `metrics` ttft/response_time/model_responses/tests_*/cost_source, `provenance` except `crucible_version`, `task.content_hash/rubric_hash/rubric_version`, `local`. Minified subtree sizes across all runs, for scale: `model` 794 KB, `provenance` 583 KB, `metrics` 528 KB, `hardware` 245 KB, `local` 52 KB, of 4.0 MB total.

### Inconsistencies (facts)
- bundle-format.md lists catalogs `v1, v2, v2.1`; disk has `v1`-`v4`.
- Active task weights sum to 0.95 although category weights sum to 1.0.
- Catalog v4 `crucible_version` (2.2.0) is lower than v3's (3.6.1).
- 19 runs still carry `local` although publish is documented to drop it; those 19 also have null `content_hash`.
- bundle-format.md says keys are folder/file names but the page reads only records; `data.json` keys are discarded.
- The one `withdrawn` status is dated 2026-11-11, and run timestamps reach 2026-11-11, one day past the system date (2026-11-10) of this snapshot.
