// Compare selection regressions, invoked by check-ui.mjs after the shared dashboard flows.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

export async function checkCompare(origin) {
  const base = `${origin.replace(/\/$/, '')}/crucible-dashboard`;
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  page.setDefaultTimeout(15000);
  const errors = [];
  const external = new Set();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (/^https?:$/.test(url.protocol) && url.origin !== new URL(origin).origin) external.add(url.origin);
  });
  async function settled() {
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
  }
  async function noOverflow() {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  async function compareControls() {
    await page.goto(base + '/compare/?mode=chat');
    await settled();
    const pick = () => page.getByLabel('Add a setup');
    const choices = () =>
      pick()
        .locator('option')
        .evaluateAll((os) => os.filter((o) => o.value).map((o) => ({ value: o.value, text: o.textContent })));
    const exact = await choices();
    assert.ok(exact.length > 1);
    assert.ok(exact.every((o) => /\d+\/\d+ tasks scored/.test(o.text)));
    await pick().selectOption(exact[0].value);
    await settled();
    assert.ok((await choices()).every((o) => /\d+ in common/.test(o.text)));
    await page.getByLabel('Pool matching setups across deployments').check();
    await settled();
    assert.equal(new URL(page.url()).searchParams.get('pool'), '1');
    assert.equal(await page.locator('.chips > li').count(), 1);
    const pooled = (await choices()).find((o) => o.value.startsWith('pool:'));
    assert.ok(pooled, 'Real data includes a matching variant across deployments');
    await pick().selectOption(pooled.value);
    await settled();
    await page.getByRole('heading', { name: 'Summary', exact: true }).waitFor();
    assert.equal(await page.locator('.chips > li').count(), 2);
    await page.getByLabel('Complete setups only').check();
    await settled();
    for (const o of await choices()) {
      const count = o.text.match(/(\d+)\/(\d+) tasks scored/);
      assert.equal(count[1], count[2], 'Complete-only options cover every active task');
    }
    await page.reload();
    await settled();
    assert.equal(await page.getByLabel('Pool matching setups across deployments').isChecked(), true);
    assert.equal(await page.getByLabel('Complete setups only').isChecked(), true);
    assert.equal(await page.locator('.chips > li').count(), 2);
    await noOverflow();
    await page.getByLabel('Pool matching setups across deployments').uncheck();
    await settled();
    assert.equal(new URL(page.url()).searchParams.has('pool'), false);
    assert.equal(await page.locator('.chips > li').count(), 2);
    assert.equal(new URL(page.url()).searchParams.get('s').includes('pool:'), false);
    console.log('Passed compare coverage, pooling, filtering, and reload flows');
  }

  try {
    for (const width of [1400, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await compareControls();
    }
    assert.deepEqual(errors, [], 'No compare runtime errors');
    assert.deepEqual([...external], [], 'No third-party requests during compare flows');
  } finally {
    await browser.close();
  }
}
