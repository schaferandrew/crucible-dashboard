<script lang="ts">
  // The leaderboard column chart (MAIN-BARS-*): hand-written SVG, with a visually hidden table of the same
  // numbers. Plots the Overall score (B-15).
  import { fmtCost, fmtScore, fmtSeconds } from '$lib/core/format';
  import type { Row } from '$lib/core/scoring';
  import { setupLabel } from '$lib/labels';
  import { barRows, layoutBars, barName, type Bar } from './bars';
  import ModelRef from './ModelRef.svelte';
  import { Tip } from './tip.svelte';

  let {
    rows,
    yMax,
    label,
    coverageMin,
    suite,
  }: { rows: Row[]; yMax: number; label: string; coverageMin: number; suite?: string } = $props();

  const id = $props.id();
  let box = $state(0);
  let vw = $state(1200);
  const list = $derived(barRows(rows));
  const narrow = $derived(vw < 640 || (box > 0 && box < 640));
  const width = $derived(Math.max(280, box || 560));
  const lay = $derived(layoutBars(list, yMax, width, narrow));
  const kinds = $derived({ local: list.some((r) => r.local), cloud: list.some((r) => !r.local) });
  const anyPartial = $derived(list.some((r) => r.overall.partial));
  const tip = new Tip<Bar>();

  let scroller: HTMLElement | undefined = $state();
  let more = $state(false);
  let sl = $state(0);
  function onscroll() {
    if (!scroller) return;
    sl = scroller.scrollLeft;
    more = scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 2;
  }
  $effect(() => {
    void lay.width;
    void box;
    onscroll();
  });

  function show(b: Bar) {
    tip.show(b, b.x + b.w - (narrow ? 0 : sl), narrow ? b.y : b.y + b.h / 2);
  }
</script>

<svelte:window bind:innerWidth={vw} />

