<script lang="ts">
  // One row per task, one dot per setup on a shared horizontal axis; two setups are joined (a dumbbell).
  // Hand-written SVG (CMP-CHART-01..05). The page offers the same numbers as a table beside it.
  import { untrack } from 'svelte';
  import { taskHref } from '$lib/paths';
  import type { NumTask } from './numbers';
  import type { Axis } from './scales';
  import { nudge, thinTicks } from './scales';

  let {
    tasks,
    values,
    dnf = null,
    labels,
    colors,
    axis,
    tick,
    show,
    what,
    suiteQ,
  }: {
    tasks: readonly NumTask[];
    /** `values[side][task]` */
    values: readonly (readonly (number | null)[])[];
    /** `dnf[side][task]`: why the side did not finish the task, or null */
    dnf?: readonly (readonly (string | null)[])[] | null;
    labels: readonly string[];
    colors: readonly string[];
    axis: Axis;
    tick: (v: number) => string;
    show: (v: number) => string;
    /** The accessible name of the figure. */
    what: string;
    suiteQ?: string;
  } = $props();

  // Redraw when the width changes by more than 8 px, debounced (CMP-CHART-05)
  let measured = $state(0);
  let drawn = $state(0);
  $effect(() => {
    const m = measured;
    const t = setTimeout(() => {
      if (Math.abs(m - untrack(() => drawn)) > 8) drawn = m;
    }, 150);
    return () => clearTimeout(t);
  });

  const W = $derived(Math.max(260, Math.floor(drawn || 320)));
  const above = $derived(W < 520); // labels sit over their row on narrow widths
  const pad = 9;
  const rowH = $derived(above ? 50 : 32);
  const x0 = $derived(above ? 4 : Math.min(200, Math.round(W * 0.36)));
  const strip = $derived(dnf ? 13 * dnf.length : 0);
  const left = $derived(x0 + pad + (above ? 0 : 8) + strip);
  const right = $derived(W - pad - 6);
  const H = $derived(tasks.length * rowH + 26);
  const X = (v: number) => left + axis.pos(v) * (right - left);
  const ticks = $derived(thinTicks(axis.ticks, X));
  const chars = $derived(Math.max(8, Math.floor((above ? W - 8 : x0 - 12) / 6.4)));

  interface Dot {
    k: number;
    v: number;
    dy: number;
  }
  const rows = $derived(
    tasks.map((t, i) => {
      const pts: Dot[] = [];
      const seen: Record<string, number> = {};
      values.forEach((row, k) => {
        const v = row[i];
        if (typeof v !== 'number') return;
        const key = v.toPrecision(2);
        const off = seen[key] ?? 0;
        seen[key] = off + 1;
        pts.push({ k, v, dy: nudge(off, values.length) });
      });
      return { t, pts };
    }),
  );
  const name = (t: NumTask) => t.name;
</script>

<div class="host" bind:clientWidth={measured}>
  <svg class="cmp" viewBox="0 0 {W} {H}" width={W} height={H} role="img" aria-label={what}>
    {#each ticks as v (v)}
      <line x1={X(v)} x2={X(v)} y1="0" y2={tasks.length * rowH} class="grid" />
      <text x={X(v)} y={H - 8} text-anchor="middle" class="tick">{tick(v)}</text>
    {/each}
    {#each rows as { t, pts }, i (t.id)}
      {@const top = i * rowH}
      {@const cy = top + (above ? 32 : rowH / 2)}
      <line x1="0" x2={W} y1={top + rowH} y2={top + rowH} class="rowline" />
      <a href={taskHref(t.id, suiteQ)}>
        <text
          x={above ? 4 : x0 - 8}
          y={above ? top + 15 : cy + 4}
          text-anchor={above ? 'start' : 'end'}
          class="lbl">{name(t).length > chars ? name(t).slice(0, chars - 1) + '…' : name(t)}</text
        >
        <title>{name(t)}</title>
      </a>
      {#each dnf ?? [] as row, k (k)}
        {#if row[i]}
          <text
            x={left - strip + 6 + k * 13}
            y={cy + 4}
            text-anchor="middle"
            class="dnf"
            style:fill={colors[k]}>×<title>{labels[k]} · {name(t)}: {row[i]}</title></text
          >
        {/if}
      {/each}
      {#if values.length === 2 && pts.length === 2}
        <line x1={X(pts[0]!.v)} x2={X(pts[1]!.v)} y1={cy} y2={cy} class="bell" />
      {/if}
      {#each pts as p (p.k)}
        <circle cx={X(p.v)} cy={cy + p.dy} r="5" class="pt" style:fill={colors[p.k]}>
          <title>{labels[p.k]} · {name(t)}: {show(p.v)}</title>
        </circle>
      {/each}
    {/each}
  </svg>
</div>

<style>
  .host {
    width: 100%;
    overflow: hidden;
  }
  svg {
    display: block;
    max-width: 100%;
    font-size: 12px;
  }
  .grid {
    stroke: var(--border);
    stroke-width: 1;
  }
  .rowline {
    stroke: var(--border);
    stroke-width: 1;
    opacity: 0.6;
  }
  .tick {
    fill: var(--muted);
  }
  .lbl {
    fill: var(--accent);
    text-decoration: underline;
    text-decoration-color: transparent;
  }
  a:hover .lbl {
    text-decoration-color: currentColor;
  }
  .bell {
    stroke: var(--border-strong);
    stroke-width: 3;
    stroke-linecap: round;
  }
  .pt {
    stroke: var(--bg);
    stroke-width: 1.5;
  }
  .dnf {
    font-size: 15px;
    font-weight: 700;
  }
</style>
