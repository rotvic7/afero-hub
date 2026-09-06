const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'afero-cloud.js'), 'utf8');
const editorialCss = fs.readFileSync(path.join(__dirname, '..', 'editorial.css'), 'utf8');

function loadCloud() {
  const window = {};
  class TestFormData {
    constructor() { this.entries = []; }
    append(name, value) { this.entries.push([name, value]); }
  }
  vm.runInNewContext(source, { window, URL, WeakMap, Error, Promise, Set, String, Object, Array, Number, Boolean, FormData: TestFormData });
  return window.AferoCloud;
}

function createFactory(overrides = {}) {
  const calls = { create: 0, oauth: [], signUp: [], reset: [], update: [], signOut: 0, workspaceQuery: null };
  const auth = {
    getSession: async () => ({ data: { session: overrides.session || null }, error: null }),
    onAuthStateChange: (callback) => ({ data: { subscription: { unsubscribe() {} } }, callback }),
    signUp: async (payload) => { calls.signUp.push(payload); return { data: { user: { id: 'u1' }, session: null }, error: null }; },
    signInWithPassword: async (payload) => ({ data: { user: { id: 'u1', email: payload.email }, session: { user: { id: 'u1' } } }, error: null }),
    signInWithOAuth: async (payload) => { calls.oauth.push(payload); return { data: { url: 'https://accounts.google.test' }, error: null }; },
    resetPasswordForEmail: async (...args) => { calls.reset.push(args); return { data: {}, error: null }; },
    updateUser: async (payload) => { calls.update.push(payload); return { data: { user: { id: 'u1' } }, error: null }; },
    signOut: async () => { calls.signOut += 1; return { error: null }; }
  };
  const factory = () => {
    calls.create += 1;
    return {
      auth,
      from: () => {
        const query = {
          select() { return query; },
          order() { return Promise.resolve({ data: [{ role: 'editor', created_at: '2026-01-01', workspace: { id: 'w1', name: 'Equipe', slug: 'equipe' } }], error: null }); }
        };
        calls.workspaceQuery = query;
        return query;
      }
    };
  };
  return { factory, calls, auth };
}

const validConfig = { supabaseUrl: 'https://demo.supabase.co', publishableKey: 'sb_publishable_example', redirectUrl: 'https://app.example.test/hub' };

test('keeps cloud messages UTF-8 and the auth modal on the current product tokens', () => {
  assert.doesNotMatch(source, /Ã|Â|�/);
  const cloudStart = editorialCss.indexOf('.cloud-demo,');
  const cloudEnd = editorialCss.indexOf('@media', cloudStart);
  assert.ok(cloudStart >= 0 && cloudEnd > cloudStart);
  const cloudCss = editorialCss.slice(cloudStart, cloudEnd);
  assert.match(cloudCss, /var\(--surface\)/);
  assert.match(cloudCss, /var\(--text-main\)/);
  assert.match(cloudCss, /var\(--accent(?:-bright)?\)/);
  assert.doesNotMatch(cloudCss, /var\(--editorial-(?:paper|ink|muted|teal|green|line|shadow|serif|ui|canvas)/);
});

test('fails closed for absent, secret, unsafe and foreign Supabase configurations', () => {
  const cloud = loadCloud();
  for (const config of [
    {},
    { ...validConfig, publishableKey: 'sb_secret_bad' },
    { ...validConfig, supabaseUrl: 'javascript:alert(1)' },
    { ...validConfig, supabaseUrl: 'https://evil.example.test' }
  ]) assert.equal(cloud.validateConfig(config).enabled, false);
  assert.equal(cloud.validateConfig({ ...validConfig, supabaseUrl: 'http://localhost:54321' }).enabled, true);
});

test('creates one PKCE client per factory and initializes auth state', async () => {
  const cloud = loadCloud();
  const { factory, calls } = createFactory({ session: { user: { id: 'u1' } } });
  const first = cloud.create({ config: validConfig, supabaseFactory: factory });
  const second = cloud.create({ config: validConfig, supabaseFactory: factory });
  assert.equal(first, second);
  const initialized = await first.initialize(() => {});
  assert.equal(calls.create, 1);
  assert.equal(initialized.enabled, true);
  assert.equal(initialized.user.id, 'u1');
});

test('uses exact Google scopes and password operations without identity merging', async () => {
  const cloud = loadCloud();
  const { factory, calls } = createFactory();
  const client = cloud.create({ config: validConfig, supabaseFactory: factory });
  await client.signInWithGoogle();
  await client.signUp({ email: 'user@example.test', password: 'long-password-123', fullName: 'Pessoa' });
  await client.sendPasswordReset('user@example.test');
  await client.updatePassword('new-password-123');
  assert.deepEqual(JSON.parse(JSON.stringify(calls.oauth[0])), { provider: 'google', options: { scopes: 'openid email profile', redirectTo: validConfig.redirectUrl } });
  assert.deepEqual(JSON.parse(JSON.stringify(calls.signUp[0])), { email: 'user@example.test', password: 'long-password-123', options: { data: { full_name: 'Pessoa' }, emailRedirectTo: validConfig.redirectUrl } });
  assert.deepEqual(JSON.parse(JSON.stringify(calls.reset[0])), ['user@example.test', { redirectTo: validConfig.redirectUrl }]);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.update[0])), { password: 'new-password-123' });
});

