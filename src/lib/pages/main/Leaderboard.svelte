<script lang="ts">
  // The leaderboard (MAIN-LB-*) on the shared ResponsiveTable: a table from 640 px, cards below.
  // Rank is rank by Overall and does not renumber when the sort changes (B-07).
  import { fmtCost, fmtPercent, fmtSeconds, fmtTps, tpsTitle } from '$lib/core/format';
  import { OVERALL, type Row } from '$lib/core/scoring';
  import type { Scope } from '$lib/core/scope';
  import type { SuiteIndex } from '$lib/core/types';
  import { setupLabel } from '$lib/labels';
  import ResponsiveTable from '$lib/ui/ResponsiveTable.svelte';
  import type { Column, SortState } from '$lib/ui/table';
  import ModelRef from './ModelRef.svelte';
  import { emptyText } from './phrases';
  import type { Picks } from './picks.svelte';
  import TierCell from '$lib/ui/TierCell.svelte';

  let {
    index,
    sc,
    sort,
    onsort,
    picks,
    suite,
  }: {
    index: SuiteIndex;
    sc: Scope;
    sort: SortState;
    onsort: (key: string) => void;
    picks: Picks;
    suite?: string;
  } = $props();

  const view = $derived(sc.view);
  const info = $derived(view.info);
  const exclude = $derived(sc.ctx.exclude);
  const aggMax = $derived(view.aggMax(exclude));
  const included = $derived(new Set(view.aggTiers(exclude).map((t) => t.id as string)));
  const combined = $derived(view.kind === 'combined');
  const sectionWord = $derived(combined ? "a section's" : 'this section’s');

  const columns = $derived<Column<Row>[]>([
    { id: 'rank', header: '#', cardHide: true, align: 'end', class: 'rank' },
    {
      id: 'model',
      header: 'Model and best setup',
      rowHeader: true,
      sortable: true,
      value: (r) => r.label,
    },
    ...(view.showAgg
      ? [
          {
            id: OVERALL,
            header: info.overallLabel,
            sortable: true,
            title: `${included.size === 1 ? `${[...included].length} tier alone` : `${included.size} tiers added together`}, out of ${aggMax}`,
            cardLabel: info.overallLabel,
          },
        ]
      : []),
    ...view.tiers.map((t) => ({
      id: t.id as string,
      header: t.label,
      sortable: true,
      title: combined
        ? `${t.label} in every section added together, out of ${view.tierMax(t.id)}`
        : t.blurb
          ? t.blurb.charAt(0).toUpperCase() + t.blurb.slice(1)
          : undefined,
    })),
    { id: 'cover', header: 'Coverage', cardLabel: 'Scored tasks' },
    { id: 'time', header: 'Time / task', sortable: true, align: 'end' },
    {
      id: 'tps',
      header: 'tok/s',
      sortable: true,
      align: 'end',
      title: 'Decode speed: output tokens per second of generation (median)',
      cardLabel: 'Decode speed',
    },
    { id: 'cost', header: 'Cost / task', sortable: true, align: 'end', title: 'Mean per run' },
  ]);

  function costTitle(row: Row): string {
    return row.local
      ? 'Estimated electricity per counted run (time x the hardware’s power x price per kWh). Not the hardware’s cost.'
      : 'Average API cost per counted run';
  }
  const progressTitle = (row: Row) =>
    row.inProgress
      ? `In progress: ${row.progress.done} of ${row.progress.total} scored tasks ${combined ? 'in all sections' : 'in this section'} done`
      : undefined;
</script>

