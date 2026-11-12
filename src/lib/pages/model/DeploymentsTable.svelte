<script lang="ts">
  // "Deployments" (MODEL-DEP-01, B-19): every deployment of the model in this section. A row is an ordinary
  // filter: picking it sets `deployment`, picking it again clears it. Rows outside the current filters are
  // dimmed, a row that would leave nothing is disabled.
  import { fmtCost, fmtSeconds, fmtTps, tpsTitle } from '$lib/core/format';
  import Empty from '$lib/ui/Empty.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import ResponsiveTable from '$lib/ui/ResponsiveTable.svelte';
  import type { Column } from '$lib/ui/table';
  import type { DeploymentRow, DeploymentTable } from './shape';

  let {
    table,
    onpick,
    pending = false,
  }: { table: DeploymentTable; onpick: (row: DeploymentRow) => void; pending?: boolean } = $props();

  const columns: Column<DeploymentRow>[] = [
    { id: 'dep', header: 'Deployment', rowHeader: true, value: (r) => r.label },
    { id: 'packager', header: 'Packaged by', value: (r) => r.packagers.join(', ') },
    { id: 'runs', header: 'Runs', align: 'end', value: (r) => r.stats?.runs },
    { id: 'finished', header: 'Finished', align: 'end', value: (r) => r.stats?.finished },
    { id: 'timed', header: 'Timed out', align: 'end', value: (r) => r.stats?.timedOut },
    { id: 'errors', header: 'Errors', align: 'end', value: (r) => r.stats?.errors },
    { id: 'time', header: 'Median time / task' },
    { id: 'tps', header: 'Decode speed' },
    { id: 'cost', header: 'Cost / task' },
  ];

  const timeText = (r: DeploymentRow) =>
    !r.stats
      ? '—'
      : r.stats.time !== null
        ? fmtSeconds(r.stats.time)
        : r.stats.timeAll !== null
          ? `${fmtSeconds(r.stats.timeAll)} (none finished)`
          : '—';
  const tpsText = (r: DeploymentRow) =>
    r.stats && r.stats.tps.median !== null
      ? `${fmtTps(r.stats.tps.median)} (${r.stats.tps.n} run${r.stats.tps.n === 1 ? '' : 's'})`
      : '—';
  const costText = (r: DeploymentRow) => (r.stats ? fmtCost(r.stats.cost, r.where === 'local') : '—');
  const rowClass = (r: DeploymentRow) => (r.inScope ? (r.picked ? 'picked' : '') : 'dim');
</script>

{#if table.rows.length === 0}
  <Empty>No deployment has a counted run of this model here.</Empty>
{:else}
  <p class="count muted" aria-live="polite">
    {#if table.shown === table.total}
      {table.total} deployment{table.total === 1 ? '' : 's'}.
    {:else}
      {table.shown} of {table.total} deployments match the filters; the other{table.total - table.shown === 1
        ? ''
        : 's'}
      {table.total - table.shown === 1 ? 'is' : 'are'} dimmed.
    {/if}
  </p>
  {#if pending}<Loading label="Loading the runs…" />{/if}
  <div class="pickable">
    <ResponsiveTable
      rows={table.rows}
      {columns}
      rowKey={(r) => r.id}
      caption="Deployments of this model"
      {rowClass}
    >
      {#snippet cell(r: DeploymentRow, col: Column<DeploymentRow>)}
        {#if col.id === 'dep'}
          <button
            type="button"
            class="pick"
            aria-pressed={r.picked}
            aria-disabled={r.disabled}
            title={r.disabled
              ? 'No setup of this model on this deployment matches the other filters'
              : r.picked
                ? 'Clear the deployment filter'
                : 'Show only this deployment'}
            onclick={() => !r.disabled && onpick(r)}
          >
            {r.label}
          </button>
          <span class="tag {r.where === 'local' ? 'local' : 'cloud'}"
            >{r.where === 'local' ? 'local' : 'cloud'}</span
          >
          {#if !r.recorded}<span
              class="tag warn"
              title="These runs didn’t record where they ran. They count toward the variant’s quality but are left out of A/Bs and speed comparisons."
              >not recorded</span
            >{/if}
          {#each r.missing as m (m)}<span
              class="tag warn"
              title="Time, speed and cost here cover only the sections that ran on this deployment."
              >no {m} runs</span
            >{/each}
        {:else if col.id === 'packager'}
          {r.packagers.join(', ') || '—'}
        {:else if col.id === 'runs'}{r.stats?.runs ?? '—'}
        {:else if col.id === 'finished'}{r.stats?.finished ?? '—'}
        {:else if col.id === 'timed'}<span class:bad={!!r.stats?.timedOut}>{r.stats?.timedOut ?? '—'}</span>
        {:else if col.id === 'errors'}<span class:bad={!!r.stats?.errors}>{r.stats?.errors ?? '—'}</span>
        {:else if col.id === 'time'}{timeText(r)}
        {:else if col.id === 'tps'}<span title={r.stats ? tpsTitle(r.stats.tps, r.stats.finished) : undefined}
            >{tpsText(r)}</span
          >
        {:else if col.id === 'cost'}<span
            title={r.where === 'local'
              ? 'Electricity estimate: local runs aren’t billed'
              : 'Billed by the provider'}>{costText(r)}</span
          >
        {/if}
      {/snippet}
    </ResponsiveTable>
  </div>
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
  .bad {
    color: var(--bad);
    font-weight: 600;
  }
  .pickable :global(tr.dim),
  .pickable :global(li.dim) {
    opacity: 0.5;
  }
  .pickable :global(tr.picked) {
    background: var(--accent-soft);
  }
  .pickable :global(li.picked) {
    background: var(--accent-soft);
  }
</style>
