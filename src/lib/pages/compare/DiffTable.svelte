<script lang="ts">
  // "Where they differ": the paired tasks by spread (CMP-DIFF-02), tied tasks folded when there are many
  // (CMP-DIFF-03), and each task's checks side by side on demand (CMP-DIFF-04). A table from 640 px, cards below.
  import { onMount } from 'svelte';
  import { fmtScore } from '$lib/core/format';
  import { taskHref } from '$lib/paths';
  import { heatStyle } from '$lib/ui/heat';
  import { CARD_QUERY } from '$lib/ui/table';
  import Checks from './Checks.svelte';
  import { TIE } from './pairing';
  import { foldsTies, type RunInfo, type SpreadRow } from './numbers';

  let {
    rows,
    labels,
    fullLabels,
    colors,
    tierLabel,
    runs,
    suite,
    suiteQ,
  }: {
    rows: readonly SpreadRow[];
    labels: readonly string[];
    fullLabels: readonly string[];
    colors: readonly string[];
    tierLabel: (tier: string | null) => string;
    runs: readonly (ReadonlyMap<string, readonly RunInfo[]> | undefined)[];
    suite: string;
    suiteQ?: string;
  } = $props();

  let wide: boolean | null = $state(null);
  onMount(() => {
    const mq = matchMedia(CARD_QUERY);
    wide = mq.matches;
    const on = (e: MediaQueryListEvent) => (wide = e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  });

  let open = $state<Record<string, boolean>>({});
  let tiedOpen = $state(false);

  const collapse = $derived(foldsTies(rows));
  const tied = $derived(rows.filter((r) => r.spread < TIE));
  const shown = $derived(collapse ? rows.filter((r) => r.spread >= TIE) : rows);
  const cols = $derived(labels.length + 2);

  const best = (r: SpreadRow, v: number) => r.spread > TIE && v + TIE >= Math.max(...r.values);
  const toggle = (id: string) => (open[id] = !open[id]);
  const rowClick = (e: MouseEvent, id: string) => {
    if (!(e.target as HTMLElement).closest('a, button')) toggle(id);
  };
</script>

{#snippet chip(r: SpreadRow, v: number)}
  <span class="chip" class:best={best(r, v)} style={heatStyle(v)}>{fmtScore(v)}</span>
{/snippet}

{#snippet detail(r: SpreadRow)}
  <Checks task={r.task} {labels} {colors} runs={runs.map((m) => m?.get(r.task.id))} {suite} {suiteQ} />
{/snippet}

{#snippet fold()}
  <strong>{tied.length} more tasks tied</strong>
  <span class="muted"
    >· {tiedOpen
      ? 'Every setup scored the same on each of these.'
      : 'Every setup scored the same on each, so they are folded.'}</span
  >
  <button type="button" class="linkbtn" aria-expanded={tiedOpen} onclick={() => (tiedOpen = !tiedOpen)}
    >{tiedOpen ? 'Fold them again' : 'Show them'}</button
  >
{/snippet}

{#if wide !== false}
  <div class="scroll">
    <table>
      <caption class="visually-hidden">Paired tasks by spread, with each setup's score</caption>
      <thead>
        <tr>
          <th scope="col">Task</th>
          <th scope="col" class="end">Spread</th>
          {#each labels as l, k (k)}
            <th scope="col" class="end" title={fullLabels[k]}>
              <span class="dot" style:background={colors[k]} aria-hidden="true"></span>{l}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each [...shown, ...(collapse && tiedOpen ? tied : [])] as r (r.task.id)}
          <tr class="task" onclick={(e) => rowClick(e, r.task.id)}>
            <th scope="row">
              <a href={taskHref(r.task.id, suiteQ)}>{r.task.name}</a>
              {#if r.task.tier}<span class="tag">{tierLabel(r.task.tier)}</span>{/if}
              <button
                type="button"
                class="linkbtn"
                aria-expanded={!!open[r.task.id]}
                onclick={() => toggle(r.task.id)}>{open[r.task.id] ? 'Hide checks' : 'Show checks'}</button
              >
            </th>
            <td class="end">{fmtScore(r.spread)}</td>
            {#each r.values as v, k (k)}<td class="end">{@render chip(r, v)}</td>{/each}
          </tr>
          {#if open[r.task.id]}
            <tr class="detail"><td colspan={cols}>{@render detail(r)}</td></tr>
          {/if}
        {/each}
        {#if collapse}
          <tr class="fold"><td colspan={cols}>{@render fold()}</td></tr>
        {/if}
      </tbody>
    </table>
  </div>
{:else}
  <ul class="cards" aria-label="Paired tasks by spread">
    {#each [...shown, ...(collapse && tiedOpen ? tied : [])] as r (r.task.id)}
      <li class="card">
        <div class="ctitle">
          <a href={taskHref(r.task.id, suiteQ)}>{r.task.name}</a>
          {#if r.task.tier}<span class="tag">{tierLabel(r.task.tier)}</span>{/if}
        </div>
        <div class="kv"><span class="muted">Spread</span><span>{fmtScore(r.spread)}</span></div>
        {#each r.values as v, k (k)}
          <div class="kv">
            <span class="muted"
              ><span class="dot" style:background={colors[k]} aria-hidden="true"></span>{labels[k]}</span
            >
            {@render chip(r, v)}
          </div>
        {/each}
        <button
          type="button"
          class="linkbtn"
          aria-expanded={!!open[r.task.id]}
          onclick={() => toggle(r.task.id)}>{open[r.task.id] ? 'Hide checks' : 'Show checks'}</button
        >
        {#if open[r.task.id]}<div class="panel">{@render detail(r)}</div>{/if}
      </li>
    {/each}
    {#if collapse}<li class="card fold">{@render fold()}</li>{/if}
  </ul>
{/if}

<style>
  .scroll {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }
  th,
  td {
    padding: var(--space-2) var(--space-3);
    text-align: left;
    vertical-align: top;
    border-bottom: 1px solid var(--border);
  }
  thead th {
    color: var(--muted);
    font-weight: 700;
  }
  .end {
    text-align: right;
  }
  tbody th {
    font-weight: 600;
  }
  tr.task {
    cursor: pointer;
  }
  tr.task:hover {
    background: var(--surface-2);
  }
  tr.detail > td,
  tr.fold > td {
    background: var(--surface-2);
  }
  .chip {
    display: inline-block;
    min-width: 2.6em;
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    text-align: center;
    font-weight: 600;
  }
  .chip.best {
    outline: 2px solid var(--fg);
    outline-offset: 1px;
  }
  .dot {
    display: inline-block;
    width: 0.65em;
    height: 0.65em;
    border-radius: 50%;
    margin-right: 0.4em;
  }
  .linkbtn {
    background: none;
    border: 0;
    padding: 0 0 0 var(--space-2);
    color: var(--accent);
    text-decoration: underline;
    font-size: var(--text-sm);
    font-weight: 400;
  }
  .cards {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .card {
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--border);
    font-size: var(--text-sm);
  }
  .ctitle {
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .kv {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-2);
    padding: 3px 0;
  }
  .panel {
    margin-top: var(--space-2);
  }
  .card .linkbtn {
    padding-left: 0;
  }
</style>
