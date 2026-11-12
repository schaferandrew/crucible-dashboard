<script lang="ts">
  import { afterNavigate } from '$app/navigation';
  import { onMount, untrack } from 'svelte';
  import { cap, fmtCost, fmtDate, fmtScore, fmtSeconds } from '$lib/core/format';
  import { loadMonth } from '$lib/pages/runs/data';
  import { OUTCOME_CLASSES, OUTCOME_LABEL, type OutcomeClass } from '$lib/core/outcome';
  import {
    NO_FILTERS,
    SORTS,
    isSortKey,
    monthLabel,
    rowMatches,
    sortRuns,
    stateCounts,
    stateLabel,
    taskTable,
    toRow,
    type RunFilters,
    type RunRow,
    type SlimRun,
    type SortKey,
  } from '$lib/pages/runs/shape';
  import { runHref } from '$lib/paths';
  import { ContextState } from '$lib/ui/contextState.svelte';
  import ControlPanel from '$lib/ui/ControlPanel.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import ErrorBoundary from '$lib/ui/ErrorBoundary.svelte';
  import { heatStyle } from '$lib/ui/heat';
  import Loading from '$lib/ui/Loading.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import ResponsiveTable from '$lib/ui/ResponsiveTable.svelte';
  import type { Column } from '$lib/ui/table';

  let { data } = $props();

  const PAGE = 50;

  const cs = untrack(() => new ContextState({ meta: data.meta, index: data.index }));

  // Months loaded so far, newest first. The first one is in the prerendered page; older ones on demand.
  let loaded = $state.raw<{ month: string; runs: SlimRun[] }[]>(
    untrack(() => (data.firstMonth ? [{ month: data.firstMonth, runs: data.firstRuns }] : [])),
  );
  let monthLoading = $state(false);
  let monthError = $state<string | null>(null);
  const nextMonth = $derived(data.months[loaded.length] ?? null);

  let filters = $state.raw<RunFilters>(NO_FILTERS);
  let sort = $state<SortKey>('newest');
  let limit = $state(PAGE);

  const suite = $derived(cs.ctx.suite);
  const tasks = $derived(taskTable(cs.index));
  const all = $derived(loaded.flatMap((m) => m.runs.map((r) => toRow(r, suite, cs.index, tasks))));
  const states = $derived(stateCounts(all));
  // Everything but the state/outcome picks, so the selects can show what each would leave
  const inScope = $derived(all.filter((r) => rowMatches(r, cs.ctx, NO_FILTERS)));
  const matched = $derived(all.filter((r) => rowMatches(r, cs.ctx, filters)));
  const sorted = $derived(sortRuns(matched, sort));
  const visible = $derived(sorted.slice(0, limit));
  const outcomeN = $derived(
    (o: OutcomeClass) =>
      inScope.filter(
        (r) => r.outcome === o && (filters.state === 'all' || (r.state ?? 'none') === filters.state),
      ).length,
  );
  const stateN = $derived(
    (s: string) =>
      inScope.filter(
        (r) => (r.state ?? 'none') === s && (filters.outcome === 'all' || r.outcome === filters.outcome),
      ).length,
  );

  const harnessLabel = (id: string) => cs.index.catalog.harnesses.find((h) => h.id === id)?.label ?? id;
  function setupText(r: RunRow): string {
    const s = r.setup;
    if (!s) return r.setupId ?? '—';
    const where = s.where === 'local' ? (s.labels.hw ?? 'local') : (s.labels.provider ?? cap(s.where));
    return [
      harnessLabel(s.harness),
      s.reasoning === 'default' ? null : `reasoning ${s.reasoning}`,
      s.quant && s.quant !== 'unrecorded' ? s.quant : null,
      where,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  const columns: Column<RunRow>[] = [
    { id: 'model', header: 'Model', rowHeader: true, value: (r) => r.model },
    { id: 'task', header: 'Task', value: (r) => r.task },
    { id: 'setup', header: 'Setup', value: (r) => setupText(r) },
    { id: 'outcome', header: 'Outcome', value: (r) => OUTCOME_LABEL[r.outcome] },
    { id: 'state', header: 'State', value: (r) => stateLabel(r.state ?? 'none') },
    { id: 'score', header: 'Score', align: 'end', value: (r) => fmtScore(r.score) },
    { id: 'time', class: 'nowrap', header: 'Time', align: 'end', value: (r) => fmtSeconds(r.elapsed) },
    { id: 'cost', class: 'nowrap', header: 'Cost', align: 'end', value: (r) => fmtCost(r.cost, r.local) },
    { id: 'date', class: 'nowrap', header: 'Started', value: (r) => fmtDate(r.startedAt) },
  ];

  const reset = () => (limit = PAGE);
  const onctx: typeof cs.update = (next) => {
    reset();
    return cs.update(next);
  };

  async function showNext() {
    const month = nextMonth;
    if (!month || monthLoading) return;
    monthLoading = true;
    monthError = null;
    try {
      const runs = await loadMonth(fetch, month);
      loaded = [...loaded, { month, runs }];
    } catch (e) {
      monthError = e instanceof Error ? e.message : String(e);
    } finally {
      monthLoading = false;
    }
  }

  onMount(() => cs.init());
  afterNavigate(({ type }) => {
    if (type !== 'enter') void cs.syncFromUrl();
  });

  // Back from a run page returns to the same picks and the same months (B-21)
  export const snapshot = {
    capture: () => ({ filters, sort, limit, months: loaded.length }),
    restore: async (v: { filters: RunFilters; sort: SortKey; limit: number; months: number }) => {
      filters = { outcome: v.filters?.outcome ?? 'all', state: v.filters?.state ?? 'all' };
      sort = isSortKey(v.sort) ? v.sort : 'newest';
      limit = v.limit > 0 ? v.limit : PAGE;
      while (loaded.length < (v.months ?? 1) && nextMonth) {
        await showNext();
        if (monthError) break;
      }
    },
  };
</script>

<PageHeader title="Runs" crumbs={[{ label: 'Runs' }]}>
  Every published run, newest first. Pick a suite to see how each run counts in it: invalid and withdrawn runs
  are listed too, with a badge, and never count.
</PageHeader>

{#if cs.failure}<p class="banner bad" role="alert">{cs.failure}</p>{/if}

<ControlPanel
  index={cs.index}
  meta={data.meta}
  ctx={cs.ctx}
  {onctx}
  unit="setups"
  noun="runs"
  count={{ shown: inScope.length, total: all.length }}
  hideProvisional
  hideEmptyFilters
  pinnedCounts
  unknownSuite={cs.unknownSuite}
  label="Run filters"
/>

<div class="bar">
  <label>
    <span>Outcome</span>
    <select
      value={filters.outcome}
      onchange={(e) => {
        filters = { ...filters, outcome: e.currentTarget.value as RunFilters['outcome'] };
        reset();
      }}
    >
      <option value="all">All outcomes</option>
      {#each OUTCOME_CLASSES as o (o)}
        <option value={o} disabled={outcomeN(o) === 0 && filters.outcome !== o}
          >{OUTCOME_LABEL[o]} ({outcomeN(o).toLocaleString('en')})</option
        >
      {/each}
    </select>
  </label>
  <label>
    <span>State in {cs.index.catalog.suite.name}</span>
    <select
      value={filters.state}
      onchange={(e) => {
        filters = { ...filters, state: e.currentTarget.value };
        reset();
      }}
    >
      <option value="all">All states</option>
      {#each states as s (s.state)}
        <option value={s.state} disabled={stateN(s.state) === 0 && filters.state !== s.state}
          >{stateLabel(s.state)} ({stateN(s.state).toLocaleString('en')})</option
        >
      {/each}
    </select>
  </label>
  <label>
    <span>Sort by</span>
    <select bind:value={sort} onchange={reset}>
      {#each SORTS as s (s.key)}<option value={s.key}>{s.label}</option>{/each}
    </select>
  </label>
</div>

<p class="count" role="status" aria-live="polite">
  {#if matched.length === 0}No runs match.{:else}Showing {visible.length.toLocaleString('en')} of
    {matched.length.toLocaleString('en')} run{matched.length === 1 ? '' : 's'}{/if}
  {#if loaded.length}
    <span class="muted">
      from {loaded.length === 1
        ? monthLabel(loaded[0]!.month)
        : `${monthLabel(loaded.at(-1)!.month)} to ${monthLabel(loaded[0]!.month)}`}{#if nextMonth}; older runs
        are not loaded{/if}.</span
    >
  {/if}
</p>

<div class="list" class:loading={cs.loading} aria-busy={cs.loading}>
  <ErrorBoundary what="the runs list">
    <ResponsiveTable
      rows={visible}
      {columns}
      rowKey={(r) => r.id}
      caption="Recent runs"
      href={(r) => runHref(r.id, cs.ctx.suite === data.meta.current_suite ? undefined : cs.ctx.suite)}
      empty={nextMonth
        ? 'No loaded run matches these filters. Older months are not loaded yet.'
        : 'No run matches these filters.'}
      rowClass={(r) => (r.flag ? 'flagged' : undefined)}
    >
      {#snippet cell(r, col, layout)}
        {#if col.id === 'model'}
          <span class="name">{r.model}</span>
          {#if r.flag}<span class="tag bad badge">{r.flag === 'withdrawn' ? 'Withdrawn' : 'Invalid'}</span
            >{/if}
        {:else if col.id === 'outcome'}
          <span
            class="tag"
            class:good={r.outcome === 'finished'}
            class:warn={r.outcome === 'timeout'}
            class:bad={r.outcome === 'error'}>{OUTCOME_LABEL[r.outcome]}</span
          >
        {:else if col.id === 'state'}
          {#if r.flag && layout === 'table'}<span class="muted">{stateLabel(r.state ?? 'none')}</span>
          {:else}{stateLabel(r.state ?? 'none')}{/if}
        {:else if col.id === 'score'}
          {#if r.score !== null}<span class="score" style={heatStyle(r.score)}>{fmtScore(r.score)}</span
            >{:else}<span class="muted" aria-label="No score">—</span>{/if}
        {:else}
          {col.value?.(r) ?? '—'}
        {/if}
      {/snippet}
    </ResponsiveTable>
  </ErrorBoundary>
</div>

<div class="more">
  {#if visible.length < matched.length}
    <button type="button" onclick={() => (limit += PAGE)}>
      Show {Math.min(PAGE, matched.length - visible.length)} more
    </button>
  {/if}
  {#if monthLoading}
    <Loading label="Loading {nextMonth ? monthLabel(nextMonth) : 'runs'}…" />
  {:else if nextMonth}
    <button type="button" onclick={showNext}>Show {monthLabel(nextMonth)}</button>
  {:else if loaded.length}
    <p class="muted">That is every run.</p>
  {/if}
  {#if monthError}
    <p class="banner bad" role="alert">
      Couldn't load {nextMonth ? monthLabel(nextMonth) : 'that month'}: {monthError}
      <button type="button" onclick={showNext}>Try again</button>
    </p>
  {/if}
</div>

{#if data.months.length === 0}
  <Empty>No runs have been published yet.</Empty>
{/if}

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin: var(--space-4) 0 var(--space-2);
  }
  .bar label {
    display: grid;
    gap: 0.2rem;
  }
  .bar span {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  select,
  button {
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    padding: 0.3rem 0.6rem;
    background: var(--surface);
    color: var(--fg);
  }
  button:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  .count {
    margin: var(--space-2) 0;
    font-size: var(--text-sm);
  }
  .list.loading {
    opacity: 0.5;
  }
  .badge {
    margin-left: var(--space-2);
    vertical-align: middle;
  }
  .score {
    display: inline-block;
    min-width: 2.6em;
    padding: 1px 6px;
    border-radius: 4px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .more {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    margin: var(--space-4) 0;
  }
  .more p {
    margin: 0;
  }
  :global(td.nowrap) {
    white-space: nowrap;
  }
  :global(tr.flagged),
  :global(li.flagged) {
    opacity: 0.8;
  }
</style>
