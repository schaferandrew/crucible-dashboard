// Browser smoke checks against a running dev/preview server. No files or published data are edited.
// npm run test:ui -- http://localhost:5173
// Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to use an existing system Chromium.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { checkCompare } from './check-compare.mjs';

const origin = process.argv[2] ?? 'http://localhost:5173';
const base = `${origin.replace(/\/$/, '')}/crucible-dashboard`;
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
});
const errors = [];
const page = await browser.newPage({ reducedMotion: 'reduce' });
page.setDefaultTimeout(15000);
page.on('pageerror', (error) => errors.push(error.message));
const outcome = () => page.getByRole('combobox', { name: /^Outcome/ });
const state = () => page.getByRole('combobox', { name: /^State in/ });
const sort = () => page.getByRole('combobox', { name: /^Sort by/ });
const suite = () => page.getByRole('combobox', { name: /^Suite/ });

async function settled() {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
}
async function followLink(link) {
  const href = await link.getAttribute('href');
  assert.ok(href, 'Navigation needs a link destination');
  const destination = new URL(href, page.url());
  // A cached page can still be idle before SvelteKit starts client navigation.
  // Wait for the destination first, then inspect its UI.
  await Promise.all([page.waitForURL((url) => url.pathname === destination.pathname), link.click()]);
  await settled();
}
async function noOverflow() {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
}
async function activeTabVisible() {
  assert.equal(
    await page.locator('nav.tabs [aria-current="page"]').evaluate((tab) => {
      const a = tab.getBoundingClientRect();
      const b = tab.parentElement.getBoundingClientRect();
      return a.left >= b.left - 1 && a.right <= b.right + 1;
    }),
    true,
    'The active nav tab must be visible',
  );
}

async function json(path) {
  const response = await page.request.get(`${base}/data/${path}`);
  assert.equal(response.ok(), true, path);
  return response.json();
}
// Find a real repeated run with output so this check survives changing data and UUIDs.
const meta = await json('meta.json');
const months = await json('recent/index.json');
const recent = await json(`recent/${months.months[0].id}.json`);
let repeat;
for (const item of recent.runs.slice(0, 50)) {
  const run = await json(`runs/${item.run_uuid}.json`);
  const sibling = run.suites?.[meta.current_suite]?.siblings?.find((s) => s.run_uuid !== run.run_uuid);
  if (run.output && sibling) {
    const other = await json(`runs/${sibling.run_uuid}.json`);
    if (other.output) {
      repeat = { run, other };
      break;
    }
  }
}
assert.ok(repeat, 'The smoke data needs a repeated run with model outputs');

