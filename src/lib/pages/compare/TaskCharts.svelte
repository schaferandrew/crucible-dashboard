<script lang="ts">
  import type { Candidate } from '$lib/core/scoring';
  import { fmtScore, fmtSeconds } from '$lib/core/format';
  import { taskHref } from '$lib/paths';
  import ErrorBoundary from '$lib/ui/feedback/ErrorBoundary.svelte';
  import type { Numbers } from './numbers';
  import { unrecordedDeployment } from './resolve';
  import { niceTime, scoreAxis, scoreAxisNote, timeAxis } from './scales';
  import RowsChart from './RowsChart.svelte';

  let {
    nums,
    items,
    labels,
    colors,
    suiteQ,
    depLabels,
    timeCaveat,
    runsError,
    onretry,
  }: {
    nums: Numbers;
    items: Candidate[];
    labels: string[];
    colors: string[];
    suiteQ?: string;
    depLabels: string[];
    timeCaveat: string;
    runsError: string | null;
    onretry: () => void;
  } = $props();
  const unrecorded = $derived(items.map((c) => unrecordedDeployment(c.first)));
  /** Why a side did not finish a shared task, for the × mark and the table alternative */
  const dnf = $derived(
    nums.cells.map((row) =>
      row.map((c) => {
        if (!c.bad) return null;
        const kinds = [c.bad.timeouts ? 'timed out' : '', c.bad.errors ? 'harness error' : ''].filter(
          Boolean,
        );
        return `didn't finish (${kinds.join(', ')})${c.bad.k < c.bad.n ? `, ${c.bad.k} of ${c.bad.n} runs` : ''}`;
      }),
    ),
  );
  const anyDnf = $derived(dnf.some((r) => r.some(Boolean)));
  const dnfNote = $derived(
    anyDnf ? " A × is a task that setup didn't finish: left out of every score, not drawn as 0." : '',
  );
  const dotValues = $derived(nums.cells.map((row) => row.map((c) => c.score)));
  const dotAxis = $derived(scoreAxis(dotValues.flat().filter((v): v is number => v !== null)));
  const timeValues = $derived(nums.cells.map((row, k) => row.map((c) => (unrecorded[k] ? null : c.time))));
  const tAxis = $derived(timeAxis(timeValues.flat().filter((v): v is number => v !== null)));

  const sharedTasks = $derived(nums.shared);
</script>

<h2>Task by task</h2>
<p class="sub">
  Score out of 10, one dot per setup. {scoreAxisNote(dotAxis)}{dnfNote}
</p>
<ErrorBoundary what="the score chart">
  <ul class="legend" aria-label="Setups">
    {#each labels as l, k (k)}
      <li><span class="dot" style:background={colors[k]} aria-hidden="true"></span>{l}</li>
    {/each}
  </ul>
  <RowsChart
    tasks={sharedTasks}
    values={dotValues}
    dnf={anyDnf ? dnf : null}
    {labels}
    {colors}
    axis={dotAxis}
    tick={String}
    show={fmtScore}
    what="Score per shared task, one dot per setup, axis from {dotAxis.lo} to 10"
    {suiteQ}
  />
  <details class="alt">
    <summary>Show the scores as a table</summary>
    <div class="scroll">
      <table>
        <caption class="visually-hidden">Finished score of each setup on each shared task</caption>
        <thead>
          <tr
            ><th scope="col">Task</th>{#each labels as l, k (k)}<th scope="col" class="end">{l}</th
              >{/each}</tr
          >
        </thead>
        <tbody>
          {#each sharedTasks as t, i (t.id)}
            <tr>
              <th scope="row"><a href={taskHref(t.id, suiteQ)}>{t.name}</a></th>
              {#each dotValues as row, k (k)}
                <td class="end"
                  >{row[i] === null ? '×' : fmtScore(row[i])}{#if dnf[k]![i]}<span class="visually-hidden">
                      {dnf[k]![i]}</span
                    >{/if}</td
                >
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </details>
</ErrorBoundary>

<h2>Time per task</h2>
<ErrorBoundary what="the run times" error={runsError} {onretry}>
  {#if !nums.timesLoaded}
    <p class="muted" role="status">Loading run times…</p>
  {:else if !tAxis}
    <p class="sub">
      Time comparisons are unavailable for pooled deployments or when timings were not recorded.
    </p>
  {:else}
    <p class="sub">
      Seconds per task (median of finished runs) on a log scale: equal distances are equal ratios, not equal
      seconds.{dnfNote}
    </p>
    <ul class="legend" aria-label="Deployments">
      {#each labels as l, k (k)}
        <li>
          <span class="dot" style:background={colors[k]} aria-hidden="true"></span>{l}: {depLabels[k]}
        </li>
      {/each}
    </ul>
    {#if timeCaveat}<p class="caveat">{timeCaveat}</p>{/if}
    <RowsChart
      tasks={sharedTasks}
      values={timeValues}
      dnf={anyDnf ? dnf : null}
      {labels}
      {colors}
      axis={tAxis}
      tick={niceTime}
      show={fmtSeconds}
      what="Median seconds per shared task, one dot per setup, log scale{timeCaveat
        ? '; from different machines'
        : ''}"
      {suiteQ}
    />
    <details class="alt">
      <summary>Show the times as a table</summary>
      <div class="scroll">
        <table>
          <caption class="visually-hidden">Median finished time of each setup on each shared task</caption>
          <thead>
            <tr
              ><th scope="col">Task</th>{#each labels as l, k (k)}<th scope="col" class="end">{l}</th
                >{/each}</tr
            >
          </thead>
          <tbody>
            {#each sharedTasks as t, i (t.id)}
              <tr>
                <th scope="row"><a href={taskHref(t.id, suiteQ)}>{t.name}</a></th>
                {#each timeValues as row, k (k)}<td class="end"
                    >{row[i] === null ? '–' : fmtSeconds(row[i])}</td
                  >{/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </details>
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
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-4);
    margin: 0 0 var(--space-2);
    padding: 0;
    list-style: none;
    font-size: var(--text-sm);
  }
  .dot {
    display: inline-block;
    width: 0.7em;
    height: 0.7em;
    border-radius: 50%;
    margin-right: 0.4em;
  }
  .caveat {
    margin: 0 0 var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--warn-soft);
    color: var(--warn);
    border-radius: var(--radius);
    font-size: var(--text-sm);
  }
  .alt {
    margin-top: var(--space-2);
    font-size: var(--text-sm);
  }
  .alt summary {
    cursor: pointer;
    color: var(--accent);
  }
  .scroll {
    overflow-x: auto;
  }
  .alt table {
    width: 100%;
    border-collapse: collapse;
    margin-top: var(--space-2);
  }
  .alt th,
  .alt td {
    padding: var(--space-1) var(--space-3);
    text-align: left;
    border-bottom: 1px solid var(--border);
  }
  .alt .end {
    text-align: right;
  }
</style>
