<script lang="ts">
  // /task/<id>: one task (spec 8). A page is a DataContext with the task fixed: the panel's counts and the
  // entries come from `scope()` over the setups that ran it. The page needs index.json and the task file only
  // (per-check results and tokens are in the task file's runs).
  import { afterNavigate } from '$app/navigation';
  import { onMount, untrack } from 'svelte';
  import { DIMS, type DataContext } from '$lib/core/context';
  import { scope } from '$lib/core/scope';
  import { link } from '$lib/paths';
  import { findElsewhere, loadTaskFile } from '$lib/pages/task/load';
  import {
    buildEntries,
    detailsOf,
    indexForTask,
    isProvisional,
    resolveTask,
    similarTasks,
    taskContext,
    taskName,
    type RunDetail,
    type TaskFile,
  } from '$lib/pages/task/shape';
  import TaskDetail from '$lib/pages/task/TaskDetail.svelte';
  import { ContextState } from '$lib/ui/contextState.svelte';
  import ControlPanel from '$lib/ui/ControlPanel.svelte';
  import ErrorBoundary from '$lib/ui/ErrorBoundary.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';

  let { data } = $props();

  const cs = untrack(() => new ContextState({ meta: data.meta, index: data.index }));
  onMount(() => cs.init());
  afterNavigate(({ type }) => {
    if (type !== 'enter') void cs.syncFromUrl();
  });

  const suite = $derived(cs.index.suite);
  const suiteQ = $derived(suite === data.meta.current_suite ? undefined : (suite as string));
  const provQ = $derived(cs.ctx.provisional ? '1' : undefined);
  const catalogTask = $derived(resolveTask(cs.index.catalog, data.id));
  const retired = $derived(catalogTask?.status === 'retired');
  const tasksHref = $derived(link('/task/', { suite: suiteQ, provisional: provQ }));
  const taskHref = (id: string, suiteId?: string) =>
    link(`/task/${encodeURIComponent(id)}/`, {
      suite: suiteId ?? suiteQ,
      provisional: provQ,
    });

  // ---- The task file for the suite in view
  let file = $state.raw<TaskFile | null>(untrack(() => data.file));
  let fileError = $state<string | null>(untrack(() => data.error));
  let fileLoading = $state(false);
  let elsewhere = $state.raw(untrack(() => data.elsewhere));

  $effect(() => {
    const t = catalogTask;
    const s = suite as string;
    const initial = data.file;
    if (!t || t.status === 'retired') {
      untrack(() => (file = null));
      return;
    }
    const have = untrack(() => file);
    if (have && have.suite === s && have.task.id === t.id) return;
    if (initial && initial.suite === s && initial.task.id === t.id) {
      file = initial;
      fileError = null;
      return;
    }
    let live = true;
    fileLoading = true;
    fileError = null;
    loadTaskFile(fetch, s, t.id).then(
      (f) => {
        if (!live) return;
        file = f;
        fileLoading = false;
      },
      (e) => {
        if (!live) return;
        file = null;
        fileError = e instanceof Error ? e.message : String(e);
        fileLoading = false;
      },
    );
    return () => {
      live = false;
    };
  });

  $effect(() => {
    if (catalogTask) return;
    const s = suite as string;
    let live = true;
    void findElsewhere(fetch, data.meta, s, data.id).then((r) => live && (elsewhere = r));
    return () => {
      live = false;
    };
  });

  // ---- Scope: the setups that ran this task and pass the filters
  const full = $derived(file?.task ?? null);
  const prov = $derived(isProvisional(full?.status ?? catalogTask?.status));
  const ctx = $derived<DataContext>(taskContext(cs.ctx, { mode: catalogTask?.mode ?? null }, prov));
  const taskIndex = $derived(catalogTask ? indexForTask(cs.index, catalogTask.id) : cs.index);
  const sc0 = $derived(scope(taskIndex, ctx));
  // A task has no Overall: the panel's tier toggles don't apply
  const sc = $derived({ ...sc0, view: { ...sc0.view, showAgg: false } });
  const hasFilters = $derived(DIMS.some((d) => ctx.filters[d]?.size));
  const built = $derived(
    file
      ? buildEntries(
          cs.index,
          file.task,
          file.runs,
          hasFilters ? new Set(sc0.setups.map((s) => s.id as string)) : null,
        )
      : null,
  );

  // A task belongs to one section, so a section chip is not a choice here
  function onctx(next: DataContext) {
    if (next.section !== ctx.section) return;
    void cs.update({ ...next, section: cs.ctx.section });
  }

  // Per-check results and tokens are in the task file's runs
  const details = $derived(built ? detailsOf(built.entries) : new Map<string, RunDetail>());

  const name = $derived(full?.name ?? (catalogTask ? taskName(catalogTask) : null));
  const like = $derived(catalogTask ? [] : similarTasks(cs.index.catalog, data.id, cs.ctx.provisional));
</script>

{#if cs.failure}<p class="banner bad" role="alert">{cs.failure}</p>{/if}

{#if !catalogTask}
  <PageHeader title="Task not found" crumbs={[{ label: 'Tasks', href: tasksHref }, { label: 'Not found' }]} />
  <p class="big">There is no task called “{data.id}” in {cs.index.catalog.suite.name}.</p>
  {#if elsewhere.length}
    <p>
      It exists in:
      {#each elsewhere as e, i (e.suite)}{i ? ', ' : ''}<a
          href={taskHref(e.taskId, e.suite === data.meta.current_suite ? undefined : e.suite)}>{e.label}</a
        >{/each}.
    </p>
  {/if}
  {#if like.length}
    <ul>
      {#each like as t (t.id)}<li><a href={taskHref(t.id)}>{taskName(t)}</a></li>{/each}
    </ul>
  {/if}
  <p><a href={tasksHref}>See all tasks</a></p>
{:else if retired}
  <PageHeader
    title={name ?? data.id}
    crumbs={[{ label: 'Tasks', href: tasksHref }, { label: name ?? data.id }]}
  />
  <p class="big">
    {name} is retired in {cs.index.catalog.suite.name}: it no longer counts, and its runs are not shown.
  </p>
  <p><a href={tasksHref}>See all tasks</a></p>
{:else}
  <PageHeader
    title={name ?? data.id}
    crumbs={[{ label: 'Tasks', href: tasksHref }, { label: name ?? data.id }]}
  />

  <ControlPanel
    index={taskIndex}
    meta={data.meta}
    {ctx}
    {onctx}
    {sc}
    unit="setups"
    pinned={['task']}
    unknownSuite={cs.unknownSuite}
    label="Task controls"
  />

  <div class="body" class:loading={cs.loading} aria-busy={cs.loading || fileLoading}>
    {#if fileError && !file}
      <ErrorBoundary what="this task" error={fileError} onretry={() => location.reload()}>
        <span></span>
      </ErrorBoundary>
    {:else if file && built}
      <ErrorBoundary what="this task">
        <TaskDetail index={cs.index} {file} {built} {details} {suiteQ} />
      </ErrorBoundary>
    {:else}
      <Loading />
    {/if}
  </div>
{/if}

<style>
  .big {
    font-size: var(--text-lg);
  }
  .body {
    margin-top: var(--space-4);
  }
  .body.loading {
    opacity: 0.5;
  }
</style>
