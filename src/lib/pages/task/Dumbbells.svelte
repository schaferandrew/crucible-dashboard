<script lang="ts">
  // Same setup, different harness (TASK-HARNESS-02): one dumbbell per setup that ran on two or more harnesses,
  // a marker per harness (shape and colour by the harness's position). Markers link to their run page (B-21).
  import { fmtScore, fmtSeconds } from '$lib/core/format';
  import type { Dumbbell, Entry } from './shape';

  let {
    rows,
    harnesses,
    harnessLabel,
    href,
  }: {
    rows: Dumbbell[];
    harnesses: string[];
    harnessLabel: (id: string) => string;
    href: (e: Entry) => string;
  } = $props();

  let box = $state(600);
  const width = $derived(Math.max(280, box));
  const m = { left: 16, right: 16, top: 6, bottom: 30 };
  const rowH = 50;
  const height = $derived(m.top + rows.length * rowH + m.bottom);
  const base = $derived(m.top + rows.length * rowH);
  const x = (v: number) => m.left + (v / 10) * (width - m.left - m.right);
  const SHAPES = ['circle', 'square', 'diamond', 'triangle'] as const;
  const idx = (id: string) => Math.max(0, harnesses.indexOf(id));
  const color = (id: string) => `var(--series-${(idx(id) % 4) + 1})`;
  const shape = (id: string) => SHAPES[idx(id) % SHAPES.length]!;
  const r = 6;
  const pts = (s: string, cx: number, cy: number) =>
    s === 'diamond'
      ? `${cx},${cy - r - 1} ${cx + r + 1},${cy} ${cx},${cy + r + 1} ${cx - r - 1},${cy}`
      : `${cx},${cy - r - 1} ${cx + r + 1},${cy + r} ${cx - r - 1},${cy + r}`;
</script>

<div class="chart" bind:clientWidth={box}>
  <svg
    {width}
    {height}
    viewBox="0 0 {width} {height}"
    role="img"
    aria-label="Score of each model on each harness, same setup"
  >
    {#each [0, 2, 4, 6, 8, 10] as v (v)}
      <line class="grid" x1={x(v)} x2={x(v)} y1={m.top} y2={base} />
      <text class="axis" x={x(v)} y={base + 16} text-anchor="middle">{v}</text>
    {/each}
    {#each rows as d, i (d.name + i)}
      {@const top = m.top + i * rowH}
      {@const dy = top + 34}
      <text class="name" x={m.left} y={top + 16}>
        <tspan font-weight="bold">{d.name}</tspan><tspan class="vals">
          {'   ' +
            d.members.map((e) => `${harnessLabel(e.setup.harness)} ${fmtScore(e.mean)}`).join(' · ')}</tspan
        >
      </text>
      <line class="bar" x1={x(d.min)} x2={x(d.max)} y1={dy} y2={dy} />
      {#each d.members as e (e.setup.id)}
        {@const s = shape(e.setup.harness)}
        {@const cx = x(e.mean)}
        <a href={href(e)}>
          <title>{d.name} on {harnessLabel(e.setup.harness)}: {fmtScore(e.mean)} · {fmtSeconds(e.time)}</title
          >
          {#if s === 'square'}
            <rect x={cx - r} y={dy - r} width={2 * r} height={2 * r} fill={color(e.setup.harness)} />
          {:else if s === 'circle'}
            <circle {cx} cy={dy} {r} fill={color(e.setup.harness)} />
          {:else}
            <polygon points={pts(s, cx, dy)} fill={color(e.setup.harness)} />
          {/if}
        </a>
      {/each}
    {/each}
  </svg>
</div>

<details class="alt">
  <summary>Show the scores as a table</summary>
  <table>
    <caption class="visually-hidden">Score of each setup on each harness</caption>
    <thead><tr><th scope="col">Setup</th><th scope="col">Harness scores</th></tr></thead>
    <tbody>
      {#each rows as d, i (d.name + i)}
        <tr>
          <th scope="row">{d.name}</th>
          <td>
            {#each d.members as e, j (e.setup.id)}{j ? ' · ' : ''}<a href={href(e)}
                >{harnessLabel(e.setup.harness)} {fmtScore(e.mean)}</a
              >{/each}
          </td>
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
  .grid {
    stroke: var(--border);
  }
  .axis {
    fill: var(--muted);
    font-size: 11px;
  }
  .name {
    fill: var(--fg);
    font-size: 12px;
  }
  .vals {
    fill: var(--muted);
  }
  .bar {
    stroke: var(--border-strong);
    stroke-width: 3;
    stroke-linecap: round;
  }
  rect,
  circle,
  polygon {
    stroke: var(--surface);
    stroke-width: 2;
  }
  a:hover :is(rect, circle, polygon),
  a:focus-visible :is(rect, circle, polygon) {
    stroke: var(--fg);
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
