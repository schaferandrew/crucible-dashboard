<script lang="ts">
  import { onMount } from 'svelte';
  // "Tasks" (MODEL-TASKS-01/02): per-area groups, closed by default (open state kept for the session), each with
  // a table of the best setup's tasks. A score is the mean of the setup's counted runs and opens its run.
  import { fmtCost, fmtRepeat, fmtScore, fmtSeconds } from '$lib/core/format';
  import { runHref, taskHref } from '$lib/paths';
  import { heat } from '$lib/ui/heat';
  import ResponsiveTable from '$lib/ui/ResponsiveTable.svelte';
  import type { Column } from '$lib/ui/table';
  import type { AreaGroup, AreaGroupTask } from './shape';

  let {
    groups,
    local,
    suiteParam,
    linksReady,
  }: { groups: readonly AreaGroup[]; local: boolean; suiteParam?: string; linksReady: boolean } = $props();

  const KEY = 'crucible-model-areas';
  function readOpen(): Set<string> {
    try {
      return new Set(JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  }
  let open = $state<Set<string>>(new Set());
  onMount(() => {
    open = readOpen();
  });
  function toggle(key: string) {
    const next = new Set(open);
    if (!next.delete(key)) next.add(key);
    open = next;
    try {
      sessionStorage.setItem(KEY, JSON.stringify([...next]));
    } catch {
      /* not remembered */
    }
  }

  const columns: Column<AreaGroupTask>[] = [
    { id: 'task', header: 'Task', rowHeader: true, value: (t) => t.task.name ?? t.task.id },
    { id: 'score', header: 'Score (mean)' },
    { id: 'time', header: 'Time' },
    { id: 'cost', header: 'Cost' },
    { id: 'runs', header: 'Runs' },
  ];
  const runsText = (t: AreaGroupTask) =>
    t.counted === t.runs ? String(t.runs) : `${t.counted} of ${t.runs} counted`;
</script>

<div class="groups">
  {#each groups as g (g.key)}
    {@const isOpen = open.has(g.key)}
    {@const h = heat(g.mean)}
    <section class="group">
      <h3>
        <button type="button" class="toggle" aria-expanded={isOpen} onclick={() => toggle(g.key)}>
          <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
          <span class="name">{g.label}</span>
          <span class="chip" style={h ? `background:${h.bg};color:${h.fg}` : undefined}
            >{g.mean === null ? '—' : fmtScore(g.mean)}</span
          >
          <span class="count muted"
            >{g.counted} of {g.total} counted{g.ranButNotCounted
              ? ` · ${g.ranButNotCounted} ran but don’t count`
              : ''}</span
          >
        </button>
      </h3>
      {#if isOpen}
        <ResponsiveTable
          rows={g.tasks}
          {columns}
          rowKey={(t) => t.task.id}
          caption="Tasks in {g.label}"
          rowClass={(t) => (t.cell ? undefined : 'notrun')}
        >
          {#snippet cell(t: AreaGroupTask, col: Column<AreaGroupTask>)}
            {#if col.id === 'task'}
              <a href={linksReady ? taskHref(t.task.id, suiteParam) : undefined}>{t.task.name ?? t.task.id}</a
              >
              <span class="tag">{t.tierLabel}</span>
            {:else if !t.cell}
              {#if col.id === 'score'}<span class="muted">not run</span>{:else}—{/if}
            {:else if col.id === 'score'}
              {@const th = heat(t.mean)}
              {#if t.mean === null}
                <span class="muted">{t.provisional ? 'provisional' : 'doesn’t count'}</span>
              {:else if linksReady && t.run}
                <a
                  class="score"
                  href={runHref(t.run, suiteParam)}
                  style={th ? `background:${th.bg};color:${th.fg}` : undefined}>{fmtScore(t.mean)}</a
                >
              {:else}
                <span class="score" style={th ? `background:${th.bg};color:${th.fg}` : undefined}
                  >{fmtScore(t.mean)}</span
                >
              {/if}
              {#if t.repeat}<span class="muted rep">{fmtRepeat(t.repeat)}</span>{/if}
            {:else if col.id === 'time'}
              {fmtSeconds(t.time)}{#if t.timedOut}<span class="tag bad">timed out</span>{/if}
            {:else if col.id === 'cost'}
              {fmtCost(t.cost, local)}
            {:else if col.id === 'runs'}
              {runsText(t)}
            {/if}
          {/snippet}
        </ResponsiveTable>
      {/if}
    </section>
  {/each}
</div>

<style>
  .group {
    border-bottom: 1px solid var(--border);
  }
  h3 {
    margin: 0;
  }
  .toggle {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    width: 100%;
    padding: var(--space-3) 0;
    background: none;
    border: 0;
    text-align: left;
    flex-wrap: wrap;
  }
  .name {
    font-weight: 700;
  }
  .chip,
  .score {
    display: inline-block;
    min-width: 2.4rem;
    text-align: center;
    padding: 1px 8px;
    border-radius: var(--radius-pill);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    background: var(--tray);
    text-decoration: none;
  }
  a.score:hover {
    outline: 2px solid var(--focus);
  }
  .count {
    font-size: var(--text-sm);
    font-weight: 400;
  }
  .rep {
    font-size: var(--text-xs);
    margin-left: var(--space-2);
  }
  .tag {
    margin-left: var(--space-2);
  }
  :global(tr.notrun) {
    color: var(--muted);
  }
</style>
