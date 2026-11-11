<script lang="ts">
  // "Every variant" (MODEL-VAR-01/02, B-19): a row is an ordinary filter set (quant, reasoning, harness, ...);
  // picking it again clears it. Each variant shows its best setup in scope. Rows outside the filters are
  // dimmed, a row that would leave nothing is disabled. Two to four ticked variants can be compared.
  import { fmtPercent } from '$lib/core/format';
  import { MAX_COMPARE_VARIANTS } from './constants';
  import { compareHref } from '$lib/paths';
  import type { View } from '$lib/core/scoring';
  import type { TierId } from '$lib/core/types';
  import Empty from '$lib/ui/Empty.svelte';
  import ResponsiveTable from '$lib/ui/ResponsiveTable.svelte';
  import type { Column } from '$lib/ui/table';
  import TierCell from '$lib/ui/TierCell.svelte';
  import { DIM_NAMES, type VariantRow, type VariantTable } from './shape';

  let {
    table,
    view,
    exclude,
    onpick,
    ticked,
    ontick,
    suiteParam,
  }: {
    table: VariantTable;
    view: View;
    exclude: ReadonlySet<TierId>;
    onpick: (row: VariantRow) => void;
    ticked: ReadonlySet<string>;
    ontick: (key: string, on: boolean) => void;
    suiteParam?: string;
  } = $props();

  const info = $derived(view.info);
  const combined = $derived(view.kind === 'combined');
  const aggMax = $derived(view.aggMax(exclude));
  const included = $derived(new Set(view.aggTiers(exclude).map((t) => t.id as string)));
  const head = $derived(table.dims.length ? table.dims.map((d) => DIM_NAMES[d] ?? d).join(' · ') : 'Variant');

  const columns = $derived<Column<VariantRow>[]>([
    ...(combined ? [] : [{ id: 'tick', header: 'Compare', cardLabel: false as const, cardHide: false }]),
    { id: 'variant', header: head, rowHeader: true, value: (r: VariantRow) => r.label },
    { id: 'coverage', header: 'Coverage' },
    ...(view.showAgg ? [{ id: 'overall', header: info.overallLabel }] : []),
    ...view.tiers.map((t) => ({ id: `tier:${t.id}`, header: t.label, title: t.blurb || undefined })),
    { id: 'deps', header: 'Deployments', align: 'end' as const },
  ]);

  const tickedRows = $derived(table.rows.filter((r) => ticked.has(r.key)));
  const canCompare = $derived(tickedRows.length >= 2 && tickedRows.length <= MAX_COMPARE_VARIANTS);
  const href = $derived(
    canCompare
      ? compareHref(
          tickedRows.map((r) => r.stats.candidate.first.id),
          suiteParam,
        )
      : null,
  );
  const rowClass = (r: VariantRow) => (r.inScope ? (r.picked ? 'picked' : '') : 'dim');
</script>

