<script lang="ts">
  // "maker / model" with each part linked to its page, optionally followed by the local/cloud tag.
  import type { Row } from '$lib/core/scoring';
  import { makerLabel } from '$lib/labels';
  import { modelHref } from '$lib/paths';

  let {
    row,
    label,
    suite,
    tag = false,
    star = false,
  }: {
    row: Row;
    /** Overrides the model text. */
    label?: string;
    /** `?suite=` to keep, or undefined for the current suite. */
    suite?: string;
    tag?: boolean;
    star?: boolean;
  } = $props();
</script>

<span class="ref"
  ><a class="maker" href={modelHref(row.setup.maker, suite)}>{makerLabel(row)}</a><span class="sl">
    /
  </span><a class="model" href={modelHref(row.model, suite)}
    >{label ?? row.label}{star && row.inProgress ? ' *' : ''}</a
  >{#if tag}
    <span class="tag" class:local={row.local} class:cloud={!row.local}>{row.local ? 'local' : 'cloud'}</span
    >{/if}</span
>

<style>
  .ref {
    overflow-wrap: anywhere;
  }
  a {
    color: inherit;
    text-decoration: none;
  }
  a:hover {
    color: var(--accent);
    text-decoration: underline;
  }
  .maker {
    color: var(--muted);
    font-weight: 400;
  }
  .model {
    font-weight: 700;
  }
  .sl {
    color: var(--muted);
    font-weight: 400;
  }
</style>
