<script lang="ts">
  // One task's page body (TASK-HEAD..HARNESS): header, tiles, prompt and scoring, checks, spread, performers,
  // effort, harness comparison. Everything is derived from `built` (the entries the filters leave) and the
  // task file; per-check results come from the run files as they load.
  import { onMount } from 'svelte';
  import { suiteInfo } from '$lib/core/catalog';
  import { fmtCost, fmtInt, fmtScore, fmtSeconds, fmtUsd, NONE } from '$lib/core/format';
  import { compareHref, modelHref, runHref } from '$lib/paths';
  import type { SuiteIndex } from '$lib/core/types';
  import Empty from '$lib/ui/Empty.svelte';
  import ErrorBoundary from '$lib/ui/ErrorBoundary.svelte';
  import ResponsiveTable from '$lib/ui/ResponsiveTable.svelte';
  import type { Column } from '$lib/ui/table';
  import Dumbbells from './Dumbbells.svelte';
  import EffortChart from './EffortChart.svelte';
  import SpreadChart from './SpreadChart.svelte';
  import {
    bestPerModel,
    byScore,
    checkColumns,
    checkStats,
    deploymentText,
    dumbbells,
    effortPoints,
    fmtTokens,
    harnessLabelOf,
    harnessRows,
    isLongPrompt,
    isProvisional,
    MEASURES,
    methodLabel,
    notCounted,
    plural,
    square,
    suiteLabel,
    tiles,
    variantText,
    type Built,
    type Entry,
    type Measure,
    type RunDetail,
    type TaskFile,
  } from './shape';

  let {
    index,
    file,
    built,
    details,
    detailState,
    suiteQ,
  }: {
    index: SuiteIndex;
    file: TaskFile;
    built: Built;
    details: ReadonlyMap<string, RunDetail>;
    detailState: 'idle' | 'loading' | 'ready' | 'error';
    suiteQ: string | undefined;
  } = $props();

  // Model links are added once mounted: the model route is not prerendered yet, and the prerender crawler
  // fails on a link to a page that doesn't exist. Drop this when /model/<id>/ is generated.
  let mounted = $state(false);
  onMount(() => (mounted = true));
  const mhref = (id: string) => (mounted ? modelHref(id, suiteQ) : undefined);

  const task = $derived(file.task);
  const info = $derived(suiteInfo(index.catalog));
  const mode = $derived(info.mode(task.mode ?? ''));
  const prov = $derived(isProvisional(task.status));
  const entries = $derived(built.entries);
  const area = $derived(
    index.catalog.areas.find((a) => a.id === task.area)?.label ??
      (task.area ? task.area[0]!.toUpperCase() + task.area.slice(1) : ''),
  );
  const harnesses = $derived((mode?.harnesses ?? []) as string[]);
  const hLabel = (id: string) => harnessLabelOf(info, id);
  const tl = $derived(tiles(entries, task.scale));
  const long = $derived(isLongPrompt(task.prompt || task.summary));
  let expanded = $state(false);
  let showAll = $state(false);
  let measure = $state<Measure>('time');

  const best = $derived(bestPerModel(index, task.mode, entries));
  const list = $derived(showAll ? entries.slice().sort(byScore) : best);
  const crit = $derived(task.criteria.map((c) => c.label));
  const cols = $derived(checkColumns(list, details, crit));
  const stats = $derived(checkStats(entries, details));
  const tokens = $derived(new Map([...details].map(([k, v]) => [k, v.tokensOut])));
  const effort = $derived(effortPoints(entries, measure, tokens));
  const bestPoints = $derived(
    bestPerModel(
      index,
      task.mode,
      effort.points.map((p) => p.entry),
    ),
  );
  const hRows = $derived(harnessRows(entries, harnesses));
  const bells = $derived(dumbbells(entries, harnesses));
  const top = $derived(best.slice(0, 4));

  const run = (e: Entry) => runHref(e.latest.uuid, suiteQ);
  const setupName = (e: Entry) =>
    `${e.label} · ${variantText(e.setup, harnesses.length > 1, hLabel)} · ${deploymentText(index, e.setup)}`;
  const fmtM = (v: number) =>
    measure === 'time' ? fmtSeconds(v) : measure === 'tokens' ? fmtTokens(v) : fmtUsd(v);
  const scale = $derived(fmtScore(tl.scale).replace(/\.0$/, ''));

  const perfCols = $derived<Column<{ rank: number; e: Entry }>[]>([
    { id: 'rank', header: '#', cardHide: true },
    { id: 'maker', header: 'Maker', cardLabel: false },
    { id: 'model', header: 'Model', rowHeader: true },
    { id: 'setup', header: 'Setup', cardLabel: false, class: 'setupcol' },
    { id: 'score', header: 'Score', align: 'end', cardLabel: 'Score' },
    ...cols.map((k) => ({ id: `chk:${k}`, header: k, title: k, cardHide: true, class: 'chk' })),
    ...(cols.length ? [{ id: 'squares', header: 'Checks', tableHide: true, cardLabel: false as const }] : []),
    { id: 'time', header: 'Time', align: 'end' },
    { id: 'tokens', header: 'Tokens out', align: 'end' },
    { id: 'cost', header: 'Cost', align: 'end' },
  ]);
  const perfRows = $derived(list.map((e, i) => ({ rank: i + 1, e })));
  const makerLabel = (e: Entry) =>
    index.entities.makers[e.setup.maker]?.label || e.setup.labels.maker || e.setup.maker;
  const shortModel = (e: Entry) => index.entities.models[e.setup.model]?.label || e.setup.labels.model;
