<script lang="ts">
  // /run/<uuid>: one run, its own shareable page (B-21, spec 5.2). The data is one small file, loaded by the
  // route; the run's own `labels` give model, maker, hardware and machine credit; only the task name and method labels
  // use a suite index that another page already loaded.
  import { page } from '$app/state';
  import { cachedIndex } from '$lib/data';
  import { fmtDate, fmtScore } from '$lib/core/format';
  import { link, modelHref, runsHref, taskHref } from '$lib/paths';
  import { labelsFromIndex } from '$lib/pages/run/labels';
  import RelatedRuns from '$lib/pages/run/RelatedRuns.svelte';
  import RunOutput from '$lib/pages/run/RunOutput.svelte';
  import { pickSuite, shapeRun, type CheckItem, type SuiteStanding } from '$lib/pages/run/shape';
  import { chrome, goBack } from '$lib/ui/layout/chrome.svelte';
  import type { Column } from '$lib/ui/tables/table';
  import Empty from '$lib/ui/feedback/Empty.svelte';
  import ErrorBoundary from '$lib/ui/feedback/ErrorBoundary.svelte';
  import { heat } from '$lib/ui/heat';
  import PageHeader from '$lib/ui/layout/PageHeader.svelte';
  import ResponsiveTable from '$lib/ui/tables/ResponsiveTable.svelte';

  import type { PageData } from '../../../routes/run/[id]/$types';

  let { data }: { data: PageData } = $props();

  const wanted = $derived(page.url.searchParams.get('suite'));
  const current = $derived(data.meta.current_suite);
  const view = $derived.by(() => {
    if (!data.run) return null;
    const suite = pickSuite(data.run, wanted, current);
    return shapeRun(data.run, {
      suite,
      currentSuite: current,
      labels: labelsFromIndex(cachedIndex(suite ?? current), data.run, suite),
    });
  });
  // Links keep a non-current suite
  const suiteQ = $derived(view?.suite && view.suite !== current ? view.suite : undefined);
  const modelRuns = $derived(view?.model.id ? runsHref(suiteQ, { model: view.model.id }) : null);
  const scoreHeat = $derived(heat(view?.score.value));

  function back(e: MouseEvent) {
    // The history entry restores the filters of the page the reader came from.
    if (chrome.previous && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      void goBack();
    }
  }

  const suiteCols: Column<SuiteStanding>[] = [
    { id: 'suite', header: 'Suite', rowHeader: true, value: (s) => s.suite },
    { id: 'state', header: 'Standing', value: (s) => s.text },
    { id: 'score', header: 'Score', align: 'end', value: (s) => fmtScore(s.score) },
    { id: 'task', header: 'Task', value: (s) => s.task },
  ];
</script>