test('reports pending confirmation and clears local references at logout', async () => {
  const cloud = loadCloud();
  const { factory, calls } = createFactory();
  const client = cloud.create({ config: validConfig, supabaseFactory: factory });
  const signedUp = await client.signUp({ email: 'user@example.test', password: 'long-password-123', fullName: '' });
  assert.equal(signedUp.confirmationPending, true);
  await client.signInWithPassword({ email: 'user@example.test', password: 'long-password-123' });
  await client.signOut();
  assert.equal(calls.signOut, 1);
  assert.equal(client.currentSession(), null);
});

test('maps workspace memberships under RLS without using email as an identifier', async () => {
  const cloud = loadCloud();
  const { factory } = createFactory();
  const client = cloud.create({ config: validConfig, supabaseFactory: factory });
  assert.deepEqual(JSON.parse(JSON.stringify(await client.listWorkspaces())), [{ workspaceId: 'w1', name: 'Equipe', slug: 'equipe', role: 'editor' }]);
});

function offer(id, score, lastSeenAt, extra = {}) {
  return {
    id, workspace_id: '11111111-1111-4111-8111-111111111111', domain: 'example.test', url_final: 'https://example.test',
    title: 'Oferta', niche: 'saas', priority: 'high', score, signals: {}, screenshot_url: null, preview_url: null,
    ads_url: null, first_seen_at: '2026-01-01T00:00:00.000Z', last_seen_at: lastSeenAt, recurrence_count: 1,
    status: 'new', user_notes: '', tags: [], ...extra
  };
}

function createCatalogFactory(overrides = {}) {
  const calls = { offers: [], imports: [], signedUrls: [], updates: [] };
  const factory = () => ({
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
    },
    functions: {
      invoke: async (...args) => {
        calls.imports.push(args);
        return overrides.importResult || { data: { hunt_id: 'h1', request_id: 'req-import' }, error: null };
      }
    },
    storage: {
      from: (bucket) => ({
        createSignedUrl: async (path, expiresIn) => {
          calls.signedUrls.push({ bucket, path, expiresIn });
          return overrides.signedUrlResult || { data: { signedUrl: 'https://storage.test/signed' }, error: null };
        }
      })
    },
    from: (table) => {
      if (table !== 'offers') throw new Error(`unexpected table ${table}`);
      const query = {
        table, orders: [], filters: [], limitValue: null, abortSignalValue: null, count: null,
        select(columns, options) { this.columns = columns; this.count = options && options.count; return this; },
        eq(column, value) { this.filters.push(['eq', column, value]); return this; },
        contains(column, value) { this.filters.push(['contains', column, value]); return this; },
        gte(column, value) { this.filters.push(['gte', column, value]); return this; },
        ilike(column, value) { this.filters.push(['ilike', column, value]); return this; },
        or(value) { this.filters.push(['or', value]); return this; },
        order(column, options) { this.orders.push([column, options]); return this; },
        limit(value) { this.limitValue = value; return this; },
        abortSignal(value) { this.abortSignalValue = value; return this; },
        update(value) { calls.updates.push(value); this.updateValue = value; return this; },
        single: async () => overrides.decisionResult || { data: { id: 'offer-1', status: 'saved', user_notes: 'nota', tags: ['tag'] }, error: null },
        then(resolve, reject) { return Promise.resolve(overrides.offersResult || { data: [], count: 0, error: null }).then(resolve, reject); }
      };
      calls.offers.push(query);
      return query;
    }
  });
  return { factory, calls };
}

const catalogConfig = { supabaseUrl: 'https://catalog.supabase.co', publishableKey: 'sb_publishable_catalog' };
const workspaceId = '11111111-1111-4111-8111-111111111111';
const cursorId = '22222222-2222-4222-8222-222222222222';

test('loads exactly one 101-row keyset request, exposes 100 items and propagates abort', async () => {
  const rows = Array.from({ length: 101 }, (_, index) => offer(`${String(index + 1).padStart(8, '0')}-0000-4000-8000-000000000000`, 100 - index, `2026-01-01T00:00:${String(index).padStart(2, '0')}.000Z`));
  const { factory, calls } = createCatalogFactory({ offersResult: { data: rows, count: 250, error: null } });
  const client = loadCloud().create({ config: catalogConfig, supabaseFactory: factory });
  const controller = new AbortController();
  const result = await client.listOffers({ workspaceId, signal: controller.signal });
  const query = calls.offers[0];
  assert.equal(result.items.length, 100);
  assert.deepEqual(JSON.parse(JSON.stringify(result.nextCursor)), { score: 1, lastSeenAt: '2026-01-01T00:00:99.000Z', id: '00000100-0000-4000-8000-000000000000' });
  assert.equal(result.total, 250);
  assert.equal(query.count, 'exact');
  assert.deepEqual(JSON.parse(JSON.stringify(query.orders)), [['score', { ascending: false }], ['last_seen_at', { ascending: false }], ['id', { ascending: true }]]);
  assert.equal(query.limitValue, 101);
  assert.equal(query.abortSignalValue, controller.signal);
});

