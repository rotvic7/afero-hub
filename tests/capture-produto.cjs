const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('C:/Users/victo/OwnProject-VictorNeiva/kit-ia-builder/node_modules/playwright');
const { createServer } = require('C:/Users/victo/OwnProject-VictorNeiva/hunter-hub/local-server.cjs');

const reviewDir = 'C:/Users/victo/OwnProject-VictorNeiva/hunter-hub/.impeccable/review';
fs.mkdirSync(reviewDir, { recursive: true });

const csv = [
  'titulo,dominio,url,score,nicho,query',
  'Protocolo Vital 21 Dias,vital.test,https://vital.test,11,saude,combo_hotmart_meta',
  'Método Atlas de Renda,atlas.test,https://atlas.test,9,financas,combo_kiwify_utmi',
  'Clube Orbe Concursos,orbe.test,https://orbe.test,7,educacao,checkout_hotmart',
  'Plano Raiz Bem-Estar,raiz.test,https://raiz.test,4,bem-estar,pixel_meta',
  'Carteira Black Cripto,black.test,https://black.test,10,financas,combo_kirvano_meta',
  'Secagem Express,secar.test,https://secar.test,6,emagrecimento,checkout_kiwify'
].join('\n');

(async () => {
  const app = createServer();
  await new Promise((r) => app.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push('console: ' + m.text());
  });

  const shot = async (selector, name) => {
    const el = page.locator(selector).first();
    if (!(await el.count())) { errors.push('sem elemento: ' + selector); return; }
    await el.screenshot({ path: path.join(reviewDir, name + '.png') });
  };

  try {
    await page.goto(`http://127.0.0.1:${app.address().port}/index.html`, { waitUntil: 'load' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
    await page.locator('[data-view="painel"]').click();
    await page.waitForFunction(() => window.AferoLiveMap && window.AferoLiveMap.getMetrics().ready);
    await page.locator('#csvInput').setInputFiles({ name: 'v.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await page.waitForFunction(() => window.AferoLiveMap.getMetrics().offers === 6);
    await page.waitForTimeout(900);

    for (const tema of ['light', 'dark']) {
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
        if (window.AferoLiveMap) window.AferoLiveMap.updateTheme();
      }, tema);
      await page.waitForTimeout(900);

      await page.locator('[data-view="painel"]').click();
      await page.waitForTimeout(500);
      await shot('.stats', 'p-kpis-' + tema);
      await shot('.rail', 'p-rail-' + tema);
      await shot('.filters', 'p-filtros-' + tema);
      await shot('.tools', 'p-busca-' + tema);
      await shot('.grid', 'p-ofertas-' + tema);
      await shot('.drop', 'p-drop-' + tema);

      await page.locator('.offer').first().click();
      await page.waitForTimeout(700);
      await shot('#xray', 'p-raiox-' + tema);
      await page.locator('#xrClose').click();
      await page.waitForTimeout(450);

      await page.locator('[data-view="agentes"]').click();
      await page.waitForTimeout(700);
      await shot('.triade', 'p-agentes-' + tema);

      await page.locator('[data-view="comece"]').click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(reviewDir, 'p-inicio-' + tema + '.png') });
    }

    // Estados de interacao no card de agente
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    await page.locator('[data-view="agentes"]').click();
    await page.waitForTimeout(600);
    await page.locator('.agent').first().hover();
    await page.waitForTimeout(400);
    await shot('.triade', 'p-agentes-hover-light');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await shot('.triade', 'p-agentes-mobile');
    await page.locator('[data-view="painel"]').click();
    await page.waitForTimeout(600);
    await shot('.filters', 'p-filtros-mobile');

    const relatorio = await page.evaluate(() => {
      const cs = (sel, prop) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el)[prop] : 'AUSENTE';
      };
      return {
        overflow: { viewport: innerWidth, document: document.documentElement.scrollWidth },
        triade: cs('.triade', 'display') + ' / ' + cs('.triade', 'gridTemplateColumns'),
        agentSpecsSpan: cs('.agent-specs span', 'display') + ' / ' + cs('.agent-specs span', 'gridTemplateColumns'),
        agentPadding: cs('.agent', 'padding'),
        agentRadius: cs('.agent', 'borderRadius'),
        agentShadow: cs('.agent', 'boxShadow'),
        statN: cs('.stat-n', 'fontFamily') + ' / ' + cs('.stat-n', 'fontVariantNumeric'),
        btnRadius: cs('.agent-act', 'borderRadius'),
        offerShadow: cs('.offer', 'boxShadow')
      };
    });
    process.stdout.write(JSON.stringify({ relatorio, errors }, null, 2) + '\n');
    if (errors.length) process.exitCode = 1;
  } finally {
    await browser.close();
    await new Promise((r) => app.close(r));
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
