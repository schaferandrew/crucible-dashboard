<script lang="ts">
  // Per-view error containment (J-18): wrap each block so a failure in one doesn't blank the page.
  //  - A render or effect error inside `children` shows "Something went wrong drawing <what>" with Try again
  //    (DATA-STATE-03/05); the error is logged.
  //  - `error` (a message from a failed fetch) shows "Couldn't load <what>" with Try again when `onretry` is
  //    given (DATA-STATE-02) instead of drawing the children.
  import type { Snippet } from 'svelte';

  let {
    children,
    what = 'this part of the page',
    error = null,
    onretry,
  }: {
    children: Snippet;
    /** What the block is, for the message: "the leaderboard", "the checks". */
    what?: string;
    /** A load failure to show instead of the content. */
    error?: string | null;
    onretry?: () => void;
  } = $props();
</script>

{#if error}
  <div class="err" role="alert">
    <p>Couldn’t load {what}.</p>
    <p class="detail">{error}</p>
    {#if onretry}<button type="button" onclick={onretry}>Try again</button>{/if}
  </div>
{:else}
  <svelte:boundary onerror={(e) => console.error(`Crucible: ${what}`, e)}>
    {@render children()}
    {#snippet failed(err, reset)}
      <div class="err" role="alert">
        <p>Something went wrong drawing {what}.</p>
        {#if err instanceof Error}<p class="detail">{err.message}</p>{/if}
        <button type="button" onclick={reset}>Try again</button>
      </div>
    {/snippet}
  </svelte:boundary>
{/if}

<style>
  .err {
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--bad);
    border-radius: var(--radius-lg);
    background: var(--bad-soft);
    color: var(--bad);
  }
  p {
    margin: 0 0 var(--space-2);
  }
  .detail {
    font-size: var(--text-sm);
    color: var(--muted);
  }
  button {
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--fg);
    padding: 0.25rem 0.75rem;
  }
</style>
