<script lang="ts">
  // Quality vs time or cost (MAIN-SCAT-*): hand-written SVG plus a visually hidden table of the same points.
  import { fmtCost, fmtScore, fmtSeconds, fmtUsd } from '$lib/core/format';
  import type { Row } from '$lib/core/scoring';
  import type { Scope } from '$lib/core/scope';
  import { setupLabel } from '$lib/labels';
  import { modelHref } from '$lib/paths';
  import ModelRef from './ModelRef.svelte';
  import { aggLabel } from './phrases';
  import {
    layoutScatter,
    scatterPoints,
    scatterSub,
    scatterWhat,
    skippedLocal,
    xOf,
    type Dot,
    type Measure,
  } from './scatter';
  import { Tip } from './tip.svelte';

  let { sc, suite }: { sc: Scope; suite?: string } = $props();

  let measure = $state<Measure>('time');
  let box = $state(0);
  const label = $derived(aggLabel(sc.view));
  const yMax = $derived(sc.view.aggMax(sc.ctx.exclude));
  const points = $derived(scatterPoints(sc.visible, measure));
  const lay = $derived(points.length ? layoutScatter(points, measure, yMax, box) : null);
  const what = $derived(scatterWhat(sc, label));
  const sub = $derived(scatterSub(measure, what, skippedLocal(sc.visible, measure)));
  const byNumber = $derived(lay ? lay.dots.slice().sort((a, b) => a.n - b.n) : []);
  const tip = new Tip<Dot>();
  const xText = (r: Row) => (measure === 'time' ? fmtSeconds(r.time) : fmtCost(r.cost, r.local));
  const MEASURES: [Measure, string][] = [
    ['time', 'Time per task'],
    ['cost', 'Cost per task'],
  ];
</script>

