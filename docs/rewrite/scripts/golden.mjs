// Computes golden numbers for the Crucible dashboard by running the REAL crucible-core.js
// (loaded in a vm with a minimal window/document shim) against the fixtures.
// Only the page-level filter engine (FILTERS/passesFilters/facet/rankedRows from assets/js/crucible.js,
// ~60 lines, not part of core) is ported below; everything else (join rules, scoring, rows, sorting) is core.
// Usage: node golden.mjs [--core path/to/crucible-core.js] [--fixtures dir] [--out file]
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const SITE = '/Users/schafer/Developer/schaferandrew.github.io';
const CORE = arg('core', SITE + '/assets/js/crucible-core.js');
const FIX = arg('fixtures', path.join(here, '../fixtures'));
const OUT = arg('out', path.join(here, '../golden-numbers.json'));

const noop = () => {};
const win = { addEventListener: noop, location: { hash: '', pathname: '/crucible/' }, console };
const ctx = vm.createContext({
  window: win, console, navigator: {}, localStorage: {}, sessionStorage: {}, location: win.location,
  document: { addEventListener: noop, getElementById: () => null, querySelectorAll: () => [], querySelector: () => null, readyState: 'loading' },
});
vm.runInContext(fs.readFileSync(CORE, 'utf8'), ctx);
const C = win.CrucibleCore;
const dataBuf = fs.readFileSync(path.join(FIX, 'data.json'));
const D = C.data(JSON.parse(dataBuf.toString('utf8')), {});

const r4 = (v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);
const clean = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'number' ? r4(v) : v)));
const sh = (cmd) => { try { return execSync(cmd, { encoding: 'utf8' }).trim(); } catch { return null; } };

// ---- ported page filter engine (crucible.js 126-200) ----
const FILTERS = [
  { id: 'hw', local: true, value: (c) => (c.local ? c.hwKey : null) },
  { id: 'format', local: true, value: (c) => (c.local ? c.format : null) },
  { id: 'quant', local: true, value: (c) => (c.local ? c.quantKey : null), text: (c) => c.quant },
  { id: 'packager', local: true, value: (c) => (c.local ? c.packager : null) },
  { id: 'reasoning', local: false, value: (c) => c.level },
];
const fval = (f, cfg) => { const v = f.value(cfg); return v === null || v === undefined ? '-' : String(v); };

function engine(V, st) {
  const configs = () => V.configs();
  const passes = (cfg, skip) => {
    if (skip !== 'harness' && st.harness !== 'best' && cfg.harness !== st.harness) return false;
    if (skip !== 'where' && st.where !== 'all' && (st.where === 'local') !== cfg.local) return false;
    for (const f of FILTERS) {
      if (f.id === skip || !(st[f.id] || []).length) continue;
      if (f.local && !cfg.local) return false;
      if (!st[f.id].includes(fval(f, cfg))) return false;
    }
    return true;
  };
  const showingInProgress = (rows) => st.showInProgress || V.noneFinished(rows);
  const shownRows = (keep) => {
    const rows = V.rows(keep, st.exclude);
    const showAll = showingInProgress(V.rows((c) => passes(c), st.exclude));
    return rows.filter((r) => showAll || !r.inProgress).length;
  };
  const facet = (skip, valueOf) => {
    const vals = {};
    configs().forEach((cfg) => { if (!passes(cfg, skip)) return; const v = valueOf(cfg); if (v !== undefined) vals[v] = true; });
    const out = {};
    Object.keys(vals).forEach((v) => { const n = shownRows((cfg) => passes(cfg, skip) && valueOf(cfg) === v); if (n) out[v] = n; });
    return out;
  };
  const valueText = (f, v) => {
    const cfg = configs().filter((c) => (!f.local || c.local) && fval(f, c) === v)[0];
    if (v === '-') return 'Not recorded';
    if (f.id === 'hw') {
      const devices = {};
      configs().forEach((x) => { if (x.local && fval(f, x) === v) Object.keys(x.devices || {}).forEach((d) => { devices[d] = true; }); });
      const names = Object.keys(devices);
      return v + (names.length ? ' (' + names.join(', ') + ')' : '');
    }
    return (cfg && f.text && f.text(cfg, v)) || v;
  };
  const ranked = (sort) => {
    const all = V.rows((c) => passes(c), st.exclude);
    const showAll = st.showInProgress || V.noneFinished(all);
    return V.sortRows(all.filter((s) => showAll || !s.inProgress), sort);
  };
  // facet option lists in display order (multi: non-'-' alphabetical by shown text, '-' last)
  const options = () => {
    const out = {};
    out.harness = Object.entries(facet('harness', (c) => c.harness));
    out.where = Object.entries(facet('where', (c) => (c.local ? 'local' : 'cloud')));
    FILTERS.forEach((f) => {
      const counts = facet(f.id, (c) => (f.local && !c.local ? undefined : fval(f, c)));
      const values = Object.keys(counts).sort((a, b) => (a === '-') - (b === '-') || (valueText(f, a).toLowerCase() < valueText(f, b).toLowerCase() ? -1 : 1));
      out[f.id] = values.map((v) => ({ value: v, text: valueText(f, v), rows: counts[v] }));
    });
    return out;
  };
  return { passes, ranked, options, facet, showingInProgress };
}

