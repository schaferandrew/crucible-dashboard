<script lang="ts">
  import { onMount } from 'svelte';

  type Theme = 'auto' | 'dark' | 'light';
  let theme: Theme = 'auto';
  let dark = $state(false);
  const key = 'crucible-theme';
  const valid = (value: string | null): Theme => (value === 'dark' || value === 'light' ? value : 'auto');
  const label = $derived(dark ? 'Switch to light mode' : 'Switch to dark mode');

  function apply() {
    dark = theme === 'auto' ? matchMedia('(prefers-color-scheme: dark)').matches : theme === 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }

  function toggle() {
    theme = dark ? 'light' : 'dark';
    apply();
    try {
      localStorage.setItem(key, theme);
    } catch {
      /* Storage may be blocked; the toggle still works for this visit. */
    }
  }

  onMount(() => {
    try {
      theme = valid(localStorage.getItem(key));
    } catch {
      /* Follow the device until the viewer chooses a theme. */
    }
    apply();
    const system = matchMedia('(prefers-color-scheme: dark)');
    const sync = (event: StorageEvent) => {
      if (event.key === key || event.key === null) {
        theme = valid(event.newValue);
        apply();
      }
    };
    system.addEventListener('change', apply);
    window.addEventListener('storage', sync);
    return () => {
      system.removeEventListener('change', apply);
      window.removeEventListener('storage', sync);
    };
  });
</script>

<div class="theme">
  <button type="button" aria-label={label} title={label} onclick={toggle}>
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {#if dark}
        <circle cx="12" cy="12" r="4" />
        <path
          d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"
        />
      {:else}
        <path d="M20.9 13a9 9 0 0 1-9.9-9.9A9 9 0 1 0 20.9 13Z" />
      {/if}
    </svg>
  </button>
</div>

<style>
  .theme {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--muted);
  }
  button:hover {
    background: var(--tray);
    color: var(--fg);
  }
</style>
