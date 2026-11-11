<script lang="ts">
  import { activeFilterCount, DIMS, type DataContext, type Dim } from '$lib/core/context';
  import { cap, fmtDate } from '$lib/core/format';
  import { changeSection, facetValueLabel, type Facet, type Scope } from '$lib/core/scope';
  import { viewFor } from '$lib/core/scoring';
  import { COMBINED, type Meta, type SuiteIndex, type TierId } from '$lib/core/types';

  let {
    index,
    meta,
    ctx,
    sc,
    facets,
    showInProgress,
    inProgressCount,
    onctx,
    onprogress,
    onprovisional,
  }: {
    index: SuiteIndex;
    meta: Meta;
    ctx: DataContext;
    sc: Scope;
    facets: Facet[];
    showInProgress: boolean;
    inProgressCount: number;
    onctx: (next: DataContext) => void;
    onprogress: (show: boolean) => void;
    onprovisional: (on: boolean) => void;
  } = $props();

  const info = $derived(sc.view.info);
  const combined = $derived(sc.view.kind === 'combined');

  const LABELS: Record<string, { name: string; all: string }> = {
    harness: { name: 'Harness', all: 'All harnesses' },
    hw: { name: 'Hardware', all: 'All machines' },
    format: { name: 'Format', all: 'All formats' },
    quant: { name: 'Quant', all: 'All quants' },
    packager: { name: 'Packager', all: 'All packagers' },
    reasoning: { name: 'Reasoning', all: 'All reasoning levels' },
  };

  const sections = $derived([
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
  ]);
  // Combined first when it exists, as the default view
  const orderedSections = $derived(
    [...sections].sort((a, b) => Number(b.id === COMBINED) - Number(a.id === COMBINED)),
  );
  const hint = $derived(orderedSections.find((s) => s.id === ctx.section)?.blurb ?? '');

  const dropdowns = $derived(
    facets.filter(
      (f) => f.dim !== 'where' && f.dim in LABELS && f.distinct >= 2 && !(f.dim === 'harness' && combined),
    ),
  );
  const whereFacet = $derived(facets.find((f) => f.dim === 'where'));
  const whereSet = $derived(ctx.filters.where);
  const provisionalTasks = $derived(
    sc.view.info.tasks.filter((t) => t.status === 'provisional' && (combined || t.mode === ctx.section)),
  );

  const nOn = $derived(activeFilterCount(ctx) + (showInProgress ? 1 : 0));
  let open = $state(false);
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
    onprogress(false);
    onctx({ ...ctx, filters: {}, exclude: new Set() });
  }
  function summary(dim: Dim): string {
    const set = ctx.filters[dim];
    if (!set || !set.size) return LABELS[dim]!.all;
    const first = facetValueLabel(index, dim, [...set][0]!);
    return set.size > 1 ? `${first} + ${set.size - 1}` : first;
  }
  function closeOthers(ev: MouseEvent) {
    for (const d of root?.querySelectorAll<HTMLDetailsElement>('details.facet[open]') ?? []) {
      if (!d.contains(ev.target as Node)) d.open = false;
    }
  }
  function onKeydown(ev: KeyboardEvent) {
    if (ev.key !== 'Escape') return;
    for (const d of root?.querySelectorAll<HTMLDetailsElement>('details.facet[open]') ?? []) {
      d.open = false;
      d.querySelector('summary')?.focus();
    }
  }

  const chips = $derived(
    DIMS.flatMap((dim) =>
      [...(ctx.filters[dim] ?? [])].map((value) => ({
        dim,
        value,
        text: `${cap(LABELS[dim]?.name.toLowerCase() ?? dim)} ${facetValueLabel(index, dim, value)}`,
      })),
    ),
  );
</script>

<svelte:window onclick={closeOthers} onkeydown={onKeydown} />