// ---- row serialization ----
const cfgBrief = (cfg) => ({ key: cfg.key, slug: cfg.slug, base: cfg.base, level: cfg.level, where: cfg.where, local: cfg.local, harness: cfg.harness, quant: cfg.quant, quantKey: cfg.quantKey, format: cfg.format, packager: cfg.packager, hwKey: cfg.hwKey, provider: cfg.provider, publisher: cfg.publisher });
const resBrief = (r) => (r ? { score: r.score, max: r.max, coverage: r.coverage, scored: r.scored, total: r.total, min: r.min, partial: r.partial } : null);
function rowOut(S, V, s, rank, withDetail) {
  const o = {
    rowKey: s.rowKey, label: s.label, rank, local: s.local, ran: s.ran, inProgress: s.inProgress, progress: s.progress, runs: s.runs,
    overall: resBrief(s.overall), overallText: C.fmtScore(s.overall.score),
    tier: Object.fromEntries(S.TIERS.filter((t) => V.TIERS.some((x) => x.id === t.id)).map((t) => [t.id, resBrief(s.tier[t.id])])),
    verdict: s.verdict, provisional: Object.fromEntries(Object.entries(s.provisional || {}).map(([k, v]) => [k, resBrief(v)])),
    provisionalRan: s.provisionalRan,
    time: s.time, timeText: C.fmtSeconds(s.time), tps: s.tps && s.tps.value, tpsText: C.fmtTps(s.tps && s.tps.value, true),
    cost: s.cost, costText: D.costLabel(s),
    variantCount: s.variants.length, bestSetup: cfgBrief(s.cfg),
  };
  if (withDetail) {
    o.variants = s.variants.map((v) => ({ cfg: cfgBrief(v.cfg), overall: resBrief(v.overall), runs: v.runs, cost: v.cost, time: v.time, inProgress: v.inProgress }));
    o.taskMeans = {};
    if (V.meanOf) V.orderedTasks.forEach((t) => { const m = V.meanOf(s.cfg, t.id); if (m !== null && m !== undefined) o.taskMeans[t.id] = m; });
  }
  return o;
}
function board(S, V, list, withDetail) {
  let rank = 0;
  return list.map((s) => { const r = V.isRanked(s) ? ++rank : null; return rowOut(S, V, s, r, withDetail); });
}
const compact = (rows) => rows.map((r) => [r.rowKey, r.rank, r.overall.score]);

