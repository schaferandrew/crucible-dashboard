<script lang="ts">
  // "Nothing here" with a reason, never a blank block. Children are the message; `action` an optional button.
  import type { Snippet } from 'svelte';

  let { children, action }: { children: Snippet; action?: Snippet } = $props();
</script>

<div class="empty">
  <p>{@render children()}</p>
  {#if action}<div class="act">{@render action()}</div>{/if}
</div>

<style>
  .empty {
    padding: var(--space-4);
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius-lg);
    color: var(--muted);
  }
  p {
    margin: 0;
  }
  .act {
    margin-top: var(--space-2);
  }
</style>
