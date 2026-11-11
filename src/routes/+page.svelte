<script lang="ts">
  import { afterNavigate } from '$app/navigation';
  import { onMount, untrack } from 'svelte';
  import { DIMS_LEADERBOARD } from '$lib/pages/leaderboard/dims';
  import { scope } from '$lib/core/scope';
  import { OVERALL, type SortSpec } from '$lib/core/scoring';
  import Leaderboard from '$lib/Leaderboard.svelte';
  import { ContextState } from '$lib/ui/contextState.svelte';
  import ControlPanel from '$lib/ui/ControlPanel.svelte';
  import ErrorBoundary from '$lib/ui/ErrorBoundary.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';

  let { data } = $props();

  // The default view (Combined, no filters) is what gets prerendered; the URL is read on mount.
  const cs = untrack(() => new ContextState({ meta: data.meta, index: data.index }));
  let showInProgress = $state(false);
  let sort = $state.raw<SortSpec>({ key: OVERALL, dir: -1 });

  // A sort key the section doesn't have falls back to Overall
  const effectiveSort = $derived.by<SortSpec>(() => {
    const view = scope(cs.index, cs.ctx).view;
    const ok =
      sort.key === 'model' ||
      sort.key === 'time' ||
      sort.key === 'tps' ||
      sort.key === 'cost' ||
      (sort.key === OVERALL && view.showAgg) ||
      view.tiers.some((t) => t.id === sort.key);
    return ok ? sort : { key: OVERALL, dir: -1 };
  });

  const sc = $derived(scope(cs.index, cs.ctx, { showInProgress, sort: effectiveSort }));

  function onsort(key: string) {
    const natural = key === 'time' || key === 'cost' || key === 'model' ? 1 : -1;
    sort = effectiveSort.key === key ? { key, dir: -effectiveSort.dir as 1 | -1 } : { key, dir: natural };
  }

  onMount(() => cs.init());
  afterNavigate(({ type }) => {
    if (type !== 'enter') void cs.syncFromUrl();
  });
</script>

<PageHeader title="Crucible" docTitle="Leaderboard" breadcrumbs={false}>
  The same real-world prompts run through local and cloud models, in
  {#if sc.view.info.hasCombined}{sc.view.info.modes.length} sections, each ranked on its own, plus a {sc.view
      .info.combinedLabel} view that adds them together.{:else}one section.{/if}
  Each run is scored 0&ndash;10 by automatic checks or hidden tests.
</PageHeader>

{#if cs.failure}<p class="banner bad" role="alert">{cs.failure}</p>{/if}

<ControlPanel
  index={cs.index}
  meta={data.meta}
  ctx={cs.ctx}
  onctx={cs.update}
  {sc}
  dims={DIMS_LEADERBOARD}
  {showInProgress}
  onprogress={(show) => (showInProgress = show)}
  unknownSuite={cs.unknownSuite}
  label="Leaderboard controls"
/>

<h2>Leaderboard</h2>
<p class="note muted">
  {#if sc.view.showAgg}
    Ranked by {sc.view.info.overallLabel} score (0&ndash;{sc.view.aggMax(sc.ctx.exclude)}): the
    {sc.view
      .aggTiers(sc.ctx.exclude)
      .map((t) => t.label)
      .join(', ')}
    scores added together{sc.view.kind === 'combined' ? ', every section' : ''}, each out of 10.
  {:else}
    Ranked by {sc.view.tiers[0]?.label ?? 'Overall'} score (0&ndash;10).
  {/if}
  A row is one model at one reasoning level, scored by its single best setup. A hatched bar means fewer than
  {Math.round(sc.view.info.coverageMin * 100)}% of that tier's tasks were scored.
</p>

<div class="board" class:loading={cs.loading} aria-busy={cs.loading}>
  <ErrorBoundary what="the leaderboard">
    <Leaderboard {sc} sort={effectiveSort} {onsort} />
  </ErrorBoundary>
</div>

<noscript
  ><p class="muted">The filters need JavaScript; the default leaderboard above works without it.</p></noscript
>

<style>
  h2 {
    margin-top: var(--space-5);
  }
  .note {
    max-width: 60rem;
    font-size: var(--text-sm);
  }
  .board.loading {
    opacity: 0.5;
  }
</style>
