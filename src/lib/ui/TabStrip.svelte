<script lang="ts">
  // The Crucible tab strip (NAV-01..06). One <nav>, never wraps: it scrolls sideways when it doesn't fit.
  import { onMount } from 'svelte';
  import { link } from '$lib/paths';
  import { NAV, type NavId } from '$lib/nav';

  let { current, suite = null }: { current: NavId; suite?: string | null } = $props();

  let strip: HTMLElement | undefined = $state();

  // NAV-06: if the strip overflows, bring the current tab into view once, on load
  onMount(() => {
    const el = strip?.querySelector<HTMLElement>('[aria-current="page"]');
    if (strip && el && strip.scrollWidth > strip.clientWidth) strip.scrollLeft = el.offsetLeft - 16;
  });
</script>

<nav class="tabs" aria-label="Crucible" bind:this={strip}>
  {#each NAV as n (n.id)}
    <a href={link(n.path, { suite })} aria-current={current === n.id ? 'page' : undefined}>{n.label}</a>
  {/each}
</nav>

<style>
  .tabs {
    display: flex;
    gap: var(--space-5);
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
    white-space: nowrap;
    box-shadow: inset 0 -1px 0 var(--border);
    scrollbar-width: none;
  }
  .tabs::-webkit-scrollbar {
    display: none;
  }
  a {
    flex: none;
    padding: var(--space-2) 0;
    border-bottom: 2px solid transparent;
    color: var(--muted);
    font-size: var(--text-sm);
    text-decoration: none;
  }
  a:hover {
    color: var(--accent);
  }
  a[aria-current='page'] {
    color: var(--fg);
    font-weight: 600;
    border-bottom-color: var(--accent-fill);
  }
  /* The ring would be clipped by the strip's overflow, so draw it inside */
  a:focus-visible {
    outline-offset: -2px;
  }
</style>
