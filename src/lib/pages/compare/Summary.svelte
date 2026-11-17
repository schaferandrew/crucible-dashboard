<script lang="ts">
  import type { Candidate } from '$lib/core/scoring';
  import type { SuiteIndex } from '$lib/core/types';
  import { suiteInfo } from '$lib/core/catalog';
  import { fmtCost, fmtScore, fmtSeconds, fmtTps, tpsTitle } from '$lib/core/format';
  import ResponsiveTable from '$lib/ui/tables/ResponsiveTable.svelte';
  import type { Column } from '$lib/ui/tables/table';
  import { heatStyle } from '$lib/ui/heat';
  import Identity from './Identity.svelte';
  import { bestOf, type Numbers } from './numbers';
  import { deploymentText, unrecordedDeployment } from './resolve';

  let {
    index,
    items,
    nums,
    colors,
    withHarness,
    suiteQ,
  }: {
    index: SuiteIndex;
    items: Candidate[];
    nums: Numbers;
    colors: string[];
    withHarness: boolean;
    suiteQ?: string;
  } = $props();
  const nShared = $derived(nums.shared.length);
  const nPaired = $derived(nums.paired.length);
  const unrecorded = $derived(items.map((c) => unrecordedDeployment(c.first)));
  const depLabels = $derived(items.map((c) => deploymentText(index, c)));
  const deploymentsDiffer = $derived(new Set(items.map((c) => c.first.deployment)).size > 1);
  const anyLocal = $derived(items.some((c) => c.first.where === 'local'));
  const anyCloud = $derived(items.some((c) => c.first.where !== 'local'));
  const tierLabel = (id: string) => suiteInfo(index.catalog).tier(id).label;
  type SRow = { k: number; c: Candidate };
  const srows = $derived<SRow[]>(items.map((c, k) => ({ k, c })));
  const bestMean = $derived(bestOf(nums.rows.map((r) => r.mean)));
  const showTime = (k: number, v: number | null, fmt: (v: number | null) => string) =>
    unrecorded[k] ? '–' : !nums.timesLoaded ? '…' : v === null ? '–' : fmt(v);

  const scols = $derived<Column<SRow>[]>([
    { id: 'setup', header: 'Setup', rowHeader: true },
    { id: 'mean', header: `Mean, ${nPaired} finished`, align: 'end' },
    ...nums.tiers.map<Column<SRow>>((t) => ({
      id: `tier:${t.tier}`,
      header: tierLabel(t.tier),
      title: `${t.n} shared finished task${t.n === 1 ? '' : 's'}`,
      align: 'end',
    })),
    { id: 'top', header: 'Top score on', align: 'end' },
    { id: 'fin', header: 'Finished', align: 'end' },
    { id: 'time', header: 'Median time per task', align: 'end' },
    {
      id: 'tps',
      header: 'Decode speed',
      title:
        'Output tokens per second of generation, prompt processing excluded: a property of the deployment',
      align: 'end',
    },
    ...(anyLocal
      ? [
          {
            id: 'elec',
            header: '≈ Electricity per task',
            title:
              "Local runs aren't billed: this is time × the machine's power × the electricity price. Mean of per-task means.",
            align: 'end',
          } as Column<SRow>,
        ]
      : []),
    ...(anyCloud
      ? [
          {
            id: 'billed',
            header: 'Billed per task',
            title: 'API cost per task, billed. Mean of per-task means.',
            align: 'end',
          } as Column<SRow>,
        ]
      : []),
  ]);
</script>

<ResponsiveTable
  rows={srows}
  columns={scols}
  rowKey={(r) => r.c.id}
  caption="Each setup's scores on the shared finished tasks, with time, speed and cost"
>
  {#snippet cell(r, col)}
    {@const row = nums.rows[r.k]!}
    {#if col.id === 'setup'}
      <Identity {index} item={r.c} color={colors[r.k]} {withHarness} {suiteQ} />
    {:else if col.id === 'mean'}
      <span
        class="chip-score"
        class:best={bestMean !== null && row.mean === bestMean}
        style={heatStyle(row.mean)}>{fmtScore(row.mean)}</span
      >
    {:else if col.id.startsWith('tier:')}
      {@const t = nums.tiers.find((x) => `tier:${x.tier}` === col.id)}
      {@const v = t?.scores[r.k] ?? null}
      <span class:best={t && bestOf(t.scores) !== null && v === bestOf(t.scores)}>{fmtScore(v)}</span>
    {:else if col.id === 'top'}
      {row.top} of {nPaired}
    {:else if col.id === 'fin'}
      <span class:bad={row.bad.length > 0}
        >{row.bad.length ? `didn't finish ${row.bad.length} of ${nShared}` : `all ${nShared} finished`}</span
      >
    {:else if col.id === 'time'}
      <span title="Median over shared finished tasks, on {depLabels[r.k]}"
        >{showTime(r.k, row.time, fmtSeconds)}</span
      >{#if deploymentsDiffer}<span class="subline">{depLabels[r.k]}</span>{/if}
    {:else if col.id === 'tps'}
      <span title="{tpsTitle(row.tps, row.finishedRuns)}, on {depLabels[r.k]}"
        >{showTime(r.k, row.tps.value, (v) => fmtTps(v))}</span
      >{#if deploymentsDiffer}<span class="subline">{depLabels[r.k]}</span>{/if}
    {:else if col.id === 'elec'}
      {r.c.first.where === 'local' ? showTime(r.k, row.cost, (v) => fmtCost(v, true)) : '–'}
    {:else if col.id === 'billed'}
      {r.c.first.where === 'local' ? '–' : showTime(r.k, row.cost, (v) => fmtCost(v, false))}
    {/if}
  {/snippet}
</ResponsiveTable>
<p class="muted small">
  Time, speed and cost are medians and means over the {nPaired} paired task{nPaired === 1 ? '' : 's'}; cost is
  the mean of per-task means. Local costs are an electricity estimate and are never set against cloud billing.
  {#if unrecorded.some(Boolean)}A setup whose machine or provider wasn't recorded shows no time, speed or
    cost.{/if}
</p>

<style>
  .small {
    font-size: var(--text-sm);
    max-width: 60rem;
  }
  .chip-score {
    display: inline-block;
    min-width: 2.6em;
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    text-align: center;
    font-weight: 600;
  }
  .best {
    font-weight: 700;
  }
  .chip-score.best {
    outline: 2px solid var(--fg);
    outline-offset: 1px;
  }
  .bad {
    color: var(--bad);
    font-weight: 600;
  }
  .subline {
    display: block;
    font-size: var(--text-xs);
    color: var(--muted);
  }
</style>
