<script lang="ts">
  // A loading line (DATA-STATE-01): announced politely, with a spinner that stops under reduced motion.
  let { label = 'Loading…' }: { label?: string } = $props();
</script>

<p class="loading" role="status" aria-live="polite">
  <span class="spin" aria-hidden="true"></span>
  {label}
</p>

<style>
  .loading {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: var(--space-4) 0;
    color: var(--muted);
  }
  .spin {
    width: 0.9rem;
    height: 0.9rem;
    border: 2px solid var(--border-strong);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
