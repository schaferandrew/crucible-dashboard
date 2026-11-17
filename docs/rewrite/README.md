# Dashboard rewrite: start here

The SvelteKit MVP is implemented on `phase-4` in [PR #6](https://github.com/schaferandrew/crucible-dashboard/pull/6).
The next step is cleanup and validation, then a separate portfolio dashboard cutover. The rest of the portfolio stays Jekyll.

Read these in order:

1. [MVP handoff](mvp-handoff.md): current architecture, verified fixes, remaining parity gaps and rollout plan.
2. [Data model](data-model.md): the design and deliberate B-01…B-23 behaviour changes. These supersede matching legacy checklist items.
3. [Behaviour spec](behaviour-spec.md): the November 10 legacy snapshot, with stable checklist IDs. Its unchecked boxes are inventory, not a statement that all features remain unimplemented.
4. [Page parity reports](parity/main.md): each page's implementation notes; follow the other files in `parity/` for task, model, compare, runs, todo and about.
5. [Golden diff](golden-diff.md) and `tests/allowlist.ts`: precisely permitted numerical differences from the old dashboard.

[Data inventory](data-inventory.md), [jank audit](jank.md) and [Phase 2a report](phase-2a-report.md) are historical evidence.
The Phase 2a report predates later registry changes (notably Eclipse hardware); use the current generator and golden diff for current results.
[Phase 4 guide](phase-4-guide.md) records porting conventions; its original parallel-agent restrictions do not govern normal maintenance.

For the generated JSON contract, read `docs/site-data-format.md` in
[Crucible's Phase 2 branch](https://github.com/schaferandrew/crucible/blob/phase-2/docs/site-data-format.md).
Records and identity corrections belong to Crucible, not this app's components.
