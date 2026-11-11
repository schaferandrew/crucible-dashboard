<script lang="ts">
  import { fmtCost, fmtPercent, fmtSeconds, fmtTps, tpsTitle } from '$lib/core/format';
  import { OVERALL, type Row, type SortSpec } from '$lib/core/scoring';
  import type { Scope } from '$lib/core/scope';
  import { makerLabel, setupLabel } from '$lib/labels';
  import TierCell from './TierCell.svelte';

  let { sc, sort, onsort }: { sc: Scope; sort: SortSpec; onsort: (key: string) => void } = $props();

  const view = $derived(sc.view);
  const info = $derived(view.info);
  const exclude = $derived(sc.ctx.exclude);
  const aggMax = $derived(view.aggMax(exclude));
  const included = $derived(new Set(view.aggTiers(exclude).map((t) => t.id as string)));
  const combined = $derived(view.kind === 'combined');
  const sectionWord = $derived(combined ? "a section's" : 'this section’s');

  function ariaSort(key: string): 'ascending' | 'descending' | 'none' {
    return sort.key !== key ? 'none' : sort.dir === 1 ? 'ascending' : 'descending';
  }

  function costTitle(row: Row): string {
    if (row.local)
      return 'Estimated electricity per counted run (time x the hardware’s power x price per kWh). Not the hardware’s cost.';
    return 'Average API cost per counted run';
  }

  const approxTitle = 'Estimated: this row pools two setups’ runs and the data has one median per setup';
</script>

