// Types for the site-data contract (`crucible site-data`, format 1), plus the core's own result shapes.
// Source of truth for the shapes: crucible/docs/site-data-format.md and crucible/schemas/site-data/*.json.
//
// IDs are branded strings. They are opaque: build them with the `as*` helpers at the loading boundary,
// compare them, use them as Map keys, and never split or parse them.

export type Brand<T extends string, B extends string> = T & { readonly __brand: B };

export type SuiteId = Brand<string, 'SuiteId'>;
export type TaskId = Brand<string, 'TaskId'>;
export type TierId = Brand<string, 'TierId'>;
export type ModeId = Brand<string, 'ModeId'>;
export type HarnessId = Brand<string, 'HarnessId'>;
export type MakerId = Brand<string, 'MakerId'>;
export type ModelId = Brand<string, 'ModelId'>;
export type ArtifactId = Brand<string, 'ArtifactId'>;
export type VariantId = Brand<string, 'VariantId'>;
export type DeploymentId = Brand<string, 'DeploymentId'>;
export type SetupId = Brand<string, 'SetupId'>;
export type RunId = Brand<string, 'RunId'>;

/** The Combined section's id. A catalog mode with this id would win over it (see `hasCombined`). */
export const COMBINED = 'combined' as const;
export type SectionId = ModeId | typeof COMBINED;

export const asSuiteId = (s: string) => s as SuiteId;
export const asTaskId = (s: string) => s as TaskId;
export const asTierId = (s: string) => s as TierId;
export const asModeId = (s: string) => s as ModeId;
export const asSectionId = (s: string) => s as SectionId;
export const asHarnessId = (s: string) => s as HarnessId;
export const asMakerId = (s: string) => s as MakerId;
export const asModelId = (s: string) => s as ModelId;
export const asDeploymentId = (s: string) => s as DeploymentId;
export const asSetupId = (s: string) => s as SetupId;
export const asRunId = (s: string) => s as RunId;

// ---- meta.json ----

export interface SuiteSummary {
  id: SuiteId;
  version: string | null;
  label: string;
  status: string | null;
  cut_at: string | null;
}

export interface Meta {
  site_data_format: number;
  built_at: string;
  crucible_version: string;
  bundle_hash: string;
  current_suite: SuiteId;
  suites: SuiteSummary[];
}

// ---- <suite>/index.json ----

export interface Counts {
  runs: number;
  counted: number;
  counted_scored: number;
  unscored: number;
  provisional: number;
  older: number;
  harness: number;
  invalid: number;
  retired: number;
  unknown_task: number;
  withdrawn: number;
}

export interface CatalogMode {
  id: ModeId;
  label: string;
  blurb: string;
  order: number;
  areas: string[];
  harnesses: HarnessId[];
}

export interface CatalogArea {
  id: string;
  label: string;
  mode: ModeId | null;
  order: number;
  blurb: string;
  examples: string;
}

export interface CatalogCategory {
  id: string;
  label: string;
  weight: number | null;
}

export interface Gate {
  mean: number;
  min: number;
}

export interface CatalogTier {
  id: TierId;
  label: string;
  blurb: string;
  detail: string;
  /** `gate`, `headline`, `stretch`, or null. Unknown roles are treated as null. */
  role: string | null;
  gate: Gate | null;
  order: number;
}

export interface CatalogHarness {
  id: HarnessId;
  label: string;
  modes: ModeId[];
}

export interface ScoringPolicy {
  coverage_min: number;
  in_progress_below: number;
}

export interface CatalogTask {
  id: TaskId;
  name: string | null;
  aliases: string[];
  mode: ModeId | null;
  area: string | null;
  category: string | null;
  tier: TierId | null;
  status: string | null;
  version?: number | null;
  rubric_version?: number | null;
  weight: number | null;
  added_in?: string | null;
  scoring: { method?: string; unit?: string; total?: number; scale?: number } & Record<string, unknown>;
}

