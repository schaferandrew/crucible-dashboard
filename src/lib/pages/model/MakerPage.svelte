<script lang="ts">
  // One maker's models (`/model/<maker>`): each model by its best setup in scope, ranked as on the leaderboard
  // (MODEL-PUB-*). The shared context with `maker` pinned, so the section chips and filters work as everywhere.
  import { afterNavigate } from '$app/navigation';
  import { onMount, untrack } from 'svelte';
  import { fmtCost, fmtPercent, fmtSeconds, listPhrase } from '$lib/core/format';
  import type { Dim } from '$lib/core/context';
  import { scope } from '$lib/core/scope';
  import type { Meta, SuiteIndex } from '$lib/core/types';
  import { compareHref } from '$lib/paths';
  import ControlPanel from '$lib/ui/ControlPanel.svelte';
  import { ContextState } from '$lib/ui/contextState.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import ErrorBoundary from '$lib/ui/ErrorBoundary.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import ResponsiveTable from '$lib/ui/ResponsiveTable.svelte';
  import type { Column } from '$lib/ui/table';
  import TierCell from '$lib/TierCell.svelte';
  import { MAX_COMPARE_VARIANTS } from './constants';
  import { modelsHref, modelHref, suiteParam } from './links';
  import MakerChart from './MakerChart.svelte';
  import { fullVariantText, makerEntries, makerLabelOf, whereText, type MakerEntry } from './shape';

  let { data }: { data: { meta: Meta; index: SuiteIndex; maker: string } } = $props();

  const makerId = untrack(() => data.maker);
  const DIMS: Dim[] = ['reasoning', 'quant', 'packager', 'format', 'harness', 'where', 'hw'];
  const cs = untrack(
    () => new ContextState({ meta: data.meta, index: data.index, pin: { maker: new Set([makerId]) } }),
  );
  onMount(() => cs.init());
  afterNavigate(({ type }) => {
    if (type !== 'enter') void cs.syncFromUrl();
  });

  const index = $derived(cs.index);
  const ctx = $derived(cs.ctx);
  const sc = $derived(scope(index, ctx));
  const view = $derived(sc.view);
  const info = $derived(view.info);
  const sq = $derived(suiteParam(ctx.suite, data.meta.current_suite));
  const name = $derived(makerLabelOf(index, makerId));
  const entries = $derived(makerEntries(index, makerId, sc));
  const ran = $derived(entries.filter((e) => e.best));
  const models = $derived(
    Object.values(index.entities.models).filter((m) => (m.maker || 'unknown') === makerId),
  );
  const nLocal = $derived(models.filter((m) => whereText(index, m.id).startsWith('Local')).length);
  const nCloud = $derived(models.filter((m) => /cloud/i.test(whereText(index, m.id))).length);
  const filtersOn = $derived(Object.entries(ctx.filters).some(([d, s]) => d !== 'maker' && s && s.size));
  const included = $derived(new Set(view.aggTiers(ctx.exclude).map((t) => t.id as string)));
  const aggMax = $derived(view.aggMax(ctx.exclude));

  const ranked = $derived(ran.filter((e) => sc.rank.has(e.best!.rowKey)));
  const top = $derived(ranked.slice(0, MAX_COMPARE_VARIANTS));
  const compare = $derived(
    top.length >= 2
      ? compareHref(
          top
            .flatMap((e) => e.best!.candidate.members.filter((m) => m).map((m) => m!.id))
            .slice(0, MAX_COMPARE_VARIANTS),
          sq,
        )
      : null,
  );

  const columns = $derived<Column<MakerEntry>[]>([
    { id: 'model', header: 'Model', rowHeader: true, value: (e) => e.model.name },
    { id: 'variant', header: 'Best variant' },
    { id: 'coverage', header: 'Coverage' },
    ...(view.showAgg ? [{ id: 'overall', header: info.overallLabel }] : []),
    ...view.tiers.map((t) => ({ id: `tier:${t.id}`, header: t.label })),
    { id: 'deployment', header: 'Deployment' },
    { id: 'time', header: 'Median time', align: 'end' as const },
    { id: 'cost', header: 'Cost', align: 'end' as const },
  ]);
  const depLabel = (e: MakerEntry) =>
    e.best ? (index.entities.deployments[e.best.setup.deployment]?.label ?? e.best.setup.deployment) : '';
</script>

<PageHeader
  title={name}
  docTitle="{name} · Models"
  crumbs={[{ label: 'Models', href: modelsHref(sq) }, { label: name }]}
