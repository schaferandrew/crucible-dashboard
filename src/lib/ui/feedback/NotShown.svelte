<script lang="ts">
  // "N runs not shown: reasons" (J-18). Pass a map of state -> count (e.g. `index.other[model]`, or counts the
  // page computed). Renders nothing when there is nothing to say.
  import { notShownLine } from './notShown';

  let { counts }: { counts: Record<string, number | undefined> | null | undefined } = $props();
  const line = $derived(notShownLine(counts));
</script>

{#if line}<p class="not-shown muted">{line}.</p>{/if}

<style>
  .not-shown {
    margin: var(--space-2) 0;
    font-size: var(--text-sm);
  }
</style>
