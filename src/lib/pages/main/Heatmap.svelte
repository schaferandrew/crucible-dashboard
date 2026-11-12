<script lang="ts">
  // "Model × area" (MAIN-HEAT-*): the mean score of each area for each model's best setup.
  import { onMount } from 'svelte';
  import { fmtScore } from '$lib/core/format';
  import type { Scope } from '$lib/core/scope';
  import type { SuiteIndex } from '$lib/core/types';
  import { heatStyle } from '$lib/ui/heat';
  import Empty from '$lib/ui/Empty.svelte';
  import { areaResult, heatAreas, partSetup, type AreaResult } from './matrix';
  import ModelRef from './ModelRef.svelte';
  import { emptyText } from './phrases';
  import { Wide } from './wide.svelte';

  let { index, sc, suite }: { index: SuiteIndex; sc: Scope; suite?: string } = $props();

  const wide = new Wide();
  onMount(() => wide.mount());
  const areas = $derived(heatAreas(index, sc.view));
  const rows = $derived(sc.visible.filter((r) => r.ran));
</script>

{#snippet result(r: AreaResult)}
  {#if r.n}
    <span class="hc" style={heatStyle(r.score)}>
      <span class="score">{fmtScore(r.score)}</span>
      <span class="n">{r.n}/{r.total} tasks</span>
    </span>
  {:else}
    <span class="muted">not run</span>
  {/if}
{/snippet}

{#if !rows.length}
  <Empty>{emptyText(index, sc.ctx, sc.view)}</Empty>
{:else}
  {#if wide.value !== false}
    <div class="scroll" class:pre={wide.value === null}>
      <table>
        <caption class="visually-hidden"
          >Mean score per area for each model's best setup, {sc.view.label}</caption
        >
        <thead>
          <tr>
            <th scope="col">Model</th>
            {#each areas as a (a.id)}<th scope="col">{a.label}</th>{/each}
          </tr>
        </thead>
        <tbody>
          {#each rows as row (row.rowKey)}
            <tr>
              <th scope="row" class="who"><ModelRef {row} {suite} tag /></th>
              {#each areas as a (a.id)}
                <td
                  >{@render result(
                    areaResult(index, sc.view, partSetup(sc.view, row, a.part)?.id ?? null, a),
                  )}</td
                >
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
  {#if wide.value !== true}
    <ul class="cards" class:pre={wide.value === null}>
      {#each rows as row (row.rowKey)}
        <li class="card">
          <div class="ctitle"><ModelRef {row} {suite} tag /></div>
          {#each areas as a (a.id)}
            <div class="kv">
              <span class="k">{a.label}</span>
              <span class="v"
                >{@render result(
                  areaResult(index, sc.view, partSetup(sc.view, row, a.part)?.id ?? null, a),
                )}</span
              >
            </div>
          {/each}
        </li>
      {/each}
    </ul>
  {/if}
{/if}

<style>
  .scroll {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: var(--text-sm);
  }
  th,
  td {
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border);
    text-align: center;
  }
  thead th {
    color: var(--muted);
    font-weight: 700;
  }
  th.who {
    text-align: left;
    font-weight: 400;
    min-width: 13rem;
  }
  .hc {
    display: inline-flex;
    flex-direction: column;
    min-width: 4.5rem;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
  }
  .score {
    font-weight: 700;
  }
  .n {
    font-size: var(--text-xs);
  }
  .cards {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .card {
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--border);
    font-size: var(--text-sm);
  }
  .ctitle {
    margin-bottom: var(--space-1);
  }
  .kv {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 2px 0;
    gap: var(--space-2);
  }
  @media (min-width: 640px) {
    .cards.pre {
      display: none;
    }
  }
  @media (max-width: 639px) {
    .scroll.pre {
      display: none;
    }
  }
</style>
