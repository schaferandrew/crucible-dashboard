// Display text for setups and rows. UI only: it reads the labels the site data already carries.

import type { Row, RowStats } from '$lib/core/scoring';
import type { Setup } from '$lib/core/types';

const NOT_RECORDED = 'not recorded';

/** "mlx-community Q4_K_M · Apple M5 Pro, 48 GB (Duskfall) · direct" or "via openrouter · direct". */
export function setupLabel(s: RowStats): string {
  const members = s.candidate.members.filter((m): m is Setup => !!m);
  const first = s.setup;
  const harness = [...new Set(members.map((m) => m.harness))].join(' + ');
  if (first.where !== 'local')
    return [`via ${first.labels.provider ?? first.provider ?? 'cloud'}`, harness].join(' · ');
  const weights = [first.labels.packager ?? '', first.quant ?? NOT_RECORDED].filter(Boolean).join(' ');
  const machines = first.labels.machines.length ? ` (${first.labels.machines.join(', ')})` : '';
  const hw = first.labels.hw
    ? first.labels.hw + machines
    : first.hw === 'unrecorded' || !first.hw
      ? `hardware ${NOT_RECORDED}`
      : first.hw;
  return [weights, hw, harness].join(' · ');
}

export function makerLabel(row: Row): string {
  return row.setup.labels.maker || row.setup.maker;
}
