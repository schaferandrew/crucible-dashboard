<script lang="ts">
  // /compare?s=<setup>,<setup>[&mode=<section>][&suite=<id>]: two to four setups side by side on the tasks they
  // all have counted runs of (behaviour-spec 9, B-01, B-04, B-18). The URL is the whole state.
  import { afterNavigate, goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { onMount, untrack } from 'svelte';
  import { suiteInfo } from '$lib/core/catalog';
  import { translateLegacyUrl } from '$lib/core/legacy';
  import type { Candidate } from '$lib/core/scoring';
  import type { SuiteId, SuiteIndex } from '$lib/core/types';
  import { loadIndex } from '$lib/data';
  import { link } from '$lib/paths';
  import {
    activeTasks,
    numSides,
    pairSide,
    parseCompareQuery,
    runsBySide,
    countedOf,
    taskRuns,
  } from '$lib/pages/compare/sides';
  import { computeNumbers, spreadRows, type Numbers } from '$lib/pages/compare/numbers';
  import {
    MAX_COMPARE,
    differenceNote,
    pairSentence,
    pairedComparison,
    variantDiff,
    variantDims,
    type VariantDim,
  } from '$lib/pages/compare/pairing';
  import {
    assignColors,
    comparisonCandidates,
    deploymentText,
    fullLabel,
    harnessCount,
    identityOf,
    pickerGroups,
    resolveCompare,
    sectionName,
    shortLabels,
  } from '$lib/pages/compare/resolve';
  import Reliability from './Reliability.svelte';
  import Summary from './Summary.svelte';
  import TaskCharts from './TaskCharts.svelte';
  import DiffTable from '$lib/pages/compare/DiffTable.svelte';
  import Identity from '$lib/pages/compare/Identity.svelte';
  import { chrome } from '$lib/ui/layout/chrome.svelte';
  import Empty from '$lib/ui/feedback/Empty.svelte';
  import ErrorBoundary from '$lib/ui/feedback/ErrorBoundary.svelte';
  import PageHeader from '$lib/ui/layout/PageHeader.svelte';
  import SectionRadiogroup from '$lib/ui/controls/SectionRadiogroup.svelte';
  import SuiteBar from '$lib/ui/controls/SuiteBar.svelte';

  import type { PageData } from '../../../routes/compare/$types';

  let { data }: { data: PageData } = $props();
  const meta = $derived(data.meta);
  const current = $derived(meta.current_suite);

  // ---- State: the URL, the suite's index, the runs of the shared tasks ----

  let search = $state('');
  let index = $state.raw<SuiteIndex>(untrack(() => data.index));
  let failure = $state<string | null>(null);
  let legacy = $state.raw<Record<string, string>>({});
  let legacyTried = false;
  let colorOf = $state.raw<Record<string, string>>({});

  onMount(() => {
    search = location.search;
  });
  afterNavigate(() => {
    search = location.search;
  });

  const q = $derived(parseCompareQuery(search));
  const known = $derived(q.suite ? meta.suites.some((s) => s.id === q.suite) : true);
  const suite = $derived((known && q.suite ? q.suite : current) as SuiteId);
  const unknownSuite = $derived(known ? null : q.suite);
  const suiteQ = $derived(suite !== current ? suite : undefined);

  $effect(() => {
    chrome.suite = suiteQ ?? null;
  });

  $effect(() => {
    const want = suite;
    if (want === untrack(() => index.suite)) return;
    failure = null;
    loadIndex(fetch, want).then(
      (i) => {
        if (want === suite) index = i;
      },
      (e) => (failure = `Couldn't load ${want}: ${e instanceof Error ? e.message : String(e)}`),
    );
  });

  const info = $derived(suiteInfo(index.catalog));
  const res = $derived(resolveCompare(index, q.s, q.mode, legacy));
  const items = $derived(res.items);
  const hasMany = $derived(items.length >= 2);
  const withHarness = $derived(harnessCount(index, res.view) > 1);
  const secName = $derived(sectionName(index, res.section));
  const suiteName = $derived(index.catalog.suite.name || index.suite);

  // A setup written as an old slug: ask the legacy map (once, only when something didn't resolve)
  $effect(() => {
    if (legacyTried || !res.notes.some((n) => n.includes("isn't a setup"))) return;
    legacyTried = true;
    fetch(`${base}/data/legacy-slugs.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const maps = (
          j && typeof j === 'object' ? ((j as { setups?: unknown }).setups ?? j) : null
        ) as Record<string, string> | null;
        if (!maps) return;
        // The shared translator turns a legacy hash into the new URL; only its setup mapping is needed here
        const t = translateLegacyUrl(
          { pathname: '/crucible/compare/', hash: '#' + q.s.map(encodeURIComponent).join(',') },
          { setups: maps },
        );
        if (t && t.unresolved.length < q.s.length) legacy = maps;
      })
      .catch(() => {});
  });

  // Each setup keeps its colour while the page is open (CMP-RESOLVE-03)
  const PALETTE = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'];
  $effect(() => {
    const next = assignColors(
      untrack(() => colorOf),
      items.map((c) => c.id),
      PALETTE,
    );
    if (items.some((c) => next[c.id] !== untrack(() => colorOf)[c.id]))
      colorOf = { ...untrack(() => colorOf), ...next };
  });
  const colors = $derived(items.map((c) => colorOf[c.id] ?? PALETTE[0]!));

  const labels = $derived(shortLabels(index, items, withHarness));
  const fulls = $derived(items.map((c) => fullLabel(index, c)));
  const tasks = $derived(activeTasks(res.view));
  const tierLabel = (t: string | null) => (t ? info.tier(t).label : '');

  // ---- Numbers: from the cells at once, then with the runs of the shared tasks ----

  const base0 = $derived(computeNumbers(numSides(index, items), tasks, info.tiers));
  const sharedKey = $derived(
    `${index.suite}|${items.map((c) => c.id).join(',')}|${base0.shared.map((t) => t.id).join(',')}`,
  );
  let loaded = $state.raw<{ key: string; runs: ReturnType<typeof runsBySide> } | null>(null);
  let runsError = $state<string | null>(null);
  let retry = $state(0);

  $effect(() => {
    void retry;
    const key = sharedKey;
    const ids = untrack(() => base0.shared.map((t) => t.id));
    const who = untrack(() => items);
    const s = untrack(() => index.suite);
    runsError = null;
    if (who.length < 2 || !ids.length) return;
    Promise.all(ids.map((t) => taskRuns(fetch, s, t).then((r) => [t, r] as const))).then(
      (pairs) => {
        if (key === sharedKey) loaded = { key, runs: runsBySide(who, new Map(pairs)) };
      },
      (e) => {
        if (key === sharedKey) runsError = e instanceof Error ? e.message : String(e);
      },
    );
  });
  const runs = $derived(loaded && loaded.key === sharedKey ? loaded.runs : undefined);
  const nums: Numbers = $derived(computeNumbers(numSides(index, items, runs), tasks, info.tiers));

  // ---- Deployments, notes ----

  const depLabels = $derived(items.map((c) => deploymentText(index, c)));
  const deploymentsDiffer = $derived(new Set(items.map((c) => c.first.deployment)).size > 1);
  const mixedWhere = $derived(
    items.some((c) => c.first.where === 'local') && items.some((c) => c.first.where !== 'local'),
  );
  const anyLocal = $derived(items.some((c) => c.first.where === 'local'));
  const places = $derived([...new Set(depLabels)]);
  const timeCaveat = $derived(
    deploymentsDiffer
      ? `${
          mixedWhere
            ? 'These times come from local machines and a cloud provider'
            : `These times come from different ${anyLocal ? 'machines' : 'providers'}`
        } (${places.join('; ')}), so a gap in time or decode speed may be the hardware, not the model.`
      : '',
  );

  const settingNotes = $derived.by(() => {
    const out: string[] = [];
    if (items.length > 1) {
      const diffs: VariantDim[] = [];
      items.forEach((a, i) => {
        for (const b of items.slice(i + 1))
          for (const d of variantDiff(identityOf(a), identityOf(b)))
            if (d !== 'model' && !diffs.includes(d)) diffs.push(d);
      });
      const note = differenceNote(diffs, true);
      if (note) out.push(note);
      if (deploymentsDiffer)
        out.push(
          `They also run on different ${mixedWhere ? 'machines and providers (local and cloud)' : anyLocal ? 'machines' : 'providers'}, so times and decode speeds are labelled by deployment (a gap in either may be the hardware, not the model) and local electricity is never set against cloud billing.`,
        );
    }
    return out;
  });

  // Two setups get the paired sentence
  const pair = $derived.by(() => {
    if (items.length !== 2) return null;
    const [a, b] = items as [Candidate, Candidate];
    const side = (c: Candidate, k: number) => pairSide(c, countedOf(index, c), runs?.[k]);
    return pairedComparison(side(a, 0), side(b, 1), tasks, variantDims(harnessCount(index, res.view)));
  });

  // ---- Page text ----

  const title = $derived(hasMany ? `Compare ${labels.join(' vs ')}` : 'Compare setups');
  const nShared = $derived(nums.shared.length);
  const nPaired = $derived(nums.paired.length);

  // ---- URL building ----

  function hrefFor(ids: string[], mode?: string | null, s: string | undefined = suiteQ) {
    return link('/compare/', {
      s: ids,
      mode: mode ?? (res.explicitMode ? res.section : undefined),
      suite: s,
    });
  }
  const ids = $derived(items.map((c) => c.id));
  // B-02: choosing a setup or a section is a navigation (it pushes); the suite is a view toggle (it replaces)
  const go = (next: string[], mode?: string | null) =>
    goto(hrefFor(next, mode), { noScroll: true, keepFocus: true });
  const onSuite = (id: SuiteId) =>
    goto(hrefFor(ids, undefined, id === current ? undefined : id), {
      replaceState: true,
      noScroll: true,
      keepFocus: true,
    });

  const groups = $derived(pickerGroups(index, comparisonCandidates(index, res.view), items));
  const candidateCount = $derived(groups.reduce((n, g) => n + g.options.length, 0));
  const full = $derived(items.length >= MAX_COMPARE);

  let copied = $state(false);
  let fallbackUrl = $state<string | null>(null);
  async function copy() {
    const url = new URL(hrefFor(ids), location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      fallbackUrl = null;
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      fallbackUrl = url;
    }
  }
  let urlField: HTMLInputElement | undefined = $state();
  $effect(() => {
    if (fallbackUrl && urlField) {
      urlField.focus();
      urlField.select();
    }
  });

  // ---- Where they differ ----

  const spread = $derived(spreadRows(nums));
  const diffRuns = $derived(items.map((_, k) => runs?.[k]));
</script>

<PageHeader title="Compare setups" docTitle={title} crumbs={[{ label: 'Compare setups' }]}>
  Two to four setups side by side, scored only on the tasks all of them have counted runs of.
</PageHeader>

{#if failure}<p class="banner bad" role="alert">{failure}</p>{/if}
<SuiteBar {index} {meta} {suite} onsuite={onSuite} unknown={unknownSuite} />

{#if res.notes.length}
  <ul class="notes" aria-label="Notes">
    {#each res.notes as n (n)}<li>{n}</li>{/each}
  </ul>
{/if}

<section class="controls" aria-label="Choose setups">
  {#if info.modes.length > 1 && !items.length}
    <SectionRadiogroup
      id="cmp-mode"
      choices={[...(info.hasCombined ? [{ id: 'combined', label: info.combinedLabel }] : []), ...info.modes]}
      value={res.section}
      onselect={(section) => go([], section)}
    />
  {/if}

  {#if items.length}
    <ul class="chips" aria-label="Chosen setups">
      {#each items as c, k (c.id)}
        <li class="chip" style:border-left-color={colors[k]}>
          <Identity {index} item={c} color={colors[k]} {withHarness} {suiteQ} />
          <button
            type="button"
            class="x"
            aria-label="Remove {labels[k]} from the comparison"
            onclick={() => go(ids.filter((i) => i !== c.id))}>✕</button
          >
        </li>
      {/each}
    </ul>
  {/if}

  <div class="pickrow">
    <div class="field">
      <label class="lbl" for="cmp-pick">Add a setup</label>
      <select
        id="cmp-pick"
        disabled={full || !candidateCount}
        value=""
        onchange={(e) => {
          const v = e.currentTarget.value;
          e.currentTarget.value = '';
          if (v) void go([...ids, v]);
        }}
      >
        <option value=""
          >{full
            ? `Up to ${MAX_COMPARE} setups`
            : candidateCount
              ? 'Pick a setup…'
              : 'No other setups ran here'}</option
        >
        {#each groups as g (g.maker)}
          <optgroup label={g.label}>
            {#each g.options as o (o.id)}<option value={o.id}>{o.text}</option>{/each}
          </optgroup>
        {/each}
      </select>
    </div>
    {#if items.length}
      <div class="field">
        <button type="button" class="copy" onclick={copy}>{copied ? 'Link copied' : 'Copy link'}</button>
      </div>
    {/if}
  </div>
  {#if fallbackUrl}
    <input
      bind:this={urlField}
      class="url"
      type="text"
      readonly
      value={fallbackUrl}
      aria-label="Link to this comparison"
    />
  {/if}

  {#if settingNotes.length}
    <ul class="notes" aria-label="About these setups">
      {#each settingNotes as n (n)}<li>{n}</li>{/each}
    </ul>
  {/if}
</section>

{#if !hasMany}
  <p class="sub">
    Pick two to four setups to see them side by side. A setup is one model at one reasoning level, quant,
    machine or provider and harness, local or cloud. They are scored only on the tasks all of them have
    counted runs of, so nobody gains from a task another skipped. Setups from different sections can't be
    compared{res.view.kind === 'section' ? `, so the picker lists only ${secName} setups.` : '.'}{items.length
      ? ' Add one more to start.'
      : ''}
  </p>
{:else}
  <p class="sub">
    {#if nShared}
      {nShared} task{nShared === 1 ? '' : 's'}
      {items.length === 2 ? 'both setups' : `all ${items.length} setups`} ran in {secName} of {suiteName}.
      Scores count the {nPaired} of them every setup finished ({nShared - nPaired} left out); a task that timed
      out or errored is listed under reliability, not scored 0. Scores are the mean of repeat runs.
    {:else}
      These setups have no scored task in common in {secName} of {suiteName} yet, so there is nothing to compare.
    {/if}
  </p>

  {#if nShared}
    <h2>Summary</h2>
    <ErrorBoundary what="the summary">
      <Summary {index} {items} {nums} {colors} {withHarness} {suiteQ} />
    </ErrorBoundary>

    <TaskCharts
      {depLabels}
      {nums}
      {items}
      {labels}
      {colors}
      {suiteQ}
      {timeCaveat}
      {runsError}
      onretry={() => (retry += 1)}
    />

    <h2>Where they differ</h2>
    <p class="sub">
      {#if pair}<strong>{pairSentence(pair, labels[0]!, labels[1]!)}</strong>&nbsp;{/if}Tasks every setup
      finished, sorted by spread (best score minus worst), widest first. Select a task to see each setup's
      checks side by side.
    </p>
    <ErrorBoundary what="the task differences">
      {#if spread.length}
        <DiffTable
          rows={spread}
          {labels}
          fullLabels={fulls}
          {colors}
          {tierLabel}
          runs={diffRuns}
          suite={index.suite}
          {suiteQ}
        />
      {:else}
        <Empty>No task was finished by every setup, so there is no score difference to show.</Empty>
      {/if}
    </ErrorBoundary>
  {/if}

  <Reliability {index} {tasks} {items} {nums} {labels} {colors} {suiteQ} {secName} />
{/if}

<style>
  .notes {
    margin: var(--space-3) 0;
    padding: var(--space-2) var(--space-3) var(--space-2) var(--space-5);
    border-radius: var(--radius);
    background: var(--warn-soft);
    color: var(--warn);
    font-size: var(--text-sm);
  }
  .controls {
    display: grid;
    gap: var(--space-3);
    margin: var(--space-3) 0;
  }
  .field {
    display: grid;
    gap: 0.2rem;
    align-content: start;
  }
  .lbl {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  select,
  .copy,
  .url {
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    padding: 0.35rem 0.6rem;
    background: var(--surface);
    font-size: var(--text-sm);
    max-width: 100%;
  }
  #cmp-pick {
    min-width: min(100%, 22rem);
  }
  .url {
    width: 100%;
  }
  .pickrow {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: var(--space-3);
  }
  .chips {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .chip {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border);
    border-left: 4px solid var(--border-strong);
    border-radius: var(--radius);
    background: var(--surface);
    min-width: 0;
  }
  .x {
    background: none;
    border: 0;
    color: var(--muted);
    padding: 0.2rem 0.4rem;
    font-size: var(--text-md);
  }
  .x:hover {
    color: var(--bad);
  }
  .sub {
    max-width: 60rem;
    color: var(--muted);
    margin: var(--space-2) 0 var(--space-3);
  }
  h2 {
    margin-top: var(--space-5);
  }
</style>
