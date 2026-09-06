const assert = require('node:assert/strict');
const test = require('node:test');
const { chromium } = require('../../kit-ia-builder/node_modules/playwright');
const { createServer } = require('../local-server.cjs');

async function withHub(viewport, callback, reducedMotion = 'no-preference') {
  const app = createServer();
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport, reducedMotion });
  try {
    await page.goto(`http://127.0.0.1:${app.address().port}/index.html`, { waitUntil: 'load' });
    await callback(page);
  } finally {
    await browser.close();
    await new Promise((resolve) => app.close(resolve));
  }
}

test('new sessions open on the live map panel with the official navigation', async () => {
  await withHub({ width: 1280, height: 900 }, async (page) => {
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.locator('#view-painel.on').count(), 1);
    assert.equal(await page.locator('[data-view="painel"]').getAttribute('aria-selected'), 'true');
    const labels = (await page.locator('.tabs [data-view]').allTextContents()).map((value) => value.replace(/\s+/g, ' ').trim());
    assert.match(labels[0], /^Mapa Vivo & Painel \d+$/);
    assert.deepEqual(labels.slice(1), ['Comece Aqui', 'Arsenal de Agentes 3']);
    assert.equal(await page.locator('[data-import-topbar]').count(), 1);
  });
});

test('the first fold gives the live map visual priority', async () => {
  await withHub({ width: 1280, height: 900 }, async (page) => {
    const geometry = await page.evaluate(() => {
      const hero = document.querySelector('#orbitHero').getBoundingClientRect();
      const map = document.querySelector('#liveMapShell').getBoundingClientRect();
      return { heroTop: hero.top, heroHeight: hero.height, mapWidth: map.width, viewportWidth: innerWidth };
    });
    assert.ok(geometry.heroTop < 180);
    assert.ok(geometry.heroHeight > 560);
    assert.ok(geometry.mapWidth > geometry.viewportWidth * 0.4);
  });
});

test('orbit stage keeps its forest surface and positioned HTML overlays', async () => {
  await withHub({ width: 1280, height: 900 }, async (page) => {
    const styles = await page.evaluate(() => {
      const hero = getComputedStyle(document.querySelector('.panel-onboarding'));
      const secondary = getComputedStyle(document.querySelector('.onboarding-actions .btn:not(.hot)'));
      return {
        heroBackground: hero.backgroundImage,
        secondaryColor: secondary.color,
        secondaryBackground: secondary.backgroundColor,
        labelsPosition: getComputedStyle(document.querySelector('.live-map-labels')).position,
        labelStrong: getComputedStyle(document.querySelector('.live-map-label strong')).display,
        legendDisplay: getComputedStyle(document.querySelector('.live-map-legend')).display
      };
    });
    assert.match(styles.heroBackground, /33, 52, 44/);
    assert.notEqual(styles.secondaryColor, styles.secondaryBackground);
    assert.equal(styles.labelsPosition, 'absolute');
    assert.equal(styles.labelStrong, 'block');
    assert.equal(styles.legendDisplay, 'flex');
  });
});

test('mobile editorial interface has no horizontal overflow', async () => {
  await withHub({ width: 375, height: 812 }, async (page) => {
    await page.locator('[data-view="painel"]').click();
    const widths = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    assert.equal(widths.document, widths.viewport);
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
    assert.equal(await page.locator('.hunt-stage-card').first().evaluate((el) => getComputedStyle(el).transform === 'none'), true);
    const order = await page.evaluate(() => ({
      map: Number(getComputedStyle(document.querySelector('.live-map-shell')).order),
      copy: Number(getComputedStyle(document.querySelector('.onboarding-copy')).order)
    }));
    assert.ok(order.map < order.copy);
  }, 'reduce');
});

test('the local motion module exposes an idempotent public interface', async () => {
  await withHub({ width: 1280, height: 900 }, async (page) => {
    const motion = await page.evaluate(() => ({
      hasGsap: typeof window.gsap !== 'undefined',
      hasScrollTrigger: typeof window.ScrollTrigger !== 'undefined',
      methods: window.AferoMotion ? ['init', 'refresh', 'destroy', 'activateCard'].filter((name) => typeof window.AferoMotion[name] === 'function') : []
    }));
    assert.equal(motion.hasGsap, true);
    assert.equal(motion.hasScrollTrigger, true);
    assert.deepEqual(motion.methods, ['init', 'refresh', 'destroy', 'activateCard']);
  });
});