{#if table.rows.length === 0}
  <Empty>No variant of this model has a counted run here.</Empty>
{:else}
  <p class="count muted" aria-live="polite">
    {#if table.shown === table.total}
      {table.total} variant{table.total === 1 ? '' : 's'}, best first.
    {:else}
      {table.shown} of {table.total} variants match the filters, best first; the rest are dimmed.
    {/if}
  </p>
  <div class="pickable">
    <ResponsiveTable
      rows={table.rows}
      {columns}
      rowKey={(r) => r.key}
      caption="Variants of this model"
      {rowClass}
    >
      {#snippet cell(r: VariantRow, col: Column<VariantRow>)}
        {#if col.id === 'tick'}
          <input
            type="checkbox"
            aria-label="Compare {r.label}"
            checked={ticked.has(r.key)}
            disabled={(!ticked.has(r.key) && ticked.size >= MAX_COMPARE_VARIANTS) || r.disabled}
            onchange={(e) => ontick(r.key, e.currentTarget.checked)}
          />
        {:else if col.id === 'variant'}
          <button
            type="button"
            class="pick"
            aria-pressed={r.picked}
            aria-disabled={r.disabled}
            title={r.disabled
              ? 'No setup of this variant matches the other filters'
              : r.picked
                ? 'Clear the variant filters'
                : 'Show only this variant'}
            onclick={() => !r.disabled && onpick(r)}
          >
            {r.label}
          </button>
          <span class="tag {r.stats.local ? 'local' : 'cloud'}">{r.stats.local ? 'local' : 'cloud'}</span>
        {:else if col.id === 'coverage'}
          <span
            class="cov"
            title="{r.stats.progress.done} of {r.stats.progress.total} scored tasks have a counted run"
          >
            <span class="covbar" aria-hidden="true"
              ><span style:width="{Math.round(r.stats.progress.share * 100)}%"></span></span
            >
            {r.stats.progress.done}/{r.stats.progress.total}
            {#if r.stats.inProgress}<span
                class="tag warn"
                title="Under {fmtPercent(info.inProgressBelow)} of the tasks">in progress</span
              >{/if}
          </span>
        {:else if col.id === 'overall'}
          <TierCell
            result={r.stats.overall}
            max={aggMax}
            local={r.stats.local}
            label={info.overallLabel}
            coverageMin={info.coverageMin}
          />
        {:else if col.id.startsWith('tier:')}
          {@const id = col.id.slice(5)}
          <TierCell
            result={r.stats.tier[id] ?? null}
            max={view.tierMax(id)}
            local={r.stats.local}
            verdict={r.stats.verdict[id] ?? null}
            label={view.tiers.find((t) => t.id === id)?.label ?? id}
            coverageMin={info.coverageMin}
            dim={view.showAgg && !included.has(id)}
          />
        {:else if col.id === 'deps'}
          {#if r.deployments.shown === r.deployments.total}{r.deployments.total}{:else}{r.deployments.shown} of
            {r.deployments.total}{/if}
        {/if}
      {/snippet}
    </ResponsiveTable>
  </div>

  {#if !combined}
    <p class="compare">
      {#if href}
        <a class="go" {href}>Compare {tickedRows.length} variants →</a>
      {:else}
        <span class="go off" aria-disabled="true"
          >Compare {tickedRows.length
            ? `${tickedRows.length} variant${tickedRows.length === 1 ? '' : 's'}`
            : 'variants'} →</span
        >
        <span class="muted">Tick two to {MAX_COMPARE_VARIANTS} variants.</span>
      {/if}
    </p>
  {/if}
{/if}

<style>
  .count {
    margin: 0 0 var(--space-2);
    font-size: var(--text-sm);
  }
  .pick {
    background: none;
    border: 0;
    padding: 0;
    font-weight: 600;
    text-align: left;
    color: inherit;
    cursor: pointer;
  }
  .pick:hover {
    color: var(--accent);
    text-decoration: underline;
  }
  .pick[aria-disabled='true'] {
    color: var(--faint);
    text-decoration: none;
  }
  .pick[aria-pressed='true']::before {
    content: '✓ ';
    color: var(--accent);
  }
  .cov {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    white-space: nowrap;
  }
  .covbar {
    display: inline-block;
    width: 3.5rem;
    height: 6px;
    border-radius: 3px;
    background: var(--bar);
    overflow: hidden;
  }
  .covbar > span {
    display: block;
    height: 100%;
    background: var(--accent-fill);
  }
  .compare {
    margin: var(--space-3) 0 0;
    display: flex;
    gap: var(--space-3);
    align-items: center;
    flex-wrap: wrap;
  }
  .go {
    font-weight: 600;
  }
  .go.off {
    color: var(--faint);
  }
  .pickable :global(tr.dim),
  .pickable :global(li.dim) {
    opacity: 0.5;
  }
  .pickable :global(tr.picked),
  .pickable :global(li.picked) {
    background: var(--accent-soft);
  }
</style>
