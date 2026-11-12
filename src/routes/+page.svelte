<script lang="ts">
  import { afterNavigate } from '$app/navigation';
  import { onMount, untrack } from 'svelte';
  import { DIMS_LEADERBOARD } from '$lib/pages/main/dims';
  import { scope } from '$lib/core/scope';
  import { OVERALL, type SortSpec } from '$lib/core/scoring';
  import { cap } from '$lib/core/format';
  import { link, suiteParam } from '$lib/paths';
  import Bars from '$lib/pages/main/Bars.svelte';
  import CompareTray from '$lib/pages/main/CompareTray.svelte';
  import Heatmap from '$lib/pages/main/Heatmap.svelte';
  import Leaderboard from '$lib/pages/main/Leaderboard.svelte';
  import Matrix from '$lib/pages/main/Matrix.svelte';
  import { caveat, caveatText, footnote, leaderboardNote } from '$lib/pages/main/phrases';
  import { Picks } from '$lib/pages/main/picks.svelte';
  import Scatter from '$lib/pages/main/Scatter.svelte';
  import { takeaways } from '$lib/pages/main/takeaways';
  import Takeaways from '$lib/pages/main/Takeaways.svelte';
  import { ContextState } from '$lib/ui/contextState.svelte';
  import ControlPanel from '$lib/ui/ControlPanel.svelte';
  import ErrorBoundary from '$lib/ui/ErrorBoundary.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';

  let { data } = $props();
  const SP = ' ';

  // The default view (Combined, no filters) is what gets prerendered; the URL is read on mount.
  const cs = untrack(() => new ContextState({ meta: data.meta, index: data.index }));
  const picks = new Picks();
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
  // The takeaways read counted scores only: never the provisional preview
  const counted = $derived(cs.ctx.provisional ? scope(cs.index, { ...cs.ctx, provisional: false }) : sc);
  const suiteQ = $derived(suiteParam(cs.ctx.suite, data.meta.current_suite));
  const info = $derived(sc.view.info);
  const cav = $derived(caveatText(caveat(cs.index), cs.index.catalog.suite.name));
  const combined = $derived(sc.view.kind === 'combined');

  function onsort(key: string) {
    const natural = key === 'time' || key === 'cost' || key === 'model' ? 1 : -1;
    sort = effectiveSort.key === key ? { key, dir: -effectiveSort.dir as 1 | -1 } : { key, dir: natural };
  }

  onMount(() => {
    picks.load();
    void cs.init();
  });
  afterNavigate(({ type }) => {
    if (type !== 'enter') void cs.syncFromUrl();
  });
</script>

