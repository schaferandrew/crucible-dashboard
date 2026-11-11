<script lang="ts">
  // "A/B" (MODEL-AB-01/02): the best setup in scope against another setup of the model on the same recorded
  // deployment that differs in exactly one answer-changing dimension. A dumbbell per shared task, with the
  // same numbers in a table underneath.
  import { fmtScore, fmtSeconds } from '$lib/core/format';
  import type { Scope } from '$lib/core/scope';
  import type { Setup, SuiteIndex } from '$lib/core/types';
  import { taskHref } from '$lib/paths';
  import { outcomeText, type RunsByCell } from './runs';
  import {
    abCandidates,
    abSentence,
    AB_DIM_LABEL,
    compareSetups,
    speedPhrase,
    type AbCandidate,
    type AbDim,
  } from './ab';
  import { isRecorded, variantText } from './shape';
  import type { Dim } from '$lib/core/context';

  let {
    index,
    sc,
    base,
    deploymentLabel,
    runs,
    suiteParam,
    linksReady = false,
  }: {
    index: SuiteIndex;
    sc: Scope;
    base: Setup;
    deploymentLabel: string;
    runs: RunsByCell | null;
    suiteParam?: string;
    /** Task links appear once the page is interactive (the prerendered copy has none). */
    linksReady?: boolean;
  } = $props();

  const cands = $derived(abCandidates(index, sc.view, base, sc.setups));
  let pickedId = $state<string | null>(null);
  const cur = $derived<AbCandidate | null>(cands.find((c) => c.setup.id === pickedId) ?? cands[0] ?? null);

  const dimsOf = (d: AbDim): Dim[] =>
    d === 'weights' ? ['quant', 'packager', 'format'] : d === 'reasoning' ? ['reasoning'] : ['harness'];
  const textOf = (s: Setup, d: AbDim) => variantText(index, s, dimsOf(d)) || s.variant;

  const result = $derived(cur ? compareSetups(index, sc.view, base, cur.setup, runs) : null);
  const aText = $derived(cur ? textOf(base, cur.dim) : '');
  const bText = $derived(cur ? textOf(cur.setup, cur.dim) : '');
  const summary = $derived.by(() => {
    if (!result || !cur) return '';
    let s = abSentence(result, aText, bText);
    const sp = result.speed;
    if (sp && sp.a !== null && sp.b !== null) {
      s += ` On ${deploymentLabel} the median time per shared task is ${fmtSeconds(sp.b)} with ${bText} against ${fmtSeconds(sp.a)} with ${aText}.`;
      const ph = speedPhrase(sp, bText);
      if (ph) s += ' ' + ph;
    }
    return s;
  });

  const W = 300;
  const pad = 8;
  const x = (v: number) => pad + (v / 10) * (W - 2 * pad);
  const secs = (v: number | null) =>
    v === null ? '—' : v >= 60 ? `${fmtSeconds(v)} (${Math.round(v)} s)` : fmtSeconds(v);
</script>

