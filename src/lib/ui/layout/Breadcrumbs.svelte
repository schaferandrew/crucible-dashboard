<script lang="ts">
  // `Crucible › Page › Detail` (NAV-07). The root link keeps the reader's suite. The last item is the current page.
  import { link } from '$lib/paths';

  import type { Crumb } from './types';

  let { items, suite = null }: { items: Crumb[]; suite?: string | null } = $props();
</script>

<nav class="crumbs" aria-label="Breadcrumb">
  <ol>
    <li><a href={link('/', { suite })}>Crucible</a></li>
    {#each items as c, i (i)}
      <li>
        <span aria-hidden="true" class="sep">›</span>
        {#if c.href && i < items.length - 1}
          <a href={c.href}>{c.label}</a>
        {:else}
          <span aria-current={i === items.length - 1 ? 'page' : undefined}>{c.label}</span>
        {/if}
      </li>
    {/each}
  </ol>
</nav>

<style>
  .crumbs {
    margin: 0 0 var(--space-3);
    font-size: var(--text-sm);
  }
  ol {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    gap: var(--space-2);
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .sep {
    color: var(--faint);
  }
  [aria-current='page'] {
    color: var(--muted);
  }
</style>