try {
  for (const width of [1400, 375]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/', '/task/', '/model/', '/compare/', '/todo/', '/runs/', '/about/']) {
      await page.goto(base + route);
      await settled();
      await page.locator('main h1').waitFor();
      assert.equal(await page.locator('main h1').count(), 1, `${width}px ${route}`);
      await noOverflow();
      await activeTabVisible();
    }

    // One selected radio is a tab stop; arrows move focus and update the section and URL.
    await page.goto(base + '/task/');
    await settled();
    const selected = page.getByRole('radio', { checked: true });
    await selected.focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => new URL(location.href).searchParams.get('mode') === 'chat');
    assert.equal(
      await page.getByRole('radio', { checked: true }).evaluate((e) => e === document.activeElement),
      true,
    );
    await followLink(page.locator('main a[href*="/task/"]').first());
    assert.equal(await page.getByRole('heading', { name: 'Task not found', exact: true }).count(), 0);
    await noOverflow();

    // Shared filters survive reload, control-panel changes, and a run-page round trip.
    await page.goto(base + '/runs/?outcome=failed&state=invalid&sort=oldest');
    await settled();
    assert.equal(await outcome().inputValue(), 'error');
    assert.equal(await state().inputValue(), 'invalid');
    assert.equal(await sort().inputValue(), 'oldest');
    await state().selectOption('all');
    await outcome().selectOption('timeout');
    assert.equal(new URL(page.url()).searchParams.get('outcome'), 'timeout');
    await page.reload();
    await settled();
    assert.equal(await outcome().inputValue(), 'timeout');
    const suites = await suite()
      .locator('option')
      .evaluateAll((options) => options.map((o) => o.value));
    if (suites.length > 1) {
      await suite().selectOption(suites[1]);
      await settled();
      assert.equal(await outcome().inputValue(), 'timeout');
      assert.equal(new URL(page.url()).searchParams.get('sort'), 'oldest');
    }
    const run = page.locator('main a[href*="/run/"]').first();
    await followLink(run);
    await noOverflow();
    await followLink(page.getByRole('link', { name: '← Back', exact: true }));
    assert.equal(await outcome().inputValue(), 'timeout');
    assert.equal(await sort().inputValue(), 'oldest');

    // Switching repeats must display the new run's output, never the previously opened text.
    await page.goto(`${base}/run/${repeat.run.run_uuid}/`);
    await settled();
    const output = () => page.locator('details.output');
    await output().locator('summary').click();
    await output().locator('pre').waitFor();
    const firstOutput = await page.request.get(`${base}/data/${repeat.run.output}`).then((r) => r.text());
    assert.equal(await output().locator('pre').textContent(), firstOutput || '(empty)');
    await followLink(
      page.getByRole('link', { name: `Run ${repeat.other.run_uuid.slice(0, 8)}`, exact: true }),
    );
    assert.equal(await output().getAttribute('open'), null);
    await output().locator('summary').click();
    await output().locator('pre').waitFor();
    const secondOutput = await page.request.get(`${base}/data/${repeat.other.output}`).then((r) => r.text());
    assert.equal(await output().locator('pre').textContent(), secondOutput || '(empty)');

    // A real two-sided comparison exercises summary, charts and reliability after extraction.
    // Mark each fetched run's checks in this browser only, so swapping columns can detect stale results.
    await page.route('**/data/runs/*.json', async (route) => {
      const response = await route.fetch();
      const run = await response.json();
      for (const score of run.scores ?? []) {
        score.items = [{ label: `Checks for ${run.run_uuid}`, passed: true }];
      }
      await route.fulfill({ response, json: run });
    });
    await page.goto(base + '/compare/?mode=chat');
    await settled();
    for (let n = 0; n < 2; n++) {
      const pick = page.getByLabel('Add a setup');
      const options = await pick
        .locator('option')
        .evaluateAll((os) => os.filter((o) => o.value).map((o) => ({ value: o.value, text: o.textContent })));
      const choice = options.find((o) => /deepseek-v4.1-flash|qwen3.8-27b/.test(o.text)) ?? options[0];
      assert.ok(choice, 'A comparison setup must be available');
      await pick.selectOption(choice.value);
      await page.waitForFunction(
        (count) => new URL(location.href).searchParams.get('s')?.split(',').length === count,
        n + 1,
      );
      await settled();
    }
    await page.getByRole('heading', { name: 'Summary', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Reliability', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Show checks', exact: true }).first().click();
    await settled();
    assert.ok(await page.getByRole('link', { name: 'open the run', exact: true }).count());
    // Keep an expanded task while the first comparison side is replaced. Checks must follow the UUIDs.
    const extra = await page
      .getByLabel('Add a setup')
      .locator('option')
      .evaluateAll((os) => os.find((o) => o.value && /claude-sonnet/.test(o.textContent))?.value);
    assert.ok(extra, 'A third scored setup must be available');
    await page.getByLabel('Add a setup').selectOption(extra);
    await page.waitForFunction(() => new URL(location.href).searchParams.get('s')?.split(',').length === 3);
    await settled();
    await page
      .getByRole('button', { name: /^Remove .* from the comparison$/ })
      .first()
      .click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get('s')?.split(',').length === 2);
    await settled();
    const checkLinks = page.getByRole('link', { name: 'open the run', exact: true });
    assert.equal(await checkLinks.count(), 2, 'The expanded task stays open with the new sides');
    const selectedIds = new URL(page.url()).searchParams.get('s').split(',');
    for (const link of await checkLinks.all()) {
      const href = await link.getAttribute('href');
      const uuid = new URL(href, base).pathname.split('/').filter(Boolean).at(-1);
      const run = await json(`runs/${uuid}.json`);
      assert.ok(selectedIds.includes(run.setup), 'An expanded check must belong to a selected setup');
      const column = link.locator('..').locator('..');
      assert.ok(
        (await column.innerText()).includes(`Checks for ${uuid}`),
        'Checks must match the linked run',
      );
    }
    await page.unroute('**/data/runs/*.json');
    await noOverflow();
    await followLink(page.getByRole('link', { name: 'Models', exact: true }));
    await activeTabVisible();
    await followLink(page.locator('main a[href*="/model/"]').first());
    // Maker -> model detail.
    const model = page.locator('main a[href*="/model/"]').filter({ hasText: /./ });
    const detail = await model.evaluateAll((links) =>
      links
        .map((a) => a.getAttribute('href'))
        .find((h) => h.split('?')[0].split('/').filter(Boolean).length === 4),
    );
    assert.ok(detail, 'A maker must link to a model detail page');
    await page.goto(new URL(detail, base).href);
    await settled();
    await noOverflow();
    await page.emulateMedia({ colorScheme: 'dark' });
    await noOverflow();
    await page.emulateMedia({ colorScheme: 'light' });
    console.log(`Passed page and navigation flows at ${width}px`);
  }

  // Changing back to the current suite while an older suite is loading must cancel the old choice.
  await page.goto(base + '/');
  await settled();
  const currentSuite = await suite().inputValue();
  const oldSuite = await suite()
    .locator('option')
    .evaluateAll((os) => os.map((o) => o.value))
    .then((ids) => ids.find((id) => id !== currentSuite));
  if (oldSuite) {
    await page.route(`**/data/${oldSuite}/index.json`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });
    await suite().selectOption(oldSuite);
    await suite().selectOption(currentSuite);
    await settled();
    assert.equal(await suite().inputValue(), currentSuite);
    assert.equal(new URL(page.url()).searchParams.has('suite'), false);
  }
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log('Passed suite race check; no browser runtime errors');
} finally {
  await browser.close();
}

await checkCompare(origin);
