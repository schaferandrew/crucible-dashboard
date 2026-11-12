<script lang="ts">
  // Who a chosen setup is (CMP-CTRL-03): maker / model with its local or cloud tag, then its variant (what
  // changes answers) and its deployment (what changes speed and cost) on their own lines.
  import { rowLabel, type Candidate } from '$lib/core/scoring';
  import type { SuiteIndex } from '$lib/core/types';
  import { modelHref } from '$lib/paths';
  import { deploymentText, packagedBy, unrecordedDeployment, variantText } from './resolve';

  let {
    index,
    item,
    color = null,
    short = false,
    withHarness,
    suiteQ,
  }: {
    index: SuiteIndex;
    item: Candidate;
    color?: string | null;
    short?: boolean;
    withHarness: boolean;
    suiteQ?: string;
  } = $props();

  const first = $derived(item.first);
  const maker = $derived(first.labels.maker || first.maker);
  const packed = $derived(packagedBy(item));
</script>

<span class="id">
  <span class="name">
    {#if color}<span class="dot" style:background={color} aria-hidden="true"></span>{/if}
    <span class="maker muted">{maker} /</span>
    <a href={modelHref(item.model, suiteQ)}>{rowLabel(index, item.model, item.reasoning)}</a>
    <span class="tag {first.where}">{first.where}</span>
  </span>
  {#if !short}
    <span class="line"
      ><span class="key">Variant</span>
      {variantText(item, withHarness)}{#if packed}<span class="muted"> · {packed}</span>{/if}</span
    >
    <span class="line" class:unrecorded={unrecordedDeployment(first)}
      ><span class="key">Deployment</span> {deploymentText(index, item)}</span
    >
  {/if}
</span>

<style>
  .id {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .name {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.35em;
    font-weight: 600;
  }
  .maker {
    font-weight: 400;
  }
  .dot {
    display: inline-block;
    width: 0.7em;
    height: 0.7em;
    border-radius: 50%;
    align-self: center;
  }
  .line {
    font-size: var(--text-sm);
    font-weight: 400;
    color: var(--muted);
    overflow-wrap: anywhere;
  }
  .key {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .unrecorded {
    color: var(--warn);
  }
</style>
