<script lang="ts">
  // Shared section picker: one tab stop, arrow-key selection, optional task counts.
  let {
    choices,
    value,
    onselect,
    label = 'Section',
    id = 'section',
  }: {
    choices: readonly { id: string; label: string; n?: number }[];
    value: string | null | undefined;
    onselect: (id: string) => void;
    /** The visible caption, also the group's accessible name. */
    label?: string;
    /** Unique per page: ties the caption to the group. */
    id?: string;
  } = $props();

  function onkeydown(event: KeyboardEvent) {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const group = (event.currentTarget as HTMLElement).parentElement;
    const buttons = [...(group?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0 || !buttons.length) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : (at + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + buttons.length) %
            buttons.length;
    buttons[next]?.focus();
    onselect(choices[next]!.id);
  }
</script>

<div class="field">
  <span class="lbl" id="{id}-lbl">{label}</span>
  <div class="seg" role="radiogroup" aria-labelledby="{id}-lbl">
    {#each choices as c, i (c.id)}
      <button
        type="button"
        {onkeydown}
        role="radio"
        aria-checked={value === c.id}
        tabindex={value === c.id || (!choices.some((c) => c.id === value) && i === 0) ? 0 : -1}
        title={c.n === undefined ? undefined : `${c.n} scored tasks`}
        onclick={() => value !== c.id && onselect(c.id)}
        >{c.label}{#if c.n !== undefined}
          <span class="count">{c.n}</span>{/if}</button
      >
    {/each}
  </div>
</div>

<style>
  .field {
    display: grid;
    gap: 0.2rem;
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
  .count {
    color: var(--muted);
    font-size: 0.85em;
    font-weight: 400;
  }
  @media (max-width: 639px) {
    .seg button {
      padding: 0.3rem 0.55rem;
    }
  }
  @media (max-width: 359px) {
    .seg button {
      padding: 0.3rem 0.4rem;
      font-size: var(--text-xs);
    }
  }
</style>