{#if cur && result}
  <h2>A/B: {aText} or {bText}</h2>
  {#if cands.length > 1}
    <div class="pickrow">
      <span class="lbl" id="ab-lbl">Compare with</span>
      <div class="seg" role="radiogroup" aria-labelledby="ab-lbl">
        {#each cands as c (c.setup.id)}
          <button
            type="button"
            role="radio"
            aria-checked={c.setup.id === cur.setup.id}
            onclick={() => (pickedId = c.setup.id)}
          >
            {textOf(c.setup, c.dim)}
          </button>
        {/each}
      </div>
    </div>
  {/if}
  <p class="muted sub">
    The same setup but for its {AB_DIM_LABEL[cur.dim]}, on {deploymentLabel}, on the {result.shared} task{result.shared ===
    1
      ? ''
      : 's'} both ran at this suite’s task version. Score per task, 0–10; a run that didn’t finish is listed below,
    not scored as a difference.
  </p>

  <ul class="db" aria-label="Score per shared task">
    {#each result.pairs as p (p.task.id)}
      <li class:skip={!p.counted}>
        <a
          class="name"
          href={linksReady ? taskHref(p.task.id, suiteParam) : undefined}
          title={p.task.name ?? p.task.id}>{p.task.name ?? p.task.id}</a
        >
        {#if !p.counted}
          <span class="skiptext">not scored here: a side didn’t finish</span>
        {:else}
          <svg
            viewBox="0 0 {W} 20"
            role="img"
            aria-label="{p.task.name ?? p.task.id}: {aText} {fmtScore(p.a)}, {bText} {fmtScore(p.b)}"
          >
            <line x1={x(0)} x2={x(10)} y1="10" y2="10" class="rail" />
            <line x1={x(p.a!)} x2={x(p.b!)} y1="10" y2="10" class="link" />
            <circle cx={x(p.a!)} cy="10" r="5" class="a"><title>{aText}: {fmtScore(p.a)}</title></circle>
            <circle cx={x(p.b!)} cy="10" r="5" class="b"><title>{bText}: {fmtScore(p.b)}</title></circle>
          </svg>
        {/if}
      </li>
    {/each}
    <li class="axis">
      <span></span>
      <svg viewBox="0 0 {W} 14" aria-hidden="true">
        {#each [0, 5, 10] as v (v)}
          <text x={x(v)} y="11" text-anchor={v === 0 ? 'start' : v === 10 ? 'end' : 'middle'}>{v}</text>
        {/each}
      </svg>
    </li>
  </ul>
  <p class="legend">
    <span><span class="dot a"></span>{aText} (selected)</span>
    <span><span class="dot b"></span>{bText}</span>
  </p>
  <p class="summary">{summary}</p>

  <details class="alt">
    <summary>The numbers as a table</summary>
    <table>
      <caption class="visually-hidden">A/B score per shared task</caption>
      <thead
        ><tr
          ><th scope="col">Task</th><th scope="col">{aText}</th><th scope="col">{bText}</th><th scope="col"
            >Difference</th
          ></tr
        ></thead
      >
      <tbody>
        {#each result.pairs as p (p.task.id)}
          <tr>
            <th scope="row">{p.task.name ?? p.task.id}</th>
            <td>{p.counted ? fmtScore(p.a) : '—'}</td>
            <td>{p.counted ? fmtScore(p.b) : '—'}</td>
            <td>{p.counted ? fmtScore(p.b! - p.a!) : 'not scored'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </details>

  {#if result.notFinished.length}
    <p class="head">Didn’t finish (reliability, not part of the score difference)</p>
    <ul class="dnf">
      {#each result.notFinished as n (n.side + n.task.id)}
        <li>
          <a href={linksReady ? taskHref(n.task.id, suiteParam) : undefined}>{n.task.name ?? n.task.id}</a>: {n.side ===
          'a'
            ? aText
            : bText} didn’t finish {n.k} of {n.n} run{n.n === 1 ? '' : 's'}{#if n.run}
            ({outcomeText(n.run.outcome)} after {secs(n.run.elapsed_s)}){/if}.
        </li>
      {/each}
    </ul>
  {/if}
{:else if sc.view.kind !== 'combined' && !isRecorded(base) && sc.setups.length > 1}
  <h2>A/B</h2>
  <p class="muted">
    An A/B needs a recorded machine or provider. This setup’s runs are on one that wasn’t recorded, so they
    can’t be compared with another’s.
  </p>
{/if}

<style>
  .sub {
    max-width: 60rem;
    font-size: var(--text-sm);
  }
  .pickrow {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
    margin-bottom: var(--space-2);
  }
  .lbl {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  .seg {
    display: inline-flex;
    flex-wrap: wrap;
    padding: 3px;
    background: var(--tray);
    border-radius: var(--radius);
  }
  .seg button {
    border: 0;
    background: none;
    padding: 0.25rem 0.7rem;
    border-radius: var(--radius-sm);
  }
  .seg button[aria-checked='true'] {
    background: var(--surface);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.2);
    font-weight: 600;
  }
  .db {
    list-style: none;
    margin: var(--space-3) 0 0;
    padding: 0;
    display: grid;
    gap: 2px;
    max-width: 52rem;
  }
  .db li {
    display: grid;
    grid-template-columns: minmax(8rem, 16rem) 1fr;
    gap: var(--space-3);
    align-items: center;
    font-size: var(--text-sm);
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .skiptext {
    color: var(--muted);
  }
  svg {
    width: 100%;
    max-width: 340px;
    height: 20px;
  }
  .axis svg {
    height: 14px;
  }
  .rail {
    stroke: var(--border);
    stroke-width: 1;
  }
  .link {
    stroke: var(--faint);
    stroke-width: 2;
  }
  circle.a,
  .dot.a {
    fill: var(--series-1);
    background: var(--series-1);
  }
  circle.b,
  .dot.b {
    fill: var(--series-2);
    background: var(--series-2);
  }
  text {
    fill: var(--muted);
    font-size: 10px;
  }
  .legend {
    display: flex;
    gap: var(--space-4);
    flex-wrap: wrap;
    font-size: var(--text-sm);
    margin: var(--space-2) 0;
  }
  .dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    margin-right: 4px;
  }
  .summary {
    font-weight: 600;
    max-width: 60rem;
  }
  .alt {
    font-size: var(--text-sm);
    margin: var(--space-2) 0;
  }
  .alt table {
    border-collapse: collapse;
    margin-top: var(--space-2);
  }
  .alt th,
  .alt td {
    padding: 2px var(--space-3);
    text-align: left;
    border-bottom: 1px solid var(--border);
  }
  .head {
    font-weight: 700;
    margin: var(--space-3) 0 var(--space-1);
  }
  .dnf {
    margin: 0;
    padding-left: 1.2rem;
    font-size: var(--text-sm);
  }
  @media (max-width: 639px) {
    .db li {
      grid-template-columns: 1fr;
      gap: 0;
    }
  }
</style>
