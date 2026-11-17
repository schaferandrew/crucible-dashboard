<script lang="ts">
  // The headline tiles of the best setup in scope (MODEL-TILES-01): Overall, the headline tier, every other
  // tier (a gate as pass / fail), coverage and counted runs.
  import { fmtInt, fmtPercent, fmtScore, listPhrase } from '$lib/core/format';
  import type { RowStats, View } from '$lib/core/scoring';
  import type { TierResult, Verdict } from '$lib/core/types';
  import type { TierId } from '$lib/core/types';

  let { view, stats, exclude }: { view: View; stats: RowStats; exclude: ReadonlySet<TierId> } = $props();

  const info = $derived(view.info);
  const head = $derived(info.headline);
  const combined = $derived(view.kind === 'combined');
  const sections = $derived(listPhrase(view.parts.map((p) => p.label)));
  const aggNames = $derived(listPhrase(view.aggTiers(exclude).map((t) => t.label)));
  const others = $derived(view.tiers.filter((t) => t.id !== head.id));

  const outOf = (r: TierResult | null | undefined) => (r && r.max && combined ? `out of ${r.max} · ` : '');
  const tasks = (r: TierResult | null | undefined) =>
    r ? `${outOf(r)}${r.scored} of ${r.total} tasks${r.partial ? ' (partial)' : ''}` : 'no scored task';
  const score = (r: TierResult | null | undefined) => (r && r.score !== null ? fmtScore(r.score) : '—');
  const verdictText = (v: Verdict) =>
    v === 'pass' ? '✓ pass' : v === 'fail' ? '✕ fail' : v === 'partial' ? 'partial' : '—';
</script>

<ul class="tiles">
  {#if view.showAgg}
    <li class="tile">
      <p class="label">{info.overallLabel}</p>
      <p class="value">{score(stats.overall)}</p>
      <p class="sub">
        {combined ? sections : aggNames} added together, out of {stats.overall.max}{stats.overall.partial
          ? ' (partial)'
          : ''}
      </p>
    </li>
  {/if}
  <li class="tile">
    <p class="label">{head.label}</p>
    <p class="value">{score(stats.tier[head.id])}</p>
    <p class="sub">{tasks(stats.tier[head.id])}</p>
  </li>
  {#each others as t (t.id)}
    {@const r = stats.tier[t.id]}
    {#if info.gateOf(t.id)}
      {@const v = stats.verdict[t.id] ?? null}
      <li class="tile">
        <p class="label">{t.label} gate</p>
        <p
          class="value"
          class:good={v === 'pass'}
          class:bad={v === 'fail'}
          class:small={v === 'partial' || v === null}
        >
          {verdictText(v)}
        </p>
        <p class="sub">
          {#if r && r.score !== null}score {fmtScore(r.score)}{r.max ? ` of ${r.max}` : ''} · {r.scored} of {r.total}
            tasks{combined ? ' · passes when every section passes' : ''}{:else}no scored task{/if}
        </p>
      </li>
    {:else if r}
      <li class="tile">
        <p class="label">{t.label}</p>
        <p class="value">{score(r)}</p>
        <p class="sub">{tasks(r)}</p>
      </li>
    {/if}
  {/each}
  <li class="tile">
    <p class="label">Coverage</p>
    <p class="value">{stats.progress.done} of {stats.progress.total}</p>
    <p class="sub">
      {stats.inProgress
        ? `in progress: under ${fmtPercent(info.inProgressBelow)} of the tasks`
        : `${fmtPercent(stats.progress.share)} of the tasks`}
    </p>
  </li>
  <li class="tile">
    <p class="label">Counted runs</p>
    <p class="value">{fmtInt(stats.runs)}</p>
    <p class="sub">of this setup; time and cost per deployment are below</p>
  </li>
</ul>

<style>
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
    gap: var(--space-3);
    list-style: none;
    margin: 0 0 var(--space-4);
    padding: 0;
  }
  .tile {
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-3);
    background: var(--surface);
  }
  p {
    margin: 0;
  }
  .label {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  .value {
    font-size: var(--text-xl);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .value.small {
    font-size: var(--text-md);
    padding: 0.3rem 0;
  }
  .value.good {
    color: var(--good);
  }
  .value.bad {
    color: var(--bad);
  }
  .sub {
    font-size: var(--text-sm);
    color: var(--muted);
  }
</style>