{#snippet cell(row: Row, col: Column<Row>, layout: 'table' | 'card')}
  {#if col.id === 'rank'}
    {sc.rank.get(row.rowKey) ?? '—'}
  {:else if col.id === 'model'}
    <span class="name" title={progressTitle(row)}>
      {#if layout === 'card'}<span class="cardrank" title="Rank by {info.overallLabel}"
          >{sc.rank.has(row.rowKey) ? '#' + sc.rank.get(row.rowKey) : '—'}</span
        >{/if}
      <span class="title"><ModelRef {row} {suite} tag star /></span>
      <span class="setup">{setupLabel(row)}</span>
      {#if row.provisionalRan}
        <span class="setup"
          >ran {row.provisionalRan.done} of {row.provisionalRan.total} provisional task{row.provisionalRan
            .total === 1
            ? ''
            : 's'}</span
        >
      {/if}
      <span class="actions">
        {#if row.variants.length > 1}
          <details class="variants">
            <summary>best of {row.variants.length} setups</summary>
            <ul>
              {#each row.variants as v, i (v.candidate.id)}
                <li>
                  {#if i === 0}<strong>best</strong>{/if}
                  {setupLabel(v)}
                  <span class="muted"
                    >&middot; {v.runs} counted run{v.runs === 1 ? '' : 's'} &middot; {info.overallLabel}
                    {v.overall.score === null ? '—' : v.overall.score.toFixed(1)}</span
                  >
                </li>
              {/each}
            </ul>
          </details>
        {/if}
        {#if !combined}
          {@const picked = picks.has(row.setup.id)}
          <button
            type="button"
            class="pick"
            aria-pressed={picked}
            title={picked
              ? 'Remove this setup from the comparison'
              : 'Add this setup to a comparison (two to 4)'}
            onclick={() => picks.toggle(row.setup.id)}>{picked ? 'picked ✓' : '+ compare'}</button
          >
        {/if}
      </span>
    </span>
  {:else if col.id === OVERALL}
    <TierCell
      result={row.overall}
      max={aggMax}
      local={row.local}
      label={info.overallLabel}
      coverageMin={info.coverageMin}
    />
  {:else if col.id === 'cover'}
    <span class="progress">{row.progress.done}/{row.progress.total}</span>
    {#if row.inProgress}
      <span
        class="tag warn"
        title="Fewer than {fmtPercent(
          info.inProgressBelow,
        )} of {sectionWord} scored tasks have a counted run, so the score may still move">in progress</span
      >
    {/if}
  {:else if col.id === 'time'}
    {fmtSeconds(row.time)}
  {:else if col.id === 'tps'}
    <span title={tpsTitle({ n: row.tpsRuns })}>{fmtTps(row.tps, true)}</span>
  {:else if col.id === 'cost'}
    <span title={costTitle(row)}>{fmtCost(row.cost, row.local)}</span>
  {:else}
    {@const t = view.tiers.find((x) => x.id === col.id)}
    {#if t}
      <TierCell
        result={row.tier[t.id] ?? null}
        max={view.tierMax(t.id)}
        local={row.local}
        verdict={row.verdict[t.id] ?? null}
        label={t.label}
        coverageMin={info.coverageMin}
        dim={view.showAgg && !included.has(t.id)}
      />
    {/if}
  {/if}
{/snippet}

<ResponsiveTable
  rows={sc.visible}
  {columns}
  rowKey={(r) => r.rowKey}
  caption="Leaderboard, {view.label}, {info.catalog.suite.name}"
  {sort}
  {onsort}
  {cell}
  empty={emptyText(index, sc.ctx, view)}
  rowClass={(r) => (r.ran ? undefined : 'is-not-run')}
/>

<style>
  .name {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-weight: 400;
  }
  .cardrank {
    color: var(--muted);
    font-size: var(--text-xs);
    font-weight: 700;
  }
  .setup {
    font-size: var(--text-xs);
    color: var(--muted);
    font-weight: 400;
    overflow-wrap: anywhere;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-3);
    align-items: baseline;
    font-size: var(--text-xs);
    font-weight: 400;
  }
  .variants summary {
    cursor: pointer;
    color: var(--accent);
  }
  .variants ul {
    margin: var(--space-1) 0 0;
    padding-left: var(--space-4);
    color: var(--fg);
    text-align: left;
  }
  .pick {
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-pill);
    background: var(--surface);
    padding: 0 0.6rem;
    font-size: var(--text-xs);
  }
  .pick[aria-pressed='true'] {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
  }
  .progress {
    font-variant-numeric: tabular-nums;
  }
  :global(tr.is-not-run) {
    opacity: 0.6;
  }
</style>
