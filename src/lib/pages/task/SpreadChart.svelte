<script lang="ts">
  // Score spread (TASK-SPREAD-01): one dot per setup on a 0-10 axis, stacked where scores coincide. Hand-written
  // SVG that follows its box's width; each dot links to its run page (B-21). The table below is the accessible
  // alternative.
  import { fmtScore } from '$lib/core/format';
  import { spreadLayout, type Entry } from './shape';

  let {
    entries,
    href,
    title,
  }: { entries: Entry[]; href: (e: Entry) => string; title: (e: Entry) => string } = $props();

  let box = $state(600);
  const width = $derived(Math.max(280, box));
  const m = { top: 10, right: 16, bottom: 30, left: 16 };
  const lay = $derived(spreadLayout(entries));
  const height = $derived(m.top + lay.plotH + m.bottom);
  const base = $derived(m.top + lay.plotH);
  const x = (v: number) => m.left + (v / 10) * (width - m.left - m.right);
</script>

<div class="chart" bind:clientWidth={box}>
  <svg
    {width}
    {height}
    viewBox="0 0 {width} {height}"
    role="img"
    aria-label="Score of each setup on this task, one dot per setup"
  >
    <line class="base" x1={m.left} x2={width - m.right} y1={base} y2={base} />
    {#each [0, 2, 4, 6, 8, 10] as v (v)}
      <line class="grid" x1={x(v)} x2={x(v)} y1={m.top} y2={base} />
      <text class="axis" x={x(v)} y={base + 16} text-anchor="middle">{v}</text>
    {/each}
    {#each lay.dots as d (d.entry.setup.id)}
      <a href={href(d.entry)}>
        <title>{title(d.entry)}</title>
        <circle
          class={d.entry.local ? 'local' : 'cloud'}
          cx={x(d.entry.mean)}
          cy={base - lay.r - 1 - d.stack * lay.step}
          r={lay.r}
        />
      </a>
    {/each}
  </svg>
</div>

<details class="alt">
  <summary>Show the scores as a table</summary>
  <table>
    <caption class="visually-hidden">Mean score of each setup on this task</caption>
    <thead><tr><th scope="col">Setup</th><th scope="col">Score</th></tr></thead>
    <tbody>
      {#each entries as e (e.setup.id)}
        <tr
          ><th scope="row"><a href={href(e)}>{title(e).split(' · ').slice(0, -1).join(' · ')}</a></th><td
            >{fmtScore(e.mean)}</td
          ></tr
        >
      {/each}
    </tbody>
  </table>
</details>

<style>
  .chart {
    width: 100%;
  }
  svg {
    display: block;
    max-width: 100%;
  }
  .base {
    stroke: var(--border-strong);
  }
  .grid {
    stroke: var(--border);
  }
  .axis {
    fill: var(--muted);
    font-size: 11px;
  }
  circle {
    stroke: var(--surface);
    stroke-width: 1;
  }
  circle.local {
    fill: var(--local);
  }
  circle.cloud {
    fill: var(--cloud);
  }
  a:hover circle,
  a:focus-visible circle {
    stroke: var(--fg);
    stroke-width: 2;
  }
  .alt {
    margin-top: var(--space-2);
    font-size: var(--text-sm);
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
</style>
