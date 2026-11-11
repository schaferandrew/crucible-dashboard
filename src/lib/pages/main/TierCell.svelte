<script lang="ts">
  import { fmtPercent, fmtScore } from '$lib/core/format';
  import type { TierResult, Verdict } from '$lib/core/types';

  let {
    result,
    max = 10,
    local = false,
    verdict = null,
    label = '',
    coverageMin = 0.75,
    dim = false,
  }: {
    result: TierResult | null;
    max?: number;
    local?: boolean;
    verdict?: Verdict;
    label?: string;
    coverageMin?: number;
    dim?: boolean;
  } = $props();

  const has = $derived(!!result && result.score !== null);
  const width = $derived(has && max > 0 ? Math.max(0, Math.min(100, (result!.score! / max) * 100)) : 0);
  const partialTitle = $derived(
    `Fewer than ${fmtPercent(coverageMin)} of this tier's tasks were scored, so the score may still move`,
  );
</script>

{#if has}
  <span class="cell" class:dim>
    <span class="bar" class:partial={result!.partial} aria-hidden="true">
      <span class="fill" class:local style:width="{width}%"></span>
    </span>
    <span class="score">{fmtScore(result!.score)}</span>
    <span class="detail">
      {result!.scored}/{result!.total} tasks
      {#if verdict === 'pass'}<span class="mark pass" title="{label} gate: pass">&#10003; pass</span>{/if}
      {#if verdict === 'fail'}<span class="mark fail" title="{label} gate: fail">&#10005; fail</span>{/if}
      {#if result!.partial}<span class="mark partial" title={partialTitle}>partial</span>{/if}
      {#if result!.prov}<span
          class="mark prov"
          title="{result!.prov.scored} of {result!.prov.total} provisional tasks included"
          >+{result!.prov.scored} provisional</span
        >{/if}
    </span>
  </span>
{:else}
  <span class="none" aria-label="No score">&mdash;</span>
{/if}

<style>
  .cell {
    display: grid;
    gap: 2px;
    min-width: 5.5rem;
  }
  .cell.dim {
    opacity: 0.45;
  }
  .score {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .bar {
    display: block;
    height: 6px;
    border-radius: 3px;
    background: var(--bar);
    overflow: hidden;
  }
  .bar.partial {
    background-image: repeating-linear-gradient(135deg, transparent 0 3px, var(--border-strong) 3px 5px);
  }
  .fill {
    display: block;
    height: 100%;
    background: var(--cloud);
  }
  .fill.local {
    background: var(--local);
  }
  .detail {
    font-size: 0.75rem;
    color: var(--muted);
    display: flex;
    flex-wrap: wrap;
    gap: 0 0.4rem;
  }
  .mark.pass {
    color: var(--good);
  }
  .mark.fail {
    color: var(--bad);
  }
  .mark.partial,
  .mark.prov {
    color: var(--warn);
  }
  .none {
    color: var(--muted);
  }
</style>
