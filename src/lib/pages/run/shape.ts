// Shaping one run's detail file (`runs/<uuid>.json`) into what the run page shows (spec 5.2, B-21). Pure and
// tolerant: a missing or oddly typed field becomes an absent line, never an exception.
//
// The run file carries its own display `labels` (model, maker, packager, hardware, machine credit), so a deep
// link needs only the one small run file. The task name and scoring-method labels are not in it: they come from
// the suite's index when some earlier page already loaded it, and otherwise are made readable from the ids.

import { fmtCost, fmtDateTime, fmtInt, fmtScore, fmtSeconds, fmtTps, NONE } from '$lib/core/format';

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Display text: the run file's `labels` plus, optionally, task and method names from a loaded index. */
export interface RunLabels {
  model?: string;
  maker?: string;
  packager?: string;
  hardware?: string;
  /** Machine credit labels (display only). */
  machines?: string[];
  task?: string;
  /** scoring method id -> label */
  methods?: Record<string, string>;
}

/** What a run's per-suite state means (the old STATE_TEXT, RUNDETAIL-07). */
export const STATE_TEXT: Record<string, string> = {
  counted: 'counts in this suite',
  provisional: 'a provisional task: shown, but not in tier scores',
  older: 'from an older version of this task: doesn’t count in this suite',
  invalid: 'marked invalid: never counts',
  harness: 'a harness this suite doesn’t score for this section: doesn’t count',
  retired: 'a retired task: doesn’t count in this suite',
  unknown_task: 'a task this suite doesn’t list: doesn’t count',
  withdrawn: 'withdrawn: never counts',
};

export const stateText = (state: string | null | undefined) =>
  (state && STATE_TEXT[state]) || (state ? `state “${state}”` : 'not in this suite');

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** `names-for-one-character` -> `Names for one character`. */
export const readableId = (id: string) => cap(id.replace(/[-_]+/g, ' '));

export interface SuiteStanding {
  suite: string;
  state: string;
  text: string;
  task: string | null;
  setup: string | null;
  score: number | null;
}

export interface SiblingRun {
  uuid: string;
  startedAt: string | null;
  state: string;
  score: number | null;
  outcome: string | null;
  /** The run being viewed. */
  self: boolean;
  /** The run the leaderboard's cell link opens for this task x setup. */
  scored: boolean;
}

export interface CheckItem {
  label: string;
  passed: boolean | null;
  detail: string | null;
}
export interface CheckGroup {
  name: string | null;
  items: CheckItem[];
}

export interface StatusLine {
  at: string;
  by: string | null;
  text: string;
}

export interface Fact {
  label: string;
  value: string;
  /** Extra text for a tooltip. */
  title?: string;
  /** Link target (absolute path from `link()` is applied by the page: this is a route key). */
  to?: { kind: 'model' | 'task'; id: string };
  tag?: 'local' | 'cloud';
}

export interface RunView {
  uuid: string;
  shortId: string;
  /** The suite whose standing and siblings are shown. */
  suite: string | null;
  standing: SuiteStanding | null;
  /** Every suite the run appears in, for the per-suite table. */
  suites: SuiteStanding[];
  task: { id: string | null; name: string; version: number | null };
  model: { id: string | null; label: string };
  where: 'local' | 'cloud' | null;
  score: {
    value: number | null;
    sentence: string;
    /** Empty when the run has no score record. */
    methodText: string;
    cappedAt: number | null;
  };
  /** The standing sentence, capitalised. */
  standingLine: string;
  outcome: { kind: 'finished' | 'timeout' | 'error'; label: string; status: string | null };
  measures: Fact[];
  setup: Fact[];
  notes: string[];
  checks: { groups: CheckGroup[]; groupLines: string[]; empty: string | null };
  statusHistory: StatusLine[];
  siblings: SiblingRun[];
  /** `outputs/<uuid>.txt`, relative to the data root, or null. */
  output: string | null;
  startedAt: string | null;
  crucibleVersion: string | null;
}

/** The choice of suite: the URL's if the run is in it, else the current suite, else the first the run has. */
export function pickSuite(
  run: Rec,
  wanted: string | null | undefined,
  current: string | null,
): string | null {
  const suites = Object.keys(rec(run.suites));
  if (wanted && suites.includes(wanted)) return wanted;
  if (current && suites.includes(current)) return current;
  return suites[0] ?? null;
}

