<script lang="ts">
  // The tasks left, one line each: link, "<Tier> · <why> · ≈ <time>" (TODO-PICK-03, TODO-TABLE-03/04).
  // The class of an item comes from its why (`is-failed`, `is-awaiting-score`, ...), for styling.
  import { fmtSeconds } from '$lib/core/format';
  import { taskHref } from '$lib/paths';
  import { whyClass, type LeftTask } from './shape';

  let { items, limit, suite }: { items: readonly LeftTask[]; limit?: number; suite?: string } = $props();
  const shown = $derived(limit ? items.slice(0, limit) : items);
</script>

<ul class="tasks">
  {#each shown as x (x.task.id)}
    <li class={whyClass(x.why)}>
      <a href={taskHref(x.task.id, suite)}>{x.task.name}</a>
      <span class="why muted"
        >{x.task.tier ? x.task.tier + ' · ' : ''}{x.why}{x.time !== null && x.kind !== 'awaiting-score'
          ? ' · ≈ ' + fmtSeconds(x.time)
          : ''}</span
      >
    </li>
  {/each}
  {#if limit && items.length > limit}<li class="more muted">…and {items.length - limit} more</li>{/if}
</ul>

<style>
  .tasks {
    margin: var(--space-2) 0 0;
    padding: 0;
    list-style: none;
    font-size: var(--text-sm);
  }
  li {
    padding: 2px 0 2px var(--space-2);
    border-left: 3px solid transparent;
  }
  li.is-failed,
  li.is-timed-out,
  li.is-harness-error {
    border-left-color: var(--bad);
  }
  li.is-awaiting-score,
  li.is-only-older-or-uncounted-runs {
    border-left-color: var(--warn);
  }
  .more {
    border-left-color: transparent;
  }
</style>
