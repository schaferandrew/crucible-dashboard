<script lang="ts">
  import { base } from '$app/paths';
  import { replaceState } from '$app/navigation';
  import { onMount, untrack } from 'svelte';
  import {
    contextToSearch,
    defaultContext,
    parseContext,
    resolveContext,
    type ContextEnv,
    type DataContext,
    type Dim,
  } from '$lib/core/context';
  import { facet, scope } from '$lib/core/scope';
  import { OVERALL, type SortSpec } from '$lib/core/scoring';
  import type { SuiteIndex } from '$lib/core/types';
  import { loadIndex } from '$lib/data';
  import FilterBar from '$lib/FilterBar.svelte';
  import Leaderboard from '$lib/Leaderboard.svelte';

  let { data } = $props();

  const env: ContextEnv = $derived({
    currentSuite: data.meta.current_suite,
    suites: data.meta.suites.map((s) => s.id),
  });

  // The default view (Combined, no filters) is what gets prerendered; the URL is read on mount.
  let index = $state.raw<SuiteIndex>(untrack(() => data.index));
  let ctx = $state.raw<DataContext>(
    untrack(() =>
      resolveContext(
        defaultContext({ currentSuite: data.meta.current_suite, suites: [] }),
        data.index.catalog,
      ),
    ),
  );
  let showInProgress = $state(false);
  let sort = $state.raw<SortSpec>({ key: OVERALL, dir: -1 });
  let notice = $state<string | null>(null);
  let failure = $state<string | null>(null);
  let loading = $state(false);
  let mounted = false;

  const FACETS: Dim[] = ['harness', 'where', 'hw', 'format', 'quant', 'packager', 'reasoning'];
  const PROVISIONAL_KEY = 'crucible-provisional';

  // A sort key the section doesn't have falls back to Overall
  const effectiveSort = $derived.by<SortSpec>(() => {
    const view = scope(index, ctx).view;
    const ok =
      sort.key === 'model' ||
      sort.key === 'time' ||
      sort.key === 'tps' ||
      sort.key === 'cost' ||
      (sort.key === OVERALL && view.showAgg) ||
      view.tiers.some((t) => t.id === sort.key);
    return ok ? sort : { key: OVERALL, dir: -1 };
  });

  const sc = $derived(scope(index, ctx, { showInProgress, sort: effectiveSort }));
  const facets = $derived(FACETS.map((d) => facet(index, ctx, d, { showInProgress })));
  const inProgressCount = $derived(sc.rows.filter((r) => r.ran && r.inProgress).length);

  function syncUrl(next: DataContext, idx: SuiteIndex) {
    if (!mounted) return;
    const search = contextToSearch(next, env, idx.catalog);
    replaceState(`${base}/${search ? '?' + search : ''}`, {});
  }

  async function update(next: DataContext) {
    let idx = index;
    if (next.suite !== idx.suite) {
      loading = true;
      failure = null;
      try {
        idx = await loadIndex(fetch, next.suite);
      } catch (e) {
        failure = `Couldn't load ${next.suite}: ${e instanceof Error ? e.message : String(e)}`;
        return;
      } finally {
        loading = false;
      }
    }
    const resolved = resolveContext(next, idx.catalog);
    index = idx;
    ctx = resolved;
    syncUrl(resolved, idx);
  }

  function onsort(key: string) {
    const natural = key === 'time' || key === 'cost' || key === 'model' ? 1 : -1;
    sort = effectiveSort.key === key ? { key, dir: -effectiveSort.dir as 1 | -1 } : { key, dir: natural };
  }

  function onprovisional(on: boolean) {
    try {
      localStorage.setItem(PROVISIONAL_KEY, on ? '1' : '0');
    } catch {
      /* private mode or blocked storage: the choice just isn't remembered */
    }
    void update({ ...ctx, provisional: on });
  }

  onMount(async () => {
    let remembered = false;
    try {
      remembered = localStorage.getItem(PROVISIONAL_KEY) === '1';
    } catch {
      /* ignore */
    }
    const parsed = parseContext(location.search, env, remembered);
    if (parsed.unknownSuite) {
      notice = `Suite "${parsed.unknownSuite}" isn't available, so this is ${data.meta.current_suite}.`;
    }
    await update(parsed.ctx);
    mounted = true;
    syncUrl(ctx, index);
  });
</script>

<svelte:head>
  <title>Leaderboard · Crucible</title>
</svelte:head>

<h1>Crucible</h1>
<p class="lede">
  The same real-world prompts run through local and cloud models, in
  {#if sc.view.info.hasCombined}{sc.view.info.modes.length} sections, each ranked on its own, plus a {sc.view
      .info.combinedLabel} view that adds them together.{:else}one section.{/if}
  Each run is scored 0&ndash;10 by automatic checks or hidden tests.
</p>

{#if notice}<p class="banner" role="status">{notice}</p>{/if}
{#if failure}<p class="banner bad" role="alert">{failure}</p>{/if}

<FilterBar
  {index}
  meta={data.meta}
  {ctx}
  {sc}
  {facets}
  {showInProgress}
  {inProgressCount}
  onctx={(next) => void update(next)}
  onprogress={(show) => (showInProgress = show)}
  {onprovisional}
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

<div class="board" class:loading aria-busy={loading}>
  <Leaderboard {sc} sort={effectiveSort} {onsort} />
</div>

<noscript
  ><p class="muted">The filters need JavaScript; the default leaderboard above works without it.</p></noscript
>

<style>
  .lede {
    max-width: 60rem;
    margin-top: 0;
  }
  h2 {
    margin-top: 1.5rem;
  }
  .note {
    max-width: 60rem;
    font-size: 0.9rem;
  }
  .banner {
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius);
    background: var(--warn-soft);
    color: var(--warn);
  }
  .banner.bad {
    color: var(--bad);
  }
  .board.loading {
    opacity: 0.5;
  }
</style>
