// Makes generated site data available at static/data.
//
// Local development convenience only: symlinks static/data to $CRUCIBLE_SITE_DATA (a folder made by
// `crucible site-data`). If the variable is unset it falls back to the maintainer's scratch build.
// CI does not use this: it generates static/data directly (see .github/workflows/deploy.yml).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'static', 'data');
const fallback =
  '/private/tmp/claude-501/-Users-schafer--claude-spares-spare-7TMX1y/c9ee77eb-8caf-4d76-970c-7327fc31cd4d/scratchpad/site-data';
const source = path.resolve(process.env.CRUCIBLE_SITE_DATA || fallback);

if (!fs.existsSync(path.join(source, 'meta.json'))) {
  console.error(
    `No site data at ${source} (no meta.json). Set CRUCIBLE_SITE_DATA to a \`crucible site-data\` output folder.`,
  );
  process.exit(1);
}
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.rmSync(target, { recursive: true, force: true });
fs.symlinkSync(source, target, 'dir');
console.log(`static/data -> ${source}`);
