<script lang="ts">
  import { modelHref } from '$lib/paths';
  import type { Part } from './takeaways';

  let { lines, suite }: { lines: Part[][]; suite?: string } = $props();
</script>

<ul class="take">
  {#each lines as line, i (i)}
    <li>
      {#each line as part, j (j)}{#if typeof part === 'string'}{part}{:else}<a
            href={modelHref(part.model, suite)}>{part.text}</a
          >{/if}{/each}
    </li>
  {/each}
</ul>

<style>
  .take {
    margin: 0 0 var(--space-5);
    padding-left: var(--space-5);
  }
  li {
    margin: var(--space-1) 0;
  }
  a {
    font-weight: 700;
  }
</style>
