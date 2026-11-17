<script lang="ts">
  // "maker / model" (the model is a link) with its local or cloud tag, for a todo entry (TODO-TABLE-02).
  import type { RowStats } from '$lib/core/scoring';
  import { modelHref } from '$lib/paths';

  let { stat, label, suite }: { stat: RowStats; label: string; suite?: string } = $props();
  const maker = $derived(stat.setup.labels.maker || stat.setup.maker);
</script>

<span class="ref">
  {#if maker}<span class="maker">{maker} /</span>{/if}
  <a class="model" href={modelHref(stat.candidate.model, suite)}>{label}</a>
  <span class="tag" class:local={stat.local} class:cloud={!stat.local}>{stat.local ? 'local' : 'cloud'}</span>
</span>

<style>
  .ref {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0 0.35rem;
    align-items: baseline;
  }
  .maker {
    color: var(--muted);
    font-weight: 400;
  }
  .model {
    font-weight: 600;
  }
</style>
