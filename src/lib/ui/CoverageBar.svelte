<script lang="ts">
  // "done/total" with a thin bar under it; local setups use the local colour, cloud ones the cloud colour.
  let {
    done,
    total,
    local = false,
    share,
  }: {
    done: number;
    total: number;
    local?: boolean;
    /** Fill fraction 0..1; defaults to done / total. */
    share?: number;
  } = $props();

  const frac = $derived(Math.min(1, Math.max(0, share ?? (total > 0 ? done / total : 0))));
</script>

<span class="progress">{done}/{total}</span>
<span class="bar" aria-hidden="true"><span class="fill" class:local style:width="{frac * 100}%"></span></span>

<style>
  .progress {
    font-variant-numeric: tabular-nums;
  }
  .bar {
    display: block;
    width: 5rem;
    height: 6px;
    margin: 3px 0;
    border-radius: 3px;
    background: var(--bar);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    background: var(--cloud);
  }
  .fill.local {
    background: var(--local);
  }
</style>
