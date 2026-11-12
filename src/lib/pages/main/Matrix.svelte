<script lang="ts">
  // "Every model on every task" (MAIN-MATRIX-*). Each scored cell links to its run's own page (B-21): the run
  // comes from the lazily fetched `<suite>/cell-runs.json`, loaded when the matrix scrolls near the viewport or
  // when a cell is clicked first. Below 640 px each row is a card.
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { buildRunLinkIndex, type RunLinkIndex } from '$lib/core/runlink';
  import type { Row } from '$lib/core/scoring';
  import { cellsOf } from '$lib/core/scoring';
  import type { Scope } from '$lib/core/scope';
  import type { CatalogTask, SuiteIndex } from '$lib/core/types';
  import { loadCellRuns } from '$lib/data';
  import { setupLabel } from '$lib/labels';
  import { runHref, taskHref } from '$lib/paths';
  import { heatStyle } from '$lib/ui/heat';
  import { cellView, setupFor, tierGroups, type CellView } from './matrix';
  import ModelRef from './ModelRef.svelte';
  import { emptyText } from './phrases';
  import { Wide } from './wide.svelte';

  let { index, sc, suite }: { index: SuiteIndex; sc: Scope; suite?: string } = $props();

  const wide = new Wide();
  let links = $state.raw<RunLinkIndex | null>(null);
  let failed = $state(false);
  let root: HTMLElement | undefined = $state();
  let loadedFor = '';

  const view = $derived(sc.view);
  const rows = $derived(sc.visible.filter((r) => r.ran));
  const groups = $derived(tierGroups(view));
  const provIds = $derived(new Set<string>(view.provisionalTasks.map((t) => t.id)));

  async function ensureLinks(): Promise<RunLinkIndex | null> {
    if (links && loadedFor === index.suite) return links;
    try {
      const idx = buildRunLinkIndex(await loadCellRuns(fetch, index.suite));
      loadedFor = index.suite;
      links = idx;
      failed = false;
      return idx;
    } catch {
      failed = true;
      return null;
    }
  }

  onMount(() => {
    const stop = wide.mount();
    const io = new IntersectionObserver(
      (e) => {
        if (e.some((x) => x.isIntersecting)) void ensureLinks();
      },
      { rootMargin: '400px' },
    );
    if (root) io.observe(root);
    return () => {
      stop();
      io.disconnect();
    };
  });

  const linkIndex = $derived(links && loadedFor === index.suite ? links : null);

  // In Combined a row pairs one setup per section: each task reads its own section's setup (B-23)
  function setupOf(row: Row, task: CatalogTask): string | null {
    return setupFor(view, row, task.id)?.id ?? null;
  }

  function runOf(row: Row, task: CatalogTask): string | null {
    const setup = setupOf(row, task);
    if (!setup) return null;
    return cellsOf(index, setup).get(task.id)?.scored_run ?? linkIndex?.get(setup, task.id) ?? null;
  }

  function cv(row: Row, t: CatalogTask): CellView {
    const setup = setupOf(row, t);
    const cell = setup ? cellsOf(index, setup).get(t.id) : undefined;
    return cellView(cell, provIds.has(t.id), row.label, t.name || t.id);
  }

  async function open(row: Row, t: CatalogTask) {
    const idx = await ensureLinks();
    const setup = setupOf(row, t);
    const run = runOf(row, t) ?? (setup ? idx?.get(setup, t.id) : null);
    if (run) await goto(runHref(run, suite));
  }
</script>

