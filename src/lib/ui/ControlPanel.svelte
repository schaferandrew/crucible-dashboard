<script lang="ts">
  // The one control panel every page uses (spec 6.3, data-model §1.2), bound to a DataContext.
  //
  //  - Section chips (Combined first), each with its task count.
  //  - Every facet as a multi-select, each option with the count it would leave given the other choices; an
  //    option that would leave nothing is disabled and shows 0 (B-19).
  //  - Tier include/exclude toggles, the provisional switch (remembered per viewer, B-13), "+ In progress".
  //  - "Filters (n on)", removable chips, Reset. Switching section prunes filter values the target lacks (B-08).
  //
  // The panel never touches the URL: the page's ContextState does (replaceState, B-02). A page passes the
  // dimensions it pins (a model page: ['model']); pinned dimensions are hidden.
  import { activeFilterCount, DIMS, type DataContext, type Dim } from '$lib/core/context';
  import { cap } from '$lib/core/format';
  import { panelCounts, panelFacet, type CountUnit } from '$lib/core/panel';
  import { changeSection, facetValueLabel, scope, type Scope } from '$lib/core/scope';
  import { viewFor } from '$lib/core/scoring';
  import { COMBINED, type Meta, type SuiteId, type SuiteIndex, type TierId } from '$lib/core/types';
  import FacetMenu from './FacetMenu.svelte';
  import { writeProvisional } from './prefs';
  import SuiteNotes from './SuiteNotes.svelte';
  import SuiteSelect from './SuiteSelect.svelte';

  /** The facets a panel offers by default. A page can pass fewer or more (`maker`, `model`, `provider`, `deployment`). */
  const DEFAULT_DIMS: Dim[] = [
    'harness',
    'where',
    'hw',
    'format',
    'quant',
    'packager',
    'reasoning',
    'maker',
    'model',
  ];

  const NAMES: Record<string, { name: string; all: string }> = {
    harness: { name: 'Harness', all: 'All harnesses' },
    hw: { name: 'Hardware', all: 'All machines' },
    format: { name: 'Format', all: 'All formats' },
    quant: { name: 'Quant', all: 'All quants' },
    packager: { name: 'Packager', all: 'All packagers' },
    reasoning: { name: 'Reasoning', all: 'All reasoning levels' },
    maker: { name: 'Maker', all: 'All makers' },
    model: { name: 'Model', all: 'All models' },
    provider: { name: 'Provider', all: 'All providers' },
    deployment: { name: 'Deployment', all: 'All deployments' },
    where: { name: 'Models', all: 'All' },
  };

  let {
    index,
    meta,
    ctx,
    onctx,
    pinned = [],
    dims = DEFAULT_DIMS,
    unit = 'rows',
    showInProgress = false,
    onprogress,
    sc: scProp,
    unknownSuite = null,
    label = 'Controls',
  }: {
    index: SuiteIndex;
    meta: Meta;
    ctx: DataContext;
    /** Called with the next context; the page applies it (ContextState.update). */
    onctx: (next: DataContext) => void;
    /** Dimensions the page pins (`['model']`, `['task']`): their facets are hidden. */
    pinned?: readonly string[];
    /** Which facets to offer, in order. */
    dims?: readonly Dim[];
    /** What the counts count: leaderboard rows, or setups (for a page with one model pinned). */
    unit?: CountUnit;
    showInProgress?: boolean;
    /** The "+ In progress" toggle is shown only when the page handles it. */
    onprogress?: (show: boolean) => void;
    /** The page's own scope, if it has one (saves recomputing it). */
    sc?: Scope;
    unknownSuite?: string | null;
    /** Accessible name of the panel region. */
    label?: string;
  } = $props();

  const sc = $derived(scProp ?? scope(index, ctx, { showInProgress }));
  const info = $derived(sc.view.info);
  const combined = $derived(sc.view.kind === 'combined');

  const sections = $derived(
    [
      ...info.modes.map((m) => ({
        id: m.id as string,
        label: m.label,
        n: viewFor(index, m.id).activeCount,
        blurb: m.blurb,
      })),
      ...(info.hasCombined
        ? [
            {
              id: COMBINED as string,
              label: info.combinedLabel,
              n: viewFor(index, COMBINED).activeCount,
              blurb: cap(info.catalog.labels.combined.blurb),
            },
          ]
        : []),
    ].sort((a, b) => Number(b.id === COMBINED) - Number(a.id === COMBINED)),
  );
  const hint = $derived(sections.find((s) => s.id === ctx.section)?.blurb ?? '');

  const shownDims = $derived(dims.filter((d) => !pinned.includes(d)));
  const facets = $derived(shownDims.map((d) => panelFacet(index, ctx, d, { unit, showInProgress })));
  // MAIN-PANEL-16: a facet with fewer than two values in the section is hidden; harness has no meaning in Combined
  const menus = $derived(
    facets.filter((f) => f.dim !== 'where' && f.distinct >= 2 && !(f.dim === 'harness' && combined)),
  );
  const whereFacet = $derived(facets.find((f) => f.dim === 'where'));
  const whereSet = $derived(ctx.filters.where);
  const counts = $derived(panelCounts(index, sc, unit));
  const inProgressCount = $derived(sc.rows.filter((r) => r.ran && r.inProgress).length);
  const provisionalTasks = $derived(
    info.tasks.filter((t) => t.status === 'provisional' && (combined || t.mode === ctx.section)),
  );

  // "Filters (n on)": pinned dimensions are the page's, not the reader's, so they don't count
  const nOn = $derived(
    activeFilterCount({
      ...ctx,
      filters: Object.fromEntries(Object.entries(ctx.filters).filter(([d]) => !pinned.includes(d))),
    }) + (showInProgress ? 1 : 0),
  );
  let open = $state(false); // the mobile "Filters" disclosure (below 640px)
  let openId: string | null = $state(null);
  let root: HTMLElement | undefined = $state();

  function setFilter(dim: Dim, values: string[]) {
    const filters = { ...ctx.filters };
    if (values.length) filters[dim] = new Set(values);
    else delete filters[dim];
    onctx({ ...ctx, filters });
  }
  function toggleValue(dim: Dim, value: string) {
    const cur = new Set(ctx.filters[dim] ?? []);
    if (!cur.delete(value)) cur.add(value);
    setFilter(dim, [...cur]);
  }
  function toggleTier(id: TierId) {
    const on = new Set(sc.view.aggTiers(ctx.exclude).map((t) => t.id));
    const exclude = new Set(ctx.exclude);
    if (exclude.has(id)) exclude.delete(id);
    else if (on.size > 1) exclude.add(id);
    onctx({ ...ctx, exclude });
  }
  function reset() {
    onprogress?.(false);
    const keep = Object.fromEntries(Object.entries(ctx.filters).filter(([d]) => pinned.includes(d)));
    onctx({ ...ctx, filters: keep, exclude: new Set() });
  }
  function setProvisional(on: boolean) {
    writeProvisional(on);
    onctx({ ...ctx, provisional: on });
  }
  function summary(dim: Dim): string {
    const set = ctx.filters[dim];
    if (!set || !set.size) return NAMES[dim]?.all ?? `All ${dim}`;
    const first = facetValueLabel(index, dim, [...set][0]!);
    return set.size > 1 ? `${first} + ${set.size - 1}` : first;
  }
  function closeOnOutside(ev: MouseEvent) {
    const hit = (ev.target as Element | null)?.closest?.('[data-facet]') as HTMLElement | null;
    if (openId && hit?.dataset.facet !== openId) openId = null;
  }

  const chips = $derived(
    DIMS.filter((d) => !pinned.includes(d)).flatMap((dim) =>
      [...(ctx.filters[dim] ?? [])].map((value) => ({
        dim,
        value,
        text: `${NAMES[dim]?.name ?? cap(dim)} ${facetValueLabel(index, dim, value)}`,
      })),
    ),
  );
