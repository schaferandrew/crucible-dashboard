# Crucible dashboard: data model and pipeline (Phase 1 proposal)

Status: **draft for approval**. Nothing in Phases 2-4 starts until this is approved.
Inputs: [behaviour-spec.md](behaviour-spec.md) (449 checklist items, OQ-01..20), [data-inventory.md](data-inventory.md),
[jank.md](jank.md) (J-01..J-24), [golden-numbers.json](golden-numbers.json).

Hosting (decided): a new repo `schaferandrew/crucible-dashboard`, SvelteKit + `adapter-static`, served at
`/crucible-dashboard/` by GitHub Pages via Actions.

---

## 0. The idea in one paragraph

Today the browser receives raw records and *works out* what they mean (corrections, maker, packager, format,
setup identity, run eligibility), on every page, in 2,500 lines of closure. The rewrite splits that into
three layers, each with exactly one home:

| Layer | What it answers | Where it runs | Output |
|---|---|---|---|
| **1. Record** | what happened (immutable observation) | harness at run time; `crucible publish` copies it | bundle records (format 3 today, format 4 for new runs) |
| **2. Resolve** | what it *is*: canonical model, maker, artifact, variant, deployment, setup; validity; per-suite run state | `crucible site-data` (Python, in the crucible repo, run by CI) | normalised entity tables + per-suite cells + per-run detail files |
| **3. Aggregate** | how it *scores*: tier scores, gate, overall, ranking, Combined pairing, paired comparison, filters | typed pure TS module `src/lib/core/` (build-time prerender **and** client for filter changes) | leaderboard rows, matrix, heatmap, etc. |

**Design philosophy: filters drill down, they never gate the first view.** The first load shows the
full, unfiltered picture: every model, quant, packager, harness and deployment, with each row's best setup
and its variants within reach. Filters (quant, format, packager, hardware, reasoning, harness) exist to narrow
and compare *if and when* the reader wants more. In practice:
- the data split is by suite and by detail depth (index → task/model → run), **never by a filter dimension**,
  so the initial payload is never a filtered subset;
