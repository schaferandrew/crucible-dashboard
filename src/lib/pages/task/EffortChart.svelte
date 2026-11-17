<script lang="ts">
  // Score against effort (TASK-EFFORT-01): mean score (0-10) against a log-x measure, one dot per setup that has
  // the measure, the best setup of each model named. Dots link to their run page (B-21).
  import { fmtScore } from '$lib/core/format';
  import { logDomain, logTicks, placeLabels, type EffortPoint, type Entry } from './shape';

  let {
    points,
    named,
    axis,
    fmt,
    href,
    nameOf,
    describe,
  }: {
    points: EffortPoint[];
    named: Entry[];
    axis: string;
    fmt: (v: number) => string;
    href: (e: Entry) => string;
    nameOf: (e: Entry) => string;
    describe: (e: Entry) => string;
  } = $props();

  let box = $state(600);
  const width = $derived(Math.max(280, box));
  const narrow = $derived(width < 500);
  const height = $derived(narrow ? 300 : 340);
  const m = $derived(
    narrow ? { top: 16, right: 14, bottom: 44, left: 32 } : { top: 16, right: 24, bottom: 44, left: 44 },
  );
  const dom = $derived(logDomain(points.map((p) => p.value)));
  const x = (v: number) =>
    m.left + ((Math.log10(v) - dom[0]) / (dom[1] - dom[0])) * (width - m.left - m.right);
  const y = (v: number) => m.top + (1 - v / 10) * (height - m.top - m.bottom);
  const dots = $derived(points.map((p) => ({ ...p, px: x(p.value), py: y(p.entry.mean) })));
  const labels = $derived(
    placeLabels(
      dots.map((d) => ({ entry: d.entry, px: d.px, py: d.py })),
      named,
      width,
      height,
      nameOf,
    ),
  );
</script>

<div class="chart" bind:clientWidth={box}>
  <svg
    {width}
    {height}
    viewBox="0 0 {width} {height}"
    role="img"
    aria-label="Score against {axis.toLowerCase()} for each setup"
  >
    {#each [0, 5, 10] as v (v)}
      <line class={v ? 'grid' : 'base'} x1={m.left} x2={width - m.right} y1={y(v)} y2={y(v)} />
      <text class="axis" x={m.left - 8} y={y(v) + 4} text-anchor="end">{v}</text>
    {/each}
    {#each logTicks(dom[0], dom[1]) as v (v)}
      <line class="grid" x1={x(v)} x2={x(v)} y1={m.top} y2={height - m.bottom} />
      <text class="axis" x={x(v)} y={height - m.bottom + 16} text-anchor="middle">{fmt(v)}</text>
    {/each}
    <text class="title" x={(m.left + width - m.right) / 2} y={height - 6} text-anchor="middle"
      >{axis} (log scale)</text
    >
    {#each dots as d (d.entry.setup.id)}
      <a href={href(d.entry)} aria-label="{describe(d.entry)}, open its run">
        <title>{describe(d.entry)}</title>
        <circle class={d.entry.local ? 'local' : 'cloud'} cx={d.px} cy={d.py} r="6" />
      </a>
    {/each}
    {#each labels as l (l.entry.setup.id)}
      <text class="plabel" x={l.x} y={l.y} text-anchor={l.anchor}>{l.text}</text>
    {/each}
  </svg>
</div>

<details class="alt">
  <summary>Show the points as a table</summary>
  <table>
    <caption class="visually-hidden">Score and {axis.toLowerCase()} of each setup</caption>
    <thead><tr><th scope="col">Setup</th><th scope="col">Score</th><th scope="col">{axis}</th></tr></thead>
    <tbody>
      {#each points as p (p.entry.setup.id)}
        <tr>
          <th scope="row"><a href={href(p.entry)}>{describe(p.entry).split(' · ')[0]}</a></th>
          <td>{fmtScore(p.entry.mean)}</td>
          <td>{fmt(p.value)}</td>
        </tr>
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
  .axis,
  .title {
    fill: var(--muted);
    font-size: 11px;
  }
  .title {
    font-size: 12px;
  }
  .plabel {
    fill: var(--fg);
    font-size: 11px;
    pointer-events: none;
    paint-order: stroke;
    stroke: var(--surface);
    stroke-width: 3px;
  }
  circle {
    stroke: var(--surface);
    stroke-width: 1.5;
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
