<script lang="ts">
  // One model (`/model/<maker>/<name>`), on the shared DataContext with `model` pinned (B-19). Variant and
  // deployment are ordinary filters; the tiles, areas, deployments, variants, A/B, tasks and "other runs" are
  // all derived from the same scope().
  import { afterNavigate } from '$app/navigation';
  import { onMount, untrack } from 'svelte';
  import { listPhrase } from '$lib/core/format';
  import type { Dim } from '$lib/core/context';
  import type { Meta, SuiteIndex } from '$lib/core/types';
  import ControlPanel from '$lib/ui/ControlPanel.svelte';
  import { ContextState } from '$lib/ui/contextState.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import ErrorBoundary from '$lib/ui/ErrorBoundary.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import NotShown from '$lib/ui/NotShown.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import { describeNotShown } from '$lib/ui/notShown';
  import { taskHref } from '$lib/paths';
  import { fmtSeconds, fmtScore } from '$lib/core/format';
  import AbBlock from './AbBlock.svelte';
  import AreaBars from './AreaBars.svelte';
  import DeploymentsTable from './DeploymentsTable.svelte';
  import { makerHref, modelsHref, suiteParam } from './links';
  import { translateModelParams } from './params';
  import { indexRuns, loadModelRuns, type ModelRuns } from './runs';
  import {
    areaBars,
    areaGroups,
    countedStates,
    deploymentTable,
    didNotFinish,
    fullVariantText,
    headline,
    makerLabelOf,
    otherCounts,
    scopesOf,
    sectionsRan,
    toggleFilters,
    variantTable,
    whereText,
    type DeploymentRow,
    type VariantRow,
  } from './shape';
  import Tiles from './Tiles.svelte';
  import TasksBlock from './TasksBlock.svelte';
  import VariantsTable from './VariantsTable.svelte';

  let { data }: { data: { meta: Meta; index: SuiteIndex; model: string; runs: ModelRuns | null } } = $props();

  const modelId = untrack(() => data.model);
  const DIMS: Dim[] = ['reasoning', 'quant', 'packager', 'format', 'harness', 'where', 'hw', 'provider'];

  const cs = untrack(
    () => new ContextState({ meta: data.meta, index: data.index, pin: { model: new Set([modelId]) } }),
  );

  // B-18: Combined is the default section, unless the model ran in only one (then that one). The prerendered
  // page already says so; the URL's own `mode` always wins.
  function soloSection(index: SuiteIndex): string | null {
    const ran = sectionsRan(index, modelId);
    return ran.length === 1 ? ran[0]! : null;
  }
  {
    const solo = untrack(() => soloSection(cs.index));
    if (solo && untrack(() => cs.ctx.section) !== solo) cs.ctx = { ...cs.ctx, section: solo as never };
  }

  let mounted = $state(false);
  async function settle() {
    let next = translateModelParams(cs.index, modelId, cs.ctx, location.search);
    const solo = soloSection(cs.index);
    if (solo && !new URLSearchParams(location.search).has('mode') && next.section !== solo)
      next = { ...next, section: solo as never };
    if (next !== cs.ctx) await cs.update(next);
  }
  onMount(async () => {
    await cs.init();
    await settle();
    mounted = true;
  });
  afterNavigate(({ type }) => {
    if (type !== 'enter') void cs.syncFromUrl().then(settle);
  });

  // The model's runs, per suite (the file is fetched on demand; the load function supplied the current suite's)
  let loaded = $state.raw<{ suite: string; runs: ModelRuns | null; error: string | null } | null>(
    untrack(() => ({ suite: data.index.suite, runs: data.runs, error: null })),
  );
  const ready = $derived(loaded?.suite === cs.index.suite);
  async function fetchRuns(suite: string) {
    loaded = null;
    try {
      loaded = { suite, runs: await loadModelRuns(fetch, suite, modelId), error: null };
    } catch (e) {
      loaded = { suite, runs: null, error: e instanceof Error ? e.message : String(e) };
    }
  }
  $effect(() => {
    const suite = cs.index.suite;
    untrack(() => {
      if (loaded?.suite !== suite) void fetchRuns(suite);
    });
  });
  const runList = $derived(ready ? (loaded?.runs?.runs ?? []) : null);
  const byCell = $derived(runList ? indexRuns(runList) : null);

  // Everything below is one scope
  const index = $derived(cs.index);
  const ctx = $derived(cs.ctx);
  const sq = $derived(suiteParam(ctx.suite, data.meta.current_suite));
  const suiteName = $derived(index.catalog.suite.name);
  const model = $derived(index.entities.models[modelId]);
  const label = $derived(model?.label ?? modelId.slice(modelId.lastIndexOf('/') + 1));
  const maker = $derived(model?.maker ?? modelId.slice(0, modelId.indexOf('/')));
  const makerName = $derived(makerLabelOf(index, maker));
  const ran = $derived(sectionsRan(index, modelId));
  const { all, sc } = $derived(scopesOf(index, ctx));
  const best = $derived(headline(sc));
  const view = $derived(sc.view);
  const states = $derived(countedStates(ctx));
  const vt = $derived(variantTable(index, all, sc, ctx));
  const dt = $derived(deploymentTable(index, all, sc, ctx, runList));
  const groups = $derived(best ? areaGroups(index, view, best, byCell, states) : []);
  const bars = $derived(areaBars(groups));
  const dnf = $derived(runList ? didNotFinish(index, sc, runList) : []);
  const other = $derived(otherCounts(index, modelId, ctx, view, runList));
  const otherInfo = $derived(describeNotShown(other));
  const harnessVaries = $derived(vt.dims.includes('harness'));
  const filtersOn = $derived(Object.entries(ctx.filters).some(([d, s]) => d !== 'model' && s && s.size));
  const bestDeployment = $derived(
    best ? (index.entities.deployments[best.setup.deployment]?.label ?? best.setup.deployment) : '',
  );
  const packaged = $derived(
    best && best.local && best.setup.packager && best.setup.packager !== 'unrecorded'
      ? (best.setup.labels.packager ?? best.setup.packager)
      : null,
  );
  const sectionNames = $derived(ran.map((m) => index.catalog.modes.find((x) => x.id === m)?.label ?? m));
  const nVariants = $derived(
    new Set(
      Object.values(index.entities.setups)
        .filter((s) => s.model === modelId)
        .map((s) => s.variant),
    ).size,
  );

  let ticked = $state<Set<string>>(new Set());
  $effect(() => {
    void ctx.section;
    void ctx.suite;
    untrack(() => (ticked = new Set()));
  });
  const tick = (key: string, on: boolean) => {
    const next = new Set(ticked);
    if (on) next.add(key);
    else next.delete(key);
    ticked = next;
  };

  const pickDeployment = (r: DeploymentRow) =>
    void cs.update(toggleFilters(cs.ctx, { deployment: r.id }, ['deployment']));
  const pickVariant = (r: VariantRow) => void cs.update(toggleFilters(cs.ctx, r.target, vt.clear));
  const clearFilters = () => {
    const keep = { model: cs.ctx.filters.model! };
    void cs.update({ ...cs.ctx, filters: keep });
  };
  const secs = (v: number | null) =>
    v === null ? '—' : v >= 60 ? `${fmtSeconds(v)} (${Math.round(v)} s)` : fmtSeconds(v);
