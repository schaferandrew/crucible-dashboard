<script lang="ts">
  // One multi-select facet of the ControlPanel (MAIN-PANEL-12..15, A11Y-01): a button that opens a group of
  // `menuitemcheckbox` options, each with its count. An option whose count would be 0 is disabled (B-19).
  // Keys: ArrowUp/Down move (wrapping), Escape closes and returns focus to the button, opening focuses the
  // first option. The panel closes any other open facet and handles clicks outside.
  import { tick } from 'svelte';
  import type { PanelOption } from '$lib/core/panel';

  let {
    id,
    label,
    summary,
    active,
    options,
    open,
    onopen,
    onclose,
    ontoggle,
    onclear,
  }: {
    id: string;
    label: string;
    /** The button text: "All quants", the first pick, or "Q4_K_M + 2". */
    summary: string;
    active: boolean;
    options: PanelOption[];
    open: boolean;
    onopen: () => void;
    onclose: () => void;
    ontoggle: (value: string) => void;
    onclear: () => void;
  } = $props();

  let menu: HTMLElement | undefined = $state();
  let button: HTMLButtonElement | undefined = $state();

  const items = () => [...(menu?.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]') ?? [])];

  async function toggle() {
    if (open) return onclose();
    onopen();
    await tick();
    items()[0]?.focus();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      e.stopPropagation();
      onclose();
      button?.focus();
      return;
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && open) {
      const list = items();
      if (!list.length) return;
      e.preventDefault();
      const i = list.indexOf(document.activeElement as HTMLElement);
      const next = e.key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
      list[i < 0 ? 0 : next]?.focus();
    }
    // ArrowDown on the closed button opens it
    if (e.key === 'ArrowDown' && !open && document.activeElement === button) {
      e.preventDefault();
      void toggle();
    }
  }
</script>

<div class="facet" data-facet={id} {onkeydown} role="presentation">
  <button
    bind:this={button}
    type="button"
    class="trigger"
    class:active
    aria-haspopup="true"
    aria-expanded={open}
    aria-controls="{id}-menu"
    onclick={toggle}
  >
    <span class="visually-hidden">{label}: </span>{summary}
  </button>
  <div class="menu" id="{id}-menu" role="group" aria-label={label} bind:this={menu} hidden={!open}>
    <button type="button" role="menuitemcheckbox" class="opt" aria-checked={!active} onclick={onclear}>
      <span class="box" aria-hidden="true">{!active ? '✓' : ''}</span>
      <span>Show all</span>
    </button>
    {#each options as o (o.value)}
      <button
        type="button"
        role="menuitemcheckbox"
        class="opt"
        class:off={o.disabled}
        aria-checked={o.selected}
        aria-disabled={o.disabled}
        title={o.disabled ? 'No results with this alongside your other choices' : undefined}
        onclick={() => !o.disabled && ontoggle(o.value)}
      >
        <span class="box" aria-hidden="true">{o.selected ? '✓' : ''}</span>
        <span class="text">{o.label}</span>
        <span class="n">{o.count}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .facet {
    position: relative;
  }
  .trigger {
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    padding: 0.3rem 0.6rem;
    background: var(--surface);
    font-size: var(--text-sm);
    white-space: nowrap;
    max-width: 14rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .trigger::after {
    content: ' \25be';
    color: var(--muted);
  }
  .trigger.active {
    background: var(--accent-soft);
    font-weight: 600;
  }
  .menu {
    position: absolute;
    z-index: 10;
    top: calc(100% + 4px);
    left: 0;
    min-width: 14rem;
    max-width: min(24rem, calc(100vw - 2 * var(--gutter)));
    max-height: 18rem;
    overflow: auto;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: var(--space-1);
  }
  .opt {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    width: 100%;
    padding: var(--space-1) 0.4rem;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    text-align: left;
    font-size: var(--text-sm);
  }
  .opt:hover {
    background: var(--accent-soft);
  }
  .opt.off {
    color: var(--faint);
  }
  .opt.off:hover {
    background: none;
  }
  .box {
    flex: none;
    display: inline-grid;
    place-items: center;
    width: 1rem;
    height: 1rem;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    font-size: 0.7rem;
    line-height: 1;
  }
  .opt[aria-checked='true'] .box {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }
  .text {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .n {
    margin-left: auto;
    color: var(--muted);
    font-size: 0.8em;
  }
  .off .n {
    color: var(--faint);
  }
</style>
