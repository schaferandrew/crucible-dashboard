<script lang="ts">
  import { link } from '$lib/paths';
  import { NAV, type NavId } from '$lib/nav';

  let { current, suite = null }: { current: NavId; suite?: string | null } = $props();
</script>

<nav class="tabs" aria-label="Crucible">
  {#each NAV as n (n.id)}
    <a href={link(n.path, { suite })} aria-current={current === n.id ? 'page' : undefined}>{n.label}</a>
  {/each}
</nav>

<style>
  .tabs {
    display: flex;
    align-items: stretch;
    gap: var(--space-5);
    white-space: nowrap;
  }
  a {
    display: flex;
    align-items: center;
    position: relative;
    padding: var(--space-3) 0;
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
  }
  a[aria-current='page']::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--accent-fill);
  }
  @media (max-width: 1100px) {
    .tabs {
      flex-direction: column;
      align-items: flex-end;
      gap: var(--space-1);
    }
  }
</style>
