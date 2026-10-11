const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const { chromium } = require(process.env.AFERO_PLAYWRIGHT_MODULE || '../../kit-ia-builder/node_modules/playwright');
const root = path.resolve(process.env.AFERO_TEST_ROOT || path.join(__dirname, '..'));
const pagePath = fs.existsSync(path.join(root, 'hub.html')) ? 'hub.html' : 'index.html';
const profile = { aggressiveness: 'grey', niches: ['saude_emagrecimento'], vehicle: 'vsl', strength: 'traffic' };
const workspaceId = '11111111-1111-4111-8111-111111111111';
const hostileTitle = '<img src=x onerror="window.__xrayXss=1">';
const offers = [
  { title: hostileTitle, signals: { gateway: 'hotmart', tracker: 'utmify', vsl_player: 'sim', pixel_ads: true } },
  { title: 'Referência com quiz', signals: { funnel_quiz: true, subscription_verified: 1 } },
  { title: 'Referência com billing', signals: { billing_tech_detected: 'yes' } }
].map((offer, i) => ({
  id: String(i + 1).padStart(8, '0') + '-0000-4000-8000-000000000000',
  workspace_id: workspaceId, fingerprint: String(i + 1).padStart(64, '0'),
  domain: `referencia-${i}.example.com`, url_final: `https://referencia-${i}.example.com/curso`,
  niche: 'saude_emagrecimento', score: 9 - i, priority: 'S', recurrence_count: i + 2,
  status: 'new', last_seen_at: '2026-10-10T12:00:00Z', ...offer
}));
const favorite = {
  offer_fingerprint: 'f'.repeat(64), source_domain: 'original.example.com',
  source_url: 'https://original.example.com/curso', source_title: 'Somente referência', offer: null
};

async function hub(run) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.webp': 'image/webp' };
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://**', route => route.abort());
    await page.route('**/afero-cloud-config.js*', route => route.fulfill({ contentType: 'application/javascript', body: 'window.AFERO_CLOUD_CONFIG={};' }));
    await page.route('**/afero-cloud.js*', route => route.fulfill({ contentType: 'application/javascript', body: `
      const user={id:'xray-reader',email:'reader@example.com'};
      const offers=${JSON.stringify(offers)},favorite=${JSON.stringify(favorite)};
      window.AferoCloud={create:()=>({
        initialize:async()=>({enabled:true,session:{user},user}),
        listWorkspaces:async()=>[{workspaceId:${JSON.stringify(workspaceId)},name:'Base',role:'viewer'}],
        hasPaidAccess:async()=>true,
        listOffers:async()=>({items:offers,total:offers.length,nextCursor:null}),
        listFavorites:async()=>({items:[favorite],nextCursor:null}),
        listOfferObservations:async()=>[],markFavoriteReviewed:async()=>({})
      })};
    ` }));
    await page.addInitScript(p => {
      localStorage.setItem('afero_radar_profile', JSON.stringify(p));
      localStorage.setItem('afero_radar_profile:xray-reader', JSON.stringify(p));
      window.__copiedRoteiro = '';
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.__copiedRoteiro = text; } } });
    }, profile);
    await page.goto(`http://127.0.0.1:${server.address().port}/${pagePath}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.hub-offer');
    await run(page);
    assert.deepEqual(errors, [], 'No browser JavaScript exceptions');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

test('inline JavaScript parses', () => {
  const html = fs.readFileSync(path.join(root, pagePath), 'utf8');
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=|application\/(?:ld\+json|json)/i.test(match[1]) && match[2].trim()) new vm.Script(match[2]);
  }
});

test('Raio X uses actual offer signals and guides the reader through their own remodeling', async () => hub(async page => {
  const texts = [];
  for (const offer of offers) {
    await page.locator('.hub-offer').filter({ hasText: offer.domain }).locator('[data-inspect]').click();
    await page.locator('#xrBody summary').click();
    const text = await page.locator('#xrScript').textContent();
    texts.push(text);
    assert.ok(text.includes(offer.domain));
    assert.ok(text.includes(offer.url_final));
    assert.ok(text.includes(`Observações na coleta: ${offer.recurrence_count}x vista`));
    assert.match(text, /ângulo esquecido/);
    assert.match(text, /BRIEFING DA SUA PRÓPRIA OFERTA/);
    assert.match(text, /a você, usuário do Afero Hub/);
    assert.match(text, /não comprovam vendas, faturamento ou anúncios ativos/);
    assert.doesNotMatch(text, /dono da|Sua oferta já converte|método validado/i);
    await page.locator('#xrClose').click();
  }
  assert.match(texts[0], /player de vídeo/);
  assert.doesNotMatch(texts[0], /A coleta indica um quiz|registra assinatura verificada/);
  assert.match(texts[1], /A coleta indica um quiz/);
  assert.match(texts[1], /entrega contínua e cancelamento/);
  assert.doesNotMatch(texts[1], /player de vídeo/);
  assert.match(texts[2], /esse sinal sozinho não confirma cobrança recorrente/);
  assert.doesNotMatch(texts[2], /registra assinatura verificada/);
}));

test('source-only favorites retain an honest, copyable reflection guide', async () => hub(async page => {
  await page.locator('#favoritesFilter').click();
  await page.locator('.hub-offer').filter({ hasText: favorite.source_domain }).locator('[data-inspect]').click();
  assert.equal(await page.locator('#xrBody summary').count(), 1);
  assert.equal(await page.locator('#xrBody summary').textContent(), 'O que fazer com essa oferta');
  await page.locator('#xrBody summary').click();
  const text = await page.locator('#xrScript').textContent();
  assert.match(text, /apenas a referência original/);
  assert.match(text, /Nicho da coleta: Não informado/);
  assert.match(text, /Score: Sem base acessível/);
  assert.match(text, /Público e situação que você quer atender/);
  await page.locator('#xrCopy').click();
  assert.equal(await page.evaluate(() => window.__copiedRoteiro), text);
  assert.equal(await page.locator('#xrSite').getAttribute('href'), favorite.source_url);
}));

test('offer titles remain text in both the drawer and copied guide', async () => hub(async page => {
  await page.locator('.hub-offer').filter({ hasText: offers[0].domain }).locator('[data-inspect]').click();
  await page.locator('#xrBody summary').click();
  assert.ok((await page.locator('#xrScript').textContent()).includes(hostileTitle));
  assert.equal(await page.locator('#xrScript img').count(), 0);
  assert.equal(await page.evaluate(() => window.__xrayXss), undefined);
  await page.locator('#xrCopy').click();
  assert.ok((await page.evaluate(() => window.__copiedRoteiro)).includes(hostileTitle));
}));
