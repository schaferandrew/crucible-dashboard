<script lang="ts">
  // /todo/: "What to run next" (spec 7). Every setup of a section whose scored tasks aren't all counted yet,
  // sortable by how easy it is to bring to full coverage, and one recommendation. No Combined and no filters
  // (OQ-08, deliberately kept): the state is suite, section, sort and "every setup" (TodoState).
  import { afterNavigate } from '$app/navigation';
  import { onMount, untrack } from 'svelte';
  import type { RowStats } from '$lib/core/scoring';
  import type { SuiteId } from '$lib/core/types';
  import { modelHref, suiteParam, taskHref } from '$lib/paths';
  import { setupLabel } from '$lib/labels';
  import TierCell from '$lib/ui/TierCell.svelte';
  import { buildTodo } from '$lib/pages/todo/build';
  import ModelRef from '$lib/pages/todo/ModelRef.svelte';
  import {
    catalogTimes,
    countsLine,
    estimateText,
    plural,
    recommend,
    SORT_KEYS,
    SORT_LABELS,
    sortEntries,
    type Entry,
    type SortKey,
  } from '$lib/pages/todo/shape';
  import { TodoState } from '$lib/pages/todo/state.svelte';
  import TaskList from '$lib/pages/todo/TaskList.svelte';
  import CoverageBar from '$lib/ui/CoverageBar.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import ErrorBoundary from '$lib/ui/ErrorBoundary.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import ResponsiveTable from '$lib/ui/ResponsiveTable.svelte';
  import SectionRadiogroup from '$lib/ui/SectionRadiogroup.svelte';
  import SuiteBar from '$lib/ui/SuiteBar.svelte';
  import type { Column } from '$lib/ui/table';

  let { data } = $props();

  const st = untrack(() => new TodoState(data.meta, data.index));
  onMount(() => st.init());
  afterNavigate(({ type }) => {
    if (type !== 'enter') void st.syncFromUrl();
  });

  const section = $derived(st.section);
  const suiteQ = $derived(suiteParam(st.suite, data.meta.current_suite));
  const info = $derived(st.index.catalog);

  // Estimates come from the catalog's per-task typical times and setup_stats: nothing else to fetch
  const times = $derived(catalogTimes(st.index.catalog.tasks, st.index));
  const built = $derived(section ? buildTodo(st.index, section.id, st.all, times) : null);
  const sorted = $derived(built ? sortEntries(built.entries, st.sort) : []);
  const pick = $derived(built ? recommend(built.entries) : null);
  const view = $derived(built?.view ?? null);
  const aggMax = $derived(view ? view.aggMax() : 10);
  const overallLabel = $derived(view?.info.overallLabel ?? 'Overall');
  const sub = $derived(
    built ? countsLine(built.entries.length, st.all, built.tasks.length, built.complete) : '',
  );

  const columns: Column<Entry<RowStats>>[] = $derived([
    { id: 'setup', header: 'Setup', rowHeader: true },
    { id: 'done', header: 'Done', cardHide: true },
    { id: 'left', header: 'Left', align: 'end', cardHide: true },
    { id: 'est', header: 'Estimated', align: 'end', cardHide: true },
    { id: 'overall', header: `${overallLabel} so far`, cardLabel: `${overallLabel} so far` },
    { id: 'tasks', header: 'Tasks left', cardHide: true },
    { id: 'summary', header: 'Progress', tableHide: true, cardLabel: false },
    { id: 'cardtasks', header: 'Tasks left', tableHide: true, cardLabel: false },
  ]);
</script>

<PageHeader title="What to run next" crumbs={[{ label: 'What to run next' }]}>
  The setups and tasks that would most improve the leaderboard: which scored tasks each setup has no counted
  result for yet, and what finishing them would take.
</PageHeader>

