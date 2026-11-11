<script lang="ts">
  import '../app.css';
  import { afterNavigate } from '$app/navigation';
  import { base } from '$app/paths';
  import { page } from '$app/state';
  import { tick } from 'svelte';
  import { fmtDate } from '$lib/core/format';
  import { navFor } from '$lib/nav';
  import { link } from '$lib/paths';
  import { chrome } from '$lib/ui/chrome.svelte';
  import TabStrip from '$lib/ui/TabStrip.svelte';

  let { data, children } = $props();

  const here = $derived(page.url.pathname.slice(base.length) || '/');
  const current = $derived(navFor(here));

  // Route focus management (J-20): after a client navigation, focus the page's <h1> and say where we are in a
  // polite live region. The first load (type `enter`) keeps the browser's own behaviour.
  let announcement = $state('');
  afterNavigate(async ({ from, to, type }) => {
    // The previous in-app page, for the run page's Back (null on a deep link)
    // (hopping between repeats of one run page keeps the original referrer)
    const hop = from?.route?.id === '/run/[id]' && to?.route?.id === '/run/[id]';
    if (!hop) chrome.previous = from?.url ? from.url.pathname + from.url.search : null;
    const s = to?.url.searchParams.get('suite');
    if (s)
      chrome.suite = data.meta.suites.some((x) => x.id === s) && s !== data.meta.current_suite ? s : null;
    if (type === 'enter') return;
    await tick();
    // SvelteKit resets focus to <body> just before this runs; wait a frame so the title has updated too
    requestAnimationFrame(() => {
      const h1 = document.querySelector<HTMLElement>('main h1');
      const target = h1 ?? document.getElementById('main');
      // a heading is not focusable by default; pages that don't use PageHeader still get the behaviour
      if (target && !target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target?.focus({ preventScroll: true });
      announcement = '';
      requestAnimationFrame(() => (announcement = document.title));
    });
  });
</script>

<svelte:head>
  <meta name="robots" content="noindex" />
</svelte:head>

<a class="skip" href="#main">Skip to content</a>

<header class="top">
  <div class="wrap bar">
    <a class="brand" href={link('/', { suite: chrome.suite })}>Crucible</a>
    <TabStrip {current} suite={chrome.suite} />
  </div>
</header>

<main id="main" class="wrap" tabindex="-1">
  {@render children()}
</main>

<footer class="wrap foot muted">
  Data built {fmtDate(data.meta.built_at)} (UTC) with Crucible {data.meta.crucible_version}.
</footer>

<div class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>

<style>
  .skip {
    position: absolute;
    left: var(--space-2);
    top: -3rem;
    padding: var(--space-2) var(--space-3);
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    z-index: 100;
  }
  .skip:focus {
    top: var(--space-2);
  }
  .top {
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  .bar {
    display: flex;
    align-items: stretch;
    gap: var(--space-5);
  }
  .bar :global(.tabs) {
    flex: 1;
    min-width: 0;
    box-shadow: none;
  }
  .brand {
    display: flex;
    align-items: center;
    font-weight: 700;
    font-size: var(--text-lg);
    color: var(--fg);
    text-decoration: none;
    padding: var(--space-2) 0;
  }
  main {
    padding-top: var(--space-5);
    padding-bottom: var(--space-7);
  }
  main:focus {
    outline: none;
  }
  .foot {
    padding-bottom: var(--space-5);
    font-size: var(--text-sm);
  }
</style>