export interface Catalog {
  suite: {
    id: SuiteId;
    name: string;
    version: string | null;
    cut_at: string | null;
    status: string | null;
    changelog_url: string | null;
    format_revision?: number;
  };
  modes: CatalogMode[];
  areas: CatalogArea[];
  categories: CatalogCategory[];
  tiers: CatalogTier[];
  harnesses: CatalogHarness[];
  scoring_policy: ScoringPolicy & Record<string, unknown>;
  scoring_methods: Record<string, { label: string; blurb: string; criteria_label: string }>;
  labels: { overall: string; combined: { label: string; blurb: string } };
  tasks: CatalogTask[];
}

export interface Maker {
  id: MakerId;
  label: string;
  url: string | null;
}

export interface Model {
  id: ModelId;
  label: string;
  maker: MakerId;
  family: string | null;
  params: number | string | null;
  active_params: number | string | null;
  known: boolean;
}

export interface Artifact {
  id: ArtifactId;
  model: ModelId;
  packager: string | null;
  format: string | null;
  quant: string | null;
  api: boolean;
}

export interface Variant {
  id: VariantId;
  artifact: ArtifactId;
  reasoning: string;
  harness: HarnessId | null;
}

export interface Deployment {
  id: DeploymentId;
  where: string | null;
  provider: string | null;
  hw: string | null;
  hw_label: string | null;
  label: string;
  machines: { label: string; runs: number }[];
  watts: number | null;
}

/** A recorded value is a string; "unrecorded" applies but was not recorded; null means not applicable. */
export interface Setup {
  id: SetupId;
  variant: VariantId;
  artifact: ArtifactId;
  deployment: DeploymentId;
  model: ModelId;
  maker: MakerId;
  packager: string | null;
  format: string | null;
  quant: string | null;
  reasoning: string;
  harness: HarnessId;
  where: string;
  hw: string | null;
  provider: string | null;
  modes: ModeId[];
  runs: number;
  labels: {
    model: string;
    maker: string;
    packager: string | null;
    hw: string | null;
    machines: string[];
    provider: string | null;
  };
  unrecorded: string[];
}

export interface Block {
  n: number;
  n_scored: number;
  mean: number | null;
  min: number | null;
  max: number | null;
  n_finished: number;
  mean_finished: number | null;
  timeouts: number;
  errors: number;
}

export interface Cell {
  setup: SetupId;
  task: TaskId;
  runs: number;
  counted?: Block;
  provisional?: Block;
  /** May arrive in a later format: the run whose score the cell shows. */
  scored_run?: RunId | null;
}

export interface Stats {
  runs: number;
  time: number | null;
  cost: number | null;
  tps: { median: number | null; n: number };
}

export interface SetupStatsSubsets {
  format: 'subsets';
  tiers: TierId[];
  keys: string[];
  by_setup: Record<string, { stats: Stats[]; index: number[] }>;
}

/** One [elapsed_s, tps, cost] triple per scored run. */
export type RunTriple = [number | null, number | null, number | null];

export interface SetupStatsCells {
  format: 'cells';
  tiers: TierId[];
  by_setup: Record<string, Record<string, { counted?: RunTriple[]; provisional?: RunTriple[] }>>;
}

export type SetupStats = SetupStatsSubsets | SetupStatsCells;

export interface SuiteIndex {
  suite: SuiteId;
  counts: Counts;
  catalog: Catalog;
  entities: {
    makers: Record<string, Maker>;
    models: Record<string, Model>;
    artifacts: Record<string, Artifact>;
    variants: Record<string, Variant>;
    deployments: Record<string, Deployment>;
    setups: Record<string, Setup>;
  };
  cells: Cell[];
  setup_stats: SetupStats;
  other: Record<string, Record<string, number>>;
}

// ---- Core results ----

/** A tier's score for one setup (or, in Combined, one pair of setups). */
export interface TierResult {
  score: number | null;
  /** 10 for a section tier, 10 per section for a Combined tier, and the sum of the included tiers for Overall. */
  max: number;
  /** Scored weight over the tier's total weight, 0..1. */
  coverage: number;
  scored: number;
  total: number;
  /** The lowest task mean that went into the score. */
  min: number | null;
  /** Coverage is below the suite's `coverage_min`, or (Overall) any included tier is partial or unscored. */
  partial: boolean;
  /** Provisional tasks folded in (provisional preview only). */
  prov?: { scored: number; total: number };
}

export type Verdict = 'pass' | 'fail' | 'partial' | null;