</script>

<PageHeader
  title={label}
  docTitle="{label} · Models"
  crumbs={[
    { label: 'Models', href: modelsHref(sq) },
    { label: makerName, href: makerHref(maker, sq) },
    { label },
  ]}
>
  <p class="meta">
    <span>By <a href={makerHref(maker, sq)}>{makerName}</a></span>
    {#if whereText(index, modelId)}<span>{whereText(index, modelId)}</span>{/if}
    <span>{nVariants} variant{nVariants === 1 ? '' : 's'}</span>
    {#if packaged}<span>Packaged by {packaged}</span>{/if}
    {#if sectionNames.length}<span>{listPhrase(sectionNames)}</span>{/if}
  </p>
</PageHeader>

{#if cs.failure}<p class="banner bad" role="alert">{cs.failure}</p>{/if}

<!-- The panel's own "Showing n of m" counts every model's setups; this page counts this model's -->
<div class="panelwrap">
  <ControlPanel
    index={cs.index}
    meta={data.meta}
    {ctx}
    onctx={cs.update}
    {sc}
    pinned={['model']}
    dims={DIMS}
    unit="setups"
    unknownSuite={cs.unknownSuite}
    label="Model controls"
  />
</div>
{#if ran.length}
  <p class="showing muted" aria-live="polite">
    Showing {sc.setups.length} of {all.setups.length} setups of this model ({vt.shown} of {vt.total} variants, {dt.shown}
    of {dt.total} deployments)
  </p>
{/if}

{#if ran.length === 0}
  <Empty>No run of this model counts in {suiteName} yet.</Empty>
  <NotShown counts={other} />
{:else if all.rows.length === 0}
  <Empty>
    This model has no counted run in {view.kind === 'combined' ? 'any section' : `the ${view.label} section`} of
    {suiteName}.
    {#if ran.length}It ran in {listPhrase(sectionNames)}.{/if}
  </Empty>
{:else if !best}
  <Empty>
    No setup of this model matches these filters.
    {#snippet action()}<button type="button" onclick={clearFilters}>Clear filters</button>{/snippet}
  </Empty>
{:else}
  <div class:busy={cs.loading} aria-busy={cs.loading}>
    <section aria-labelledby="h-best">
      <h2 id="h-best">{filtersOn ? 'Best setup in scope' : 'Best setup'}</h2>
      <p class="note muted">
        {fullVariantText(index, best.setup, harnessVaries)} on {bestDeployment}{#if best.variants.length > 1 || sc.setups.length > 1}
          , the best of {sc.setups.length} setup{sc.setups.length === 1 ? '' : 's'}{filtersOn
            ? ' that match the filters'
            : ''}{/if}. Tiles, areas, tasks and the A/B below are about this setup; change the filters above,
        or pick a row in the tables, to look at another.
      </p>
      <ErrorBoundary what="the tiles">
        <Tiles {view} stats={best} exclude={ctx.exclude} />
      </ErrorBoundary>
    </section>

    <section aria-labelledby="h-areas">
      <h2 id="h-areas">By area</h2>
      <p class="note muted">
        Mean score on the tasks this setup has a counted run of in each area. “Measured on x of y” counts the
        area’s tasks; an area measured on fewer than half its tasks is drawn pale and is not a fair read of
        the area.
      </p>
      <ErrorBoundary what="the areas">
        {#if bars.length}<AreaBars {bars} />{:else}<Empty>No areas to show.</Empty>{/if}
      </ErrorBoundary>
    </section>

    <section aria-labelledby="h-deps">
      <h2 id="h-deps">Deployments</h2>
      <p class="note muted">
        Where this model ran: speed, cost and reliability belong to a deployment, not to a variant. Median
        time is per task over finished runs; decode speed (output tokens per second of generation, prompt
        processing excluded) is the median over finished runs that recorded it. Local cost is an electricity
        estimate (≈), cloud cost is what the provider billed. Select a deployment to filter to it; select it
        again to clear.
      </p>
      <ErrorBoundary what="the deployments" error={loaded?.error} onretry={() => fetchRuns(cs.index.suite)}>
        <DeploymentsTable table={dt} onpick={pickDeployment} pending={!ready} />
      </ErrorBoundary>
      {#if dnf.length}
        <details class="dnfbox">
          <summary>Runs that didn’t finish ({dnf.length})</summary>
          <ul class="dnf">
            {#each dnf as d (d.run.run_uuid)}
              <li>
                {#if d.task}<a href={mounted ? taskHref(d.task.id, sq) : undefined}
                    >{d.task.name ?? d.task.id}</a
                  >{:else}{d.run.task}{/if}:
                {d.run.outcome === 'timed_out' ? 'timed out' : 'errored'} after {secs(d.run.elapsed_s)} on {d.deployment};
                the leaderboard scores it {fmtScore(d.run.score)}.
                {#if !d.recorded}<span class="tag warn">not recorded</span>{/if}
              </li>
            {/each}
          </ul>
        </details>
      {/if}
    </section>

    <section aria-labelledby="h-vars">
      <h2 id="h-vars">Every variant</h2>
      <p class="note muted">
        {#if view.kind === 'combined'}
          One variant per section, alike but for the harness, scored added together. Comparing is per section.
        {:else}
          Each variant is shown by its best setup in scope. Select a row to filter to that variant (its
          {vt.dims.length ? listPhrase(vt.dims.map((d) => d)) : 'settings'}); select it again to clear. Tick
          two to four to compare them.
        {/if}
      </p>
      <ErrorBoundary what="the variants">
        <VariantsTable
          table={vt}
          {view}
          exclude={ctx.exclude}
          onpick={pickVariant}
          {ticked}
          ontick={tick}
          suiteParam={sq}
        />
      </ErrorBoundary>
    </section>

    {#if view.kind !== 'combined'}
      <section aria-labelledby="h-ab">
        <ErrorBoundary what="the A/B">
          <AbBlock
            {index}
            {sc}
            base={best.setup}
            deploymentLabel={bestDeployment}
            runs={byCell}
            suiteParam={sq}
            linksReady={mounted}
          />
        </ErrorBoundary>
      </section>
    {/if}

    <section aria-labelledby="h-tasks">
      <h2 id="h-tasks">Tasks</h2>
      <p class="note muted">
        Every task for this setup, grouped by {view.kind === 'combined' ? 'section and ' : ''}area; a score is
        the mean of its counted runs. Time and cost are from this setup’s own runs ({bestDeployment}). Select
        a score for its run, checks and output.
      </p>
      <ErrorBoundary what="the tasks">
        {#if !ready}<Loading label="Loading the runs…" />{/if}
        <TasksBlock {groups} local={best.local} suiteParam={sq} linksReady={mounted && ready} />
      </ErrorBoundary>
    </section>
  </div>

  {#if otherInfo.total}
    <p class="other muted">
      Other runs: {otherInfo.total} run{otherInfo.total === 1 ? '' : 's'} of this model don’t count in {suiteName}
      ({otherInfo.reasons.map((r) => r.text).join(', ')}). They aren’t in any score.
    </p>
  {/if}
{/if}

<style>
  section {
    margin-top: var(--space-5);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-4);
    margin: 0;
    color: var(--muted);
  }
  .note {
    max-width: 60rem;
    font-size: var(--text-sm);
    margin: 0 0 var(--space-3);
  }
  .busy {
    opacity: 0.5;
  }
  .dnfbox {
    margin-top: var(--space-4);
    font-size: var(--text-sm);
  }
  .dnfbox summary {
    font-weight: 700;
    cursor: pointer;
  }
  .panelwrap :global(.count-line) {
    display: none;
  }
  .showing {
    margin: calc(-1 * var(--space-2)) 0 var(--space-3);
    font-size: var(--text-sm);
  }
  .dnf {
    margin: 0;
    padding-left: 1.2rem;
    font-size: var(--text-sm);
  }
  .other {
    margin-top: var(--space-5);
    font-size: var(--text-sm);
  }
</style>