{#if st.failure}<p class="banner bad" role="alert">{st.failure}</p>{/if}

<SuiteBar
  index={st.index}
  meta={data.meta}
  suite={st.suite}
  onsuite={(s: SuiteId) => st.setSuite(s)}
  unknown={st.unknownSuite}
/>

<section aria-label="Remaining tasks" class:loading={st.loading} aria-busy={st.loading}>
  {#if st.choices.length > 1}
    <SectionRadiogroup
      id="todo-mode"
      choices={st.choices}
      value={section?.id}
      onselect={(id) => st.setMode(id)}
    />
  {/if}

  {#if !section}
    <Empty>{info.suite.name} has no sections with scored tasks yet.</Empty>
  {:else if !built}
    <Loading label="Working out what's left…" />
  {:else}
    <h2>Recommended next</h2>
    <ErrorBoundary what="the recommendation">
      {#if !pick}
        <Empty>Every setup here has a counted run of every scored task. Nothing left to run.</Empty>
      {:else}
        {@const e = pick.entry}
        <div class="card pick">
          <div class="ctitle"><ModelRef stat={e.stat} label={e.label} suite={suiteQ} /></div>
          <p class="setup muted">{setupLabel(e.stat)}</p>
          <p class="why">
            {plural(e.left.toRun, 'task')} to run · {e.stat.progress.done}/{e.stat.progress.total} done{e.left
              .awaiting
              ? ' · ' + plural(e.left.awaiting, 'run') + ' awaiting a score'
              : ''}{e.left.toRun ? ' · ' + estimateText(e.left) + ' estimated' : ''}
          </p>
          {#if pick.order.length}
            <p class="muted">Run these, quickest and never-failed first:</p>
            <TaskList items={pick.order} suite={suiteQ} />
          {/if}
          {#if pick.then.length}
            <p class="muted">
              Then:
              {#each pick.then as x, i (x.key)}{i ? ', ' : ''}<a
                  href={modelHref(x.stat.candidate.model, suiteQ)}>{x.label}</a
                >
                ({plural(x.left.toRun, 'task')}){/each}
            </p>
          {/if}
          <p class="foot muted">
            Easiest means fewest tasks to run, each task this setup already timed out or errored on counting
            extra, then the least estimated time: each task's median finished time across setups, scaled by
            this setup's own pace.
          </p>
        </div>
      {/if}
    </ErrorBoundary>

    <h2>Setups with tasks left</h2>
    <div class="controls">
      <div class="field">
        <label class="lbl" for="todo-sort">Sort by</label>
        <select id="todo-sort" value={st.sort} onchange={(e) => st.setSort(e.currentTarget.value as SortKey)}>
          {#each SORT_KEYS as k (k)}<option value={k}>{SORT_LABELS[k]}</option>{/each}
        </select>
      </div>
      <label class="check">
        <input type="checkbox" checked={st.all} onchange={(e) => st.setAll(e.currentTarget.checked)} />
        Every setup, not just each model's best
      </label>
    </div>
    {#if sub}<p class="muted sub">{sub}</p>{/if}

    <ErrorBoundary what="the setups with tasks left">
      <ResponsiveTable
        rows={sorted}
        {columns}
        rowKey={(e) => e.key}
        caption="Setups with tasks left, {section.label}, {info.suite.name}"
        empty="Every setup here has a counted run of every scored task. Nothing left to run."
      >
        {#snippet cell(e, col)}
          {#if col.id === 'setup'}
            <ModelRef stat={e.stat} label={e.label} suite={suiteQ} />
            <div class="setup muted">{setupLabel(e.stat)}</div>
          {:else if col.id === 'done'}
            <CoverageBar
              done={e.stat.progress.done}
              total={e.stat.progress.total}
              share={e.stat.progress.share}
              local={e.stat.local}
            />
            {#if e.stat.inProgress}<span class="tag warn">in progress</span>{/if}
          {:else if col.id === 'left'}
            {e.left.tasks.length}{e.left.failed ? ` (${e.left.failed} failed)` : ''}
          {:else if col.id === 'est'}
            {estimateText(e.left)}
          {:else if col.id === 'overall'}
            <TierCell
              result={e.stat.overall}
              max={aggMax}
              local={e.stat.local}
              label={overallLabel}
              coverageMin={built.view.info.coverageMin}
            />
          {:else if col.id === 'tasks'}
            <span class="names">
              {#each e.left.tasks as x, i (x.task.id)}{i ? ', ' : ''}<a
                  href={taskHref(x.task.id, suiteQ)}
                  title="{x.task.tier ? x.task.tier + ' · ' : ''}{x.why}">{x.task.name}</a
                >{/each}
            </span>
          {:else if col.id === 'summary'}
            {e.stat.progress.done}/{e.stat.progress.total} done · {e.left.tasks.length} left · {estimateText(
              e.left,
            )}
          {:else if col.id === 'cardtasks'}
            <TaskList items={e.left.tasks} limit={4} suite={suiteQ} />
          {/if}
        {/snippet}
      </ResponsiveTable>
    </ErrorBoundary>
  {/if}
</section>

<style>
  h2 {
    margin-top: var(--space-5);
  }
  section.loading {
    opacity: 0.6;
  }
  .field {
    display: grid;
    gap: 0.2rem;
    margin-bottom: var(--space-3);
  }
  .lbl {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  select {
    justify-self: start;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    padding: 0.3rem 0.6rem;
    background: var(--surface);
    color: var(--fg);
    font-size: var(--text-sm);
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3) var(--space-5);
    align-items: flex-end;
  }
  .check {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    margin-bottom: var(--space-3);
    font-size: var(--text-sm);
  }
  .sub {
    margin: 0 0 var(--space-3);
    font-size: var(--text-sm);
  }
  .card.pick {
    max-width: 60rem;
    padding: var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
  }
  .ctitle {
    font-size: var(--text-md);
  }
  .card p {
    margin: var(--space-2) 0 0;
  }
  .setup {
    font-size: var(--text-sm);
  }
  .foot {
    font-size: var(--text-sm);
  }
  .names {
    overflow-wrap: anywhere;
  }
</style>
