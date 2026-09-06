const path = require('node:path');
const { chromium } = require('../../kit-ia-builder/node_modules/playwright');
const { createServer } = require('../local-server.cjs');

(async () => {
  const app = createServer();
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = [];
  const externalFailures = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('Failed to load resource')) return;
    errors.push(`console: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) externalFailures.push(request.url());
    else errors.push(`request: ${request.url()} · ${request.failure()?.errorText || 'failed'}`);
  });

  try {
    await page.goto(`http://127.0.0.1:${app.address().port}/index.html`, { waitUntil: 'load' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
    await page.locator('[data-view="painel"]').click();
    await page.waitForFunction(() => window.AferoLiveMap && window.AferoLiveMap.getMetrics().ready);

    const csv = [
      'titulo,dominio,url,score,nicho,query',
      'Protocolo Vital,vital.test,https://vital.test,11,saude,combo_hotmart_meta',
      'Método Atlas,atlas.test,https://atlas.test,9,financas,combo_kiwify_utmi',
      'Clube Orbe,orbe.test,https://orbe.test,7,educacao,checkout_hotmart',
      'Plano Raiz,raiz.test,https://raiz.test,4,bem-estar,pixel_meta'
    ].join('\n');
    await page.locator('#csvInput').setInputFiles({ name: 'visual.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await page.waitForFunction(() => window.AferoLiveMap.getMetrics().offers === 4);
    await page.waitForTimeout(700);

    const reviewDir = path.resolve(__dirname, '..', '.impeccable', 'review');
    await page.locator('.top').screenshot({ path: path.join(reviewDir, 'afero-inverse-nav-light.png') });
    await page.locator('.panel-onboarding').screenshot({ path: path.join(reviewDir, 'afero-live-map-light-desktop.png') });
    await page.locator('#themeToggle').click();
    await page.waitForTimeout(1000);
    await page.locator('.top').screenshot({ path: path.join(reviewDir, 'afero-inverse-nav-dark.png') });
    await page.locator('.panel-onboarding').screenshot({ path: path.join(reviewDir, 'afero-live-map-dark-desktop.png') });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await page.locator('.panel-onboarding').screenshot({ path: path.join(reviewDir, 'afero-live-map-dark-mobile.png') });

    const report = await page.evaluate(() => ({
      metrics: window.AferoLiveMap.getMetrics(),
      width: { viewport: innerWidth, document: document.documentElement.scrollWidth },
      fonts: {
        body: getComputedStyle(document.body).fontFamily,
        opener: getComputedStyle(document.querySelector('.onboarding-title')).fontFamily,
        offer: getComputedStyle(document.querySelector('.offer-t')).fontFamily,
        xray: getComputedStyle(document.querySelector('.xr-title')).fontFamily
      },
      header: getComputedStyle(document.querySelector('.editorial-nav-shell')).backgroundColor
    }));
    process.stdout.write(`${JSON.stringify({ ...report, errors, externalFailures }, null, 2)}\n`);
    if (errors.length) process.exitCode = 1;
  } finally {
    await browser.close();
    await new Promise((resolve) => app.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