test('rejects invalid cursors before querying and uses exact count only on the first page', async () => {
  const { factory, calls } = createCatalogFactory();
  const client = loadCloud().create({ config: catalogConfig, supabaseFactory: factory });
  await assert.rejects(() => client.listOffers({ workspaceId, cursor: { score: 101, lastSeenAt: 'invalid', id: 'bad' } }), /cursor/i);
  assert.equal(calls.offers.length, 0);
  await client.listOffers({ workspaceId, cursor: { score: 77, lastSeenAt: '2026-01-02T03:04:05.000Z', id: cursorId } });
  assert.equal(calls.offers[0].count, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.offers[0].filters)), [['eq', 'workspace_id', workspaceId], ['or', `score.lt.77,and(score.eq.77,last_seen_at.lt.\"2026-01-02T03:04:05.000Z\"),and(score.eq.77,last_seen_at.eq.\"2026-01-02T03:04:05.000Z\",id.gt.${cursorId})`]]);
});

test('applies signal, group and novelty filters to the full database query', async () => {
  const { factory, calls } = createCatalogFactory({ offersResult: { data: [offer('33333333-3333-4333-8333-333333333333', 75, '2026-01-01T00:00:00.000Z', { signals: { pixel_ads: true, vsl_player: true }, recurrence_count: 2 })], count: 1, error: null } });
  const client = loadCloud().create({ config: catalogConfig, supabaseFactory: factory });
  const result = await client.listOffers({ workspaceId, filters: { search: '50%_off', niche: 'saas', priority: 'high', status: 'new', pixel: true, vsl: true, billing: true, recurring: true, group: 'saas_br', novel: true } });
  assert.deepEqual(JSON.parse(JSON.stringify(calls.offers[0].filters)), [
    ['eq', 'workspace_id', workspaceId], ['ilike', 'title', '%50\\%\\_off%'], ['eq', 'niche', 'saas'],
    ['eq', 'priority', 'high'], ['eq', 'status', 'new'], ['contains', 'signals', { pixel_ads: true }],
    ['contains', 'signals', { vsl_player: true }], ['or', 'signals->>billing_tech_detected.eq.true,signals->>mrr.eq.true'],
    ['contains', 'signals', { group: 'saas_br' }],
    ['contains', 'signals', { novel: true }], ['gte', 'recurrence_count', 2]
  ]);
  assert.equal(result.localFilterLabel, null);
  assert.equal(result.items.length, 1);
});

test('imports only through the edge function and preserves its request reference', async () => {
  const { factory, calls } = createCatalogFactory();
  const client = loadCloud().create({ config: catalogConfig, supabaseFactory: factory });
  const file = { name: 'ofertas.csv' };
  const result = await client.importHunt({ workspaceId, file });
  assert.equal(calls.imports.length, 1);
  assert.equal(calls.imports[0][0], 'import-hunt');
  assert.deepEqual(JSON.parse(JSON.stringify(calls.imports[0][1].body.entries)), [['workspace_id', workspaceId], ['file', file]]);
  assert.equal(result.request_id, 'req-import');
});

test('sends only editable decision fields and confirms the row returned by the server', async () => {
  const { factory, calls } = createCatalogFactory();
  const client = loadCloud().create({ config: catalogConfig, supabaseFactory: factory });
  const input = { workspaceId, offerId: 'offer-1', status: 'saved', userNotes: 'nota', tags: ['tag'], score: 99 };
  const result = await client.updateOfferDecision(input);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.updates[0])), { status: 'saved', user_notes: 'nota', tags: ['tag'] });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { id: 'offer-1', status: 'saved', user_notes: 'nota', tags: ['tag'] });
  assert.equal(input.score, 99);
  await assert.rejects(() => client.updateOfferDecision({ workspaceId, offerId: 'offer-1', status: 'admin', userNotes: '', tags: [] }), /status/i);
  await assert.rejects(() => client.updateOfferDecision({ workspaceId, offerId: 'offer-1', status: 'new', userNotes: 'x'.repeat(10001), tags: [] }), /nota/i);
  await assert.rejects(() => client.updateOfferDecision({ workspaceId, offerId: 'offer-1', status: 'new', userNotes: '', tags: Array(25).fill('tag') }), /tags/i);
});

test('creates 60-second signed URLs only inside the selected workspace prefix', async () => {
  const { factory, calls } = createCatalogFactory();
  const client = loadCloud().create({ config: catalogConfig, supabaseFactory: factory });
  const result = await client.createHuntSignedUrl({ workspaceId, path: `${workspaceId}/hunt.csv` });
  assert.equal(result, 'https://storage.test/signed');
  assert.deepEqual(JSON.parse(JSON.stringify(calls.signedUrls[0])), { bucket: 'cacadas_csv', path: `${workspaceId}/hunt.csv`, expiresIn: 60 });
  await assert.rejects(() => client.createHuntSignedUrl({ workspaceId, path: `other/${workspaceId}/hunt.csv` }), /workspace/i);
});
