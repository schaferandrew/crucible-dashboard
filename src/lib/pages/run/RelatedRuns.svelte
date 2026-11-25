<script lang="ts">
  import { goto } from '$app/navigation';
  import { fmtDateTime, fmtScore } from '$lib/core/format';
  import { OUTCOME_LABEL, outcomeClass } from '$lib/core/outcome';
  import type { Setup, SuiteIndex } from '$lib/core/types';
  import { cachedIndex, loadIndex } from '$lib/data';
  import { loadModelRuns, type ModelRuns } from '$lib/pages/model/runs';
  import { stateLabel } from '$lib/pages/runs/shape';
  import { compareHref, runHref, runsHref, taskHref } from '$lib/paths';
  import type { RunView } from './shape';

  let { view, suiteQ }: { view: RunView; suiteQ?: string } = $props();

  const PREVIEW_LIMIT = 5;
  let modelRuns = $state.raw<ModelRuns | null>(null);
  let loading = $state(false);
  let unavailable = $state(false);
  let index = $state.raw<SuiteIndex | null>(null);
  let sameSetupOnly = $state(false);

  const modelId = $derived(view.model.id);
  const suite = $derived(view.suite);
  const task = $derived(view.task.id);
  const setupId = $derived(view.standing?.setup ?? null);
  $effect(() => {
    if (!suite || !modelId || !task) return;
    let active = true;
    loading = true;
    unavailable = false;
    modelRuns = null;
    index = cachedIndex(suite);
    loadModelRuns(fetch, suite, modelId)
      .then((runs) => {
        if (!active) return;
        modelRuns = runs;
        if (!index && runs?.runs.some((run) => run.task === task && run.setup !== setupId)) {
          void loadIndex(fetch, suite)
            .then((labels) => {
              if (active) index = labels;
            })
            .catch(() => {
              // The preview can still show run results with the machine label from the model shard.
            });
        }
      })
      .catch(() => {
        if (active) unavailable = true;
      })
      .finally(() => {
        if (active) loading = false;
      });
    return () => {
      active = false;
    };
  });

  const matching = $derived.by(() => {
    const rows = new Map(
      view.siblings
        .filter((run) => !run.self)
        .map((run) => [run.uuid, { ...run, setup: setupId, machine: null as string | null }]),
    );
    for (const run of modelRuns?.runs ?? []) {
      if (run.task !== task || run.run_uuid === view.uuid) continue;
      const repeat = rows.get(run.run_uuid);
      rows.set(run.run_uuid, {
        uuid: run.run_uuid,
        setup: run.setup,
        machine: run.machine,
        startedAt: run.started_at,
        score: run.score,
        state: run.state,
        outcome: run.outcome,
        self: false,
        scored: repeat?.scored ?? false,
      });
    }
    return [...rows.values()].sort(
      (a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? '') || b.uuid.localeCompare(a.uuid),
    );
  });

  const canFilter = $derived(
    !!setupId &&
      matching.some((run) => run.setup === setupId) &&
      matching.some((run) => run.setup !== setupId),
  );
  const onlySame = $derived(canFilter && sameSetupOnly);
  const visible = $derived(onlySame ? matching.filter((run) => run.setup === setupId) : matching);

  const allHref = $derived(
    modelId && task
      ? runsHref(suiteQ, { model: modelId, task, setup: onlySame ? setupId : undefined })
      : null,
  );

  function setupLabel(setup: Setup | undefined, machine: string | null, isRepeat: boolean): string {
    if (isRepeat) return 'Same setup';
    if (!setup) return machine ?? 'Different setup';
    const label = [
      setup.labels.hw ?? setup.labels.provider,
      setup.quant,
      setup.reasoning !== 'default' ? `reasoning ${setup.reasoning}` : null,
      setup.harness,
    ]
      .filter((part) => part && part !== 'unrecorded')
      .join(' · ');
    return label || machine || 'Different setup';
  }

  function switchTo(e: MouseEvent, uuid: string) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    void goto(runHref(uuid, suiteQ), { replaceState: true, noScroll: true });
  }
</script>

<section class="related" aria-labelledby="h-related">
  <div class="heading">
    <div>
      <h2 id="h-related">Related runs</h2>
      <p class="muted">Same model · same task</p>
    </div>
    {#if canFilter}
      <label><input type="checkbox" bind:checked={sameSetupOnly} /> Same setup only</label>
    {/if}
  </div>

  {#if visible.length}
    <ul class="runs">
      {#each visible.slice(0, PREVIEW_LIMIT) as run (run.uuid)}
        {@const setup = run.setup ? index?.entities.setups[run.setup] : undefined}
        <li>
          <div class="identity">
            <a href={runHref(run.uuid, suiteQ)} onclick={(e) => switchTo(e, run.uuid)}
              >Run {run.uuid.slice(0, 8)}</a
            >
            <span class="muted">{setupLabel(setup, run.machine, run.setup === setupId)}</span>
          </div>
          <div class="result">
            <strong>{fmtScore(run.score)}</strong>
            {#if run.outcome && outcomeClass(run.outcome) !== 'finished'}
              <span class="muted">{OUTCOME_LABEL[outcomeClass(run.outcome)]}</span>
            {/if}
            {#if run.scored}<span class="tag good">Matrix run</span>
            {:else if run.state !== 'counted'}<span class="muted">{stateLabel(run.state)}</span>{/if}
            {#if run.startedAt}<time class="muted" datetime={run.startedAt}>{fmtDateTime(run.startedAt)}</time
              >{/if}
          </div>
        </li>
      {/each}
    </ul>
  {:else if loading}
    <p class="status muted" role="status">Loading runs…</p>
  {:else}
    <p class="status muted">{unavailable ? 'Run preview unavailable.' : 'No other runs in this suite.'}</p>
  {/if}

  <div class="actions">
    {#if allHref}
      <a href={allHref}>View all matching runs</a>
      {#if visible.length > PREVIEW_LIMIT}
        <span class="muted">{PREVIEW_LIMIT} of {visible.length.toLocaleString()} other runs</span>
      {/if}
    {/if}
    <div class="compare">
      {#if task}<a href={taskHref(task, suiteQ) + '#best-performers'}>Task rankings</a>{/if}
      {#if setupId}<a href={compareHref([setupId], suiteQ)}>Compare setup</a>{/if}
    </div>
  </div>
</section>

<style>
  .related {
    margin-bottom: var(--space-5);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    padding: var(--space-3) var(--space-4);
    font-size: var(--text-sm);
  }
  .heading,
  .actions,
  .compare,
  .runs li,
  .identity,
  .result {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1) var(--space-3);
  }
  .heading,
  .runs li {
    justify-content: space-between;
  }
  .heading h2 {
    margin: 0;
  }
  .heading p,
  .status {
    margin: 0;
  }
  .heading label {
    display: inline-flex;
    gap: var(--space-1);
    align-items: center;
  }
  .runs {
    list-style: none;
    padding: 0;
    margin: var(--space-2) 0;
  }
  .runs li {
    border-top: 1px solid var(--border);
    padding: var(--space-2) 0;
  }
  .runs a {
    font-weight: 600;
  }
  .result {
    font-variant-numeric: tabular-nums;
  }
  .status {
    padding: var(--space-3) 0;
  }
  .actions {
    gap: var(--space-2) var(--space-3);
  }
  .compare {
    margin-inline-start: auto;
  }
  @media (max-width: 639px) {
    .identity,
    .result {
      width: 100%;
    }
    .compare {
      margin-inline-start: 0;
    }
  }
</style>