<h2>Quality vs {measure}</h2>
<div class="toolbar" role="radiogroup" aria-label="Plot the headline score against">
  {#each MEASURES as [m, text] (m)}
    <button type="button" role="radio" aria-checked={measure === m} onclick={() => (measure = m)}
      >{text}</button
    >
  {/each}
</div>
<p class="sub muted">{sub}</p>

{#if lay}
  <div class="legend">
    <span class="item"><span class="sw local"></span>Local</span>
    <span class="item"><span class="sw cloud"></span>Cloud</span>
  </div>
{/if}
<div class="wrap" bind:clientWidth={box}>
  {#if !lay}
    <p class="muted">Nothing to plot for these filters yet.</p>
  {:else}
    <svg
      class="chart"
      width={lay.width}
      height={lay.height}
      viewBox="0 0 {lay.width} {lay.height}"
      role="img"
      aria-label="{what} against {measure} per task. The leaderboard has the same numbers."
    >
      <rect
        class="quadrant"
        x={lay.quadrant.x}
        y={lay.quadrant.y}
        width={lay.quadrant.w}
        height={lay.quadrant.h}
      />
      {#each lay.yTicks as t (t.v)}
        <line
          class={t.v ? 'grid' : 'baseline'}
          x1={lay.m.left}
          x2={lay.width - lay.m.right}
          y1={t.y}
          y2={t.y}
        />
        <text class="axis" x={lay.m.left - 8} y={t.y + 4} text-anchor="end">{t.v}</text>
      {/each}
      {#each lay.xTicks as t (t.v)}
        <line class="grid" x1={t.x} x2={t.x} y1={lay.m.top} y2={lay.height - lay.m.bottom} />
        <text class="axis" x={t.x} y={lay.height - lay.m.bottom + 16} text-anchor="middle"
          >{measure === 'time' ? fmtSeconds(t.v) : fmtUsd(t.v)}</text
        >
      {/each}
      <text
        class="title"
        x={(lay.m.left + lay.width - lay.m.right) / 2}
        y={lay.height - 6}
        text-anchor="middle"
        >{measure === 'time' ? 'Median time per task' : 'Average cost per task'} (log scale)</text
      >
      {#if lay.frontierPath}<path class="frontier" d={lay.frontierPath} />{/if}
      {#each lay.dots as d (d.row.rowKey)}
        <circle
          class="dot {d.row.local ? 'local' : 'cloud'}"
          class:partial={d.row.overall.partial}
          cx={d.px}
          cy={d.py}
          r="6"
        />
        {#if lay.narrow}
          <text class="plabel" x={d.px + 8} y={d.py - 7}>{d.n}</text>
        {:else if d.label}
          <text
            class="plabel"
            x={d.flip ? d.px - 9 : d.px + 9}
            y={d.py - 8}
            text-anchor={d.flip ? 'end' : 'start'}>{d.row.label}</text
          >
        {/if}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <circle
          class="hit"
          cx={d.px}
          cy={d.py}
          r="14"
          tabindex="0"
          role="img"
          aria-label="{d.row.label}: {label} {fmtScore(d.row.overall.score)}, {xText(d.row)}"
          onmouseenter={() => tip.show(d, d.px, d.py)}
          onfocus={() => tip.show(d, d.px, d.py)}
          onmouseleave={() => tip.hide()}
          onblur={() => tip.hide()}
        />
      {/each}
    </svg>
    {#if tip.item}
      {@const d = tip.item}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="tip"
        style:left={tip.x < box / 2 ? tip.x + 14 + 'px' : undefined}
        style:right={tip.x < box / 2 ? undefined : box - tip.x + 14 + 'px'}
        style:top={Math.max(0, tip.y - 20) + 'px'}
        onmouseenter={() => tip.keep()}
        onmouseleave={() => tip.hide()}
      >
        <div class="tt"><ModelRef row={d.row} {suite} /> · {d.row.local ? 'local' : 'cloud'}</div>
        <div class="muted small">{setupLabel(d.row)}</div>
        <div>{label} {fmtScore(d.row.overall.score)}{d.row.overall.partial ? ' (partial)' : ''}</div>
        <div>Time per task {fmtSeconds(d.row.time)} · cost {fmtCost(d.row.cost, d.row.local)}</div>
      </div>
    {/if}
  {/if}
</div>
{#if lay}
  {#if lay.narrow}
    <ol class="key">
      {#each byNumber as d (d.row.rowKey)}
        <li>
          <span class="sw {d.row.local ? 'local' : 'cloud'}"></span>
          <strong>{d.n}</strong>
          <a href={modelHref(d.row.model, suite)}>{d.row.label}</a>
          · {fmtScore(d.row.overall.score)}{d.row.overall.partial ? ' (partial)' : ''} · {xText(d.row)}
        </li>
      {/each}
    </ol>
  {/if}
  <div class="visually-hidden">
    <table>
      <caption>{what} against {measure} per task</caption>
      <thead
        ><tr
          ><th>Model</th><th>{label}</th><th>{measure === 'time' ? 'Time per task' : 'Cost per task'}</th></tr
        ></thead
      >
      <tbody>
        {#each points as r (r.rowKey)}
          <tr
            ><th scope="row">{r.label}</th><td
              >{fmtScore(r.overall.score)}{r.overall.partial ? ' (partial)' : ''}</td
            ><td>{xOf(r, measure) === null ? '—' : xText(r)}</td></tr
          >
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  h2 {
    margin-top: var(--space-6);
  }
  .toolbar {
    display: inline-flex;
    padding: 2px;
    background: var(--tray);
    border-radius: var(--radius);
    margin-bottom: var(--space-2);
  }
  .toolbar button {
    border: 0;
    background: none;
    padding: 0.25rem 0.75rem;
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
  }
  .toolbar button[aria-checked='true'] {
    background: var(--surface);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.15);
    font-weight: 700;
  }
  .sub {
    max-width: 60rem;
    font-size: var(--text-sm);
  }
  .legend {
    display: flex;
    gap: var(--space-4);
    font-size: var(--text-sm);
    color: var(--muted);
    margin-bottom: var(--space-2);
  }
  .item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .sw {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    display: inline-block;
  }
  .sw.local {
    background: var(--local);
  }
  .sw.cloud {
    background: var(--cloud);
  }
  .wrap {
    position: relative;
    width: 100%;
  }
  .chart {
    display: block;
    max-width: 100%;
  }
  .quadrant {
    fill: var(--accent-soft);
    opacity: 0.6;
  }
  .grid {
    stroke: var(--border);
  }
  .baseline {
    stroke: var(--border-strong);
  }
  .axis,
  .title,
  .plabel {
    font-size: 11px;
    fill: var(--muted);
  }
  .plabel {
    fill: var(--fg);
  }
  .frontier {
    fill: none;
    stroke: var(--muted);
    stroke-width: 1.5;
    stroke-dasharray: 4 3;
  }
  .dot {
    stroke: var(--surface);
    stroke-width: 1.5;
  }
  .dot.local {
    fill: var(--local);
  }
  .dot.cloud {
    fill: var(--cloud);
  }
  .dot.partial {
    fill: var(--surface);
    stroke-width: 2;
  }
  .dot.partial.local {
    stroke: var(--local);
  }
  .dot.partial.cloud {
    stroke: var(--cloud);
  }
  .hit {
    fill: transparent;
  }
  .hit:focus-visible {
    stroke: var(--focus);
    stroke-width: 2;
  }
  .tip {
    position: absolute;
    z-index: 5;
    max-width: 18rem;
    padding: var(--space-2) var(--space-3);
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    font-size: var(--text-sm);
  }
  .tt {
    font-weight: 700;
  }
  .small {
    font-size: var(--text-xs);
  }
  .key {
    list-style: none;
    margin: var(--space-3) 0 0;
    padding: 0;
    font-size: var(--text-sm);
  }
  .key li {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--space-2);
    align-items: baseline;
    padding: 2px 0;
  }
</style>