{#snippet score(row: Row, t: CatalogTask, c: CellView, card: boolean)}
  {@const run = runOf(row, t)}
  {@const text = card ? c.card : c.wide}
  {#if run}
    <a
      class="cell"
      class:timeout={c.timeout}
      class:uncounted={c.state === 'uncounted'}
      class:card
      href={runHref(run, suite)}
      style={heatStyle(c.mean)}
      title={c.title}
      aria-label={c.label}
      >{text}{#if c.n > 1}<sup>×{c.n}</sup>{/if}</a
    >
  {:else}
    <button
      type="button"
      class="cell"
      class:timeout={c.timeout}
      class:uncounted={c.state === 'uncounted'}
      class:card
      style={heatStyle(c.mean)}
      title={c.title}
      aria-label={c.label}
      onclick={() => open(row, t)}
      >{text}{#if c.n > 1}<sup>×{c.n}</sup>{/if}</button
    >
  {/if}
{/snippet}

<div bind:this={root}>
  {#if rows.length === 0}
    <p class="empty">{emptyText(index, sc.ctx, view)}</p>
  {:else}
    {#if failed}<p class="banner bad" role="alert">
        Couldn’t load the run links. <button type="button" onclick={ensureLinks}>Try again</button>
      </p>{/if}
    {#if wide.value !== false}
      <div class="scroll" class:pre={wide.value === null}>
        <table>
          <caption class="visually-hidden"
            >Score of each model's best setup on each task, {view.label}</caption
          >
          <thead>
            <tr>
              <th scope="col"></th>
              {#each groups as g (g.id)}
                <th scope="colgroup" colspan={g.tasks.length} class="tier" class:section={g.sectionStart}
                  >{g.label}</th
                >
              {/each}
            </tr>
            <tr>
              <th scope="col">Model</th>
              {#each groups as g (g.id)}
                {#each g.tasks as t, i (t.id)}
                  <th
                    scope="col"
                    class="task"
                    class:start={i === 0}
                    class:section={i === 0 && g.sectionStart}
                    title={t.name || t.id}
                  >
                    <a href={taskHref(t.id, suite)}>{t.name || t.id}</a>
                  </th>
                {/each}
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each rows as row (row.rowKey)}
              <tr>
                <th scope="row" class="who">
                  <ModelRef {row} {suite} />
                  <span class="setup">{setupLabel(row)}</span>
                </th>
                {#each groups as g (g.id)}
                  {#each g.tasks as t, i (t.id)}
                    {@const c = cv(row, t)}
                    <td
                      class:start={i === 0}
                      class:section={i === 0 && g.sectionStart}
                      class:prov={provIds.has(t.id)}
                      class:isempty={c.state === 'empty'}
                    >
                      {#if c.state === 'empty'}·{:else}{@render score(row, t, c, false)}{/if}
                    </td>
                  {/each}
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
            <div class="setup">{setupLabel(row)}</div>
            {#each groups as g (g.id)}
              <p class="group">{g.label}</p>
              {#each g.tasks as t (t.id)}
                {@const c = cv(row, t)}
                <div class="kv" class:prov={provIds.has(t.id)}>
                  <span class="k"
                    ><a href={taskHref(t.id, suite)}>{t.name || t.id}</a>
                    {#if provIds.has(t.id)}<span class="tag">provisional</span>{/if}</span
                  >
                  <span class="v">
                    {#if c.state === 'empty'}<span class="muted">not run</span>{:else}{@render score(
                        row,
                        t,
                        c,
                        true,
                      )}{/if}
                  </span>
                </div>
              {/each}
            {/each}
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

<style>
  .scroll {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  table {
    border-collapse: collapse;
    font-size: var(--text-sm);
    width: 100%;
  }
  th,
  td {
    padding: 3px 4px;
    border-bottom: 1px solid var(--border);
    text-align: center;
  }
  thead th {
    color: var(--muted);
    font-weight: 700;
    vertical-align: bottom;
  }
  th.tier {
    border-left: 1px solid var(--border-strong);
  }
  th.task {
    font-weight: 400;
    font-size: var(--text-xs);
    min-width: 3.2rem;
    max-width: 5.5rem;
    overflow-wrap: anywhere;
  }
  th.task a {
    color: inherit;
  }
  .start {
    border-left: 1px solid var(--border-strong);
  }
  .section {
    border-left: 2px solid var(--muted);
  }
  th.who {
    text-align: left;
    min-width: 13rem;
    position: sticky;
    left: 0;
    background: var(--surface);
    font-weight: 400;
  }
  .setup {
    display: block;
    font-size: var(--text-xs);
    color: var(--muted);
    overflow-wrap: anywhere;
  }
  td.prov {
    outline: 1px dashed var(--border-strong);
    outline-offset: -2px;
  }
  td.isempty {
    color: var(--faint);
  }
  .cell {
    display: inline-block;
    min-width: 2.2rem;
    padding: 2px 4px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    font: inherit;
    font-weight: 700;
    text-decoration: none;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .cell:hover {
    border-color: var(--fg);
  }
  .cell.uncounted {
    background: none;
    color: var(--muted);
    border-color: var(--border-strong);
  }
  .cell.timeout {
    box-shadow: 0 0 0 2px var(--bad);
  }
  .cell sup {
    font-size: 0.65em;
    font-weight: 400;
    margin-left: 1px;
  }
  .empty {
    padding: var(--space-4);
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius-lg);
    color: var(--muted);
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
  .group {
    margin: var(--space-2) 0 2px;
    font-size: var(--text-xs);
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
  }
  .kv {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
    padding: 2px 0;
  }
  .k {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .k a {
    color: inherit;
  }
  .banner button {
    margin-left: var(--space-2);
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