{#snippet sortHead(key: string, label: string, title?: string)}
  <th scope="col" aria-sort={ariaSort(key)} {title}>
    <button type="button" class="sorter" onclick={() => onsort(key)}>
      {label}{#if sort.key === key}<span aria-hidden="true">{sort.dir === 1 ? ' ↑' : ' ↓'}</span>{/if}
    </button>
  </th>
{/snippet}

{#if sc.visible.length === 0}
  <p class="empty">
    No model has a counted run in {combined ? 'any section' : 'this section'} of {info.catalog.suite.name} for these
    filters yet.
  </p>
{:else}
  <div class="scroll">
    <table>
      <caption class="visually-hidden">Leaderboard, {view.label}, {info.catalog.suite.name}</caption>
      <thead>
        <tr>
          <th scope="col" class="rank">#</th>
          {@render sortHead('model', 'Model and best setup')}
          {#if view.showAgg}
            {@render sortHead(
              OVERALL,
              info.overallLabel,
              `${[...included].length} tier${included.size === 1 ? '' : 's'} added together, out of ${aggMax}`,
            )}
          {/if}
          {#each view.tiers as t (t.id)}
            {@render sortHead(t.id, t.label, t.blurb || undefined)}
          {/each}
          <th scope="col" class="cover">Coverage</th>
          {@render sortHead('time', 'Time / task')}
          {@render sortHead('tps', 'tok/s', 'Decode speed: output tokens per second of generation (median)')}
          {@render sortHead('cost', 'Cost / task', 'Mean per run')}
        </tr>
      </thead>
      <tbody>
        {#each sc.visible as row (row.rowKey)}
          {@const rank = sc.rank.get(row.rowKey)}
          <tr class:dim={!row.ran}>
            <td class="rank">{rank ?? '—'}</td>
            <th
              scope="row"
              class="name"
              title={row.inProgress
                ? `In progress: ${row.progress.done} of ${row.progress.total} scored tasks done`
                : undefined}
            >
              <div class="title">
                <span class="maker">{makerLabel(row)} /</span>
                <span class="model">{row.label}{row.inProgress ? ' *' : ''}</span>
                <span class="where" class:local={row.local}>{row.local ? 'local' : 'cloud'}</span>
              </div>
              <div class="setup">{setupLabel(row)}</div>
              {#if row.variants.length > 1}
                <details class="variants">
                  <summary>best of {row.variants.length} setups</summary>
                  <ul>
                    {#each row.variants as v, i (v.candidate.id)}
                      <li>
                        {#if i === 0}<strong>best</strong>{/if}
                        {setupLabel(v)}
                        <span class="muted"
                          >&middot; {v.runs} counted run{v.runs === 1 ? '' : 's'} &middot; Overall {v.overall
                            .score === null
                            ? '—'
                            : v.overall.score.toFixed(1)}</span
                        >
                      </li>
                    {/each}
                  </ul>
                </details>
              {/if}
            </th>
            {#if view.showAgg}
              <td
                ><TierCell
                  result={row.overall}
                  max={aggMax}
                  local={row.local}
                  label={info.overallLabel}
                  coverageMin={info.coverageMin}
                /></td
              >
            {/if}
            {#each view.tiers as t (t.id)}
              <td>
                <TierCell
                  result={row.tier[t.id] ?? null}
                  max={view.tierMax(t.id)}
                  local={row.local}
                  verdict={row.verdict[t.id] ?? null}
                  label={t.label}
                  coverageMin={info.coverageMin}
                  dim={view.showAgg && !included.has(t.id)}
                />
              </td>
            {/each}
            <td class="cover">
              <span class="progress">{row.progress.done}/{row.progress.total}</span>
              {#if row.inProgress}
                <span
                  class="pill"
                  title="Fewer than {fmtPercent(
                    info.inProgressBelow,
                  )} of {sectionWord} scored tasks have a counted run, so the score may still move"
                  >in progress</span
                >
              {/if}
            </td>
            <td class="num" title={row.approx ? approxTitle : undefined}
              >{row.approx ? '~' : ''}{fmtSeconds(row.time)}</td
            >
            <td class="num" title={row.approx ? approxTitle : tpsTitle({ n: row.tpsRuns })}
              >{row.approx && row.tps !== null ? '~' : ''}{fmtTps(row.tps, true)}</td
            >
            <td class="num" title={row.approx ? approxTitle : costTitle(row)}
              >{row.approx && row.cost !== null ? '~' : ''}{fmtCost(row.cost, row.local)}</td
            >
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .scroll {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.9rem;
  }
  th,
  td {
    padding: 0.55rem 0.7rem;
    text-align: left;
    vertical-align: top;
    border-bottom: 1px solid var(--border);
  }
  thead th {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--muted);
    white-space: nowrap;
    background: var(--surface);
  }
  tbody tr:last-child > * {
    border-bottom: 0;
  }
  .sorter {
    background: none;
    border: 0;
    padding: 0;
    font: inherit;
    color: inherit;
    font-weight: inherit;
  }
  th[aria-sort='ascending'] .sorter,
  th[aria-sort='descending'] .sorter {
    color: var(--fg);
  }
  .rank {
    width: 2rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }
  th.name {
    font-weight: 400;
    min-width: 15rem;
    position: sticky;
    left: 0;
    background: var(--surface);
  }
  .title {
    display: flex;
    flex-wrap: wrap;
    gap: 0 0.35rem;
    align-items: baseline;
  }
  .maker {
    color: var(--muted);
  }
  .model {
    font-weight: 600;
  }
  .where {
    font-size: 0.7rem;
    border: 1px solid var(--cloud);
    color: var(--cloud);
    border-radius: 999px;
    padding: 0 0.4rem;
  }
  .where.local {
    border-color: var(--local);
    color: var(--local);
  }
  .setup {
    font-size: 0.8rem;
    color: var(--muted);
  }
  .variants {
    font-size: 0.8rem;
    margin-top: 0.15rem;
  }
  .variants summary {
    cursor: pointer;
    color: var(--accent);
  }
  .variants ul {
    margin: 0.25rem 0 0;
    padding-left: 1rem;
  }
  .cover {
    white-space: nowrap;
  }
  .progress {
    font-variant-numeric: tabular-nums;
  }
  .pill {
    font-size: 0.7rem;
    background: var(--warn-soft);
    color: var(--warn);
    border-radius: 999px;
    padding: 0 0.4rem;
    margin-left: 0.25rem;
  }
  .num {
    white-space: nowrap;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  tr.dim {
    opacity: 0.6;
  }
  .empty {
    padding: 1rem;
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius);
    color: var(--muted);
  }
</style>