>
  <p class="meta">
    <span>{models.length} model{models.length === 1 ? '' : 's'}</span>
    <span>{nLocal} local</span>
    <span>{nCloud} cloud</span>
    <span>{info.catalog.suite.name}</span>
  </p>
  {#if makerId === 'unknown'}<p class="muted">
      These models have no recorded maker, and none could be taken from their name.
    </p>{/if}
</PageHeader>

{#if cs.failure}<p class="banner bad" role="alert">{cs.failure}</p>{/if}

<!-- The panel's own "Showing n of m" counts every maker's rows; this page counts this maker's -->
<div class="panelwrap">
  <ControlPanel
    {index}
    meta={data.meta}
    {ctx}
    onctx={cs.update}
    {sc}
    pinned={['maker']}
    dims={DIMS}
    unit="rows"
    unknownSuite={cs.unknownSuite}
    label="Maker controls"
  />
</div>
<p class="showing muted" aria-live="polite">Showing {ran.length} of {entries.length} models</p>

<h2>Models</h2>
<p class="note muted">
  {view.label}{view.kind === 'combined' ? ' view' : ' section'}. Each model’s best setup, chosen and ranked by
  {info.overallLabel} score as on the leaderboard{view.showAgg
    ? ` (${listPhrase(view.aggTiers(ctx.exclude).map((t) => t.label))} added together, each out of 10)`
    : ''}, and the deployment (machine or provider) it ran on; time and cost belong to that setup. Models
  measured on under {fmtPercent(info.inProgressBelow)} of the section’s tasks run come after the rest.
</p>

<ErrorBoundary what="the models">
  {#if entries.length === 0}
    <Empty>No models yet.</Empty>
  {:else}
    <ResponsiveTable
      rows={entries}
      {columns}
      rowKey={(e) => e.model.id}
      caption="{name} models, best setup of each"
      href={(e) => modelHref(e.model.id, sq)}
      rowClass={(e) => (e.best ? undefined : 'notrun')}
    >
      {#snippet cell(e: MakerEntry, col: Column<MakerEntry>)}
        {#if col.id === 'model'}
          {e.model.name}
          {#if e.best}<span class="tag {e.best.local ? 'local' : 'cloud'}"
              >{e.best.local ? 'local' : 'cloud'}</span
            >{/if}
        {:else if !e.best}
          {#if col.id === 'variant'}<span class="muted"
              >Not run {filtersOn ? 'with these filters' : 'in this section'}</span
            >{/if}
        {:else if col.id === 'variant'}
          {fullVariantText(index, e.best.setup, view.harnesses.length > 1)}
          {#if e.variants > 1}<span class="sub">best of {e.variants} variants</span>{/if}
        {:else if col.id === 'coverage'}
          {e.best.progress.done}/{e.best.progress.total}
          {#if e.best.inProgress}<span class="tag warn">in progress</span>{/if}
        {:else if col.id === 'overall'}
          <TierCell
            result={e.best.overall}
            max={aggMax}
            local={e.best.local}
            label={info.overallLabel}
            coverageMin={info.coverageMin}
          />
        {:else if col.id.startsWith('tier:')}
          {@const id = col.id.slice(5)}
          <TierCell
            result={e.best.tier[id] ?? null}
            max={view.tierMax(id)}
            local={e.best.local}
            verdict={e.best.verdict[id] ?? null}
            label={view.tiers.find((t) => t.id === id)?.label ?? id}
            coverageMin={info.coverageMin}
            dim={view.showAgg && !included.has(id)}
          />
        {:else if col.id === 'deployment'}
          {depLabel(e)}
          {#if e.deployments > 1}<span class="sub">best of {e.deployments} deployments</span>{/if}
        {:else if col.id === 'time'}
          {fmtSeconds(e.best.time)}
        {:else if col.id === 'cost'}
          <span title={e.best.local ? 'Electricity estimate' : 'Billed by the provider'}
            >{fmtCost(e.best.cost, e.best.local)}</span
          >
        {/if}
      {/snippet}
    </ResponsiveTable>
    {#if compare}
      <p class="compare">
        <a class="go" href={compare}>Compare these</a>
        <span class="muted"
          >Best setups of {top.length < ranked.length ? 'the top ' : ''}{top.length} ranked models in this section.</span
        >
      </p>
    {/if}
  {/if}
</ErrorBoundary>

{#if ran.length}
  <h2 class="chart-h">
    {view.showAgg ? info.overallLabel : (view.tiers[0]?.label ?? 'Score')} score per model
  </h2>
  <p class="note muted">
    Score of each model’s best setup, 0 to {view.showAgg ? aggMax : 10}. Labels read score · tasks run / tasks
    in the section.
  </p>
  <ErrorBoundary what="the chart">
    <MakerChart {entries} {view} exclude={ctx.exclude} suiteParam={sq} />
  </ErrorBoundary>
{/if}

<style>
  .panelwrap :global(.count-line) {
    display: none;
  }
  .showing {
    margin: calc(-1 * var(--space-2)) 0 var(--space-3);
    font-size: var(--text-sm);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-4);
    margin: 0;
    color: var(--muted);
  }
  h2 {
    margin-top: var(--space-5);
  }
  .note {
    max-width: 60rem;
    font-size: var(--text-sm);
  }
  .sub {
    display: block;
    font-size: var(--text-xs);
    color: var(--muted);
  }
  .compare {
    margin: var(--space-3) 0 0;
    display: flex;
    gap: var(--space-3);
    flex-wrap: wrap;
    align-items: center;
  }
  .go {
    font-weight: 600;
  }
  :global(tr.notrun),
  :global(li.notrun) {
    color: var(--muted);
  }
</style>
