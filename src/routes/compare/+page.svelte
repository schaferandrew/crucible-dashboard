<script lang="ts">
  // /compare?s=<setup>,<setup>[&mode=<section>][&suite=<id>]: two to four setups side by side on the tasks they
  // all have counted runs of (behaviour-spec 9, B-01, B-04, B-18). The URL is the whole state.
  import { afterNavigate, goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { onMount, untrack } from 'svelte';
  import { suiteInfo } from '$lib/core/catalog';
  import { fmtCost, fmtInt, fmtScore, fmtSeconds, fmtTps, tpsTitle } from '$lib/core/format';
  import { translateLegacyUrl } from '$lib/core/legacy';
  import type { Candidate } from '$lib/core/scoring';
  import type { SuiteId, SuiteIndex } from '$lib/core/types';
  import { loadIndex } from '$lib/data';
  import { link, runHref, taskHref } from '$lib/paths';
  import {
    activeTasks,
    numSides,
    pairSide,
    parseCompareQuery,
    runsBySide,
    countedOf,
    taskRuns,
  } from '$lib/pages/compare/sides';
  import {
    bestOf,
    computeNumbers,
    spreadRows,
    type Numbers,
    type RunInfo,
    type Unfinished,
  } from '$lib/pages/compare/numbers';
  import {
    MAX_COMPARE,
    differenceNote,
    outcomeText,
    pairSentence,
    pairedComparison,
    variantDiff,
    variantDims,
    type VariantDim,
  } from '$lib/pages/compare/pairing';
  import {
    assignColors,
    deploymentText,
    fullLabel,
    harnessCount,
    identityOf,
    pickerGroups,
    resolveCompare,
    sectionName,
    shortLabels,
    unrecordedDeployment,
  } from '$lib/pages/compare/resolve';
  import { niceTime, scoreAxis, scoreAxisNote, timeAxis } from '$lib/pages/compare/scales';
  import DiffTable from '$lib/pages/compare/DiffTable.svelte';
  import Identity from '$lib/pages/compare/Identity.svelte';
  import RowsChart from '$lib/pages/compare/RowsChart.svelte';
  import { chrome } from '$lib/ui/chrome.svelte';
  import type { Column } from '$lib/ui/table';
  import Empty from '$lib/ui/Empty.svelte';
  import ErrorBoundary from '$lib/ui/ErrorBoundary.svelte';
  import { heatStyle } from '$lib/ui/heat';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import ResponsiveTable from '$lib/ui/ResponsiveTable.svelte';
  import SuiteBar from '$lib/ui/SuiteBar.svelte';

  let { data } = $props();
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

  const unrecorded = $derived(items.map((c) => unrecordedDeployment(c.first)));
  const depLabels = $derived(items.map((c) => deploymentText(index, c)));
  const deploymentsDiffer = $derived(new Set(items.map((c) => c.first.deployment)).size > 1);
  const mixedWhere = $derived(
    items.some((c) => c.first.where === 'local') && items.some((c) => c.first.where !== 'local'),
  );
  const anyLocal = $derived(items.some((c) => c.first.where === 'local'));
  const anyCloud = $derived(items.some((c) => c.first.where !== 'local'));
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

  const groups = $derived(pickerGroups(index, res.view.candidates(), items));
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

  // ---- Summary table ----

  type SRow = { k: number; c: Candidate };
  const srows = $derived<SRow[]>(items.map((c, k) => ({ k, c })));
  const bestMean = $derived(bestOf(nums.rows.map((r) => r.mean)));
  const showTime = (k: number, v: number | null, fmt: (v: number | null) => string) =>
    unrecorded[k] ? '–' : !nums.timesLoaded ? '…' : v === null ? '–' : fmt(v);

  const scols = $derived<Column<SRow>[]>([
    { id: 'setup', header: 'Setup', rowHeader: true },
    { id: 'mean', header: `Mean, ${nPaired} finished`, align: 'end' },
    ...nums.tiers.map<Column<SRow>>((t) => ({
      id: `tier:${t.tier}`,
      header: tierLabel(t.tier),
      title: `${t.n} shared finished task${t.n === 1 ? '' : 's'}`,
      align: 'end',
    })),
    { id: 'top', header: 'Top score on', align: 'end' },
    { id: 'fin', header: 'Finished', align: 'end' },
    { id: 'time', header: 'Median time per task', align: 'end' },
    {
      id: 'tps',
      header: 'Decode speed',
      title:
        'Output tokens per second of generation, prompt processing excluded: a property of the deployment',
      align: 'end',
    },
    ...(anyLocal
      ? [
          {
            id: 'elec',
            header: '≈ Electricity per task',
            title:
              "Local runs aren't billed: this is time × the machine's power × the electricity price. Mean of per-task means.",
            align: 'end',
          } as Column<SRow>,
        ]
      : []),
    ...(anyCloud
      ? [
          {
            id: 'billed',
            header: 'Billed per task',
            title: 'API cost per task, billed. Mean of per-task means.',
            align: 'end',
          } as Column<SRow>,
        ]
      : []),
  ]);

  // ---- Charts ----

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
  const outcomeLine = (r: RunInfo) =>
    `${outcomeText({ outcome: r.outcome })}${r.elapsed !== null ? ` after ${fmtSeconds(r.elapsed)}` : ''}`;
  const badKinds = (b: Unfinished) =>
    [b.timeouts ? `${b.timeouts} timed out` : '', b.errors ? `${b.errors} harness error` : '']
      .filter(Boolean)
      .join(', ');

  // ---- Where they differ ----

  const spread = $derived(spreadRows(nums));
  const diffRuns = $derived(items.map((_, k) => runs?.[k]));

  // ---- Not shared ----

  const missing = $derived(
    items.map((c) => {
      const have = countedOf(index, c);
      return tasks.filter((t) => !have.has(t.id));
    }),
  );
  const outside = $derived(tasks.filter((t) => missing.some((m) => m.some((x) => x.id === t.id))));
  let openMissing = $state<Record<string, boolean>>({});
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
    <div class="field">
      <span class="lbl" id="cmp-mode-l">Section</span>
      <div class="seg" role="radiogroup" aria-labelledby="cmp-mode-l">
        {#each [...(info.hasCombined ? [{ id: 'combined', label: info.combinedLabel }] : []), ...info.modes] as m (m.id)}
          <button type="button" role="radio" aria-checked={res.section === m.id} onclick={() => go([], m.id)}
            >{m.label}</button
          >
        {/each}
      </div>
    </div>
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
      <ResponsiveTable
        rows={srows}
        columns={scols}
        rowKey={(r) => r.c.id}
        caption="Each setup's scores on the shared finished tasks, with time, speed and cost"
      >
        {#snippet cell(r, col)}
          {@const row = nums.rows[r.k]!}
          {#if col.id === 'setup'}
            <Identity {index} item={r.c} color={colors[r.k]} {withHarness} {suiteQ} />
          {:else if col.id === 'mean'}
            <span
              class="chip-score"
              class:best={bestMean !== null && row.mean === bestMean}
              style={heatStyle(row.mean)}>{fmtScore(row.mean)}</span
            >
          {:else if col.id.startsWith('tier:')}
            {@const t = nums.tiers.find((x) => `tier:${x.tier}` === col.id)}
            {@const v = t?.scores[r.k] ?? null}
            <span class:best={t && bestOf(t.scores) !== null && v === bestOf(t.scores)}>{fmtScore(v)}</span>
          {:else if col.id === 'top'}
            {row.top} of {nPaired}
          {:else if col.id === 'fin'}
            <span class:bad={row.bad.length > 0}
              >{row.bad.length
                ? `didn't finish ${row.bad.length} of ${nShared}`
                : `all ${nShared} finished`}</span
            >
          {:else if col.id === 'time'}
            <span title="Median over shared finished tasks, on {depLabels[r.k]}"
              >{showTime(r.k, row.time, fmtSeconds)}</span
            >{#if deploymentsDiffer}<span class="subline">{depLabels[r.k]}</span>{/if}
          {:else if col.id === 'tps'}
            <span title="{tpsTitle(row.tps, row.finishedRuns)}, on {depLabels[r.k]}"
              >{showTime(r.k, row.tps.value, (v) => fmtTps(v))}</span
            >{#if deploymentsDiffer}<span class="subline">{depLabels[r.k]}</span>{/if}
          {:else if col.id === 'elec'}
            {r.c.first.where === 'local' ? showTime(r.k, row.cost, (v) => fmtCost(v, true)) : '–'}
          {:else if col.id === 'billed'}
            {r.c.first.where === 'local' ? '–' : showTime(r.k, row.cost, (v) => fmtCost(v, false))}
          {/if}
        {/snippet}
      </ResponsiveTable>
      <p class="muted small">
        Time, speed and cost are medians and means over the {nPaired} paired task{nPaired === 1 ? '' : 's'};
        cost is the mean of per-task means. Local costs are an electricity estimate and are never set against
        cloud billing.
        {#if unrecorded.some(Boolean)}A setup whose machine or provider wasn't recorded shows no time, speed
          or cost.{/if}
      </p>
    </ErrorBoundary>

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
                      >{row[i] === null ? '×' : fmtScore(row[i])}{#if dnf[k]![i]}<span
                          class="visually-hidden"
                        >
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
    <ErrorBoundary what="the run times" error={runsError} onretry={() => (retry += 1)}>
      {#if !nums.timesLoaded}
        <p class="muted" role="status">Loading run times…</p>
      {:else if !tAxis}
        <p class="sub">No run times were recorded for these tasks.</p>
      {:else}
        <p class="sub">
          Seconds per task (median of finished runs) on a log scale: equal distances are equal ratios, not
          equal seconds.{dnfNote}
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
              <caption class="visually-hidden">Median finished time of each setup on each shared task</caption
              >
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

  <h2>Reliability</h2>
  <ErrorBoundary what="reliability">
    {#if !nums.rows.some((r) => r.bad.length)}
      <p class="sub">Every setup finished every shared task, so no task is left out of the scores.</p>
    {:else}
      <p class="sub">
        A run that timed out or hit a harness error says how reliable the setup is, not how well it answers,
        so it is left out of the scores above (the suite's own leaderboard still scores it 0).
      </p>
      <ul class="missing">
        {#each nums.rows as r, k (k)}
          <li>
            <div class="line">
              <span class="dot" style:background={colors[k]} aria-hidden="true"></span>
              {labels[k]}: {r.bad.length
                ? `didn't finish on ${r.bad.length} of ${nShared} shared tasks`
                : `finished all ${nShared} shared tasks`}
            </div>
            {#if r.bad.length}
              <ul class="list">
                {#each r.bad as b (b.task.id)}
                  <li>
                    <a href={taskHref(b.task.id, suiteQ)}>{b.task.name}</a>:
                    {#if b.runs.length}
                      {#each b.runs as run, i (run.uuid)}{i ? '; ' : ''}<a href={runHref(run.uuid, suiteQ)}
                          >{outcomeLine(run)}</a
                        >{/each}
                    {:else}
                      {badKinds(b)}
                    {/if}
                    {b.k < b.n ? ` (${b.k} of ${b.n} runs)` : ''}
                  </li>
                {/each}
              </ul>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </ErrorBoundary>

  {#if unrecorded.some(Boolean)}
    <h2>Machine not recorded</h2>
    <p class="sub">
      These setups ran on a machine or provider that wasn't recorded, so their runs could come from different
      ones. Their scores are shown, but time, speed and cost are left out and never compared.
    </p>
    <ul class="missing">
      {#each items as c, k (c.id)}
        {#if unrecorded[k]}
          <li>
            <div class="line">
              <span class="dot" style:background={colors[k]} aria-hidden="true"></span>
              {labels[k]}: {c.first.runs} run{c.first.runs === 1 ? '' : 's'}, {depLabels[k]}
            </div>
          </li>
        {/if}
      {/each}
    </ul>
  {/if}

  <h2>Tasks not shared</h2>
  <ErrorBoundary what="the unshared tasks">
    {#if !outside.length}
      <p class="sub">Every one of the {tasks.length} tasks in {secName} is shared by all of these setups.</p>
    {:else}
      <p class="sub">
        {outside.length} of the {tasks.length} tasks in {secName} are left out of the comparison because at least
        one setup has no counted run of them on its recorded machine or provider. Nobody is scored on a task another
        setup skipped.
      </p>
      <ul class="missing">
        {#each items as c, k (c.id)}
          {@const miss = missing[k]!}
          <li>
            <div class="line">
              <span class="dot" style:background={colors[k]} aria-hidden="true"></span>
              {labels[k]}: {miss.length
                ? `no counted run of ${fmtInt(miss.length)} of ${tasks.length} tasks`
                : `ran all ${tasks.length} tasks`}
              {#if miss.length}
                <button
                  type="button"
                  class="linkbtn"
                  aria-expanded={!!openMissing[c.id]}
                  onclick={() => (openMissing[c.id] = !openMissing[c.id])}
                  >{openMissing[c.id] ? 'Hide' : 'List them'}</button
                >
              {/if}
            </div>
            {#if miss.length && openMissing[c.id]}
              <ul class="list">
                {#each miss as t (t.id)}<li><a href={taskHref(t.id, suiteQ)}>{t.name}</a></li>{/each}
              </ul>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </ErrorBoundary>
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
  .seg {
    display: inline-flex;
    flex-wrap: wrap;
    padding: 3px;
    background: var(--tray);
    border-radius: var(--radius);
    width: fit-content;
  }
  .seg button {
    background: none;
    border: 0;
    border-radius: var(--radius-sm);
    padding: 0.3rem 0.8rem;
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .seg button[aria-checked='true'] {
    background: var(--surface);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.18);
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
  .small {
    font-size: var(--text-sm);
    max-width: 60rem;
  }
  .chip-score {
    display: inline-block;
    min-width: 2.6em;
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    text-align: center;
    font-weight: 600;
  }
  .best {
    font-weight: 700;
  }
  .chip-score.best {
    outline: 2px solid var(--fg);
    outline-offset: 1px;
  }
  .bad {
    color: var(--bad);
    font-weight: 600;
  }
  .subline {
    display: block;
    font-size: var(--text-xs);
    color: var(--muted);
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
  .missing {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-2);
  }
  .line {
    font-weight: 600;
  }
  .list {
    margin: var(--space-1) 0 0;
    padding-left: var(--space-5);
    font-size: var(--text-sm);
    columns: 1;
  }
  .linkbtn {
    background: none;
    border: 0;
    padding: 0 0 0 var(--space-2);
    color: var(--accent);
    text-decoration: underline;
    font-size: var(--text-sm);
    font-weight: 400;
  }
</style>