test('the orbit stage keeps its forest atmosphere across saved theme preferences', async () => {
  await withHub({ width: 1280, height: 900 }, async (page) => {
    await page.evaluate(() => localStorage.setItem('afero-hub-theme', 'dark'));
    await page.reload({ waitUntil: 'load' });
    const colors = await page.locator('#liveMapShell').evaluate((element) => {
      const style = getComputedStyle(element);
      return { foreground: style.color, background: style.backgroundImage };
    });
    assert.match(colors.foreground, /238, 244, 233|247, 246, 241/);
    assert.match(colors.background, /33, 52, 44|16, 37, 29|9, 24, 18|20, 45, 36|14, 33, 26/);
  });
});

test('official type system is assigned by role', async () => {
  await withHub({ width: 1280, height: 900 }, async (page) => {
    const fonts = await page.evaluate(() => ({
      brand: getComputedStyle(document.querySelector('.brand-name')).fontFamily,
      body: getComputedStyle(document.body).fontFamily,
      tab: getComputedStyle(document.querySelector('.tab')).fontFamily,
      metric: getComputedStyle(document.querySelector('.stat-n')).fontFamily
    }));
    assert.match(fonts.brand, /Unbounded/i);
    assert.match(fonts.body, /Manrope/i);
    assert.match(fonts.tab, /Hanken Grotesk/i);
    assert.match(fonts.metric, /Space Mono/i);
  });
});

/* O Hub passou a ter tema único (claro). O que precisa ser garantido não é mais
   a diferença entre dois temas, e sim que os rótulos da navegação continuem
   legíveis sobre o vidro escuro: era exatamente aí que o tema escuro removido
   pintava texto escuro sobre fundo escuro. */
test('navigation shell keeps readable labels over the forest glass', async () => {
  await withHub({ width: 1280, height: 900 }, async (page) => {
    const luminance = (rgb) => {
      const values = rgb.match(/[\d.]+/g).slice(0, 3).map(Number);
      return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
    };

    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');

    const cores = await page.evaluate(() => {
      const shell = getComputedStyle(document.querySelector('.editorial-nav-shell'));
      const abas = [...document.querySelectorAll('.tab')].map((aba) => getComputedStyle(aba).color);
      return { shell: shell.backgroundColor, abas };
    });

    // Vidro escuro preservado.
    assert.ok(luminance(cores.shell) < 80, `nav clara demais: ${cores.shell}`);
    // Todo rótulo precisa ser claro o bastante para ler sobre esse vidro.
    assert.ok(cores.abas.length >= 2);
    cores.abas.forEach((cor) => {
      assert.ok(luminance(cor) > 120, `rótulo sem contraste na nav: ${cor}`);
    });
  });
});

test('a saved dark preference no longer forces the removed dark theme', async () => {
  await withHub({ width: 1280, height: 900 }, async (page) => {
    await page.evaluate(() => localStorage.setItem('afero-hub-theme', 'dark'));
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(750);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
    assert.equal(await page.evaluate(() => localStorage.getItem('afero-hub-theme')), null);
    assert.equal(await page.locator('#themeToggle').count(), 0);
  });
});

test('live map starts with three agents and no demonstration offers', async () => {
  await withHub({ width: 1280, height: 900 }, async (page) => {
    await page.locator('[data-view="painel"]').click();
    await page.waitForFunction(() => window.AferoLiveMap && window.AferoLiveMap.getMetrics().ready);
    const metrics = await page.evaluate(() => window.AferoLiveMap.getMetrics());
    const labels = await page.locator('[data-map-agent-label] strong').allTextContents();
    assert.equal(metrics.agents, 3);
    assert.equal(metrics.offers, 0);
    assert.deepEqual(labels.map((label) => label.trim()), ['Caçador', 'Copywriter', 'Páginas']);
    assert.equal(await page.locator('#liveMapShell').getAttribute('data-map-state'), 'empty');
  });
});

