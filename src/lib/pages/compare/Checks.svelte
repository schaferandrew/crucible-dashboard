<script lang="ts">
  // "Show checks" panel of one task (CMP-DIFF-04): each setup's check results side by side, from its newest
  // finished, scored run. The run files are fetched when the panel is first opened.
  import { fmtDate, fmtScore } from '$lib/core/format';
  import { loadRun } from '$lib/data';
  import { runHref, taskHref } from '$lib/paths';
  import { checksFromRun, type RunChecks } from './checks';
  import { newestFinished, type NumTask, type RunInfo } from './numbers';

  let {
    task,
    labels,
    colors,
    runs,
    suite,
    suiteQ,
  }: {
    task: NumTask;
    labels: readonly string[];
    colors: readonly string[];
    /** Each side's counted runs of this task (undefined until the runs are loaded). */
    runs: readonly (readonly RunInfo[] | undefined)[];
    suite: string;
    suiteQ?: string;
  } = $props();

  type State = { status: 'loading' } | { status: 'error' } | { status: 'ok'; checks: RunChecks };
  const states = $state<Record<number, State>>({});

  const picks = $derived(runs.map((r) => newestFinished(r)));

  $effect(() => {
    picks.forEach((p, k) => {
      const uuid = p.newest?.uuid;
      if (!uuid || states[k]) return;
      states[k] = { status: 'loading' };
      loadRun(fetch, uuid).then(
        (run) => (states[k] = { status: 'ok', checks: checksFromRun(run, suite) }),
        () => (states[k] = { status: 'error' }),
      );
    });
  });
</script>

<div class="grid">
  {#each labels as label, k (k)}
    {@const pick = picks[k]}
    {@const st = states[k]}
    <div class="col" style:border-top-color={colors[k]}>
      <p class="head">
        <strong>{label}</strong>{#if pick?.newest}&nbsp;{fmtScore(pick.newest.score)}{/if}
      </p>
      {#if !runs[k]}
        <p class="muted small">Loading runs…</p>
      {:else if !pick?.newest}
        <p class="muted small">No finished run.</p>
      {:else}
        <p class="muted small">
          {pick.count > 1 ? `Newest of ${pick.count} counted runs` : 'One counted run'}, {fmtDate(
            pick.newest.startedAt,
          )} ·
          <a href={runHref(pick.newest.uuid, suiteQ)}>open the run</a>
        </p>
        {#if !st || st.status === 'loading'}
          <p class="muted small">Loading checks…</p>
        {:else if st.status === 'error'}
          <p class="muted small">Couldn’t load the checks.</p>
        {:else if st.checks.empty}
          <p class="muted small">{st.checks.empty}</p>
        {:else if st.checks.lines.length}
          <ul class="checks">
            {#each st.checks.lines as l (l)}<li>{l}</li>{/each}
          </ul>
        {:else}
          {#each st.checks.groups as g, i (i)}
            {#if g.name}<h4>{g.name}</h4>{/if}
            <ul class="checks">
              {#each g.items as it, j (j)}
                <li class:fail={it.passed === false}>
                  <span aria-hidden="true">{it.passed ? '✓' : it.passed === false ? '✕' : '–'}</span>
                  <span class="visually-hidden"
                    >{it.passed ? 'Passed:' : it.passed === false ? 'Failed:' : 'Not run:'}</span
                  >
                  {it.label}{#if it.detail}<span class="muted">&nbsp;({it.detail})</span>{/if}
                </li>
              {/each}
            </ul>
          {/each}
        {/if}
      {/if}
    </div>
  {/each}
</div>
<p class="link"><a href={taskHref(task.id, suiteQ)}>Open the task page →</a></p>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: var(--space-3);
  }
  .col {
    border-top: 3px solid var(--border-strong);
    padding-top: var(--space-2);
    min-width: 0;
  }
  .head {
    margin: 0 0 2px;
  }
  .small {
    margin: 0 0 var(--space-2);
    font-size: var(--text-sm);
  }
  h4 {
    margin: var(--space-2) 0 2px;
    font-size: var(--text-sm);
  }
  .checks {
    list-style: none;
    margin: 0 0 var(--space-2);
    padding: 0;
    font-size: var(--text-sm);
  }
  .checks li {
    padding: 1px 0;
    overflow-wrap: anywhere;
  }
  .checks li.fail {
    color: var(--bad);
  }
  .link {
    margin: var(--space-2) 0 0;
    font-size: var(--text-sm);
  }
</style>
