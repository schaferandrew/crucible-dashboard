<script lang="ts">
  import type { Candidate } from '$lib/core/scoring';
  import type { SuiteIndex } from '$lib/core/types';
  import { fmtInt, fmtSeconds } from '$lib/core/format';
  import { runHref, taskHref } from '$lib/paths';
  import ErrorBoundary from '$lib/ui/feedback/ErrorBoundary.svelte';
  import type { Numbers, NumTask, RunInfo, Unfinished } from './numbers';
  import { outcomeText } from './pairing';
  import { countedOf } from './sides';
  import { deploymentText, unrecordedDeployment } from './resolve';

  let {
    index,
    tasks,
    items,
    nums,
    labels,
    colors,
    suiteQ,
    secName,
  }: {
    index: SuiteIndex;
    tasks: NumTask[];
    items: Candidate[];
    nums: Numbers;
    labels: string[];
    colors: string[];
    suiteQ?: string;
    secName: string;
  } = $props();
  const nShared = $derived(nums.shared.length);
  const unrecorded = $derived(items.map((c) => unrecordedDeployment(c.first)));
  const depLabels = $derived(items.map((c) => deploymentText(index, c)));
  const outcomeLine = (r: RunInfo) =>
    `${outcomeText({ outcome: r.outcome })}${r.elapsed !== null ? ` after ${fmtSeconds(r.elapsed)}` : ''}`;
  const badKinds = (b: Unfinished) =>
    [b.timeouts ? `${b.timeouts} timed out` : '', b.errors ? `${b.errors} harness error` : '']
      .filter(Boolean)
      .join(', ');

  // ---- Not shared ----

  const missing = $derived(
    items.map((c) => {
      const have = countedOf(index, c);
      return tasks.filter((t) => !have.has(t.id));
    }),
  );
  const outside = $derived(tasks.filter((t) => missing.some((m) => m.some((x) => x.id === t.id))));
  let openMissing = $state<Record<string, boolean>>({});
</script>

<h2>Reliability</h2>
<ErrorBoundary what="reliability">
  {#if !nShared}
    <p class="sub">No shared tasks yet, so there is no reliability comparison.</p>
  {:else if !nums.rows.some((r) => r.bad.length)}
    <p class="sub">Every setup finished every shared task, so no task is left out of the scores.</p>
  {:else}
    <p class="sub">
      A run that timed out or hit a harness error says how reliable the setup is, not how well it answers, so
      it is left out of the scores above (the suite's own leaderboard still scores it 0).
    </p>
    <ul class="missing">
      {#each nums.rows as r, k (k)}
        <li>
          <div class="line">
            <span class="dot" style:background={colors[k]} aria-hidden="true"></span>
            {labels[k]}: {r.bad.length
              ? `didn't finish on ${r.bad.length} of ${nShared} shared tasks`
              : `finished all ${nShared} shared tasks`}
          </div>
          {#if r.bad.length}
            <ul class="list">
              {#each r.bad as b (b.task.id)}
                <li>
                  <a href={taskHref(b.task.id, suiteQ)}>{b.task.name}</a>:
                  {#if b.runs.length}
                    {#each b.runs as run, i (run.uuid)}{i ? '; ' : ''}<a href={runHref(run.uuid, suiteQ)}
                        >Run {run.uuid.slice(0, 8)}</a
                      >
                      · {outcomeLine(run)}
                      >{/each}
                  {:else}
                    {badKinds(b)}
                  {/if}
                  {b.k < b.n ? ` (${b.k} of ${b.n} runs)` : ''}
                </li>
              {/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</ErrorBoundary>

{#if unrecorded.some(Boolean)}
  <h2>Machine not recorded</h2>
  <p class="sub">
    These setups ran on a machine or provider that wasn't recorded, so their runs could come from different
    ones. Their scores are shown, but time, speed and cost are left out and never compared.
  </p>
  <ul class="missing">
    {#each items as c, k (c.id)}
      {#if unrecorded[k]}
        <li>
          <div class="line">
            <span class="dot" style:background={colors[k]} aria-hidden="true"></span>
            {labels[k]}: {c.first.runs} run{c.first.runs === 1 ? '' : 's'}, {depLabels[k]}
          </div>
        </li>
      {/if}
    {/each}
  </ul>
{/if}

<h2>Tasks not shared</h2>
<ErrorBoundary what="the unshared tasks">
  {#if !outside.length}
    <p class="sub">Every one of the {tasks.length} tasks in {secName} is shared by all of these setups.</p>
  {:else}
    <p class="sub">
      {outside.length} of the {tasks.length} tasks in {secName} are left out of the comparison because at least
      one setup has no counted run of them on its recorded machine or provider. Nobody is scored on a task another
      setup skipped.
    </p>
    <ul class="missing">
      {#each items as c, k (c.id)}
        {@const miss = missing[k]!}
        <li>
          <div class="line">
            <span class="dot" style:background={colors[k]} aria-hidden="true"></span>
            {labels[k]}: {miss.length
              ? `no counted run of ${fmtInt(miss.length)} of ${tasks.length} tasks`
              : `ran all ${tasks.length} tasks`}
            {#if miss.length}
              <button
                type="button"
                class="linkbtn"
                aria-expanded={!!openMissing[c.id]}
                onclick={() => (openMissing[c.id] = !openMissing[c.id])}
                >{openMissing[c.id] ? 'Hide' : 'List them'}</button
              >
            {/if}
          </div>
          {#if miss.length && openMissing[c.id]}
            <ul class="list">
              {#each miss as t (t.id)}<li><a href={taskHref(t.id, suiteQ)}>{t.name}</a></li>{/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</ErrorBoundary>

<style>
  .sub {
    max-width: 60rem;
    color: var(--muted);
    margin: var(--space-2) 0 var(--space-3);
  }
  h2 {
    margin-top: var(--space-5);
  }
  .dot {
    display: inline-block;
    width: 0.7em;
    height: 0.7em;
    border-radius: 50%;
    margin-right: 0.4em;
  }
  .missing {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-2);
  }
  .line {
    font-weight: 600;
  }
  .list {
    margin: var(--space-1) 0 0;
    padding-left: var(--space-5);
    font-size: var(--text-sm);
    columns: 1;
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
</style>
