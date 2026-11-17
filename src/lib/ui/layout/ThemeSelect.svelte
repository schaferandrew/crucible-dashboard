<script lang="ts">
  import { onMount } from 'svelte';

  type Theme = 'auto' | 'dark' | 'light';
  let theme = $state<Theme>('auto');
  const key = 'crucible-theme';
  const valid = (value: string | null): Theme => (value === 'dark' || value === 'light' ? value : 'auto');

  function apply() {
    document.documentElement.dataset.theme =
      theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
  }

  function change() {
    apply();
    try {
      localStorage.setItem(key, theme);
    } catch {
      /* Storage may be blocked. */
    }
  }

  onMount(() => {
    try {
      theme = valid(localStorage.getItem(key));
    } catch {
      /* Default to auto. */
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

<label class="theme">
  <span>Theme</span>
  <select aria-label="Theme" bind:value={theme} onchange={change}>
    <option value="auto">Auto</option>
    <option value="dark">Dark</option>
    <option value="light">Light</option>
  </select>
</label>

<style>
  .theme {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    flex-shrink: 0;
  }
  select {
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    padding: var(--space-2);
    min-height: 44px;
  }
</style>
