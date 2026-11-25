import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import worker from '../upload-api/worker.mjs';

const origin = new URL(process.argv[2] ?? 'http://localhost:4173').origin;
const endpoint = process.argv[3];
const uploadPath = '/__upload_test';
const zip = Buffer.from(
  'UEsDBAoAAAAAAACAIVAAAAAAAAAAAAAAAAAJAAAAdGVzdC50eHRQSwECFAAKAAAAAAAAgCFQAAAAAAAAAAAAAAAACQAAAAAAAAAAAAAAAAAAAAAAdGVzdC50eHRQSwUGAAAAAAEAAQA3AAAAJwAAAAAA',
  'base64',
);
const receipt = createHash('sha256').update(zip).digest('hex');
const app = origin + '/crucible-dashboard';
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
});
const stored = new Map();
const page = await browser.newPage({ colorScheme: 'light', reducedMotion: 'reduce' });

if (!endpoint) {
  await page.route(origin + uploadPath, async (route) => {
    const body = route.request().postDataBuffer();
    const response = await worker.fetch(
      new Request(origin + uploadPath, {
        method: 'POST',
        body,
        headers: {
          'Content-Type': route.request().headers()['content-type'],
          'Content-Length': String(body.length),
          Origin: origin,
        },
      }),
      {
        DASHBOARD_ORIGIN: origin,
        UPLOAD_LIMIT: { limit: async () => ({ success: true }) },
        RESULTS_INBOX: { put: async (key, bytes) => stored.set(key, Buffer.from(bytes)) },
      },
    );
    await route.fulfill({ status: response.status, body: await response.text() });
  });
}

try {
  for (const width of [1400, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(app + '/about/');
    await page.waitForLoadState('networkidle');
    await page.getByRole('link', { name: 'Upload your Crucible results' }).click();
    await page.waitForURL(app + '/upload/');
    await page.waitForLoadState('networkidle');
    const input = page.getByLabel('Choose results ZIP');
    const submit = page.getByRole('button', { name: 'Upload results', exact: true });

    await input.setInputFiles({ name: 'results.txt', mimeType: 'text/plain', buffer: zip });
    await page.getByRole('alert').filter({ hasText: 'Choose one ZIP file.' }).waitFor();
    assert.ok(await submit.isDisabled());

    if (width === 1400) {
      await input.setInputFiles({ name: 'results.zip', mimeType: 'application/zip', buffer: zip });
    } else {
      const transfer = await page.evaluateHandle(
        (bytes) => {
          const transfer = new DataTransfer();
          transfer.items.add(new File([new Uint8Array(bytes)], 'results.zip', { type: 'application/zip' }));
          return transfer;
        },
        [...zip],
      );
      await page.locator('fieldset').dispatchEvent('drop', { dataTransfer: transfer });
      await transfer.dispose();
    }

    await page.getByText('results.zip', { exact: true }).waitFor();
    assert.ok(await submit.isEnabled());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({ path: `test-results/results-upload/${width}.png`, fullPage: true });
    await submit.click();
    await page.getByRole('status').filter({ hasText: receipt }).waitFor();
    assert.ok(await submit.isDisabled());
  }
  if (!endpoint) assert.deepEqual(stored, new Map([[`pending/${receipt}.zip`, zip]]));
  console.log(
    'Passed file selection, drag and drop, validation, and upload receipts at desktop and mobile widths',
  );
} finally {
  await browser.close();
}