function amount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function scoreSentence(
  record: Rec | null,
  value: number | null,
  fallbackUnit: string | null,
): {
  sentence: string;
  cappedAt: number | null;
} {
  if (!record) return { sentence: 'Not scored.', cappedAt: null };
  const raw = rec(record.raw);
  const total = num(raw.total);
  const passed = num(raw.passed);
  const unit = str(raw.unit) ?? fallbackUnit ?? 'points';
  const capped = num(record.capped_at);
  let s: string;
  if (total !== null && passed !== null) {
    s = `${amount(passed)} of ${amount(total)} ${unit}${unit === 'tests' ? ' passed' : ''} → ${fmtScore(value)}`;
  } else s = `Score ${fmtScore(value)}`;
  if (capped !== null) s += ` (capped at ${amount(capped)})`;
  return { sentence: s, cappedAt: capped };
}

function chooseScore(run: Rec, ref: unknown): Rec | null {
  const scores = arr(run.scores).map(rec);
  const r = rec(ref);
  return (
    scores.find((s) => s.rubric_version === r.rubric_version && s.method === r.method) ??
    scores.find((s) => s.rubric_version === r.rubric_version) ??
    scores[0] ??
    null
  );
}

function checksOf(record: Rec | null): RunView['checks'] {
  if (!record)
    return {
      groups: [],
      groupLines: [],
      empty: 'This run has no score record, so there are no checks to show.',
    };
  const items = arr(record.items).map(rec);
  if (items.length) {
    const groups = new Map<string, CheckItem[]>();
    for (const it of items) {
      const g = str(it.group) ?? '';
      const list = groups.get(g) ?? [];
      list.push({
        label: str(it.label) ?? str(it.id) ?? 'check',
        passed: typeof it.passed === 'boolean' ? it.passed : null,
        detail: str(it.detail),
      });
      groups.set(g, list);
    }
    return {
      groups: [...groups].map(([name, list]) => ({ name: name || null, items: list })),
      groupLines: [],
      empty: null,
    };
  }
  const gl = arr(record.groups)
    .map(rec)
    .map((g) => {
      const passed = num(g.passed);
      const total = num(g.total);
      const id = str(g.id) ?? 'group';
      const frac = passed !== null && total !== null ? `${amount(passed)}/${amount(total)} ` : '';
      return `${frac}${id}${str(g.detail) ? ` (${str(g.detail)})` : ''}`;
    });
  return gl.length
    ? { groups: [], groupLines: gl, empty: null }
    : { groups: [], groupLines: [], empty: 'No per-check results published for this score.' };
}

function statusText(s: Rec): string {
  const reasonOf = (v: unknown) => str(rec(v).reason);
  if (s.withdrawn) return 'Withdrawn' + (reasonOf(s.withdrawn) ? `: ${reasonOf(s.withdrawn)}` : '');
  if (s.invalid) return 'Marked invalid' + (reasonOf(s.invalid) ? `: ${reasonOf(s.invalid)}` : '');
  if (s.valid === true) return 'Marked valid';
  return 'Status updated';
}

function hardwareText(hw: Rec, key: string | null, labelOverride?: string): string | null {
  if (labelOverride) return labelOverride;
  const chip = str(hw.chip);
  const mem = num(hw.memory_gb);
  if (chip) return mem ? `${chip} · ${mem} GB` : chip;
  const acc = arr(hw.accelerators)
    .map(rec)
    .map((a) => str(a.name))
    .filter(Boolean);
  return acc.length ? acc.join(' + ') : key;
}

/** The `labels` block of a run file (`{hw, model, maker, packager, machines}`), tolerant. */
export function runFileLabels(raw: unknown): RunLabels {
  const l = rec(rec(raw).labels);
  return {
    model: str(l.model) ?? undefined,
    maker: str(l.maker) ?? undefined,
    packager: str(l.packager) ?? undefined,
    hardware: str(l.hw) ?? undefined,
    machines: arr(l.machines).filter((m): m is string => typeof m === 'string' && m !== ''),
  };
}