{#if list.length}
  <div class="legend" aria-hidden="false">
    {#if kinds.local}<span class="item"><span class="sw local"></span>Local</span>{/if}
    {#if kinds.cloud}<span class="item"><span class="sw cloud"></span>Cloud</span>{/if}
    {#if anyPartial}<span class="item"
        ><span class="sw partial"></span>Partial: a tier has under {Math.round(coverageMin * 100)}% of its
        tasks scored</span
      >{/if}
  </div>
  <div class="wrap" bind:clientWidth={box}>
    {#if lay.narrow}
      <svg
        class="chart"
        width={lay.width}
        height={lay.height}
        viewBox="0 0 {lay.width} {lay.height}"
        role="img"
        aria-label="{label} score for each model, best first. The table below has the same numbers."
      >
        <defs>
          {#each ['local', 'cloud'] as k (k)}
            <pattern
              id="{id}-hatch-{k}"
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" class="f-{k}" opacity="0.35" />
              <rect width="3" height="6" class="f-{k}" />
            </pattern>
          {/each}
        </defs>
        {#each lay.ticks as t (t.v)}
          <line
            class={t.v ? 'grid' : 'baseline'}
            x1={lay.left}
            x2={lay.width - lay.right}
            y1={t.y}
            y2={t.y}
          />
          <text class="axis" x={lay.left - 8} y={t.y + 4} text-anchor="end">{t.v}</text>
        {/each}
        {#each lay.bars as b (b.row.rowKey)}
          <path
            class="bar f-{b.kind}"
            class:inprog={b.row.inProgress}
            d={b.path}
            fill={b.row.overall.partial ? `url(#${id}-hatch-${b.kind})` : undefined}
          />
          {#if lay.narrow}
            <text class="name" x={b.nx} y={b.ny}>{b.shown}</text>
            <text class="value" x={b.vx} y={b.vy}>{fmtScore(b.score)}</text>
          {:else}
            <text class="value" x={b.vx} y={b.vy} text-anchor="middle">{fmtScore(b.score)}</text>
            <text class="name" text-anchor="end" transform="translate({b.nx},{b.ny}) rotate(-45)"
              >{b.shown}</text
            >
          {/if}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <rect
            class="hit"
            x={b.hx}
            y={b.hy}
            width={b.hw}
            height={b.hh}
            tabindex="0"
            role="img"
            aria-label="{b.name}: {label} {fmtScore(b.score)}{b.row.overall.partial ? ', partial' : ''}"
            onmouseenter={() => show(b)}
            onfocus={() => show(b)}
            onmouseleave={() => tip.hide()}
            onblur={() => tip.hide()}
          />
        {/each}
      </svg>
    {:else}
      <div class="plot">
        <svg class="axissvg" width={lay.left} height={lay.height} aria-hidden="true">
          {#each lay.ticks as t (t.v)}
            <text class="axis" x={lay.left - 8} y={t.y + 4} text-anchor="end">{t.v}</text>
          {/each}
        </svg>
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div
          class="scroller"
          class:more
          tabindex="0"
          role="region"
          aria-label="{label} score chart: scroll sideways for more models"
          bind:this={scroller}
          {onscroll}
        >
          <svg
            class="chart"
            width={lay.width - lay.left}
            height={lay.height}
            viewBox="0 0 {lay.width - lay.left} {lay.height}"
            role="img"
            aria-label="{label} score for each model, best first. The table below has the same numbers."
          >
            <g transform="translate({-lay.left},0)">
              <defs>
                {#each ['local', 'cloud'] as k (k)}
                  <pattern
                    id="{id}-hatch-{k}"
                    width="6"
                    height="6"
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(45)"
                  >
                    <rect width="6" height="6" class="f-{k}" opacity="0.35" />
                    <rect width="3" height="6" class="f-{k}" />
                  </pattern>
                {/each}
              </defs>
              {#each lay.ticks as t (t.v)}
                <line
                  class={t.v ? 'grid' : 'baseline'}
                  x1={lay.left}
                  x2={lay.width - lay.right}
                  y1={t.y}
                  y2={t.y}
                />
              {/each}
              {#each lay.bars as b (b.row.rowKey)}
                <path
                  class="bar f-{b.kind}"
                  class:inprog={b.row.inProgress}
                  d={b.path}
                  fill={b.row.overall.partial ? `url(#${id}-hatch-${b.kind})` : undefined}
                />
                {#if lay.narrow}
                  <text class="name" x={b.nx} y={b.ny}>{b.shown}</text>
                  <text class="value" x={b.vx} y={b.vy}>{fmtScore(b.score)}</text>
                {:else}
                  <text class="value" x={b.vx} y={b.vy} text-anchor="middle">{fmtScore(b.score)}</text>
                  <text class="name" text-anchor="end" transform="translate({b.nx},{b.ny}) rotate(-45)"
                    >{b.shown}</text
                  >
                {/if}
                <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
                <rect
                  class="hit"
                  x={b.hx}
                  y={b.hy}
                  width={b.hw}
                  height={b.hh}
                  tabindex="0"
                  role="img"
                  aria-label="{b.name}: {label} {fmtScore(b.score)}{b.row.overall.partial ? ', partial' : ''}"
                  onmouseenter={() => show(b)}
                  onfocus={() => show(b)}
                  onmouseleave={() => tip.hide()}
                  onblur={() => tip.hide()}
                />
              {/each}
            </g>
          </svg>
        </div>
      </div>
    {/if}
    {#if tip.item}
      {@const b = tip.item}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="tip"
        style:left={tip.x < box / 2 ? tip.x + 10 + 'px' : undefined}
        style:right={tip.x < box / 2 ? undefined : box - tip.x + b.w + 10 + 'px'}
        style:top={Math.max(0, tip.y - 20) + 'px'}
        onmouseenter={() => tip.keep()}
        onmouseleave={() => tip.hide()}
      >
        <div class="tt"><ModelRef row={b.row} {suite} /></div>
        <div class="muted">{setupLabel(b.row)}</div>
        <div>
          {label}
          {fmtScore(b.score)} of {yMax}{b.row.overall.partial ? ' (partial)' : ''}{b.row.inProgress
            ? ' · in progress'
            : ''}
        </div>
        <div>Time per task {fmtSeconds(b.row.time)} · cost {fmtCost(b.row.cost, b.row.local)}</div>
      </div>
    {/if}
  </div>
  <div class="visually-hidden">
    <table>
      <caption>{label} score for each model, best first</caption>
      <thead
        ><tr><th>Model</th><th>{label}</th><th>Partial</th><th>Time per task</th><th>Cost per task</th></tr
        ></thead
      >
      <tbody>
        {#each list as r (r.rowKey)}
          <tr
            ><th scope="row">{barName(r)}</th><td>{fmtScore(r.overall.score)}</td><td
              >{r.overall.partial ? 'partial' : 'no'}</td
            ><td>{fmtSeconds(r.time)}</td><td>{fmtCost(r.cost, r.local)}</td></tr
          >
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-4);
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
  .sw.partial {
    background: repeating-linear-gradient(135deg, var(--border-strong) 0 3px, transparent 3px 6px);
    border: 1px solid var(--border-strong);
  }
  .wrap {
    position: relative;
    width: 100%;
    margin-bottom: var(--space-4);
  }
  .chart {
    display: block;
    max-width: 100%;
    overflow: visible;
  }
  .f-local {
    fill: var(--local);
  }
  .f-cloud {
    fill: var(--cloud);
  }
  .grid {
    stroke: var(--border);
  }
  .baseline {
    stroke: var(--border-strong);
  }
  .axis,
  .name {
    font-size: 11px;
    fill: var(--muted);
  }
  .value {
    font-size: 11px;
    font-weight: 700;
    fill: var(--fg);
  }
  .bar.inprog {
    opacity: 0.45;
  }
  .hit {
    fill: transparent;
    cursor: default;
  }
  .hit:hover,
  .hit:focus-visible {
    fill: var(--accent-soft);
    fill-opacity: 0.5;
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
  .muted {
    font-size: var(--text-xs);
  }
  .plot {
    display: flex;
    align-items: flex-start;
  }
  .axissvg {
    flex: none;
    position: relative;
    z-index: 1;
    background: var(--bg);
  }
  .scroller .chart {
    max-width: none;
  }
  .scroller {
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    position: relative;
  }
  .scroller::after {
    content: '';
    position: sticky;
    display: block;
    float: right;
    right: 0;
    top: 0;
    width: 24px;
    height: 100%;
    margin-top: -100%;
    pointer-events: none;
    opacity: 0;
    background: linear-gradient(to right, transparent, var(--bg));
  }
  .scroller.more {
    box-shadow: inset -10px 0 8px -8px rgb(0 0 0 / 0.2);
  }
</style>
