<script lang="ts">
  // The compare tray (MAIN-TRAY-01): fixed bottom-right, hidden when nothing is picked.
  import { compareHref } from '$lib/paths';
  import type { Picks } from './picks.svelte';

  let { picks, suite }: { picks: Picks; suite?: string } = $props();
  const n = $derived(picks.ids.length);
</script>

<div class="tray" role="status" hidden={n === 0}>
  {#if n === 1}
    <span>1 setup picked: pick another to compare</span>
  {:else if n > 1}
    <a class="go" href={compareHref(picks.ids, suite)}>Compare {n} →</a>
  {/if}
  <button type="button" onclick={() => picks.clear()}>Clear</button>
</div>

<style>
  .tray {
    position: fixed;
    right: var(--space-4);
    bottom: var(--space-4);
    z-index: 20;
    display: flex;
    gap: var(--space-3);
    align-items: center;
    padding: var(--space-2) var(--space-3);
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    font-size: var(--text-sm);
  }
  .go {
    font-weight: 700;
  }
  button {
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    background: var(--surface);
    padding: 0.15rem 0.6rem;
  }
  @media (max-width: 639px) {
    .tray {
      left: 0;
      right: 0;
      bottom: 0;
      border-radius: 0;
      justify-content: space-between;
    }
  }
</style>
