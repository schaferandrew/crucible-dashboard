<script lang="ts">
  // "By area" (MODEL-AREAS-01): one bar per area with the mean over the tasks that have a counted run. The
  // numbers are in the text of each row, which is the table alternative to the bars.
  import { fmtScore } from '$lib/core/format';
  import type { AreaBar } from './shape';

  let { bars }: { bars: readonly AreaBar[] } = $props();
</script>

<ul class="areas">
  {#each bars as b (b.key)}
    <li
      class:none={b.state !== 'counted'}
      class:pale={b.pale && b.state === 'counted'}
      title={b.state === 'none-count'
        ? 'It has runs in this area, but none counts in this suite.'
        : undefined}
    >
      <span class="name">{b.label}</span>
      <span class="track" aria-hidden="true">
        {#if b.state === 'counted' && b.score !== null}<span class="fill" style:width="{b.score * 10}%"
          ></span>{/if}
      </span>
      <span class="val">
        {#if b.state === 'not-run'}not run
        {:else if b.state === 'none-count'}none count
        {:else}{fmtScore(b.score)} · measured on {b.n} of {b.total}{b.pale ? ' (few)' : ''}{/if}
      </span>
    </li>
  {/each}
</ul>

<style>
  .areas {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-2);
    font-size: var(--text-sm);
  }
  li {
    display: grid;
    grid-template-columns: minmax(8rem, 14rem) 1fr minmax(9rem, 14rem);
    gap: var(--space-3);
    align-items: center;
  }
  .track {
    height: 10px;
    border-radius: 5px;
    background: var(--bar);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    background: var(--accent-fill);
  }
  .pale .fill {
    opacity: 0.4;
  }
  .none .name,
  .none .val {
    color: var(--muted);
  }
  .val {
    font-variant-numeric: tabular-nums;
  }
  @media (max-width: 639px) {
    li {
      grid-template-columns: 1fr;
      gap: 2px;
    }
  }
</style>