// ---- walk suites x modes x scenarios ----
const out = { suites: {} };
for (const cat of D.SUITES) {
  const sid = D.suiteId(cat);
  const S = D.suite(sid);
  const su = (out.suites[sid] = {
    suiteId: sid, name: D.suiteName(cat), status: cat.suite.status, isCurrent: cat === D.CURRENT, version: cat.suite.version, cutAt: cat.suite.cut_at,
    scoredTasks: S.tasks.filter((t) => t.status === 'active').length,
    suiteLine: [D.suiteName(cat) + (cat.suite.version ? ' (version ' + cat.suite.version + ')' : ''), S.tasks.filter((t) => t.status === 'active').length + ' scored tasks', cat.suite.cut_at ? 'cut ' + C.fmtDate(cat.suite.cut_at) : null].filter(Boolean).join(' · '),
    policy: { coverageMin: S.COVERAGE_MIN, inProgressBelow: S.IN_PROGRESS_BELOW },
    tiers: S.TIERS.map((t) => ({ id: t.id, label: t.label, role: t.role, gate: S.gateOf(t.id) || null })),
    unscoredRuns: S.unscored,
    tasks: S.tasks.map((t) => ({ id: t.id, name: t.name, mode: t.mode, area: t.area, tier: t.tier, status: t.status })),
    modes: {},
  });
  const modeIds = S.MODES.map((m) => m.id).concat(S.hasCombined() ? [C.COMBINED] : []);
  for (const mid of modeIds) {
    const V0 = S.view(mid);
    const isComb = mid === C.COMBINED;
    const m = (su.modes[mid] = {
      modeId: mid, label: V0.info.label, isCombined: isComb,
      tabCount: isComb ? V0.orderedTasks.length : S.tasks.filter((t) => t.mode === mid && t.status === 'active').length,
      harnesses: V0.harnesses ? V0.harnesses() : [],
      tiersShown: V0.TIERS.map((t) => t.id), aggShown: V0.showAgg(), aggLabel: V0.aggInfo().label,
      aggMax: V0.aggMax({}), tierMax: isComb ? Object.fromEntries(V0.TIERS.map((t) => [t.id, V0.tierMax(t.id)])) : undefined,
      orderedTaskIds: V0.orderedTasks.map((t) => t.id),
      provisionalTasks: S.provisionalTasks(mid).map((t) => t.id),
      setupsWithRuns: V0.configs().length,
      scenarios: [],
    });
    const provModes = m.provisionalTasks.length ? [false, true] : [false];
    const excludes = [{}];
    if (V0.showAgg()) V0.TIERS.forEach((t) => excludes.push({ [t.id]: true }));
    for (const prov of provModes) {
      const V = prov ? S.view(mid, { provisional: true }) : V0;
      for (const exclude of excludes) {
        for (const showInProgress of [false, true]) {
          const st = { harness: 'best', where: 'all', showInProgress, exclude };
          const E = engine(V, st);
          const sort = { key: C.AGG, dir: -1 };
          let rows;
          try { rows = E.ranked(sort); } catch (e) { m.scenarios.push({ error: String(e) }); continue; }
          const total = V.rows(null, exclude);
          const sc = {
            id: `prov=${prov}|exclude=${Object.keys(exclude).join('+') || 'none'}|inProgress=${showInProgress}`,
            provisional: prov, exclude: Object.keys(exclude), showInProgress,
            counts: {
              rowsShown: rows.length, rowsTotalNoFilter: total.length, ranked: rows.filter((r) => V.isRanked(r)).length,
              inProgressHidden: V.rows((c) => E.passes(c), exclude).filter((s) => s.ran && s.inProgress).length,
              notRun: rows.filter((r) => !r.ran).length, localRows: rows.filter((r) => r.local).length, cloudRows: rows.filter((r) => !r.local).length,
              setups: V.configs().length,
            },
            noneFinished: V.noneFinished(V.rows((c) => E.passes(c), exclude)),
            aggMax: V.aggMax(exclude),
            rows: Object.keys(exclude).length ? board(S, V, rows, false).map((r) => ({ rowKey: r.rowKey, label: r.label, rank: r.rank, inProgress: r.inProgress, overall: r.overall, overallText: r.overallText, tier: r.tier })) : board(S, V, rows, true),
          };
          const base = !prov && !Object.keys(exclude).length;
          if (base) {
            sc.filterOptions = E.options();
            // sort orders (row keys) for every sortable column, natural direction
            sc.sortOrders = {};
            const keys = [C.AGG, ...V.TIERS.map((t) => t.id), 'time', 'tps', 'cost', 'model'];
            for (const k of keys) {
              const dir = ['time', 'cost', 'model'].includes(k) ? 1 : -1;
              try { sc.sortOrders[k] = { dir, rowKeys: E.ranked({ key: k, dir }).map((s) => s.rowKey) }; } catch (e) { sc.sortOrders[k] = { error: String(e) }; }
            }
            // one-filter-at-a-time boards: [rowKey, rank, overallScore] per row, default sort
            sc.singleFilterBoards = {};
            const opts = sc.filterOptions;
            const run1 = (label, patch) => {
              const st2 = Object.assign({ harness: 'best', where: 'all', showInProgress, exclude }, patch);
              const E2 = engine(V, st2);
              const b = board(S, V, E2.ranked(sort), false);
              sc.singleFilterBoards[label] = { rows: compact(b), count: b.length, options: E2.options() };
            };
            opts.harness.forEach(([h]) => run1('harness=' + h, { harness: h }));
            opts.where.forEach(([w]) => run1('where=' + w, { where: w }));
            FILTERS.forEach((f) => opts[f.id].forEach((o) => run1(f.id + '=' + o.value, { [f.id]: [o.value] })));
          }
          m.scenarios.push(sc);
        }
      }
    }
  }
}

