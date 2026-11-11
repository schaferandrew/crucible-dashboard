<script lang="ts">
  // "<Overall> score per model" (MODEL-PUB-08): horizontal bars of each model's best setup, hand-drawn SVG.
  // Local and cloud get their colours; a bar is pale when the setup is in progress or partial. The table
  // above has the same numbers (the chart is a picture of it).
  import { fmtPercent, fmtScore } from '$lib/core/format';
  import type { View } from '$lib/core/scoring';
  import type { TierId } from '$lib/core/types';
  import { modelHref } from '$lib/paths';
  import type { MakerEntry } from './shape';

  let {
    entries,
    view,
    exclude,
    suiteParam,
  }: { entries: readonly MakerEntry[]; view: View; exclude: ReadonlySet<TierId>; suiteParam?: string } =
    $props();

  let box = $state(0);
  const W = $derived(Math.max(280, box || 640));
  const narrow = $derived(W < 520);
  const max = $derived(view.showAgg ? view.aggMax(exclude) : 10);
  const label = $derived(view.showAgg ? view.info.overallLabel : (view.tiers[0]?.label ?? 'Score'));
  const list = $derived(entries.filter((e) => e.best));

  const rowH = $derived(narrow ? 46 : 32);
  const left = $derived(narrow ? 0 : Math.min(190, Math.round(W * 0.28)));
  const right = $derived(narrow ? 0 : 110);
  const x0 = $derived(left + (narrow ? 4 : 0));
  const barMax = $derived(narrow ? W - 8 - 100 : W - right - x0);
  const H = $derived(list.length * rowH + 26);
  const X = (v: number) => x0 + (v / max) * barMax;
  const ticks = $derived([0, max / 2, max]);
</script>

{#if list.length}
  <div class="chart" bind:clientWidth={box}>
    <svg
      width={W}
      height={H}
      viewBox="0 0 {W} {H}"
      role="img"
      aria-label="{label} score per model: {list
        .map((e) => `${e.model.name} ${fmtScore(e.best!.overall.score)}`)
        .join(', ')}. The table above has the same numbers."
    >
      {#each ticks as v (v)}
        <line x1={X(v)} x2={X(v)} y1="0" y2={H - 20} class="grid" />
        <text x={X(v)} y={H - 5} class="tick" text-anchor={v === 0 ? 'start' : v === max ? 'end' : 'middle'}
          >{v}</text
        >
      {/each}
      {#each list as e, i (e.model.id)}
        {@const s = e.best!}
        {@const y = 4 + i * rowH}
        {@const by = narrow ? y + 20 : y + 5}
        <a href={modelHref(e.model.id, suiteParam)}>
          <text
            class="lbl"
            x={narrow ? x0 : left - 8}
            y={narrow ? y + 13 : y + 16}
            text-anchor={narrow ? 'start' : 'end'}>{e.model.name}</text
          >
        </a>
        {#if s.overall.score === null}
          <text class="none" x={x0 + 4} y={narrow ? by + 13 : y + 16}>no {label} tasks run yet</text>
        {:else}
          {@const w = Math.max(1, (s.overall.score / max) * barMax)}
          <rect
            x={x0}
            y={by}
            width={w}
            height="16"
            rx="3"
            class={s.local ? 'local' : 'cloud'}
            fill-opacity={s.inProgress || s.overall.partial ? 0.35 : 1}
          />
          <text class="val" x={x0 + w + 6} y={by + 12}
            >{fmtScore(s.overall.score)} · {s.progress.done}/{s.progress.total}</text
          >
        {/if}
      {/each}
    </svg>
  </div>
  <p class="legend">
    <span><span class="sw local"></span>local</span>
    <span><span class="sw cloud"></span>cloud</span>
    <span
      ><span class="sw pale"></span>in progress (under {fmtPercent(view.info.inProgressBelow)} of tasks run)</span
    >
  </p>
{/if}

<style>
  .chart {
    width: 100%;
    overflow: hidden;
  }
  svg {
    display: block;
    max-width: 100%;
  }
  .grid {
    stroke: var(--border);
  }
  text {
    fill: var(--fg);
    font-size: 12px;
  }
  .tick {
    fill: var(--muted);
    font-size: 11px;
  }
  .val {
    fill: var(--muted);
  }
  .none {
    fill: var(--muted);
    font-style: italic;
  }
  .lbl:hover {
    fill: var(--accent);
    text-decoration: underline;
  }
  rect.local,
  .sw.local {
    fill: var(--local);
    background: var(--local);
  }
  rect.cloud,
  .sw.cloud {
    fill: var(--cloud);
    background: var(--cloud);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    font-size: var(--text-sm);
    color: var(--muted);
    margin: var(--space-2) 0 0;
  }
  .sw {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 3px;
    margin-right: 5px;
    vertical-align: -1px;
  }
  .sw.pale {
    background: var(--faint);
    opacity: 0.35;
  }
</style>