{#snippet checks(items: CheckItem[])}
  <ul class="checks">
    {#each items as it, j (j)}
      <li class:fail={it.passed === false}>
        <span class="mark" aria-hidden="true">{it.passed ? '✓' : it.passed === false ? '✕' : '–'}</span>
        <span class="visually-hidden"
          >{it.passed ? 'Passed:' : it.passed === false ? 'Failed:' : 'Not run:'}</span
        >
        {it.label}{#if it.detail}<span class="muted">&nbsp;({it.detail})</span>{/if}
        {#if it.items.length}{@render checks(it.items)}{/if}
      </li>
    {/each}
  </ul>
{/snippet}

{#if !view}
  <PageHeader
    title="Run not found"
    docTitle="Run not found"
    crumbs={[{ label: 'Runs', href: link('/runs/') }, { label: 'Not found' }]}
  />
  <Empty>
    No run <code>{data.id}</code> is published here ({data.error}).
    {#snippet action()}<a href={link('/')}>Back to the leaderboard</a>{/snippet}
  </Empty>
{:else}
  <PageHeader
    title={view.task.name}
    docTitle="{view.task.name} · run {view.shortId}"
    crumbs={[
      { label: 'Runs', href: runsHref(suiteQ) },
      ...(modelRuns ? [{ label: `${view.model.label} runs`, href: modelRuns }] : []),
      { label: `Run ${view.shortId}` },
    ]}
  />

  {#if chrome.previous}<p class="back"><a href={chrome.previous} onclick={back}>← Back</a></p>{/if}

  <p class="sub">
    <a href={view.model.id ? modelHref(view.model.id, suiteQ) : undefined}>{view.model.label}</a>
    {#if view.where}<span class="tag {view.where}">{view.where}</span>{/if}
    <span class="muted">· run <code>{view.uuid}</code></span>
  </p>

  <ErrorBoundary what="the run">
    <section class="card summary" aria-label="Result">
      <div class="scorebox">
        <span
          class="score"
          class:none={!scoreHeat}
          style={scoreHeat ? `background:${scoreHeat.bg};color:${scoreHeat.fg}` : undefined}
          >{fmtScore(view.score.value)}</span
        >
        <span class="of muted">out of 10</span>
      </div>
      <div class="said">
        <p class="sentence">
          {view.score.sentence}{#if view.score.methodText}, {view.score.methodText}{/if}.
        </p>
        <p class="standing">
          {view.standingLine}
          <span
            class="tag"
            class:good={view.outcome.kind === 'finished'}
            class:warn={view.outcome.kind === 'timeout'}
            class:bad={view.outcome.kind === 'error'}>{view.outcome.label}</span
          >
        </p>
      </div>
    </section>

    {#if view.task.id || view.siblings.length}
      {#key `${view.suite}|${view.model.id}|${view.task.id}`}
        <RelatedRuns {view} {suiteQ} />
      {/key}
    {/if}

    {#if view.notes.length}
      <section class="notes" aria-label="Corrections">
        <h2>Recorded as…</h2>
        <ul>
          {#each view.notes as n (n)}<li>{n}</li>{/each}
        </ul>
      </section>
    {/if}

    <div class="cols">
      <section aria-labelledby="h-run">
        <h2 id="h-run">The run</h2>
        <dl class="facts">
          {#each view.measures as f (f.label)}
            <div title={f.title}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          {/each}
        </dl>
      </section>
      <section aria-labelledby="h-setup">
        <h2 id="h-setup">The setup</h2>
        <dl class="facts">
          {#each view.setup as f (f.label)}
            <div title={f.title}>
              <dt>{f.label}</dt>
              <dd>
                {#if f.to?.kind === 'model'}<a href={modelHref(f.to.id, suiteQ)}>{f.value}</a
                  >{:else}{f.value}{/if}
              </dd>
            </div>
          {/each}
        </dl>
      </section>
    </div>

    <section aria-labelledby="h-checks">
      <h2 id="h-checks">Checks and tests</h2>
      {#if view.checks.empty}
        <p class="muted">{view.checks.empty}</p>
      {:else if view.checks.groupLines.length}
        <ul class="checks">
          {#each view.checks.groupLines as l (l)}<li>{l}</li>{/each}
        </ul>
      {:else}
        {#each view.checks.groups as g, i (i)}
          {#if g.name}<h3>{g.name}</h3>{/if}
          {@render checks(g.items)}
        {/each}
      {/if}
    </section>

    <section aria-labelledby="h-suites">
      <h2 id="h-suites">In each suite</h2>
      <ResponsiveTable
        rows={view.suites}
        columns={suiteCols}
        rowKey={(s) => s.suite}
        caption="This run's standing in each suite"
        empty="This run is not part of any visible suite."
      >
        {#snippet cell(s, col)}
          {#if col.id === 'task' && s.task}
            <a href={taskHref(s.task, s.suite === current ? undefined : s.suite)}>{s.task}</a>
          {:else}{col.value?.(s) ?? '—'}{/if}
        {/snippet}
      </ResponsiveTable>
    </section>

    {#if view.statusHistory.length}
      <section aria-labelledby="h-status">
        <h2 id="h-status">Status history</h2>
        <ol class="history">
          {#each view.statusHistory as s (s.at + s.text)}
            <li>
              <time datetime={s.at}>{fmtDate(s.at)}</time>
              {s.text}{#if s.by}<span class="muted"> · {s.by}</span>{/if}
            </li>
          {/each}
        </ol>
      </section>
    {/if}

    {#if view.output}
      <section aria-labelledby="h-out">
        <h2 id="h-out" class="visually-hidden">Model output</h2>
        {#key view.uuid}
          <RunOutput output={view.output} />
        {/key}
      </section>
    {:else}
      <section aria-labelledby="h-out">
        <h2 id="h-out">Model output</h2>
        <p class="muted">No model output was published for this run.</p>
      </section>
    {/if}

    <p class="muted small foot">
      Run {view.shortId}{#if view.crucibleVersion}, recorded by Crucible {view.crucibleVersion}{/if}{#if view.task.version !== null},
        task v{view.task.version}{/if}.
    </p>
  </ErrorBoundary>
{/if}

<style>
  .back {
    margin: 0 0 var(--space-3);
    font-size: var(--text-sm);
  }
  .sub {
    margin: 0 0 var(--space-4);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  code {
    font: var(--text-sm) var(--mono);
    overflow-wrap: anywhere;
  }
  section {
    margin-bottom: var(--space-5);
  }
  .card {
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    padding: var(--space-4);
  }
  .summary {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4) var(--space-5);
    align-items: center;
  }
  .scorebox {
    display: grid;
    justify-items: center;
    gap: var(--space-1);
  }
  .score {
    min-width: 4.5rem;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-lg);
    text-align: center;
    font-size: var(--text-xl);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .score.none {
    background: var(--tray);
    color: var(--muted);
  }
  .of {
    font-size: var(--text-xs);
  }
  .said {
    flex: 1;
    min-width: 14rem;
  }
  .said p {
    margin: 0 0 var(--space-1);
  }
  .sentence {
    font-weight: 600;
  }
  .notes {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    background: var(--warn-soft);
    color: var(--warn);
  }
  .notes h2 {
    font-size: var(--text-md);
  }
  .notes ul {
    margin: 0;
    padding-left: 1.2rem;
  }
  .cols {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
    gap: 0 var(--space-5);
  }
  .facts {
    margin: 0;
    font-size: var(--text-sm);
  }
  .facts > div {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-1) 0;
    border-bottom: 1px solid var(--border);
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
    text-align: right;
    overflow-wrap: anywhere;
  }
  h3 {
    margin: var(--space-3) 0 var(--space-1);
    font-size: var(--text-sm);
    color: var(--muted);
  }
  .checks {
    list-style: none;
    margin: 0;
    padding: 0;
    font-size: var(--text-sm);
  }
  .checks li {
    padding: 2px 0;
  }
  .checks .checks {
    margin-left: 1.2rem;
  }
  .checks .mark {
    display: inline-block;
    width: 1.2rem;
    color: var(--good);
    font-weight: 700;
  }
  .checks li.fail .mark {
    color: var(--bad);
  }
  .history {
    margin: 0;
    padding-left: 1.2rem;
    font-size: var(--text-sm);
  }
  .small {
    font-size: var(--text-sm);
  }
  .foot {
    margin-top: var(--space-5);
  }
</style>