</script>

<svelte:window onclick={closeOnOutside} />

<section class="panel" aria-label={label} bind:this={root}>
  <div class="row primary">
    <div class="field">
      <span class="lbl" id="section-lbl">Section</span>
      <div class="seg" role="radiogroup" aria-labelledby="section-lbl">
        {#each sections as s (s.id)}
          <button
            type="button"
            role="radio"
            aria-checked={ctx.section === s.id}
            title="{s.n} scored tasks"
            onclick={() => ctx.section !== s.id && onctx(changeSection(index, ctx, s.id))}
          >
            {s.label} <span class="count">{s.n}</span>
          </button>
        {/each}
      </div>
    </div>
    <SuiteSelect {meta} value={ctx.suite} onchange={(suite: SuiteId) => onctx({ ...ctx, suite })} />
    <button
      type="button"
      class="toggle-filters"
      aria-expanded={open}
      aria-controls="panel-filters"
      onclick={() => (open = !open)}
    >
      Filters ({nOn} on) <span aria-hidden="true">{open ? '▴' : '▾'}</span>
    </button>
  </div>
  {#if hint}<p class="hint muted">{hint}</p>{/if}

  <div class="row filters" id="panel-filters" class:open>
    {#if sc.view.showAgg && sc.view.tiers.length > 1}
      <div class="field">
        <span class="lbl" id="tiers-lbl">{info.overallLabel} score counts</span>
        <div class="seg" role="group" aria-labelledby="tiers-lbl">
          {#each sc.view.tiers as t (t.id)}
            {@const on = sc.view.aggTiers(ctx.exclude).some((x) => x.id === t.id)}
            {@const last = on && sc.view.aggTiers(ctx.exclude).length === 1}
            <button
              type="button"
              aria-pressed={on}
              aria-disabled={last}
              title={last
                ? `The ${info.overallLabel} score needs at least one tier`
                : on
                  ? `Leave ${t.label} out of the ${info.overallLabel} score`
                  : `Add ${t.label} to the ${info.overallLabel} score`}
              onclick={() => toggleTier(t.id)}
            >
              {on ? '✓ ' : ''}{t.label}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    {#if whereFacet && whereFacet.distinct >= 2}
      <div class="field">
        <span class="lbl" id="where-lbl">Models</span>
        <div class="seg" role="group" aria-labelledby="where-lbl">
          <button type="button" aria-pressed={!whereSet?.size} onclick={() => setFilter('where', [])}
            >All</button
          >
          {#each whereFacet.options as o (o.value)}
            <button
              type="button"
              aria-pressed={o.selected}
              aria-disabled={o.disabled}
              title={o.disabled ? `No ${o.label.toLowerCase()} models for these filters` : undefined}
              onclick={() =>
                !o.disabled && setFilter('where', o.selected && whereSet?.size === 1 ? [] : [o.value])}
            >
              {o.label} ({o.count})
            </button>
          {/each}
        </div>
      </div>
    {/if}

    {#each menus as f (f.dim)}
      <div class="field">
        <span class="lbl" aria-hidden="true">{NAMES[f.dim]?.name ?? cap(f.dim)}</span>
        <FacetMenu
          id="facet-{f.dim}"
          label={NAMES[f.dim]?.name ?? cap(f.dim)}
          summary={summary(f.dim)}
          active={!!ctx.filters[f.dim]?.size}
          options={f.options}
          open={openId === `facet-${f.dim}`}
          onopen={() => (openId = `facet-${f.dim}`)}
          onclose={() => (openId = null)}
          ontoggle={(v) => toggleValue(f.dim, v)}
          onclear={() => setFilter(f.dim, [])}
        />
      </div>
    {/each}

    {#if onprogress}
      <div class="field">
        <span class="lbl" id="show-lbl">Show</span>
        <div class="seg" role="group" aria-labelledby="show-lbl">
          <button type="button" aria-pressed={!showInProgress} onclick={() => onprogress(false)}>
            Finished
          </button>
          <button
            type="button"
            aria-pressed={showInProgress}
            class:faint={inProgressCount === 0}
            title={inProgressCount === 0
              ? 'Every model has finished ' + (combined ? 'every section' : 'this section')
              : undefined}
            onclick={() => onprogress(true)}
          >
            + In progress ({inProgressCount})
          </button>
        </div>
      </div>
    {/if}
  </div>

  {#if combined}
    <p class="note muted">Each row pairs one setup per section that differs only in harness.</p>
  {:else if sc.view.harnesses.length === 1}
    <p class="note muted">Every {sc.view.label} run uses the {sc.view.harnesses[0]} harness.</p>
  {/if}

  {#if provisionalTasks.length}
    <div class="prov">
      <label>
        <input
          type="checkbox"
          checked={ctx.provisional}
          onchange={(e) => setProvisional(e.currentTarget.checked)}
        />
        Include {provisionalTasks.length} provisional task{provisionalTasks.length === 1 ? '' : 's'}
      </label>
      <span class="muted">
        {#if ctx.provisional}
          Scores aren't comparable to {info.catalog.suite.name}.
        {:else}
          Not yet in {info.catalog.suite.name}'s scores; off by default.
        {/if}
      </span>
    </div>
  {/if}

  <div class="foot">
    <span class="count-line" aria-live="polite">Showing {counts.shown} of {counts.total} {counts.noun}</span>
    <span class="chips">
      {#each chips as c (c.dim + c.value)}
        <button
          type="button"
          class="chip"
          aria-label="Remove filter: {c.text}"
          onclick={() => toggleValue(c.dim, c.value)}
        >
          {c.text} <span aria-hidden="true">&times;</span>
        </button>
      {/each}
    </span>
    {#if nOn > 0}
      <button type="button" class="reset" onclick={reset}>Reset filters</button>
    {/if}
  </div>
  <SuiteNotes {index} {meta} unknown={unknownSuite} />
</section>

<style>
  .panel {
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    padding: var(--space-3) 0.9rem;
    margin-bottom: var(--space-4);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3) var(--space-5);
    align-items: flex-end;
  }
  .row.filters {
    margin-top: var(--space-3);
  }
  .field {
    display: grid;
    gap: 0.2rem;
  }
  .lbl {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  /* The live site's segmented control: a grey tray with the chosen segment raised */
  .seg {
    display: inline-flex;
    flex-wrap: wrap;
    padding: 3px;
    background: var(--tray);
    border-radius: var(--radius);
  }
  .seg button {
    background: none;
    border: 0;
    border-radius: var(--radius-sm);
    padding: 0.3rem 0.8rem;
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--fg);
  }
  .seg button[aria-checked='true'],
  .seg button[aria-pressed='true'] {
    background: var(--surface);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.18);
  }
  .seg button.faint {
    color: var(--faint);
  }
  .seg button[aria-disabled='true'] {
    color: var(--faint);
    cursor: not-allowed;
  }
  .count {
    color: var(--muted);
    font-size: 0.85em;
    font-weight: 400;
  }
  .hint,
  .note {
    margin: var(--space-2) 0 0;
    font-size: var(--text-sm);
  }
  .prov {
    margin-top: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius);
    background: var(--warn-soft);
    color: var(--warn);
    font-size: var(--text-sm);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-3);
  }
  .prov .muted {
    color: inherit;
  }
  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    margin-top: var(--space-3);
    min-height: 2rem;
  }
  .count-line {
    font-weight: 600;
    font-size: var(--text-sm);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .chip {
    background: var(--accent-soft);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-pill);
    padding: 0.1rem 0.6rem;
    font-size: var(--text-sm);
  }
  .reset {
    margin-left: auto;
    background: none;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    padding: 0.25rem 0.6rem;
    font-size: var(--text-sm);
  }
  .toggle-filters {
    display: none;
    width: 100%;
    background: none;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    padding: 0.4rem 0.6rem;
    text-align: left;
    font-size: var(--text-sm);
  }
  /* Below 640px the filter row folds behind "Filters (n on)" (MAIN-PANEL-27); Section and Suite stay */
  @media (max-width: 639px) {
    .toggle-filters {
      display: block;
    }
    .row.filters:not(.open) {
      display: none;
    }
    .seg button {
      padding: 0.3rem 0.55rem;
    }
  }
  @media (max-width: 359px) {
    .seg button {
      padding: 0.3rem 0.4rem;
      font-size: var(--text-xs);
    }
  }
</style>
