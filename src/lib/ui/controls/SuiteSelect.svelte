<script lang="ts">
  // The suite <select> (SUITE-01): shown only when two or more suites are visible, the current one marked.
  // Hidden suites are not in `meta.suites` at all (B-10), so they can't appear here.
  import type { Meta, SuiteId } from '$lib/core/types';

  let {
    meta,
    value,
    onchange,
    id = 'suite',
  }: { meta: Meta; value: SuiteId; onchange: (suite: SuiteId) => void; id?: string } = $props();
</script>

{#if meta.suites.length > 1}
  <div class="field">
    <label for={id}>Suite</label>
    <select {id} {value} onchange={(e) => onchange(e.currentTarget.value as SuiteId)}>
      {#each meta.suites as s (s.id)}
        <option value={s.id}>{s.label}{s.id === meta.current_suite ? ' (current)' : ''}</option>
      {/each}
    </select>
  </div>
{/if}

<style>
  .field {
    display: grid;
    gap: 0.2rem;
  }
  label {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  select {
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    padding: 0.3rem 0.6rem;
    background: var(--surface);
    font-size: var(--text-sm);
  }
</style>
