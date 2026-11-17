<script lang="ts">
  // Every page starts with this: breadcrumbs, the one <h1> (the route focus target) and the document title.
  // The layout focuses `main h1` after a client navigation and announces the title in a polite live region.
  import type { Snippet } from 'svelte';
  import Breadcrumbs from './Breadcrumbs.svelte';
  import { chrome } from './chrome.svelte';
  import { documentTitle } from './title';
  import type { Crumb } from './types';

  let {
    title,
    docTitle,
    crumbs = [],
    breadcrumbs = true,
    children,
  }: {
    /** The visible <h1>. */
    title: string;
    /** The <title> text before ` · Crucible`; defaults to `title`. */
    docTitle?: string;
    /** Items after the root `Crucible` crumb; the last is the current page. */
    crumbs?: Crumb[];
    /** Hide the breadcrumb line (the leaderboard has none). */
    breadcrumbs?: boolean;
    /** Optional lede under the title. */
    children?: Snippet;
  } = $props();
</script>

<svelte:head>
  <title>{documentTitle(docTitle ?? title)}</title>
</svelte:head>

{#if breadcrumbs}<Breadcrumbs items={crumbs} suite={chrome.suite} />{/if}
<h1 tabindex="-1">{title}</h1>
{#if children}<div class="lede">{@render children()}</div>{/if}

<style>
  .lede {
    max-width: 60rem;
    margin: 0 0 var(--space-4);
  }
</style>