test('selecting an agent focuses its routes and opens the contextual drawer', async () => {
  await withHub({ width: 1280, height: 900 }, async (page) => {
    await page.waitForFunction(() => window.AferoLiveMap && window.AferoLiveMap.getMetrics().ready);
    await page.evaluate(() => window.AferoLiveMap.focusAgent('copywriter'));
    await page.locator('#agentDrawer[data-agent="copywriter"].on').waitFor();
    const metrics = await page.evaluate(() => window.AferoLiveMap.getMetrics());
    assert.equal(metrics.selectedAgent, 'copywriter');
    assert.equal(await page.locator('#agentDrawerTitle').textContent(), 'Agente Copywriter');
  });
});

test('reduced motion is exposed by the map runtime', async () => {
  await withHub({ width: 390, height: 844 }, async (page) => {
    await page.waitForFunction(() => window.AferoLiveMap && window.AferoLiveMap.getMetrics().ready);
    assert.equal((await page.evaluate(() => window.AferoLiveMap.getMetrics())).reducedMotion, true);
  }, 'reduce');
});

test('the panel orders orbit, telemetry, import bench and catalog', async () => {
  await withHub({ width: 1280, height: 900 }, async (page) => {
    const order = await page.locator('#view-painel').evaluate((panel) =>
      ['orbitHero', 'telemetry', 'drop', 'grid'].map((id) => {
        const element = panel.querySelector(`#${id}`);
        return { id, top: element.getBoundingClientRect().top };
      })
    );
    assert.ok(order[0].top < order[1].top);
    assert.ok(order[1].top < order[2].top);
    assert.ok(order[2].top < order[3].top);
  });
});

test('topbar import opens the existing CSV input', async () => {
  await withHub({ width: 1280, height: 900 }, async (page) => {
    await page.evaluate(() => {
      window.__csvClicked = false;
      document.querySelector('#csvInput').addEventListener('click', () => { window.__csvClicked = true; }, { once: true });
    });
    await page.locator('[data-import-topbar]').click();
    assert.equal(await page.evaluate(() => window.__csvClicked), true);
  });
});

test('WebGL fallback keeps an HTML constellation and import action accessible', async () => {
  await withHub({ width: 1280, height: 900 }, async (page) => {
    await page.evaluate(() => {
      window.AferoLiveMap.destroy();
      window.THREE = null;
      window.AferoLiveMap.mount({ canvas: document.querySelector('#aferoLiveMap') });
    });
    assert.equal(await page.locator('#liveMapShell').getAttribute('data-map-state'), 'fallback');
    assert.equal(await page.locator('.live-map-fallback').isVisible(), true);
    assert.deepEqual(
      await page.locator('.fallback-agent strong').allTextContents(),
      ['Caçador', 'Copywriter', 'Páginas']
    );
    assert.equal(await page.locator('[data-import-topbar]').isVisible(), true);
  });
});

test('CSV import and search filters feed the live map with real offers', async () => {
  await withHub({ width: 1280, height: 900 }, async (page) => {
    await page.locator('[data-view="painel"]').click();
    await page.waitForFunction(() => window.AferoLiveMap && window.AferoLiveMap.getMetrics().ready);
    const csv = [
      'titulo,dominio,url,score,nicho,query',
      'Oferta Alfa,alfa.test,https://alfa.test,10,saude,combo_hotmart_meta',
      'Oferta Beta,beta.test,https://beta.test,7,financas,checkout_kiwify'
    ].join('\n');
    await page.locator('#csvInput').setInputFiles({ name: 'fixture.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await page.locator('#authUseDemo').click();
    await page.waitForFunction(() => window.AferoLiveMap.getMetrics().offers === 2);
    assert.equal(await page.locator('#liveMapShell').getAttribute('data-map-state'), 'populated');

    await page.locator('#q').fill('Alfa');
    await page.waitForFunction(() => window.AferoLiveMap.getMetrics().offers === 1);
    assert.equal(await page.locator('#liveMapCount').textContent(), '1 oferta em órbita');
  });
});