<section class="panel" aria-label="Leaderboard controls" bind:this={root}>
  <div class="row primary">
    <div class="field">
      <span class="lbl" id="section-lbl">Section</span>
      <div class="seg" role="radiogroup" aria-labelledby="section-lbl">
        {#each orderedSections as s (s.id)}
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
    {#if meta.suites.length > 1}
      <div class="field">
        <label class="lbl" for="suite">Suite</label>
        <select
          id="suite"
          value={ctx.suite}
          onchange={(e) => onctx({ ...ctx, suite: e.currentTarget.value as typeof ctx.suite })}
        >
          {#each meta.suites as s (s.id)}
            <option value={s.id}>{s.label}{s.id === meta.current_suite ? ' (current)' : ''}</option>
          {/each}
        </select>
      </div>
    {/if}
    <button type="button" class="toggle-filters" aria-expanded={open} onclick={() => (open = !open)}>
      Filters ({nOn} on) <span aria-hidden="true">{open ? '▴' : '▾'}</span>
    </button>
  </div>
  {#if hint}<p class="hint muted">{hint}</p>{/if}

  <div class="row filters" class:open>
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
              aria-pressed={whereSet?.has(o.value) ?? false}
              onclick={() =>
                setFilter('where', whereSet?.has(o.value) && whereSet.size === 1 ? [] : [o.value])}
            >
              {o.label} ({o.rows})
            </button>
          {/each}
        </div>
      </div>
    {/if}

    {#each dropdowns as f (f.dim)}
      <div class="field">
        <span class="lbl">{LABELS[f.dim]!.name}</span>
        <details class="facet">
          <summary class:active={!!ctx.filters[f.dim]?.size}>{summary(f.dim)}</summary>
          <div class="menu">
            <label class="opt">
              <input
                type="checkbox"
                checked={!ctx.filters[f.dim]?.size}
                onchange={() => setFilter(f.dim, [])}
              />
              <span>Show all</span>
            </label>
            {#each f.options as o (o.value)}
              <label class="opt">
                <input
                  type="checkbox"
                  checked={ctx.filters[f.dim]?.has(o.value) ?? false}
                  onchange={() => toggleValue(f.dim, o.value)}
                />
                <span>{o.label}</span>
                <span class="n">{o.rows}</span>
              </label>
            {/each}
          </div>
        </details>
      </div>
    {/each}

    <div class="field">
      <span class="lbl" id="show-lbl">Show</span>
      <div class="seg" role="group" aria-labelledby="show-lbl">
        <button type="button" aria-pressed={!showInProgress} onclick={() => onprogress(false)}
          >Finished</button
        >
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
          onchange={(e) => onprovisional(e.currentTarget.checked)}
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
    <span class="count-line" aria-live="polite">Showing {sc.visible.length} of {sc.totalRows} models</span>
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
  <p class="suite-line muted">
    {info.catalog.suite.name}{info.catalog.suite.version ? ` (version ${info.catalog.suite.version})` : ''} &middot;
    {info.tasks.filter((t) => t.status === 'active').length} scored tasks{info.catalog.suite.cut_at
      ? ` · cut ${fmtDate(info.catalog.suite.cut_at)}`
      : ''}
  </p>
</section>

<style>
  .panel {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    padding: 0.75rem 0.9rem;
    margin-bottom: 1rem;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.25rem;
    align-items: flex-end;
  }
  .row.filters {
    margin-top: 0.75rem;
  }
  .field {
    display: grid;
    gap: 0.2rem;
  }
  .lbl {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  .seg {
    display: inline-flex;
    flex-wrap: wrap;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    overflow: hidden;
  }
  .seg button {
    background: none;
    border: 0;
    padding: 0.3rem 0.65rem;
    border-right: 1px solid var(--border);
  }
  .seg button:last-child {
    border-right: 0;
  }
  .seg button[aria-checked='true'],
  .seg button[aria-pressed='true'] {
    background: var(--accent-soft);
    font-weight: 600;
  }
  .seg button.faint {
    opacity: 0.55;
  }
  .seg button[aria-disabled='true'] {
    cursor: not-allowed;
  }
  .count {
    color: var(--muted);
    font-size: 0.8em;
  }
  select,
  summary {
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    padding: 0.3rem 0.6rem;
    background: var(--surface);
  }
  details.facet {
    position: relative;
  }
  summary {
    cursor: pointer;
    list-style: none;
    white-space: nowrap;
    max-width: 14rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary::after {
    content: ' \25be';
    color: var(--muted);
  }
  summary.active {
    background: var(--accent-soft);
    font-weight: 600;
  }
  .menu {
    position: absolute;
    z-index: 10;
    top: calc(100% + 4px);
    left: 0;
    min-width: 14rem;
    max-height: 18rem;
    overflow: auto;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    box-shadow: 0 6px 18px rgb(0 0 0 / 0.15);
    padding: 0.25rem;
  }
  .opt {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    padding: 0.25rem 0.4rem;
    border-radius: 4px;
    cursor: pointer;
  }
  .opt:hover {
    background: var(--accent-soft);
  }
  .opt .n {
    margin-left: auto;
    color: var(--muted);
    font-size: 0.8em;
  }
  .hint,
  .note,
  .suite-line {
    margin: 0.4rem 0 0;
    font-size: 0.85rem;
  }
  .prov {
    margin-top: 0.6rem;
    padding: 0.4rem 0.6rem;
    border-radius: 6px;
    background: var(--warn-soft);
    font-size: 0.9rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
  }
  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
    margin-top: 0.75rem;
    min-height: 2rem;
  }
  .count-line {
    font-weight: 600;
    font-size: 0.9rem;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .chip {
    background: var(--accent-soft);
    border: 1px solid var(--border-strong);
    border-radius: 999px;
    padding: 0.1rem 0.6rem;
    font-size: 0.8rem;
  }
  .reset {
    margin-left: auto;
    background: none;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    padding: 0.25rem 0.6rem;
  }
  .toggle-filters {
    display: none;
    width: 100%;
    background: none;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
    text-align: left;
  }
  @media (max-width: 639px) {
    .toggle-filters {
      display: block;
    }
    .row.filters:not(.open) {
      display: none;
    }
    .field {
      flex: 1 1 auto;
    }
  }
</style>