const dataSha = crypto.createHash('sha256').update(dataBuf).digest('hex');
const metaPath = path.join(FIX, 'fixtures.meta.json');
const fixMeta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
const verPath = path.join(FIX, 'verification.json');
const ver = fs.existsSync(verPath) ? JSON.parse(fs.readFileSync(verPath, 'utf8')) : {};
out.metadata = {
  spotchecks: ver.spotchecks || null, dataDriftVsLocalRepo: ver.drift || null,
  detailsNote: 'details.json (per-item score detail, loaded only when a run is opened) is fetched as a fixture but not used in leaderboard numbers',
  portedFromPage: 'FILTERS, passesFilters, facet, valueText, rankedRows (crucible.js 126-210); selection of scenarios (mode x provisional x exclude-one-tier x showInProgress; single-filter boards at base state only)',
  notCaptured: 'model/compare/task/run pages, scatter/bars/heatmap/matrix charts (per-row taskMeans captured for non-combined modes), takeaway sentences, multi-filter combinations, mobile card layout (same data)',
  generatedAt: new Date().toISOString(),
  method: 'A (real crucible-core.js run in a Node vm against fetched live fixtures; page-level filter/facet engine from crucible.js ported, spot-checked against live DOM via Playwright - see spotchecks)',
  coreJsPath: CORE,
  siteRepoGitCommit: sh(`git -C ${SITE} rev-parse HEAD`),
  siteRepoDirtyCoreJs: sh(`git -C ${SITE} status --porcelain -- assets/js/crucible-core.js assets/js/crucible.js`) || '',
  dataSha256: dataSha, dataBytes: dataBuf.length,
  dataFetchTime: fixMeta.fetchTime || null,
  dataUrl: fixMeta.dataUrl || 'https://www.schaferandrew.com/crucible/data.json',
  pageSuites: D.SUITES.map((c) => D.suiteId(c)), currentSuite: D.suiteId(D.CURRENT),
  bundle: { runMonths: Object.keys(D.payload.runs || {}), runs: (function c(n){ return Array.isArray(n) ? n.reduce((a,x)=>a+c(x),0) : n && typeof n==='object' ? (n.record==='run' ? 1 : Object.values(n).reduce((a,x)=>a+c(x),0)) : 0; })(D.payload.runs), status: Object.keys(D.payload.status||{}).length, catalogs: Object.keys(D.payload.catalogs || {}).length, scores: (D.payload.scores || []).length, hiddenSuites: (D.DISPLAY || {}).hidden_suites || [] },
};
fs.writeFileSync(OUT, JSON.stringify(clean(out)));
console.log('wrote', OUT, fs.statSync(OUT).size, 'bytes');
