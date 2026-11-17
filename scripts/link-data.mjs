// Makes generated site data available at static/data.
//
// Local development convenience only: symlinks static/data to $CRUCIBLE_SITE_DATA (a folder made by
// `crucible site-data`). If it is unset it uses .cache/site-data (made by `npm run data:gen`).
// CI does not use this: it generates static/data directly (see .github/workflows/deploy.yml).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'static', 'data');
const fallback = path.join(root, '.cache', 'site-data');
const source = path.resolve(process.env.CRUCIBLE_SITE_DATA || fallback);

if (!fs.existsSync(path.join(source, 'meta.json'))) {
  console.error(
    `No site data at ${source} (no meta.json). Run \`npm run data:gen\`, or set CRUCIBLE_SITE_DATA to a \`crucible site-data\` output folder.`,
  );
  process.exit(1);
}
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.rmSync(target, { recursive: true, force: true });
fs.symlinkSync(source, target, 'dir');
console.log(`static/data -> ${source}`);
