const assert = require('node:assert/strict');
const test = require('node:test');
const { chromium } = require('../../kit-ia-builder/node_modules/playwright');
const { createServer } = require('../local-server.cjs');

async function withHub(callback, prepare) {
  const app = createServer();
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    if (prepare) await prepare(page);
    await page.goto(`http://127.0.0.1:${app.address().port}/index.html`, { waitUntil: 'load' });
    await callback(page);
  } finally {
    await browser.close();
    await new Promise((resolve) => app.close(resolve));
  }
}

test('keeps the demonstration identifiable and exposes an accessible account dialog', async () => {
  await withHub(async (page) => {
    await page.locator('#demoBanner').waitFor();
    assert.match(await page.locator('#demoBanner').textContent(), /BASE DEMONSTRATIVA/);
    assert.equal(await page.locator('#workspaceSelect').isVisible(), false);
    await page.locator('#accountButton').click();
    assert.equal(await page.locator('#authModal').getAttribute('role'), 'dialog');
    assert.equal(await page.locator('#authModal').getAttribute('aria-modal'), 'true');
    assert.equal(await page.locator('#authEmail').count(), 1);
    assert.equal(await page.locator('#authPassword').getAttribute('minlength'), '12');
  });
});

test('signing in loads the first workspace without carrying demonstration flags', async () => {
  await withHub(async (page) => {
    await page.evaluate(() => localStorage.setItem('afero-hub-flags', JSON.stringify({ 'demo.test': 'saved' })));
    await page.locator('#accountButton').click();
    await page.locator('#authEmail').fill('pessoa@example.test');
    await page.locator('#authPassword').fill('senha-com-doze');
    await page.locator('#authSubmit').click();
    await page.locator('#workspaceSelect').waitFor();
    assert.equal(await page.locator('#workspaceSelect').inputValue(), '11111111-1111-4111-8111-111111111111');
    assert.equal(await page.locator('#accountButton').textContent(), 'Pessoa');
    assert.equal(await page.locator('#demoBanner').isVisible(), false);
    assert.equal(await page.evaluate(() => localStorage.getItem('afero-hub-flags')), JSON.stringify({ 'demo.test': 'saved' }));
  }, async (page) => {
    await page.route('**/afero-cloud-config.js*', (route) => route.fulfill({ contentType: 'application/javascript', body: "window.AFERO_CLOUD_CONFIG={supabaseUrl:'https://demo.supabase.co',publishableKey:'sb_publishable_demo',redirectUrl:'https://demo.test/hunter-hub/index.html'};" }));
    await page.addInitScript(() => {
      const user = { id: 'u1', email: 'pessoa@example.test', user_metadata: { full_name: 'Pessoa' } };
      const session = { user };
      window.__AFERO_SUPABASE_FACTORY__ = () => ({
        auth: {
          getSession: async () => ({ data: { session: null }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          signInWithPassword: async () => ({ data: { session, user }, error: null }),
          signOut: async () => ({ error: null }),
          signUp: async () => ({ data: { session: null, user }, error: null }),
          signInWithOAuth: async () => ({ data: {}, error: null }),
          resetPasswordForEmail: async () => ({ data: {}, error: null }),
          updateUser: async () => ({ data: { user }, error: null })
        },
        from: () => ({
          select() { return this; }, order() { return this; }, eq() { return this; }, limit() { return this; }, abortSignal() { return this; },
          then(resolve) { return Promise.resolve({ data: [{ role: 'editor', workspace: { id: '11111111-1111-4111-8111-111111111111', name: 'Pessoal', slug: 'pessoal' } }], count: 0, error: null }).then(resolve); }
        })
      });
    });
  });
});

test('the authenticated catalog keeps a paginated cloud sample separate from the demonstration', async () => {
  await withHub(async (page) => {
    await page.locator('#accountButton').click();
    await page.locator('#authEmail').fill('pessoa@example.test');
    await page.locator('#authPassword').fill('senha-com-doze');
    await page.locator('#authSubmit').click();
    await page.locator('#catalogLoadMore').waitFor();
    assert.match(await page.locator('#catalogTotal').textContent(), /101/);
    assert.match(await page.locator('#catalogSampleLabel').textContent(), /amostra carregada/);
    assert.equal(await page.locator('#grid .offer').count(), 100);
    assert.equal(await page.locator('#catalogLoadMore').isVisible(), true);
    assert.equal(await page.locator('body').getByText(/anúncio ativo|ads ativos|com anúncio ativo/i).count(), 0);
  }, async (page) => {
    await page.route('**/afero-cloud-config.js*', (route) => route.fulfill({ contentType: 'application/javascript', body: "window.AFERO_CLOUD_CONFIG={supabaseUrl:'https://demo.supabase.co',publishableKey:'sb_publishable_demo',redirectUrl:'https://demo.test/hunter-hub/index.html'};" }));
    await page.addInitScript(() => {
      const workspaceId = '11111111-1111-4111-8111-111111111111';
      const user = { id: 'u1', email: 'pessoa@example.test', user_metadata: { full_name: 'Pessoa' } };
      const session = { user };
      const rows = Array.from({ length: 101 }, (_, index) => ({
        id: `${String(index + 1).padStart(8, '0')}-0000-4000-8000-000000000000`, workspace_id: workspaceId,
        title: `Oferta ${index + 1}`, domain: `oferta-${index + 1}.test`, url_final: `https://oferta-${index + 1}.test`,
        score: 100 - index, priority: 'high', niche: 'saas', recurrence_count: index === 0 ? 2 : 1,
        first_seen_at: '2026-01-01T00:00:00.000Z', last_seen_at: `2026-01-01T00:00:${String(index % 60).padStart(2, '0')}.000Z`,
        signals: { pixel_ads: index === 0 ? 'sim' : 'nao', vsl: 'sim', quiz: 'sim', mrr: 'sim', escalado: index === 0 ? 'sim' : 'nao', new_builder: index === 0 ? 'sim' : 'nao', language: 'pt-BR' },
        ads_url: 'https://www.facebook.com/ads/library/?q=oferta', status: 'new', user_notes: '', tags: []
      }));
      function queryFor(table) {
        return {
          select() { return this; }, order() { return this; }, eq() { return this; }, limit() { return this; }, abortSignal() { return this; },
          then(resolve) {
            return Promise.resolve(table === 'workspace_members'
              ? { data: [{ role: 'editor', workspace: { id: workspaceId, name: 'Pessoal', slug: 'pessoal' } }], count: 0, error: null }
              : { data: rows, count: 101, error: null }
            ).then(resolve);
          }
        };
      }
      window.__AFERO_SUPABASE_FACTORY__ = () => ({
        auth: {
          getSession: async () => ({ data: { session: null }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          signInWithPassword: async () => ({ data: { session, user }, error: null }), signOut: async () => ({ error: null }),
          signUp: async () => ({ data: { session: null, user }, error: null }), signInWithOAuth: async () => ({ data: {}, error: null }), resetPasswordForEmail: async () => ({ data: {}, error: null }), updateUser: async () => ({ data: { user }, error: null })
        },
        from: queryFor
      });
    });
  });
});

test('account controls fit a mobile viewport with visible focus targets', async () => {
  const app = createServer();
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  try {
    await page.goto(`http://127.0.0.1:${app.address().port}/index.html`, { waitUntil: 'load' });
    await page.locator('#accountButton').click();
    const dom = await page.evaluate(() => {
      const modal = document.querySelector('#authModal').getBoundingClientRect();
      const primary = document.querySelector('#authSubmit').getBoundingClientRect();
      const focused = document.activeElement;
      return { viewport: innerWidth, width: document.documentElement.scrollWidth, modalTop: modal.top, modalBottom: modal.bottom, primaryHeight: primary.height, focused: focused && focused.id };
    });
    assert.equal(dom.width, dom.viewport);
    assert.ok(dom.modalTop >= 0 && dom.modalBottom <= 812);
    assert.ok(dom.primaryHeight >= 44);
    assert.equal(dom.focused, 'authEmail');
  } finally {
    await browser.close();
    await new Promise((resolve) => app.close(resolve));
  }
});
