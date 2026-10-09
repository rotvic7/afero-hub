const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('../../kit-ia-builder/node_modules/playwright');
const http = require('node:http');
const config = require('../vercel.json');

function allFiles(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = prefix + entry.name;
    return entry.isDirectory() ? allFiles(path.join(directory, entry.name), name + '/') : [name];
  }).sort();
}

// Exercise the generated artifact, with the same exact routes and CSP as Vercel.
function serveBuild(output) {
  const headers = Object.fromEntries(config.headers[0].headers.map(({ key, value }) => [key, value]));
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
  return http.createServer((req, res) => {
    let pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname.endsWith('/') && pathname !== '/') {
      res.writeHead(308, { Location: pathname.slice(0, -1) });
      res.end();
      return;
    }
    const rewrite = config.rewrites.find(({ source }) => source === pathname);
    pathname = rewrite ? rewrite.destination : pathname === '/' ? '/index.html' : pathname;
    const file = path.resolve(output, '.' + decodeURIComponent(pathname));
    const relative = path.relative(output, file);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { ...headers, 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
}

test('public build contains the LP, Hub, local fonts and supplied product images', async () => {
  const { buildPublic, publicPaths, verifyPublicAssets } = await import('../scripts/build-public.mjs');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'afero-public-test-'));
  try {
    const output = buildPublic(path.join(scratch, 'site'));
    assert.match(fs.readFileSync(path.join(output, 'index.html'), 'utf8'), /Chega de pagar para começar do zero/);
    assert.match(fs.readFileSync(path.join(output, 'hub.html'), 'utf8'), /id="accountButton"/);
    assert.ok(fs.existsSync(path.join(output, 'privacidade.html')));
    assert.ok(fs.existsSync(path.join(output, 'vendor', 'supabase.js')));
    assert.ok(fs.existsSync(path.join(output, 'prints', 'hub-grade.webp')));
    assert.ok(fs.existsSync(path.join(output, 'assets', 'fonts', 'manrope-600.ttf')));
    assert.ok(fs.existsSync(path.join(output, 'assets', 'fonts', 'Satoshi-Variable.woff2')));
    assert.ok(fs.existsSync(path.join(output, 'assets', 'images', 'afero-logo.png')));
    assert.deepEqual(allFiles(output), [...publicPaths].sort());
    assert.deepEqual(fs.readdirSync(path.join(output, 'prints')).sort(), fs.readdirSync(path.join(__dirname, '..', 'prints')).sort());
    for (const privatePath of ['local-server.cjs', 'AGENTS.md', 'backend', 'supabase', 'tests', 'docs', 'scripts', 'video', 'backups', '.env', '.vercel']) {
      assert.equal(fs.existsSync(path.join(output, privatePath)), false, privatePath);
    }
    assert.doesNotThrow(() => verifyPublicAssets(output));
    fs.unlinkSync(path.join(output, 'assets', 'fonts', 'manrope-600.ttf'));
    assert.throws(() => verifyPublicAssets(output), /Missing public dependency.*manrope-600\.ttf/);
    fs.writeFileSync(path.join(output, 'stale.html'), 'old page');
    buildPublic(output);
    assert.equal(fs.existsSync(path.join(output, 'stale.html')), false);
    assert.doesNotThrow(() => verifyPublicAssets(output));
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test('public build refuses to overwrite source files or an unowned directory', async () => {
  const { buildPublic } = await import('../scripts/build-public.mjs');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'afero-public-safety-'));
  try {
    const sentinel = path.join(scratch, 'keep.txt');
    fs.writeFileSync(sentinel, 'keep');
    assert.throws(() => buildPublic(path.resolve(__dirname, '..')), /Output must be a child/);
    assert.throws(() => buildPublic(scratch), /unowned output/);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'keep');
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test('Vercel publishes the generated folder with LP at the root and Hub at /hub', () => {
  assert.equal(config.outputDirectory, 'public-site-index');
  assert.equal(config.buildCommand, 'node scripts/build-public.mjs');
  assert.equal(config.framework, null);
  assert.equal(config.trailingSlash, false);
  assert.deepEqual(config.rewrites, [
    { source: '/hub', destination: '/hub.html' },
    { source: '/vendas', destination: '/index.html' }
  ]);
  const headers = Object.fromEntries(config.headers[0].headers.map(({ key, value }) => [key, value]));
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.match(headers['Content-Security-Policy'], /connect-src[^;]*supabase\.co/);
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
});

test('built pages load with production CSP and navigate between LP, Hub and privacy on desktop and mobile', async () => {
  const { buildPublic } = await import('../scripts/build-public.mjs');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'afero-public-browser-'));
  let app;
  let browser;
  try {
    const output = buildPublic(path.join(scratch, 'site'));
    app = serveBuild(output);
    await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true });
    const origin = `http://127.0.0.1:${app.address().port}`;
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      // Keep the proof offline; remote fonts fall back to supplied local fonts.
      await context.route('**/*', (route) => route.request().url().startsWith(origin)
        ? route.continue() : route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (/content security policy|refused to (load|execute|apply|connect)/i.test(message.text())) errors.push(message.text());
      });
      page.on('response', (response) => {
        if (response.url().startsWith(origin) && response.status() >= 400 && !new URL(response.url()).pathname.startsWith('/api/')) errors.push(`${response.status()} ${response.url()}`);
      });
      await page.goto(origin + '/', { waitUntil: 'load' });
      assert.equal(await page.locator('h1').count(), 1);
      assert.equal(await page.locator('#accountButton').count(), 0);
      assert.equal(await page.evaluate(() => document.fonts.check('600 16px Satoshi')), true);
      await page.locator('[data-niche="tecnologia"]').click();
      assert.equal(await page.locator('[data-niche="tecnologia"]').getAttribute('aria-pressed'), 'true');
      assert.match(await page.locator('.niche-result h3').textContent(), /Que tarefa fica mais simples/);
      await page.locator('.faq summary').first().click();
      assert.equal(await page.locator('.faq details').first().getAttribute('open'), '');
      if (viewport.width < 761) {
        await page.getByRole('button', { name: 'Abrir navegação' }).click();
        assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'true');
        await page.locator('#sales-navigation a[href="#como-funciona"]').click();
        assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'false');
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `LP overflow at ${viewport.width}px`);
      await page.getByRole('link', { name: 'Entrar no Hub', exact: true }).click();
      assert.equal(new URL(page.url()).pathname, '/hub');
      await page.locator('#accountButton').waitFor();
      assert.equal(await page.evaluate(() => window.AFERO_CLOUD_CONFIG.redirectUrl), origin + '/hub');
      await page.locator('#accountButton').click();
      assert.equal(await page.locator('#authModal').getAttribute('role'), 'dialog');
      await page.keyboard.press('Escape');
      await page.getByRole('link', { name: 'Conhecer o Afero Hub', exact: true }).click();
      assert.equal(new URL(page.url()).pathname, '/');
      await page.getByRole('link', { name: 'Privacidade', exact: true }).click();
      assert.ok(await page.getByRole('heading', { name: 'Privacidade no Afero Hub' }).isVisible());
      await page.getByRole('link', { name: 'Ir ao painel', exact: true }).click();
      assert.equal(new URL(page.url()).pathname, '/hub');
      await page.goto(origin + '/guia-funil-afero-hub.html', { waitUntil: 'load' });
      assert.ok(await page.locator('h1').isVisible());
      assert.deepEqual(errors, []);
      await context.close();
    }
    for (const pathname of ['/hub/', '/vendas', '/lp-afero-hub-vendas.html']) {
      assert.equal((await fetch(origin + pathname)).status, 200, pathname);
    }
    for (const pathname of ['/local-server.cjs', '/supabase/config.toml', '/AGENTS.md', '/.env', '/api/projects']) {
      assert.equal((await fetch(origin + pathname)).status, 404, pathname);
    }
  } finally {
    if (browser) await browser.close();
    if (app) await new Promise((resolve) => app.close(resolve));
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
