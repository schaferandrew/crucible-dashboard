<script lang="ts">
  // The segmented "Section" choice (one section at a time). ControlPanel has its own copy with task counts and
  // Combined; pages without a panel (todo) use this one.
  let {
    choices,
    value,
    onselect,
    label = 'Section',
    id = 'section',
  }: {
    choices: readonly { id: string; label: string }[];
    value: string | null | undefined;
    onselect: (id: string) => void;
    /** The visible caption, also the group's accessible name. */
    label?: string;
    /** Unique per page: ties the caption to the group. */
    id?: string;
  } = $props();
</script>

<div class="field">
  <span class="lbl" id="{id}-lbl">{label}</span>
  <div class="seg" role="radiogroup" aria-labelledby="{id}-lbl">
    {#each choices as c (c.id)}
      <button
        type="button"
        role="radio"
        aria-checked={value === c.id}
        onclick={() => value !== c.id && onselect(c.id)}>{c.label}</button
      >
    {/each}
  </div>
</div>

<style>
  .field {
    display: grid;
    gap: 0.2rem;
    margin-bottom: var(--space-3);
  }
  .lbl {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  .seg {
    display: inline-flex;
    flex-wrap: wrap;
    justify-self: start;
    padding: 3px;
    background: var(--tray);
    border-radius: var(--radius);
  }
  .seg button {
    background: none;
    border: 0;
    border-radius: var(--radius-sm);
    padding: 0.3rem 0.8rem;
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--fg);
  }
  .seg button[aria-checked='true'] {
    background: var(--surface);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.18);
  }
</style>
