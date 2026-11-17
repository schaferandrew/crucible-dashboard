<script lang="ts">
  // The model output, lazy-loaded when the disclosure is first opened (RUNDETAIL-10, DATA-FETCH-06): "Loading…",
  // then the text ("(empty)" when empty) or "Couldn’t load the output." with a retry on reopen.
  import { loadOutput } from '$lib/data';

  let { output }: { output: string } = $props();

  let phase = $state<'idle' | 'loading' | 'done' | 'failed'>('idle');
  let text = $state('');

  async function ontoggle(e: Event) {
    if (!(e.currentTarget as HTMLDetailsElement).open || phase === 'loading' || phase === 'done') return;
    phase = 'loading';
    try {
      text = await loadOutput(fetch, output);
      phase = 'done';
    } catch {
      phase = 'failed';
    }
  }
</script>

<details class="output" {ontoggle}>
  <summary>Model output</summary>
  {#if phase === 'loading'}
    <p class="muted" role="status">Loading…</p>
  {:else if phase === 'failed'}
    <p class="bad" role="alert">Couldn’t load the output. Close and reopen to try again.</p>
  {:else if phase === 'done'}
    <pre>{text === '' ? '(empty)' : text}</pre>
  {/if}
</details>

<style>
  .output {
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-2) var(--space-3);
    background: var(--surface);
  }
  summary {
    cursor: pointer;
    font-weight: 600;
  }
  pre {
    margin: var(--space-2) 0 0;
    max-height: 32rem;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font: var(--text-sm) / 1.45 var(--mono);
  }
  .bad {
    color: var(--bad);
  }
</style>
