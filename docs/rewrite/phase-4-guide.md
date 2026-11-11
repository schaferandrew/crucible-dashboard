# Phase 4 guide for page porters

Everything shared lives in `src/lib/ui/`, `src/lib/core/` and `src/lib/paths.ts`. **Never edit shared files**:
if you need a change there, describe it in your report and carry on with a local workaround.

## Conventions

- One route folder per page (`src/routes/<page>/`). Page-only components, shaping code and tests go in
  `src/lib/pages/<page>/`.
- Pages are a `DataContext` with some dimensions pinned (data-model §1.2). Don't write your own filter logic.
- Every internal link comes from `$lib/paths` (`link`, `taskHref`, `modelHref`, `runHref`, `compareHref`); ids
  are opaque, never split them.
- Dates and numbers: `$lib/core/format` only (UTC, fixed locale).
- Colours, spacing, type: CSS variables from `src/lib/ui/tokens.css`. Heat cells: `heat()` from `$lib/ui/heat`
  (AA text colour per cell). Local/cloud: `.tag.local` / `.tag.cloud`.
- History (B-02): filter/sort/toggle changes `replaceState` (ContextState does it); links and `goto` push.
- Each block of a page goes in `<ErrorBoundary what="the matrix">`; show `<Empty>` instead of a blank block;
  say what was left out with `<NotShown counts={...}>` (J-18).
- Document the checklist IDs you cover in your report.

## Components (`$lib/ui/…`)

| Component | Use |
|---|---|
| `PageHeader {title, docTitle?, crumbs?, breadcrumbs?}` | First thing on every page: breadcrumbs, the single `<h1>` (focus target), `<title>`. Children = lede. |
| `ContextState` (`contextState.svelte`) | Owns the DataContext: `new ContextState({meta, index, pin?})`, `onMount(() => cs.init())`, `afterNavigate(({type}) => type !== 'enter' && cs.syncFromUrl())`. Gives `cs.index`, `cs.ctx`, `cs.update`, `cs.unknownSuite`, `cs.loading`, `cs.failure`, `cs.href(path, params)`. `pin: {model: new Set([id])}` forces a dimension and keeps it out of the URL. |
| `ControlPanel` | `index, meta, ctx, onctx={cs.update}` plus `pinned` (dims to hide: `['model']`, `['task']`), `dims`, `unit` (`'rows'` or `'setups'` counts), `showInProgress`/`onprogress`, `sc` (your scope, optional), `unknownSuite`. Section chips, facets with counts (zero options disabled), tier toggles, provisional (localStorage), in-progress, summary, reset. |
| `SuiteBar` / `SuiteSelect` / `SuiteNotes` | For a page without a ControlPanel (the panel embeds them). |
| `ResponsiveTable` | `rows, columns: Column<T>[], rowKey, caption, sort?, onsort?, href?, cell?` snippet `(row, col, layout)` switching on `col.id`. Table at ≥ 640 px, cards below. `rowHeader: true` marks the name column (link target when `href` is given). |
| `Loading`, `Empty`, `ErrorBoundary {what, error?, onretry?}`, `NotShown {counts}` | States. |
| `Breadcrumbs`, `TabStrip` | Used by the shell; you rarely touch them. |

Core helpers you will want: `scope()`, `panelFacet()`/`panelCounts()` (`core/panel`), `changeSection()`,
`translateLegacyUrl()` (`core/legacy`), `runLinkFor(fetch, suite, setupId, taskId)` in `$lib/data` (the run a
matrix cell opens, from the lazily fetched `cell-runs.json`; link with `runHref`).

## A minimal page

```svelte
<script lang="ts">
  import { afterNavigate } from '$app/navigation';
  import { onMount, untrack } from 'svelte';
  import { scope } from '$lib/core/scope';
  import { ContextState } from '$lib/ui/contextState.svelte';
  import ControlPanel from '$lib/ui/ControlPanel.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  let { data } = $props();
  const cs = untrack(() => new ContextState({ meta: data.meta, index: data.index }));
  const sc = $derived(scope(cs.index, cs.ctx));
  onMount(() => cs.init());
  afterNavigate(({ type }) => type !== 'enter' && cs.syncFromUrl());
</script>
<PageHeader title="…" crumbs={[{ label: '…' }]} />
<ControlPanel index={cs.index} meta={data.meta} ctx={cs.ctx} onctx={cs.update} {sc} unknownSuite={cs.unknownSuite} />
```

See `src/routes/+page.svelte` (leaderboard) and `src/routes/run/[id]/+page.svelte` for working examples.

## Screenshots

Start your own server on a free port (5173 may be taken by another session): `npx vite dev --port 5199` (or
`npm run build && npx vite preview --port 5199`). Then

```
npm run shots -- --page <name> --new <path-under-base> --live <live-url> --port 5199
```

writes `docs/rewrite/shots/<name>/{new,live}-{1400,375}.png` (full page, light theme, reduced motion). `--only new`
or `--only live` takes one pair. Needs Chromium once: `npx playwright install chromium`. Stop your server after.