</script>

<header class="head">
  <div class="pills">
    <span class="tag">{info.tier(task.tier ?? '').label}</span>
    <span class="tag">{[mode?.label, area].filter(Boolean).join(' · ')}</span>
    {#if harnesses.length}<span class="tag">{harnesses.map(hLabel).join(' / ')}</span>{/if}
    {#if prov}<span class="tag warn">Provisional</span>{/if}
  </div>
  <ul class="meta">
    <li>
      Scored by {methodLabel(index.catalog, task.method)}{task.total !== null
        ? `, ${fmtInt(task.total)} ${task.unit || 'points'}`
        : ''}
    </li>
    <li>
      Task v{task.version ?? '?'}{task.rubricVersion !== null ? ` · rubric v${task.rubricVersion}` : ''}
    </li>
    {#if task.aliases.length}<li>Formerly {task.aliases.join(', ')}</li>{/if}
    {#if task.addedIn}<li>Added in suite {suiteLabel(task.addedIn)}</li>{/if}
  </ul>
</header>
{#if prov}
  <p class="banner">
    Provisional: not scored in this suite yet. Its runs are shown here only; they never count toward any score
    or ranking.
  </p>
{/if}

{#if !entries.length}
  <p class="big">
    {#if built.filteredOut}
      No setup left for these filters: {plural(built.filteredOut, 'run')} of this task {built.filteredOut ===
      1
        ? 'is'
        : 'are'} hidden by them.
    {:else}
      No run of this task counts in this suite yet.
      {#if notCounted(built.states, task)}
        {plural(notCounted(built.states, task), 'run')}
        {notCounted(built.states, task) === 1 ? 'exists' : 'exist'} but
        {notCounted(built.states, task) === 1 ? "doesn't" : "don't"} count (an older task version, a harness this
        suite doesn't score, or marked invalid).
      {/if}
    {/if}
  </p>
{:else}
  <ErrorBoundary what="the numbers">
    <div class="tiles">
      <div class="tile">
        <span class="k">Setups that ran it</span>
        <span class="v">{tl.setups}</span>
        <span class="d">{plural(tl.models, 'model')} · {tl.local} local, {tl.cloud} cloud</span>
      </div>
      <div class="tile">
        <span class="k">Scored {scale}</span>
        <span class="v">{tl.maxed} <small>of {tl.setups}</small></span>
        <span class="bar" aria-hidden="true"
          ><span style="width:{tl.setups ? (tl.maxed / tl.setups) * 100 : 0}%"></span></span
        >
      </div>
      <div class="tile">
        <span class="k">Median score</span>
        <span class="v">{fmtScore(tl.median)}</span>
        <span class="d">range {fmtScore(tl.min)} to {fmtScore(tl.top)}</span>
      </div>
      <div class="tile">
        <span class="k">Fastest top score ({fmtScore(tl.top)})</span>
        <span class="v">{tl.fastest ? fmtSeconds(tl.fastest.time) : NONE}</span>
        {#if tl.fastest}
          <span class="d"
            ><a href={mhref(tl.fastest.setup.model)}>{tl.fastest.label}</a> · {hLabel(
              tl.fastest.setup.harness,
            )}</span
          >
        {:else}<span class="d">no time recorded</span>{/if}
      </div>
    </div>
  </ErrorBoundary>
{/if}

<div class="two">
  <section class="block">
    <h2>What it asks</h2>
    {#if task.prompt || task.summary}
      <pre class:collapsed={long && !expanded}>{task.prompt || task.summary}</pre>
      {#if long}
        <button type="button" class="linkbtn" aria-expanded={expanded} onclick={() => (expanded = !expanded)}
          >{expanded ? 'Collapse the prompt' : 'Show the full prompt'}</button
        >
      {/if}
    {:else}
      <p class="muted">The catalog has no prompt for this task.</p>
    {/if}
  </section>
  <section class="block">
    <h2>How it's scored</h2>
    {#if task.rules.length}
      <h3>Rules</h3>
      <ul class="rules">
        {#each task.rules as r, i (i)}<li>{r}</li>{/each}
      </ul>
    {/if}
    {#if task.criteria.length}
      <h3>{(task.method && index.catalog.scoring_methods?.[task.method]?.criteria_label) || 'Criteria'}</h3>
      <ul class="rules">
        {#each task.criteria as c (c.label)}
          <li>
            {c.label}{#if c.max !== null}<span class="muted">
                {c.max} {c.max === 1 ? 'point' : 'points'}</span
              >{/if}
          </li>
        {/each}
      </ul>
    {/if}
    {#if !task.rules.length && !task.criteria.length}
      <p class="muted">The catalog lists no rules for this task.</p>
    {/if}
    <p class="muted">
      Scored {[
        task.total !== null
          ? `${fmtInt(task.total)} ${task.unit || 'points'} in total${task.scale ? `, scaled to ${task.scale}` : ''}`
          : null,
        `by ${methodLabel(index.catalog, task.method)}`,
      ]
        .filter(Boolean)
        .join(', ')}.
    </p>
  </section>
</div>

{#if entries.length}
  {#if built.filteredOut || built.unscored || built.unknownSetup}
    <p class="muted small" role="status">
      {#if built.filteredOut}{plural(built.filteredOut, 'run')} of setups hidden by the filters.{/if}
      {#if built.unscored}{plural(built.unscored, 'counted run')} without a score.{/if}
      {#if built.unknownSetup}{plural(built.unknownSetup, 'run')} of a setup the index doesn't list.{/if}
    </p>
  {/if}

  <section>
    <h2>Which checks trip models up</h2>
    <ErrorBoundary what="the checks">
      {#if detailState === 'error' && !stats.length}
        <p class="muted">Couldn’t load the per-check results.</p>
      {:else if !stats.length && detailState !== 'ready'}
        <p class="muted">Loading per-check results…</p>
      {:else if !stats.length}
        <p class="muted">No per-check results were published for these runs.</p>
      {:else}
        <p class="muted">
          Share of the {plural(Math.max(...stats.map((s) => s.n)), 'setup')}’ newest counted runs that passed
          each check, hardest first. A part-credit check counts the share it earned.
          {#if detailState === 'loading'}Loading more…{/if}
        </p>
        <ul class="bars">
          {#each stats as s (s.key)}
            <li>
              <span class="bname">{s.key}</span>
              <span class="bar"><span style="width:{s.rate * 100}%"></span></span>
              <span class="pct">{Math.round(s.rate * 100)}%</span>
              <span class="muted bn">{s.full} of {s.n} runs</span>
            </li>
          {/each}
        </ul>
      {/if}
    </ErrorBoundary>
  </section>

  <section>
    <h2>Score spread</h2>
    <p class="muted">
      One dot per setup, at its mean score. Dots at the same score stack. Select a dot for its run.
    </p>
    <p class="legend"><span class="tag local">Local</span> <span class="tag cloud">Cloud</span></p>
    <ErrorBoundary what="the score spread">
      <SpreadChart {entries} href={run} title={(e) => `${setupName(e)} · ${fmtScore(e.mean)}`} />
    </ErrorBoundary>
  </section>

  <section>
    <h2>Best performers</h2>
    <p class="muted">
      {showAll
        ? 'Every setup'
        : `Each model's best setup (the one the leaderboard ranks it by, on its ${index.catalog.labels.overall} score)`},
      ranked by score on this task, then time. Check squares are from the setup's newest counted run. Select a
      score to open that run.{#if detailState === 'loading'}
        Loading checks…{/if}
    </p>
    <ErrorBoundary what="the performers">
      <ResponsiveTable
        rows={perfRows}
        columns={perfCols}
        rowKey={(r) => r.e.setup.id}
        caption="Best performers on this task"
      >
        {#snippet cell(r, col, layout)}
          {#if col.id === 'rank'}{r.rank}
          {:else if col.id === 'maker'}{makerLabel(r.e)}
          {:else if col.id === 'model'}
            {#if layout === 'card'}<span class="rank">#{r.rank}</span>{/if}<a
              class="mlink"
              href={mhref(r.e.setup.model)}>{shortModel(r.e)}</a
            >
            {#if layout === 'card'}<span class="tag {r.e.local ? 'local' : 'cloud'}"
                >{r.e.local ? 'local' : 'cloud'}</span
              >{/if}
          {:else if col.id === 'setup'}
            <span class="tag {r.e.local ? 'local' : 'cloud'}">{r.e.local ? 'local' : 'cloud'}</span>
            {variantText(r.e.setup, harnesses.length > 1, hLabel)}
            <span class="muted">{deploymentText(index, r.e.setup)}</span>
          {:else if col.id === 'score'}
            <a class="score" href={run(r.e)} aria-label="{r.e.label} {fmtScore(r.e.mean)}, open its run"
              >{fmtScore(r.e.mean)}</a
            >{#if r.e.runs.length > 1}<span class="muted">
                ×{r.e.runs.length}{layout === 'card' ? ' runs' : ''}</span
              >{/if}
          {:else if col.id === 'squares'}
            <span class="squares">
              {#each cols as k (k)}{@render sq(r.e, k)}{/each}
            </span>
          {:else if col.id.startsWith('chk:')}
            {@render sq(r.e, col.id.slice(4))}
          {:else if col.id === 'time'}{fmtSeconds(r.e.time)}
          {:else if col.id === 'tokens'}{fmtTokens(tokens.get(r.e.latest.uuid))}
          {:else if col.id === 'cost'}<span title={r.e.local ? 'Estimated electricity cost' : 'Billed cost'}
              >{fmtCost(r.e.cost, r.e.local)}</span
            >
          {/if}
        {/snippet}
      </ResponsiveTable>
    </ErrorBoundary>
    <div class="actions">
      {#if entries.length > best.length}
        <button type="button" class="seg" onclick={() => (showAll = !showAll)}
          >{showAll ? 'Show best setup per model' : `Show all ${entries.length} setups`}</button
        >
      {/if}
      {#if top.length > 1}
        <a
          href={compareHref(
            top.map((e) => e.setup.id),
            suiteQ,
          )}>Compare top {top.length} →</a
        >
      {/if}
    </div>
  </section>

  <section>
    <h2>Score against effort</h2>
    <div class="seg-group" role="radiogroup" aria-label="Measure for the horizontal axis">
      {#each Object.keys(MEASURES) as m (m)}
        <button
          type="button"
          role="radio"
          aria-checked={measure === m}
          class="seg"
          onclick={() => (measure = m as Measure)}>{MEASURES[m as Measure].label}</button
        >
      {/each}
    </div>
    <p class="muted">
      {#if effort.points.length}
        Score against {MEASURES[measure].axis.toLowerCase()}, log scale. Up and to the left is better. Each
        dot is a setup; the best setup of each model is named.
        {#if effort.skipped}
          {plural(effort.skipped, 'setup')} left off ({measure === 'cost'
            ? 'local hardware with no power figure, or no cost recorded'
            : measure === 'tokens' && detailState !== 'ready'
              ? 'token counts are still loading or not recorded'
              : 'not recorded'}).
        {/if}
      {:else if measure === 'tokens' && detailState !== 'ready'}
        Token counts come from each setup's newest run and are loading.
      {:else}
        Nothing to plot: none of these setups recorded this measure.
      {/if}
      Times and costs are from different machines and providers, so read them as each setup's own, not as a like-for-like
      speed test.
    </p>
    <p class="legend"><span class="tag local">Local</span> <span class="tag cloud">Cloud</span></p>
    {#if effort.points.length}
      <ErrorBoundary what="the effort chart">
        <EffortChart
          points={effort.points}
          named={bestPoints}
          axis={MEASURES[measure].axis}
          fmt={fmtM}
          href={run}
          nameOf={(e) => shortModel(e) ?? e.label}
          describe={(e) =>
            `${setupName(e)} · score ${fmtScore(e.mean)} · ${fmtM(
              (effort.points.find((p) => p.entry === e) ?? { value: 0 }).value,
            )}`}
        />
      </ErrorBoundary>
    {/if}
  </section>

  {#if harnesses.length > 1}
    <section>
      <h2>Harness comparison</h2>
      <p class="muted">The same task through each agent harness this suite scores for it.</p>
      <ErrorBoundary what="the harness comparison">
        {#if !hRows.length}
          <Empty>No harness has a counted run of this task.</Empty>
        {:else}
          <ResponsiveTable
            rows={hRows}
            rowKey={(r) => r.id}
            caption="Score and time by harness"
            columns={[
              { id: 'h', header: 'Harness', rowHeader: true },
              { id: 'n', header: 'Setups', align: 'end' },
              { id: 'mean', header: 'Mean score', align: 'end' },
              { id: 'best', header: 'Best score', align: 'end' },
              { id: 'time', header: 'Median time', align: 'end' },
            ]}
          >
            {#snippet cell(r, col)}
              {#if col.id === 'h'}<span class="hsw" style="background:var(--series-{(r.index % 4) + 1})"
                ></span>{hLabel(r.id)}
              {:else if col.id === 'n'}{r.entries.length}
              {:else if col.id === 'mean'}{fmtScore(r.mean)}
              {:else if col.id === 'best'}{fmtScore(r.best)}
              {:else}{fmtSeconds(r.time)}{/if}
            {/snippet}
          </ResponsiveTable>
        {/if}
        <h3>Same setup, different harness</h3>
        {#if !bells.length}
          <p class="muted">
            No model ran this task on more than one harness at the same setup, so there is nothing to compare
            yet.
          </p>
        {:else}
          <p class="legend">
            {#each hRows as r (r.id)}<span class="tag"
                ><span class="hsw" style="background:var(--series-{(r.index % 4) + 1})"></span>{hLabel(
                  r.id,
                )}</span
              >{/each}
          </p>
          <Dumbbells rows={bells} {harnesses} harnessLabel={hLabel} href={run} />
        {/if}
      </ErrorBoundary>
    </section>
  {/if}
{/if}

{#snippet sq(e: Entry, key: string)}
  {@const g = details.get(e.latest.uuid)?.groups.find((x) => x.key === key)}
  {@const s = square(g?.value)}
  <span class="sq {s.kind}" role="img" title="{key}: {s.text}" aria-label="{key}: {s.text}">{s.mark}</span>
{/snippet}

<style>
  section,
  .two {
    margin-bottom: var(--space-5);
  }
  .head {
    margin-bottom: var(--space-3);
  }
  .pills {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .meta {
    list-style: none;
    margin: var(--space-2) 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-4);
    color: var(--muted);
    font-size: var(--text-sm);
  }
  .big {
    font-size: var(--text-lg);
  }
  .small {
    font-size: var(--text-sm);
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    gap: var(--space-3);
    margin: var(--space-4) 0;
  }
  .tile {
    display: grid;
    gap: 2px;
    align-content: start;
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
  }
  .k {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  .v {
    font-size: var(--text-xl);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .v small {
    font-size: var(--text-sm);
    font-weight: 400;
    color: var(--muted);
  }
  .d {
    font-size: var(--text-sm);
    color: var(--muted);
  }
  .bar {
    display: block;
    height: 8px;
    background: var(--bar);
    border-radius: 4px;
    overflow: hidden;
  }
  .bar > span {
    display: block;
    height: 100%;
    background: var(--accent-fill);
  }
  .two {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
    gap: var(--space-4) var(--space-5);
  }
  pre {
    margin: 0 0 var(--space-2);
    padding: var(--space-3);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-family: var(--mono);
    font-size: var(--text-sm);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  pre.collapsed {
    max-height: 14rem;
    overflow: hidden;
    -webkit-mask-image: linear-gradient(#000 70%, transparent);
    mask-image: linear-gradient(#000 70%, transparent);
  }
  .linkbtn {
    background: none;
    border: 0;
    padding: 0;
    color: var(--accent);
    text-decoration: underline;
  }
  h3 {
    margin: var(--space-3) 0 var(--space-1);
    font-size: var(--text-sm);
    color: var(--muted);
  }
  .rules {
    margin: 0 0 var(--space-2);
    padding-left: 1.2rem;
    font-size: var(--text-sm);
  }
  .bars {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-1);
  }
  .bars li {
    display: grid;
    grid-template-columns: minmax(8rem, 16rem) 1fr 3rem 7rem;
    align-items: center;
    gap: var(--space-3);
    font-size: var(--text-sm);
  }
  .bname {
    overflow-wrap: anywhere;
  }
  .pct {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .bn {
    white-space: nowrap;
  }
  @media (max-width: 639px) {
    .bars li {
      grid-template-columns: 1fr 3rem;
    }
    .bars .bar {
      grid-column: 1 / -1;
      order: 3;
    }
    .bars .bn {
      grid-column: 1 / -1;
      order: 4;
    }
  }
  .legend {
    margin: var(--space-1) 0;
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .hsw {
    display: inline-block;
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 50%;
    margin-right: 0.4rem;
    vertical-align: -1px;
  }
  .score {
    font-weight: 700;
    padding: 1px 8px;
    border-radius: var(--radius);
    background: var(--accent-soft);
    color: var(--accent);
    text-decoration: none;
    font-variant-numeric: tabular-nums;
  }
  .score:hover {
    text-decoration: underline;
  }
  .mlink {
    color: inherit;
    font-weight: 600;
  }
  .rank {
    color: var(--muted);
    margin-right: var(--space-2);
  }
  .squares {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 3px;
    justify-content: flex-end;
  }
  .sq {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.3rem;
    height: 1.3rem;
    border-radius: 3px;
    font-size: var(--text-xs);
    font-weight: 700;
    background: var(--tray);
    color: var(--muted);
  }
  .sq.pass {
    background: var(--good-soft);
    color: var(--good);
  }
  .sq.fail {
    background: var(--bad-soft);
    color: var(--bad);
  }
  .sq.partial {
    background: var(--warn-soft);
    color: var(--warn);
  }
  :global(td.setupcol) {
    min-width: 15rem;
  }
  :global(td.chk) {
    text-align: center;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-4);
    margin-top: var(--space-3);
    font-size: var(--text-sm);
  }
  .seg {
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    background: var(--surface);
    padding: 0.3rem 0.7rem;
    font-size: var(--text-sm);
  }
  .seg-group {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    background: var(--tray);
    border-radius: var(--radius);
  }
  .seg-group .seg {
    border: 0;
    background: transparent;
  }
  .seg-group .seg[aria-checked='true'] {
    background: var(--surface);
    font-weight: 700;
    box-shadow: 0 0 0 1px var(--border-strong);
  }
</style>
