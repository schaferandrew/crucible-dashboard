<script lang="ts">
  // The task index (TASK-INDEX-01..03): one heading per section with shown tasks, one list per area.
  import Empty from '$lib/ui/Empty.svelte';
  import { plural, type IndexSection } from './shape';

  let {
    sections,
    suiteName,
    shown,
    href,
  }: {
    sections: IndexSection[];
    suiteName: string;
    shown: number;
    href: (taskId: string) => string;
  } = $props();
</script>

{#if !shown}
  <Empty>This suite has no tasks to list.</Empty>
{:else}
  <p class="intro">
    Every task of {suiteName}, by section and area. Select one for what it asks, how it is scored and how the
    models did.
  </p>
  {#each sections as s (s.id)}
    <section>
      <h2>{s.label} <small>{plural(s.count, 'task')}</small></h2>
      {#if s.blurb}<p class="muted blurb">{s.blurb}</p>{/if}
      {#each s.areas as a (a.id)}
        <h3>{a.label}</h3>
        <ul>
          {#each a.items as it (it.task.id)}
            <li>
              <div class="top">
                <a href={href(it.task.id)}>{it.name}</a>
                <span class="tag">{it.tierLabel}</span>
                {#if it.provisional}<span class="tag warn">Provisional</span>{/if}
              </div>
              <p class="muted by">{it.scoredBy}</p>
            </li>
          {/each}
        </ul>
      {/each}
    </section>
  {/each}
{/if}

<style>
  section {
    margin-bottom: var(--space-5);
  }
  .intro,
  .blurb {
    max-width: 60rem;
  }
  h2 small {
    font-size: var(--text-sm);
    font-weight: 400;
    color: var(--muted);
  }
  h3 {
    margin: var(--space-4) 0 var(--space-1);
    font-size: var(--text-md);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
    gap: 0 var(--space-5);
  }
  li {
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--border);
  }
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-2);
  }
  .top a {
    font-weight: 600;
  }
  .by {
    margin: 2px 0 0;
    font-size: var(--text-sm);
  }
</style>
