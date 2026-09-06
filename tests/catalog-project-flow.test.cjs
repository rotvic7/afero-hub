const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { chromium } = require('../../kit-ia-builder/node_modules/playwright');
const { createProject, createServer } = require('../local-server.cjs');

test('the live map Panel remains the initial view before and after CSV import', async () => {
  const app = createServer();
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  const { port } = app.address();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
    assert.equal(await page.locator('#view-painel.on').count(), 1);
    await page.locator('#csvInput').setInputFiles(path.resolve(__dirname, '../../output/playwright/sample-hunter.csv'));
    await page.reload({ waitUntil: 'load' });
    await page.locator('#view-painel.on').waitFor({ timeout: 1500 });
    assert.equal(await page.locator('[data-view="painel"]').getAttribute('aria-selected'), 'true');
  } finally {
    await browser.close();
    await new Promise((resolve) => app.close(resolve));
  }
});

test('the Panel starts the hunting onboarding without the former 3D map', async () => {
  const app = createServer();
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  const { port } = app.address();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
    assert.equal(await page.locator('#orbitShell').count(), 0);
    await page.locator('[data-view="painel"]').click();
    await page.locator('#panelOnboarding').waitFor();
    assert.equal(await page.locator('[data-start-hunt]').count(), 1);
    assert.equal(await page.locator('[data-import-now]').count(), 1);
    await page.locator('[data-start-hunt]').click();
    assert.equal(await page.locator('#view-comece.on').count(), 1);
  } finally {
    await browser.close();
    await new Promise((resolve) => app.close(resolve));
  }
});

test('a selected demonstration offer requires an account before opening the project form', async () => {
  const app = createServer();
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  const { port } = app.address();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
    await page.locator('[data-view="painel"]').click();
    await page.locator('.offer').first().click();
    await page.locator('#xrModel').click();
    await assert.doesNotReject(() => page.locator('#authModal').waitFor({ timeout: 1500 }));
    assert.equal(await page.locator('#projectModal.on').count(), 0);
  } finally {
    await browser.close();
    await new Promise((resolve) => app.close(resolve));
  }
});

test('the hub lists a copy ready for approval and unlocks the page stage', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hunter-hub-ui-'));
  const project = createProject({
    rootDir: root,
    offer: { title: 'Oferta de aprovação', url: 'https://example.test/oferta' },
    brief: { projectName: 'Aprovação no Hub', audience: 'Público', problem: 'Problema', promise: 'Promessa', rightsConfirmed: true }
  });
  const statePath = path.join(project.path, 'projeto.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  state.status = 'copy-em-revisao';
  state.artifacts.copy = 'resultados/copy/copy-v1.md';
  fs.writeFileSync(path.join(project.path, state.artifacts.copy), '# Copy pronta\n', 'utf8');
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

  const app = createServer({ rootDir: root });
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  const { port } = app.address();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
    await page.locator('[data-view="comece"]').click();
    await page.locator('#localProjects .local-project').waitFor({ timeout: 1500 });
    await page.locator('[data-approve-copy]').click();
    await page.locator('.local-project-status').filter({ hasText: 'Página pronta para executar' }).waitFor({ timeout: 1500 });
    const updated = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.equal(updated.status, 'pagina-pronta-para-execucao');
  } finally {
    await browser.close();
    await new Promise((resolve) => app.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