- every filter is computed client-side from the same index already loaded, with no fetch;
- defaults are "all"; nothing is pre-selected to keep the page small;
- only deeper detail (a task's runs, a model's runs, one run's items, an output) is fetched on demand.

No rule lives in two layers. Corrections, maker inference, format-from-quant and setup merging are all layer 2,
once. Scoring is layer 3, once. The page never patches data.

---

## 1. Entities and identity

All IDs are deterministic strings built from *resolved* IDs of their parts. They are opaque to the page (branded
TS types, never `split`), readable in URLs, and collision-free by construction, so no `~2` suffixes (OQ-17).
Unknown parts get the literal `unrecorded`; they never merge into a better-recorded entity by guesswork.

| Entity | Identity (stable ID) | Example ID | Recorded on the run | Derived in layer 2 |
|---|---|---|---|---|
| **maker** | registry slug | `qwen`, `ibm-granite` | `model.maker` (format 4) / `model.origin.maker` (3) | from the model registry when the run's value is missing; else `unknown` |
| **model** | `<maker>/<name>` | `qwen/qwen3.5-9b` | `model.base` (raw key as the runtime called it) | registry alias lookup on the raw base → canonical model; label, family, params from registry |
| **artifact** (the weights) | `<model>~<packager>~<format>~<quant>`, or `<model>~api` for cloud | `qwen/qwen3.5-9b~lmstudio-community~gguf~q4_k_m` | `model.packager` (was `publisher`), `model.format`, `model.quant` | packager spelling normalised (registry); format from quant **only** via a declared publish rule, tagged `format_source: quant` |
| **variant** (what changes the answer) | `<artifact>~r-<level>~<harness>` | `…~q4_k_m~r-default~direct` | `model.reasoning.{requested,resolved}`, `harness.id` | `level` = requested if explicit, else resolved, else `default` (unchanged rule) |
| **machine** | registry slug | `duskfall` | `serving_host` (format 4) / `endpoint.device` / `hardware.label` (3) | host-name aliases (`Mac-168`, `redacted-host-a`) → machine; machine → hardware key, watts |
| **deployment** (where it ran) | `local~<hardware key>` / `cloud~<provider>` | `local~m5-pro-48gb`, `cloud~openrouter` | `endpoint.where/provider`, `hardware.key` | hardware key from the machine registry when the run's key is null (fixes most of the 67) |
| **setup** (a leaderboard candidate) | `<variant>@<deployment>` | `…~direct@local~m5-pro-48gb` | — | pure composition |
| **leaderboard row** | `<model>~r-<level>` (unchanged grouping) | `qwen/qwen3.5-9b~r-default` | — | layer 3 picks the best setup per row, as today |
| **run** | `run_uuid` | `000267e7-…` | everything | per-suite `state` (counted / provisional / older / retired / invalid / harness / withdrawn / unknown-task), chosen score |
| **score** | `run_uuid` + `rubric_version` + `method` | — | score record | which one a suite uses (unchanged rule) |
| **status** | `run_uuid` + `at` | — | status record | validity = last status wins, else `outcome.invalid` (unchanged rule) |
| **task / suite** | `task.id` within a suite catalog | `v4/react-lead-form` | catalog | alias → id resolved once (377 legacy runs) |

Model "version" is part of the canonical name (`qwen3.5` vs `qwen3.8`); the registry may carry `family` and
`version` fields for grouping, but they are not part of the ID.

### 1.1 What changes about setup identity

Today `buildConfigs` groups runs by 7 fields and then **fuzzy-merges** groups with unrecorded fields into a single
"compatible, better-recorded" group (order- and history-dependent; J-04). In the rewrite:

- A run's setup ID is a pure function of its own record + the registries.
- A run with an unrecorded field lands in an `unrecorded` setup and is *shown as such*, unless a registry
  entry says otherwise (see §2). `crucible publish --check` lists every such run so it can be fixed at the source.
- **Behaviour change B-03**: some setups that merge today will split. Phase 2 reports the exact delta against
  `golden-numbers.json` before anything ships; if it is large we add explicit registry entries rather than
  bring back inference.

### 1.2 One data context for every page

Today each page, and each block within the model page, has its own selection logic. The variant picker, the
deployments table, the variants table and the A/B block each resolve "what's selected" with different fallbacks
(MODEL-PAGE-03, PICK-02, DEP-01, VAR-01). The rewrite has one pattern everywhere:

```ts
type DataContext = {
  suite: SuiteId;
  section: SectionId | 'combined';          // default 'combined' wherever it exists (B-18)
  filters: Partial<Record<Dim, Set<string>>>; // Dim = model | maker | quant | format | packager | reasoning
                                              //       | harness | where | hw | provider | deployment
  focus?: SetupId;                          // the one setup a detail block is about, if the reader picked one
  provisional: boolean; exclude: Set<TierId>;
};
scope(index, ctx) -> { setups, cells, rows }  // pure, in src/lib/core
```

- **One URL codec** reads and writes `DataContext` for every route (same param names on every page).
- **Pages are a context with some dimensions pinned.** The leaderboard is the context with nothing pinned. A model
  page is the same context with `model` pinned, a task page pins `task`, and compare pins a set of setups. They use the
  same filter chips, the same `scope()` and the same counting.
- **On the model page, variant and deployment are ordinary filters.** Picking a quant, reasoning level, harness or
  deployment sets a filter, as it does on the leaderboard. Every block (tiles, by-area bars, deployments table,
  variants table, tasks, other runs) is derived from the same `scope()`, so they can't disagree. Clicking a row
  in the deployments or variants table sets that filter, and clicking it again clears it. Rows outside the current
  filters stay visible but dimmed, with a count of what is hidden.
- **The unfiltered model page is the whole model** (drill-down philosophy): headline tiles for its best setup, every
  variant and every deployment listed. Narrowing only happens when the reader asks.
- **A/B** is a derived block. Given the scope, it pairs setups that differ in exactly one dimension on the same
  recorded deployment, with the same rule as today.
- Stores hold only the `DataContext` and UI chrome state (open groups, compare ticks). Everything else is derived.

---

## 2. Corrections, done cleanly

**Principle:** fix at record time when possible; otherwise fix in layer 2 from a reviewed registry. Never in the page.
Published records stay byte-identical forever; the correction is an *interpretation*, stored next to them.

`corrections.yaml` becomes a small registry directory in the crucible repo, published into the bundle like
`corrections.json` is today:

```
registry/
  makers.yaml     # id, label, url                          (replaces KNOWN_BASE_MAKERS + maker guessing)
  models.yaml     # id (maker/name), label, aliases[] (raw bases), params?, family?, reason per alias
  packagers.yaml  # id, label, spellings[] (Qwen -> qwen, ~openai -> openai), is_packager: bool
  machines.yaml   # id, label, host_aliases[], hardware_key, watts, class
  overrides.yaml  # rare per-run fixes keyed by run_uuid list, each with a reason (e.g. format unknown but provable)
```

- **Record time** (`origin.py`, `runrecord.py`): the harness looks the raw base up in `models.yaml` and writes the
  canonical `model.id` + `maker` directly. New runs need no correction. Unknown models record `maker: null` and
  `crucible run` warns, so the registry gets the entry the same day.
- **Layer 2** (`crucible site-data`): every run, old or new, is resolved through the registry. The result carries
  `resolution: {model_from: alias|recorded, maker_from: recorded|registry|unknown, format_from: recorded|quant|override, notes[]}`,
  which the run detail shows as today's "Recorded as … corrected: <reason>" line.
- **Guarantees** checked by `crucible publish --check`: every published raw base resolves to a registry model or is
  explicitly `unknown`; every alias has a reason; no two aliases collide; makers referenced exist; every local run
  resolves to a machine and hardware key, or is listed.
- Deleted from the page: `applyCorrections`, `KNOWN_BASE_MAKERS`, `PACKAGERS`, `makerFromBase`, `recordedMaker`
  majority vote, `formatOfQuant`, the `variant_key` parser. The `ibm` vs `ibm-granite` conflict disappears (registry says `ibm-granite`).

---

## 3. Bundle format

**Recommendation: format 4 for new run records; existing format-3 records are not rewritten.**

Because the site no longer reads bundle records directly (it reads layer-2 output), the bundle's job is only
"faithful archive + input to `site-data`". So:

- `crucible site-data` reads **both** format 3 and format 4 records. The "migration" of the 2,053 existing runs
  is that reader: a pure, tested function `v3 → internal`, run through `crucible`, never a hand edit and never
  a rewrite of published files. Content hashes stay valid.
- Format 4 (run records only; score/status/catalog stay format 3, revision bumped where noted):

| Change | Why |
|---|---|
| `model.publisher` → `model.packager` (namespace the weights were downloaded from; may equal the maker) | J-06: "publisher" meant three things |
| `model.maker` top-level, `model.id` = canonical model ID when the registry knows it, `model.raw_base` = what the runtime called it | J-03/J-05: fix at record time |
| `model.format` always set for local runs, with `format_source: runtime|filename|unknown` | J-07 |
| `serving_host` (machine that served the weights) and `harness_host` (machine that ran the harness), replacing `endpoint.device` / `hardware.label` / `provenance.machine_label` | J-14 |
| drop `variant_key`, `display`, `run_path`, `endpoint.app`, `hardware.offload`, `origin.base_repo`, `provenance.submitter/verification`; `local` must never be published (publish rejects it) | J-12, inventory §5 |
| `hardware` reduced to `{key}`; the rest lives in `machines.yaml` | J-12 |

- Catalog revision 3: carries all display text currently in `_data/crucible_fallbacks.yml` (area blurbs/examples,
  tier detail, scoring-method labels including `judge`). Scoring fields of a past suite stay frozen; display
  fields may be revised, and `--check` enforces that split. The fallback YAML is deleted (J-10).
- Bundle home: moves from `schaferandrew.github.io/_data/crucible` + `crucible-data/outputs` to
  `crucible-dashboard/bundle/` via `crucible publish --from-bundle <old> --to <new>` (copies, verifies every
  content hash; no record changes). The 19 legacy runs with a leaked `local` key and null hash are copied as-is
  and flagged by `--check` (they're already published; we don't edit them, `site-data` ignores `local`).

- **The dashboard repo's `bundle/` is the source of truth** for every published result (the maintainer's
  runs and, later, community submissions; issue #3). Local run folders are staging. `crucible publish` writes a
  generated `bundle/manifest.json` (`run_uuid → content_hash, submitter, path`) and applies one idempotent rule
  set against it: unknown uuid → add; same uuid and hash → no-op; same uuid, different hash → reject. Re-running
  publish is always safe. The manifest and rules are Phase 2 work.

*Alternative considered:* rewrite all 2,053 records to format 4 through publish with `migrated_from` provenance.
Rejected: it doubles the archive's churn and breaks immutability for no consumer benefit.

---

## 4. What the site loads

CI (`.github/workflows/deploy.yml`): install crucible at the version pinned in `.crucible-version` →
`crucible site-data bundle/ static/data/` → `vite build` (prerenders every route) → deploy. **Generated data
is not committed**; the repo holds the bundle and the app.

```
static/data/                       (generated, gitignored)
  meta.json                        suites list, current suite, build time, crucible version, format
  <suite>/index.json               catalog index (no prompts/rules), entities used by this suite
                                   (models, makers, artifacts, variants, deployments, setups), and CELLS
  <suite>/tasks/<task>.json        task prompt, rules, criteria + slim runs of that task (for task page & matrix-cell clicks)
  <suite>/models/<model>.json      slim runs of that model in this suite (model page)
  runs/<run_uuid>.json             one run's detail: record summary, resolution notes, score items/groups, status
  outputs/<run_uuid>.txt           model output (unchanged)
  recent/<YYYY-MM>.json            slim run list per month (runs page, paginated)
```

**Cells** are the key to keeping first load flat: one entry per `setup × task` with the per-suite state already
applied: `{n, mean, n_finished, mean_finished, state}` (counted vs provisional kept separate). Every main-page
view (leaderboard, matrix, heatmap, scatter, Combined, all filters) and the todo/compare pages are computable
from cells + entities. Per-setup time / tok/s / cost medians depend on which tiers are included, so each setup
carries them precomputed for every *included-tier set × provisional on/off* (2^tiers × 2 = 16 today; if a suite
ever has more than 5 tiers, fall back to per-cell value arrays). Size therefore scales with setups × tasks, **not
with runs**.

Prerendering: the default view of each route is rendered to HTML at build time by the same TS core, so the
leaderboard is visible before any JSON is fetched; the client then loads `index.json` for interaction.

**Size targets (gzip), enforced by a CI check:**

| What | Today | Target |
|---|---|---|
| Main page first load (HTML + JS + CSS + data) | ~0.75 MB data + ~7k lines unminified JS, growing ~0.35 MB gz/month | **≤ 250 KB total**, data ≤ 100 KB, flat as runs grow |
| Open one run | 1.0 MB gz (all details) | **≤ 10 KB** (one file) |
| Task page | 0.7 MB gz | ≤ 120 KB, grows ~1 KB/month per task |
| Main-thread work on load | full join of all runs | O(cells); no run-level work |

Cache: SvelteKit's hashed asset names; data URLs carry the build `version`; `runs/*.json` and `outputs/*` are immutable.

---

## 5. Jank items: disposition

| ID | Disposition | How |
|---|---|---|
| J-01 monolithic data.json | **Fixed** | per-suite index of entities + cells; prerendered HTML; size budget in CI |
| J-02 details.json all-in-one | **Fixed** | `runs/<uuid>.json` on demand |
| J-03 runtime corrections | **Fixed** | registry resolved in layer 2 (and at record time for new runs); page has no correction code |
| J-04 fuzzy string identity | **Fixed** | deterministic composed IDs; no merging; `--check` lists unrecorded fields (B-03) |
| J-05 maker inference | **Fixed** | `makers.yaml` + `models.yaml`; `unknown` is explicit; JS tables deleted |
| J-06 publisher ×3 | **Fixed** | `maker` and `packager` only, everywhere (records format 4, entities, UI) |
| J-07 format/quant guessing | **Fixed** (moved) | harness records format; for old runs the quant rule runs once in layer 2 and is tagged `format_from: quant`, visible in run detail |
| J-08 duplicated rules | **Fixed** | one TS core module; pages import it; run state precomputed in layer 2. The four divergences resolve to the core definitions (B-06) |
| J-09 hard-coded constants | **Fixed / kept** | palette, breakpoints → design tokens; `MAX_COMPARE`, paired-comparison thresholds, label limits → one typed `config.ts`; UI copy in `strings.ts`. Kept as code constants, documented (HC-02/03/05/17) |
| J-10 fallbacks.yml shadows catalog | **Fixed** | display text moves into catalogs (revision 3); fallback file deleted; unknown IDs still render generically |
| J-11 Liquid builds JSON | **Fixed** | Liquid gone; Python writes JSON |
| J-12 dead/redundant run fields | **Fixed** for the site, **kept** in the archive | site payload never carries them; format 4 stops recording them; format-3 records untouched |
| J-13 all catalogs + prompts everywhere | **Fixed** | hidden suites not built at all; prompts/rules only in `tasks/<task>.json` |
| J-14 three machine fields | **Fixed** | `machines.yaml`; `serving_host` vs `harness_host` in format 4; watts move from display YAML to machines |
| J-15 string-keyed joins | **Fixed** | typed IDs + Maps; the only composite key is the documented, never-parsed entity ID |
| J-16 global mutable state | **Fixed** | pure functions `(data, query) → view model`; Svelte stores for UI state only |
| J-17 runs page broken | **Fixed** (B-05) | rebuilt on the same core, monthly shards, paginated |
| J-18 catch-all errors, silent skips | **Fixed** | load-time validation (zod or hand-written guards from the schemas); per-view error boundaries; "N runs not shown: reasons" line |
| J-19 perf hot spots | **Fixed** | no O(G²) merge; Maps; aggregation is O(cells) |
| J-20 accessibility | **Fixed** | semantic tables/links, route focus management, axe check in CI |
| J-21 dead code | **Fixed** | not ported |
| J-22 cache busting | **Fixed** | hashed assets, immutable per-run files |
| J-23 hash routing | **Fixed** (B-01) | path routes + query params; legacy hash links translated by redirect stubs at `/crucible/` |
| J-24 refuted | **Kept** as a check | `--check`: local run must resolve to a machine + hardware key |

---

## 6. Behaviour changes against behaviour-spec.md

Everything not listed here keeps parity with the checklist.

| # | Change | Spec items / OQ |
|---|---|---|
| B-01 | **URLs.** Base `/crucible-dashboard/`. Entity pages use paths: `/task/<task>`, `/model/<maker>/<name>`, `/run/<uuid>` (run detail gets its own shareable route; the panel still opens in place). View state moves from the hash to query params (`?suite=v4&mode=chat&exclude=forge&harness=pi…`, same names and value grammar). Compare: `/compare?s=<setup>,<setup>`. Old `/crucible/#…` links: after cutover the `/crucible/*` pages become tiny redirect stubs that translate the old hash grammar (including the legacy `&compare=` and `&setup=` forms, ROUTE-12) to new URLs. | ROUTE-01..12 |
| B-02 | **History policy** (one rule, OQ-09): filter/sort/toggle changes `replaceState`; navigating to another entity (task, model, run, compare, section) pushes. | ROUTE-11, OQ-09 |
| B-03 | **No fuzzy setup merging.** Runs with unrecorded artifact fields form `unrecorded` setups unless the registry resolves them. Delta vs golden measured in Phase 2. | §2.3 setup identity, OQ-17 |
| B-04 | **Setup IDs replace slugs** in compare/model URLs; they never get `~2` suffixes and don't change when new data arrives. Old slugs map via the redirect stub using a `legacy-slugs.json` generated once from the current site. | OQ-17, CMP-*, MODEL-* |
| B-05 | **Runs page rebuilt**: suite filter works; uses the suite's chosen score (not max over rubrics); outcome filter uses core classes (`harness_error` counts as error); invalid/withdrawn shown with a badge, not silently mixed; paginated by month; cards link to `/run/<uuid>`. | RUN-PAGE-01..10, OQ-01 |
| B-06 | **One definition each** for: provisional (`status == 'provisional'`; any *unknown* status is treated as provisional and labelled with its raw value, OQ-14), outcome classes (`runOutcome`), best score (suite's pinned rubric), local vs cloud (`deployment.where`). | J-08, OQ-14 |
| B-07 | **Rank** always means rank by Overall; it does not renumber when sorting by another column. | OQ-10, MAIN-LB-11 |
| B-08 | **Section switch** clears every filter value the target section doesn't have and keeps the rest (today only harness and hw are reset); the hidden harness filter no longer applies in Combined. | OQ-04, OQ-06 |
| B-09 | **Cost label** says "mean per run" on the leaderboard and "mean of per-task means" on compare (numbers unchanged). | OQ-20 |
| B-10 | **Hidden suites** (v1, v2) are not built or shipped at all; a direct `?suite=v1` falls back to current with a notice (same as an unknown suite today). | SUITE-*, J-13 |
| B-11 | **Display text per suite** comes from that suite's catalog, so past suites show their own blurbs rather than today's fallback text; `judge` gets a proper label. | J-10 |
| B-12 | **Dates and numbers** formatted in UTC with a fixed `en` locale (avoids hydration mismatch). | OQ-15, RUN-PAGE-07 |
| B-13 | **`?provisional=1`** is honoured once and then rewritten into the current query (no stale override). `localStorage` remembers the last choice as today. | OQ-19 |
| B-14 | **Maker of Granite** becomes `ibm-granite` everywhere (was `ibm` via the JS table in some paths). | J-05 |
| B-15 | **Bars** chart keeps plotting Overall (code behaviour); AGENTS doc is corrected instead. Name truncation fixed at the coded 29+"…". | OQ-03, OQ-05 |
| B-16 | Dead paths not ported: `V.provisionalScore` cell note, task page `renderStub` button, compare duplicate notes. | OQ-07, OQ-11, OQ-12 |
| B-17 | Model page section `mode` goes into the URL. | OQ-13 |
| B-18 | **Combined is the default section** on the leaderboard (no `mode` param → Combined), on model and maker pages, and in compare when the setups span sections. It falls back to the first section only when a suite has fewer than two sections or the entity ran in only one. | MAIN-URL-02/03, MODEL-PUB-02, MODEL-PAGE-03 |
| B-19 | **Model page selection rebuilt on the shared `DataContext` (§1.2).** Variant picker, deployments table and variants table become filters over one scope. Gone: the "closest variant" jump with dashed chips (PICK-02) and the per-block fallbacks. Instead, values that would leave nothing in scope are disabled with a count of 0, and the selection only changes when the reader changes it. The URL uses filter params instead of `variant=`/`deployment=` (legacy params translated). | MODEL-URL-01/04, MODEL-PAGE-03, MODEL-PICK-01/02, MODEL-DEP-01, MODEL-VAR-01 |

Kept as is, deliberately: todo has no Combined and no filters (OQ-08); scatter y-axis scales differ by page (OQ-16);
narrow-card tooltip differences (OQ-18) get parity, not redesign; status records stay unversioned-checked like today but
are validated at publish (OQ-02).

---

## 7. Testing and parity

- **Layer 2 (Python):** unit tests for the v3 reader, registry resolution, IDs, validity and run state; a golden test
  that reproduces today's per-suite state counts (v4: counted 1674, older 166, retired 92, invalid 62,
  provisional 54, harness 4, withdrawn 1) except where B-03 deliberately differs, with the diff written out.
- **Layer 3 (TS):** vitest tests that rebuild every leaderboard/filter scenario in `golden-numbers.json` from the
  generated `index.json`. Expected diffs (B-03, B-07, B-14) are listed in a `golden-diff.md` the reviewer signs off.
- **Pages:** each checklist item ticked with a Playwright assertion or a screenshot pair (1400 px, 375 px) against the live site.
- **Fixtures:** the 12 MB live snapshot in `docs/rewrite/fixtures/` stays until cutover, then is deleted.

---

## 8. Decisions I need from you

1. **Approve the three-layer split** (resolve in Python `crucible site-data`, score in TS). The alternative is doing
   layer 2 in TS too (one language, but then corrections/registry live outside the harness and can't be applied at record time).
2. **Approve "no fuzzy merge" (B-03)**, accepting that some setups may split until registry entries are added.
3. **Approve format 4 without rewriting old records** (§3).
4. **Approve moving the bundle** into `crucible-dashboard/bundle/` (and `crucible publish --to` pointing there).
5. Anything in §6 you want kept at strict parity instead.
6. **Approve the shared `DataContext` (§1.2)** and the model-page rebuild on it (B-19), plus Combined as the default (B-18).