export function shapeRun(
  raw: unknown,
  opts: { suite?: string | null; currentSuite?: string | null; labels?: RunLabels } = {},
): RunView {
  const run = rec(raw);
  const own = runFileLabels(run);
  const labels: RunLabels = {
    ...opts.labels,
    ...Object.fromEntries(Object.entries(own).filter(([, v]) => v !== undefined)),
  };
  const uuid = str(run.run_uuid) ?? '';
  const summary = rec(run.summary);
  const resolution = rec(run.resolution);
  const metrics = rec(summary.metrics);
  const harness = rec(summary.harness);
  const endpoint = rec(summary.endpoint);
  const hw = rec(summary.hardware);
  const suite = pickSuite(run, opts.suite, opts.currentSuite ?? null);
  const entry = rec(rec(run.suites)[suite ?? '']);

  const suites: SuiteStanding[] = Object.entries(rec(run.suites)).map(([id, v]) => {
    const e = rec(v);
    const state = str(e.state) ?? 'unknown';
    return {
      suite: id,
      state,
      text: stateText(state),
      task: str(e.task),
      setup: str(e.setup),
      score: num(e.score),
    };
  });
  const standing = suites.find((s) => s.suite === suite) ?? null;

  const taskId = standing?.task ?? str(rec(summary.task).id);
  const where = resolution.where === 'local' || resolution.where === 'cloud' ? resolution.where : null;
  const local = where === 'local';
  const modelId = str(resolution.model);
  const modelLabel =
    labels.model ?? (modelId ? modelId.split('/').slice(1).join('/') || modelId : 'Unknown model');

  // Outcome (core classes): timed out, finished, else error
  const sOutcome = rec(summary.outcome);
  const outcomeKind: RunView['outcome']['kind'] =
    sOutcome.timed_out === true || run.outcome === 'timed_out'
      ? 'timeout'
      : run.outcome === 'finished'
        ? 'finished'
        : 'error';
  const outcome = {
    kind: outcomeKind,
    label: outcomeKind === 'timeout' ? 'Timed out' : outcomeKind === 'finished' ? 'Finished' : 'Error',
    status: str(sOutcome.status),
  };

  const record = chooseScore(run, entry.score_ref);
  const value = standing?.score ?? num(record?.score);
  const { sentence, cappedAt } = scoreSentence(record, value, null);
  const method = str(record?.method);
  const methodText = record
    ? `by ${(method && labels.methods?.[method]) ?? method ?? 'an unknown method'} (rubric version ${record.rubric_version ?? '?'})`
    : '';

  // Cost: billed by the provider (cloud) or an electricity estimate (local)
  const cost = num(run.cost);
  const costKind =
    cost === null
      ? 'not recorded'
      : local
        ? 'electricity estimate'
        : str(metrics.cost_source)
          ? 'billed by the provider'
          : 'estimate';
  const tokensIn = num(metrics.tokens_in);
  const tokensOut = num(metrics.tokens_out);

  const measures: Fact[] = [
    {
      label: 'Outcome',
      value: outcome.label + (outcome.status ? ` (${outcome.status.replace(/_/g, ' ')})` : ''),
    },
    { label: 'Time', value: fmtSeconds(num(summary.elapsed_s)) },
    {
      label: 'Tokens',
      value:
        tokensIn === null && tokensOut === null ? NONE : `${fmtInt(tokensIn)} in · ${fmtInt(tokensOut)} out`,
      title: 'Token counts are not comparable across harnesses',
    },
    {
      label: 'Decode speed',
      value: fmtTps(num(metrics.output_tokens_per_s)),
      title: 'Output tokens per second of generation, prompt processing excluded',
    },
    {
      label: 'Cost',
      value: cost === null ? NONE : `${fmtCost(cost, local)} (${costKind})`,
      title: local
        ? 'Electricity estimate from the run’s time, the machine’s power draw and the average US price per kWh. Not the hardware’s cost.'
        : 'The provider’s billed cost',
    },
  ];
  const toolCalls = num(metrics.tool_calls);
  if (toolCalls !== null) measures.push({ label: 'Tool calls', value: fmtInt(toolCalls) });
  const reasoned = num(metrics.reasoning_chars);
  if (reasoned)
    measures.push({ label: 'Reasoned for', value: `${fmtInt(reasoned)} characters before answering` });
  measures.push({ label: 'Started', value: fmtDateTime(str(summary.started_at)) });

  const reasoningRes = str(resolution.reasoning);
  const quant = str(resolution.quant);
  const formatFrom = str(rec(resolution.sources).format_from);
  const hardwareKey = str(resolution.hardware_key);
  const hwText = where === 'local' ? hardwareText(hw, hardwareKey, labels.hardware) : null;
  const machine = labels.machines?.length ? labels.machines.join(', ') : str(resolution.machine);
  const setup: Fact[] = [];
  if (modelId)
    setup.push({
      label: 'Model',
      value: modelLabel,
      to: { kind: 'model', id: modelId },
      tag: where ?? undefined,
    });
  setup.push({ label: 'Maker', value: labels.maker ?? str(resolution.maker) ?? 'unknown' });
  setup.push({ label: 'Packager', value: labels.packager ?? str(resolution.packager) ?? 'not recorded' });
  if (where === 'local') {
    setup.push({ label: 'Quant', value: quant ?? 'not recorded' });
    setup.push({
      label: 'Format',
      value:
        (str(resolution.format) ?? 'not recorded') + (formatFrom === 'quant' ? ' (read from the quant)' : ''),
    });
  }
  setup.push({ label: 'Reasoning', value: reasoningRes ?? 'default' });
  setup.push({
    label: 'Harness',
    value:
      (str(resolution.harness) ?? 'not recorded') + (str(harness.version) ? ` ${str(harness.version)}` : ''),
  });
  if (where === 'cloud') {
    const upstream = str(rec(endpoint.upstream).name);
    setup.push({
      label: 'Provider',
      value: (str(resolution.provider) ?? 'not recorded') + (upstream ? `, routed to ${upstream}` : ''),
    });
  } else if (where === 'local') {
    setup.push({ label: 'Served by', value: str(resolution.provider) ?? 'not recorded' });
    setup.push({
      label: 'Hardware class',
      value: (hwText ?? 'not recorded') + (machine ? ` (${machine})` : ''),
      title: 'Hardware class is the public identity; the machine name is credit only',
    });
  }

  const status = arr(run.status)
    .map(rec)
    .map((s) => ({ at: str(s.at) ?? '', by: str(s.by), text: statusText(s) }))
    .sort((a, b) => a.at.localeCompare(b.at));

  // Siblings: the other runs of this task x setup in the chosen suite, plus this one, newest first
  const scoredRun = str(entry.scored_run);
  const sibs: SiblingRun[] = arr(entry.siblings)
    .map(rec)
    .filter((s) => str(s.run_uuid) && s.run_uuid !== uuid)
    .map((s) => ({
      uuid: str(s.run_uuid)!,
      startedAt: str(s.started_at),
      state: str(s.state) ?? 'unknown',
      score: num(s.score),
      outcome: str(s.outcome),
      self: false,
      scored: s.run_uuid === scoredRun,
    }));
  const self: SiblingRun = {
    uuid,
    startedAt: str(summary.started_at),
    state: standing?.state ?? 'unknown',
    score: value,
    outcome: str(run.outcome),
    self: true,
    scored: uuid === scoredRun,
  };
  const siblings = sibs.length
    ? [self, ...sibs].sort(
        (a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? '') || b.uuid.localeCompare(a.uuid),
      )
    : [];

  const taskName = labels.task ?? (taskId ? readableId(taskId) : 'Unknown task');
  const standingLine = standing
    ? cap(`${stateText(standing.state)}.`)
    : 'This run is not part of this suite.';

  return {
    uuid,
    shortId: uuid.slice(0, 8),
    suite,
    standing,
    suites,
    task: { id: taskId, name: taskName, version: num(rec(summary.task).version) },
    model: { id: modelId, label: modelLabel },
    where,
    score: { value, sentence, methodText, cappedAt },
    standingLine,
    outcome,
    measures,
    setup,
    notes: arr(resolution.notes).filter((n): n is string => typeof n === 'string'),
    checks: checksOf(record),
    statusHistory: status,
    siblings,
    output: str(run.output),
    startedAt: str(summary.started_at),
    crucibleVersion: str(rec(summary.provenance).crucible_version),
  };
}
