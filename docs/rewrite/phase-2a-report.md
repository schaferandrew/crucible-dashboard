# Phase 2a report: the registry and the resolver

Worktree: `/Users/schafer/Developer/crucible/.claude/worktrees/agent-a99949178810e9b38`
Branch: `phase-2a-registry` (from `origin/main` 6faa751). Not pushed, no PR.
Release: Crucible 3.10.0 (minor), `uv lock` done, CHANGELOG entry added. Full suite: 707 passed, 80 skipped.

Commits:
1. `5998e5e` Add the registry (registry/*.yaml), its resolver and publish integration
2. `fdca81a` Registry docs, tests, schemas and the 3.10.0 release

## What was built

- `registry/{makers,models,packagers,machines,overrides}.yaml`; `corrections.yaml` deleted (git rm).
- `crucible/registry.py`: `load(source)` (repo yaml, bundle folder, or its `registry/` folder of JSON), `Registry.problems()`,
  `Registry.resolve_run(run) -> Resolution` (frozen), `Resolution.{artifact_id,variant_id,deployment_id,setup_id,unrecorded}`,
  `Registry.energy_cost`, `Registry.files()` (published form), `default()`.
- `crucible/bundle.py`: publish writes `registry/<name>.json` (validated, `record: registry`, `format_version: 3`, `name`),
  refuses to publish on registry problems, and still writes `corrections.json` in the exact old shape, now generated
  (`bundle.corrections(reg)`). `format_revision` 2 -> 3. `--check` adds registry problems (errors) and warnings: unresolved
  `model.base` (with run counts), local runs with no machine / hardware key (with host names), runs carrying `local` or a null
  content hash. Existing checks kept.
- `crucible/origin.py`: `capture()` fills a missing `origin.maker` from the registry (source becomes `registry` or `<src>+registry`). Record format unchanged.
- Five `registry-*.schema.json` files (package-data glob already covers them), `tests/test_registry.py` (47 tests), docs
  (`docs/bundle-format.md` Registry section, README, AGENTS.md, the publish-results and sync-runs-usb skills).

Schema choices beyond the spec (all optional fields): alias-level `packager` (see "Decisions"), alias-level `legacy_to_base`
(keeps `ornith-ai/Ornith-1.5-9B` casing in the generated corrections.json), hardware `cpu` and `system_memory_gb`,
`machines.hardware` may be null (Eclipse).

## Registry stats

| | |
|---|---|
| makers | 18 |
| models | 40 (every canonical model in the published runs; all 40 have a maker) |
| aliases | 12 (all from corrections.yaml, reasons verbatim) |
| packagers | 22 (5 repackagers: mlx-community, lmstudio-community, unsloth, bartowski, incoai; 17 maker namespaces); spellings: `Qwen`, `~openai` |
| hardware keys | 3 (watts 40 / 60 / 350 from crucible_display.yml, usd_per_kwh 0.183) |
| machines | 4: duskfall, ironwood, whitehall, eclipse |
| overrides | 0 |
| models with unknown maker | none. Every model has an evident maker namespace. Left as two makers on purpose: `z-ai` (OpenRouter) and `zai-org` (LM Studio); they are different models (glm-5.3-flash vs glm-4.7-flash), not merged. |

KNOWN_BASE_MAKERS: all 6 entries are covered by corrections aliases; the one conflict (granite) resolves to `ibm-granite`.

Host names:
- Mapped to duskfall: `Duskfall`, `Mac-168` (two IP-style DHCP names were later removed from the registry; those runs resolve through endpoint.device). Proof: all four carry hardware key `m5-pro-48gb`, no
  `served_via`, and `provenance.machine_id` `m_9482e089d1c3`, the id of the 268 runs labelled Duskfall on both device and label.
- ironwood has two `machine_id`s (`m_09df208c24c5`, `m_f554f42a74a5`): each only ever appears with machine_label Ironwood and key `m1-pro-32gb` when it served itself.
- `provenance.machine_id` is the harness host, not the serving host (e.g. Ironwood driving Whitehall over LM Link). So the resolver uses it only for a run with no device and no `served_via`.
- Unmapped: none by name. 4 local runs have no host at all (no device, no label, served via LM Link, harness machine_id `m_09df208c24c5`), so they can't be proven and stay unresolved.
- Eclipse (63 runs): its hardware was never recorded (key, cpu, memory all null), so it has no hardware key in the registry.

## Resolution stats (all 2,053 published runs, no exceptions)

- Maker coverage: recorded 61.0% (1,253) -> resolved **100.0%** (+800 from the registry).
- `model_from`: recorded 1,774, alias 279, unknown 0. 40 distinct canonical models.
- `maker_from`: recorded 1,253, registry 800, unknown 0.
- `packager_from`: recorded 1,721, none 332 (cloud runs with no publisher, local runs that recorded none; no registry default applies).
- `format_from`: recorded 1,296, cloud (`api`) 507, **quant 148** (matches the page's 148 gguf fills), none 102 (MXFP4 40 + 62 with no quant).
  Note: I added the value `cloud` to the spec's enum so cloud `api` isn't mislabelled.
- Local runs (1,546): machine resolved 1,542 (device 1,455 and hardware.label 87, so the label-only runs, including the Mac-168 and IP-style-host ones, now resolve); hardware key 1,479 (all recorded; the registry adds none, because the 67 unkeyed runs are Eclipse 63 + the 4 hostless ones). The design doc's hope that machine lookup "fixes most of the 67" does not hold: Eclipse has no known hardware.
- Distinct ids: 69 artifacts, 149 variants, 6 deployments, **157 setups**.
- Runs in a setup with an `unrecorded` part: **391 runs in 42 setups** (all local, missing: packager 328, format 102, quant 62, hardware key 67; a run can miss several). These are the B-03 split candidates; not compared against golden-numbers.json (stage 2b).
- Integration test (skipped when the site repo is absent) asserts zero exceptions, maker coverage >= max(61%, recorded), a setup_id for every run, URL-safe ids, and prints this distribution.

## Decisions and things I could not decide

1. **Packager is per alias, not per model.** `qwen3.8-27b-splash` -> incoai must not give packager incoai to ordinary `qwen/qwen3.8-27b` runs; `~openai` and muse-glimmer likewise. Model-level `packager` is supported and unused. Legacy corrections.json `publisher` comes from the alias packager only.
2. **A recorded maker wins over the registry** (spec), with a note on disagreement. None disagree in the published data.
3. **A raw base resolves by exact alias or case-insensitive model id.** Record-time `origin` fill looks up the cleaned base (`clean_base_model`), so a new run of a base that keeps a packager prefix (e.g. `mlx-community/muse-glimmer-30b`) is not filled at record time; it still resolves in layer 2 via its alias.
4. `energy_cost` uses the resolved hardware key (recorded, else the machine's); identical to the page on the published data.
5. Cloud-only models have no `label`, `family` or `params`: only fields a source states were filled. Maker `url` omitted (would be guessing).
6. Format 4 support is by shape only (tested with a synthetic record): `model.id` is trusted only when it is a registry id; otherwise it falls back to `model.raw_base`.
