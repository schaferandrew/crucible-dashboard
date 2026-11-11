<script lang="ts">
  import '../app.css';
  import { base } from '$app/paths';
  import { page } from '$app/state';
  import { NAV } from '$lib/nav';

  let { children } = $props();

  // Current tab: the longest nav path that prefixes the pathname (under the base).
  const here = $derived(page.url.pathname.slice(base.length) || '/');
  const current = $derived(
    NAV.filter((n) => (n.path === '/' ? here === '/' : here.startsWith(n.path))).at(-1)?.id ?? 'leaderboard',
  );
</script>

<svelte:head>
  <title>Crucible</title>
</svelte:head>

<header class="top">
  <div class="wrap bar">
    <a class="brand" href="{base}/">Crucible</a>
    <nav aria-label="Crucible">
      {#each NAV as n (n.id)}
        <a href="{base}{n.path}" aria-current={current === n.id ? 'page' : undefined}>{n.label}</a>
      {/each}
    </nav>
  </div>
</header>

<main class="wrap">
  {@render children()}
</main>

<style>
  .top {
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 1.25rem;
  }
  .brand {
    font-weight: 700;
    font-size: 1.125rem;
    color: var(--fg);
    text-decoration: none;
    padding: 0.75rem 0;
  }
  nav {
    display: flex;
    gap: 0.25rem;
    overflow-x: auto;
    scrollbar-width: none;
    overscroll-behavior-x: contain;
  }
  nav::-webkit-scrollbar {
    display: none;
  }
  nav a {
    white-space: nowrap;
    padding: 0.75rem 0.6rem;
    color: var(--muted);
    text-decoration: none;
    border-bottom: 2px solid transparent;
  }
  nav a[aria-current='page'] {
    color: var(--fg);
    font-weight: 600;
    border-bottom-color: var(--accent);
  }
  main {
    padding-top: 1.25rem;
    padding-bottom: 3rem;
  }
</style>
