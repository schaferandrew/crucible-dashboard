// Screenshot harness: the new page next to the live one, at 1400 px and 375 px, full page.
//
//   npm run shots -- --page <name> --new <path> --live <url> [--port 5173] [--wait 600] [--only new|live]
//
//   --page  folder name under docs/rewrite/shots/ (e.g. leaderboard, run)
//   --new   path of the new page, relative to the app base, e.g. `/` or `/run/<uuid>/?suite=v4`
//           (a path that already starts with /crucible-dashboard is used as is)
//   --live  full URL of the live page, e.g. https://www.schaferandrew.com/crucible/
//   --port  the running dev or preview server (default 5173); start it yourself: `npm run dev` or `npm run preview`
//   --wait  extra milliseconds to let a page settle after the network goes quiet (default 600)
//   --only  take only the `new` or only the `live` pair
//
// Writes docs/rewrite/shots/<page>/{new,live}-{1400,375}.png. Light theme, reduced motion, so shots are stable.
// Needs Chromium once: `npx playwright install chromium`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = '/crucible-dashboard';
const WIDTHS = [
  { w: 1400, h: 900 },
  { w: 375, h: 812 },
];

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    out[key] = next === undefined || next.startsWith('--') ? true : next;
    if (out[key] !== true) i++;
  }
  return out;
}

const a = args(process.argv.slice(2));
if (!a.page || (!a.new && a.only !== 'live') || (!a.live && a.only !== 'new')) {
  console.error(
    'usage: npm run shots -- --page <name> --new <path> --live <url> [--port 5173] [--wait 600] [--only new|live]',
  );
  process.exit(2);
}

const port = a.port ?? 5173;
const wait = Number(a.wait ?? 600);
const outDir = path.join(root, 'docs/rewrite/shots', String(a.page));
fs.mkdirSync(outDir, { recursive: true });

const newUrl = a.new
  ? new URL((String(a.new).startsWith(BASE) ? '' : BASE) + a.new, `http://localhost:${port}`).href
  : null;

const targets = [];
if (a.only !== 'live' && newUrl) targets.push(['new', newUrl]);
if (a.only !== 'new' && a.live) targets.push(['live', String(a.live)]);

const browser = await chromium.launch();
let failed = false;
try {
  for (const [name, url] of targets) {
    for (const { w, h } of WIDTHS) {
      const ctx = await browser.newContext({
        viewport: { width: w, height: h },
        colorScheme: 'light',
        reducedMotion: 'reduce',
        deviceScaleFactor: 1,
      });
      const page = await ctx.newPage();
      const file = path.join(outDir, `${name}-${w}.png`);
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
        await page.waitForTimeout(wait);
        await page.screenshot({ path: file, fullPage: true });
        console.log(`${path.relative(root, file)}  <-  ${url}`);
      } catch (e) {
        failed = true;
        console.error(`FAILED ${name} ${w}px (${url}): ${e instanceof Error ? e.message : e}`);
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