<PageHeader title="Crucible" docTitle="Leaderboard" breadcrumbs={false}>
  <p>
    Crucible is an AI task gauntlet to analyze whether local models are capable of real work. Can they write
    code for personal projects? Keep working when the internet is unavailable? Accomplish tasks involving
    personal data we don't want to share with cloud providers for training? The tasks are divided into
    sections and sorted into tiers of difficulty. Play around, I think you'll be surprised by the performance
    of these small models.
  </p>
  <p class="muted">Everything below was created and written by or with the help of AI.</p>
  <p>
    Crucible runs the same real-world prompts in {info.modes.length || 2} separate sections, each ranked on its
    own{#if info.hasCombined}, with a {info.combinedLabel} view that adds them together{/if}.
    {#each info.modes as m (m.id)}
      {@const areas = info.catalog.areas
        .filter((a) => a.mode === null || a.mode === m.id)
        .filter((a) => m.areas.length === 0 || m.areas.includes(a.id))
        .map((a) => a.label.toLowerCase())}
      <strong>{m.label || cap(m.id)}</strong> tasks{areas.length ? ` (${areas.join(', ')})` : ''}: {m.blurb}{m
        .harnesses.length > 1
        ? ', harness: ' + m.harnesses.join(' or ')
        : ''}.{SP}
    {/each}
    Each run is scored 0&ndash;10 by automatic checks or hidden tests. Tasks come in tiers:
    {#each info.tiers as t, i (t.id)}
      <strong>{t.label}</strong> ({t.blurb}{t.role === 'gate' && !t.blurb.includes('gate')
        ? ', pass or fail'
        : t.role === 'headline' && !t.blurb.includes('headline')
          ? ', the headline score'
          : ''}){i < info.tiers.length - 1 ? ',' : '.'}{SP}
    {/each}
    <a href={link('/about/')}>How Crucible works, and how to run it yourself &rarr;</a>
  </p>
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

<div class="results" class:loading={cs.loading} aria-busy={cs.loading}>
  <ErrorBoundary what="the takeaways">
    <Takeaways lines={takeaways(cs.index, counted)} suite={suiteQ} />
  </ErrorBoundary>

  <h2>Leaderboard</h2>
  <p class="note muted">{leaderboardNote(sc).join(' ')}</p>

  <ErrorBoundary what="the chart">
    <Bars
      rows={sc.visible}
      yMax={sc.view.aggMax(sc.ctx.exclude)}
      label={sc.view.showAgg ? info.overallLabel : (sc.view.tiers[0]?.label ?? info.overallLabel)}
      coverageMin={info.coverageMin}
      suite={suiteQ}
    />
  </ErrorBoundary>

  <ErrorBoundary what="the leaderboard">
    <Leaderboard index={cs.index} {sc} sort={effectiveSort} {onsort} {picks} suite={suiteQ} />
  </ErrorBoundary>

  {#if cav.lead && caveat(cs.index).methods.length}
    <p class="caveat">
      <strong>How scores are made.</strong>
      {cav.lead}{cav.unscored}Each rule is listed on the <a href={link('/about/')}>About</a> page.
    </p>
  {/if}

  <ErrorBoundary what="the quality chart">
    <Scatter {sc} suite={suiteQ} />
  </ErrorBoundary>

  <h2>Every model on every task</h2>
  <p class="note muted">
    {#if combined}
      Score per task, grouped by section and then tier. As in the leaderboard, each row pairs a model's
      setups: a section's tasks show the model's setup for that section. Rows keep the leaderboard's order. A
      score
    {:else}
      Score per task, grouped by tier, for each model's best setup; rows keep the leaderboard's order. A score
    {/if}
    is the mean of that setup's runs (&times;n marks repeats). Select any cell for its runs, checks and output.
    An empty outlined cell has runs that don't count in this suite (an older task version, or a run marked invalid).
  </p>
  <ErrorBoundary what="the matrix">
    <Matrix index={cs.index} {sc} suite={suiteQ} />
  </ErrorBoundary>

  <h2>Model &times; area</h2>
  <p class="note muted">
    {#if combined}
      Mean score (0&ndash;10) for each area of every section, across all tiers; each section's areas use the
      model's setup for that section.
    {:else}
      Mean score (0&ndash;10) for each area in this section, across all tiers, for each model's best setup.
    {/if}
  </p>
  <ErrorBoundary what="the heatmap">
    <Heatmap index={cs.index} {sc} suite={suiteQ} />
  </ErrorBoundary>

  <p class="foot note muted">{footnote(cs.index, data.meta.crucible_version)}</p>
</div>

<CompareTray {picks} suite={suiteQ} />

<noscript
  ><p class="muted">The filters need JavaScript; the default leaderboard above works without it.</p></noscript
>

<style>
  h2 {
    margin-top: var(--space-6);
  }
  .note {
    max-width: 60rem;
    font-size: var(--text-sm);
  }
  .caveat {
    max-width: 60rem;
    font-size: var(--text-sm);
    padding: var(--space-3);
    background: var(--surface-2);
    border-radius: var(--radius);
    margin: var(--space-4) 0 0;
  }
  .foot {
    margin-top: var(--space-6);
    padding-bottom: var(--space-7);
  }
  .results.loading {
    opacity: 0.5;
  }
</style>
