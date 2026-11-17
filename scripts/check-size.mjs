// Size budget (gzip), checked after `npm run build`:
//   - the current suite's index.json            <= 100 KB
//   - first-load JS + CSS for `/` (every file the prerendered page references) <= 150 KB
// Exits non-zero when a budget is exceeded.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const build = path.join(root, 'build');
const KB = 1024;
const BUDGET_INDEX = 100 * KB;
const BUDGET_FIRST_LOAD = 150 * KB;

const gz = (file) => zlib.gzipSync(fs.readFileSync(file), { level: 9 }).length;
const fmt = (n) => (n / KB).toFixed(1) + ' KB';

const meta = JSON.parse(fs.readFileSync(path.join(build, 'data', 'meta.json'), 'utf8'));
const indexFile = path.join(build, 'data', meta.current_suite, 'index.json');
const indexSize = gz(indexFile);

const html = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
const assets = [...new Set(html.match(/_app\/immutable\/[^"'\s)]+\.(?:js|css)/g) ?? [])];
// Modules the entry imports statically are preloaded by <link rel=modulepreload>; follow import graphs too.
const seen = new Set();
const queue = [...assets];
while (queue.length) {
  const a = queue.pop();
  if (seen.has(a)) continue;
  seen.add(a);
  const file = path.join(build, a);
  if (!fs.existsSync(file) || !a.endsWith('.js')) continue;
  for (const m of fs
    .readFileSync(file, 'utf8')
    .matchAll(/from\s*"\.\.?\/([^"]+\.js)"|import\("\.\.?\/([^"]+\.js)"\)/g)) {
    const rel = m[1] ?? m[2];
    // relative to the importing file's directory
    const target = path.posix.normalize(
      path.posix.join(path.posix.dirname(a), m[0].includes('"../') ? '../' + rel : rel),
    );
    // dynamic imports are lazy, only static `from` imports are first-load
    if (m[1]) queue.push(target);
  }
}
let total = 0;
const rows = [];
for (const a of [...seen].sort()) {
  const file = path.join(build, a);
  if (!fs.existsSync(file)) continue;
  const size = gz(file);
  total += size;
  rows.push([a, size]);
}

console.log(
  `current suite index.json (${meta.current_suite}): ${fmt(indexSize)} gzip (budget ${fmt(BUDGET_INDEX)})`,
);
for (const [a, size] of rows) console.log(`  ${fmt(size).padStart(9)}  ${a}`);
console.log(`first-load JS+CSS for /: ${fmt(total)} gzip (budget ${fmt(BUDGET_FIRST_LOAD)})`);

let failed = false;
if (indexSize > BUDGET_INDEX) {
  console.error(`FAIL: index.json is ${fmt(indexSize)} gzip, over ${fmt(BUDGET_INDEX)}`);
  failed = true;
}
if (total > BUDGET_FIRST_LOAD) {
  console.error(`FAIL: first-load JS+CSS is ${fmt(total)} gzip, over ${fmt(BUDGET_FIRST_LOAD)}`);
  failed = true;
}
process.exit(failed ? 1 : 0);
