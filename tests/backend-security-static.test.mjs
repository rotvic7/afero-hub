import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const migrationUrl = new URL('supabase/migrations/202608280001_afero_backend.sql', root);
const hardeningMigrationUrl = new URL('supabase/migrations/202609010001_afero_hardening.sql', root);
const hardeningRollbackUrl = new URL('supabase/rollback/202609010001_afero_hardening.policies.rollback.sql', root);
const edgeFunctionUrl = new URL('supabase/functions/import-hunt/index.ts', root);
const edgeCoreUrl = new URL('supabase/functions/import-hunt/core.ts', root);
const configUrl = new URL('supabase/config.toml', root);
const functionEnvExampleUrl = new URL('supabase/functions/.env.example', root);
const browserConfigExampleUrl = new URL('afero-cloud-config.example.js', root);
const rollbackUrl = new URL('supabase/rollback/202608280001_afero_backend.rollback.sql', root);

test('enables RLS for every public application table', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const tables = [
    'profiles', 'workspaces', 'workspace_members', 'hunts', 'offers',
    'hunt_offers', 'workspace_invitations', 'audit_events', 'import_rate_limits'
  ];
  for (const table of tables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security;`, 'i'));
  }
});

test('keeps privileged import unavailable to browser roles', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /grant execute on function public\.import_hunt\([^)]+\) to service_role;/i);
  assert.doesNotMatch(sql, /grant execute on function public\.import_hunt\([^)]+\) to authenticated;/i);
  assert.match(sql, /revoke all on function[\s\S]+public\.import_hunt\([^)]+\)[\s\S]+from public, anon;/i);
});

test('keeps the Edge wrapper authenticated and delegates import work to the core', async () => {
  const source = await readFile(edgeFunctionUrl, 'utf8');
  assert.match(source, /@supabase\/server@1\.4\.1/);
  assert.match(source, /withSupabase\(\{ auth: 'user' \}/);
  assert.match(source, /import \{ handleImportHunt \} from '\.\/core\.ts';/);
  assert.match(source, /handleImportHunt\(request, context\)/);
  assert.doesNotMatch(source, /SUPABASE_(?:SECRET|SERVICE_ROLE)/);
});

test('keeps import Storage and privileged RPC exclusively administrative', async () => {
  const source = await readFile(edgeCoreUrl, 'utf8');
  assert.match(source, /supabaseAdmin\.storage\.from\('cacadas_csv'\)\.upload/);
  assert.match(source, /supabaseAdmin\.storage\.from\('cacadas_csv'\)\.remove/);
  assert.match(source, /supabaseAdmin\.rpc\('consume_import_rate_limit', \{ p_user_id: userId \}\)/);
  assert.match(source, /supabaseAdmin\.rpc\('import_hunt', importArgs\)/);
  assert.doesNotMatch(source, /supabase\.storage/);
  assert.doesNotMatch(source, /SUPABASE_(?:SECRET|SERVICE_ROLE)/);
});

test('keeps Edge public failures and 5xx logs redacted', async () => {
  const source = await readFile(edgeCoreUrl, 'utf8');
  assert.match(source, /request_id: requestId/);
  assert.match(source, /user_id: userId/);
  assert.match(source, /workspace_id: workspaceId/);
  assert.match(source, /code/);
  assert.doesNotMatch(source, /console\.(?:error|log)\([^\n]*(?:authorization|parsed\.rows|file\.name|file\b)/i);
});

test('keeps CSV storage private and rollback explicitly guarded', async () => {
  const [sql, rollback] = await Promise.all([
    readFile(migrationUrl, 'utf8'),
    readFile(rollbackUrl, 'utf8')
  ]);
  assert.match(sql, /values \('cacadas_csv', 'cacadas_csv', false, 5242880,/i);
  assert.equal((sql.match(/create policy cacadas_csv_/gi) || []).length, 3);
  assert.doesNotMatch(sql, /\^\[a-f0-9-\]\{36\}\$/);
  assert.match(rollback, /afero\.allow_destructive_rollback/);
  assert.match(rollback, /is distinct from 'yes'/i);
});

test('hardens CSV storage through policies without changing storage grants', async () => {
  const sql = await readFile(hardeningMigrationUrl, 'utf8');
  assert.match(sql, /drop policy if exists cacadas_csv_insert_editor on storage\.objects;/i);
  assert.match(sql, /drop policy if exists cacadas_csv_delete_owner on storage\.objects;/i);
  assert.doesNotMatch(sql, /revoke\s+(?:insert|delete|all)\s+on\s+storage\.objects/i);
  assert.doesNotMatch(sql, /drop policy if exists cacadas_csv_select_member on storage\.objects;/i);
});

test('hardening migration protects tenant links, imports and catalog indexes', async () => {
  const sql = await readFile(hardeningMigrationUrl, 'utf8');
  assert.match(sql, /offers_workspace_catalog_idx\s+on public\.offers\s*\(workspace_id, score desc, last_seen_at desc, id\)/i);
  assert.match(sql, /offers_workspace_status_score_idx\s+on public\.offers\s*\(workspace_id, status, score desc\)/i);
  assert.match(sql, /foreign key \(hunt_id, workspace_id\)\s+references public\.hunts \(id, workspace_id\)/i);
  assert.match(sql, /foreign key \(offer_id, workspace_id\)\s+references public\.offers \(id, workspace_id\)/i);
  assert.match(sql, /create or replace function public\.consume_import_rate_limit\(p_user_id uuid\)/i);
  assert.match(sql, /grant execute on function public\.consume_import_rate_limit\(uuid\) to service_role;/i);
  assert.doesNotMatch(sql, /grant execute on function public\.consume_import_rate_limit\(uuid\) to authenticated;/i);
  assert.match(sql, /public\.merge_offer_signals\(public\.offers\.signals, excluded\.signals\)/i);
  assert.match(sql, /greatest\(public\.offers\.score, excluded\.score\)/i);
});

test('guards the hardening policy rollback and leaves schema objects alone', async () => {
  const sql = await readFile(hardeningRollbackUrl, 'utf8');
  assert.match(sql, /current_setting\('afero\.allow_policy_rollback', true\) is distinct from 'yes'/i);
  assert.match(sql, /create policy cacadas_csv_insert_editor/i);
  assert.match(sql, /create policy cacadas_csv_delete_owner/i);
  assert.doesNotMatch(sql, /(?:alter table|drop table|revoke\s+.+storage\.objects|create index)/i);
});

test('requires confirmed email and hardened password sessions locally', async () => {
  const config = await readFile(configUrl, 'utf8');
  assert.match(config, /enable_confirmations = true/);
  assert.match(config, /enable_refresh_token_rotation = true/);
  assert.match(config, /enable_anonymous_sign_ins = false/);
  assert.match(config, /minimum_password_length = 12/);
  assert.match(config, /secure_password_change = true/);
});

test('keeps production Auth redirects and Edge CORS aligned with the Afero deploy', async () => {
  const [config, envExample, browserExample] = await Promise.all([
    readFile(configUrl, 'utf8'),
    readFile(functionEnvExampleUrl, 'utf8'),
    readFile(browserConfigExampleUrl, 'utf8')
  ]);

  assert.match(config, /site_url = "https:\/\/afero-hub\.vercel\.app\/hub"/);
  assert.match(config, /additional_redirect_urls = \[[^\]]*"https:\/\/afero-hub\.vercel\.app\/hub"/);
  assert.match(config, /additional_redirect_urls = \[[^\]]*"https:\/\/afero-hub\.vercel\.app\/hub\.html"/);
  assert.match(config, /additional_redirect_urls = \[[^\]]*"http:\/\/localhost:4377\/index\.html"/);
  assert.match(config, /additional_redirect_urls = \[[^\]]*"http:\/\/127\.0\.0\.1:4377\/index\.html"/);
  assert.match(envExample, /^ALLOWED_ORIGINS=http:\/\/127\.0\.0\.1:4377,http:\/\/localhost:4377,https:\/\/afero-hub\.vercel\.app$/m);
  assert.match(browserExample, /redirectUrl: 'https:\/\/afero-hub\.vercel\.app\/hub'/);
  assert.doesNotMatch(`${config}\n${envExample}\n${browserExample}`, /SEU-PROJETO|movimentobuilder-ia/i);
});

test('pins and serves the browser Supabase SDK locally', async () => {
  const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(pkg.dependencies['@supabase/supabase-js'], '2.57.4');
  assert.equal(pkg.devDependencies.supabase, '2.39.2');
  assert.match(html, /vendor\/supabase\.js/);
  assert.doesNotMatch(html, /cdn[^"']*supabase|unpkg[^"']*supabase|jsdelivr[^"']*supabase/i);
});

/* O Hub é página estática sem passo de build, então a chave publicável precisa
   viver no arquivo versionado para o produto conectar. O que este teste guarda
   deixou de ser "arquivo vazio" e passou a ser o que de fato importa: a origem
   tem que ser um projeto Supabase, e a chave tem que ser de papel anônimo,
   protegida por RLS. service_role, segredo e string de conexão continuam
   proibidos. Regra afrouxada em 06/09/2026, decisão do Victor, depois que o
   commit 9ebbb78 conectou o Hub ao Supabase. */
test('keeps browser configuration public and restricted to an anon key', async () => {
  const config = await readFile(new URL('../afero-cloud-config.js', import.meta.url), 'utf8');

  const url = config.match(/supabaseUrl:\s*'([^']*)'/);
  assert.ok(url, 'afero-cloud-config.js precisa declarar supabaseUrl.');
  assert.match(url[1], /^$|^https:\/\/[a-z0-9-]+\.supabase\.co$/,
    'supabaseUrl deve ser vazio ou a origem https de um projeto Supabase.');

  const key = config.match(/publishableKey:\s*'([^']*)'/);
  assert.ok(key, 'afero-cloud-config.js precisa declarar publishableKey.');
  if (key[1]) {
    /* Chave nova (sb_publishable_) passa direto. JWT antigo tem o papel
       decodificado, porque uma service_role colada aqui vazaria o banco. */
    if (!key[1].startsWith('sb_publishable_')) {
      const partes = key[1].split('.');
      assert.equal(partes.length, 3, 'publishableKey deve ser um JWT ou uma chave sb_publishable_.');
      const carga = JSON.parse(Buffer.from(partes[1], 'base64').toString('utf8'));
      assert.equal(carga.role, 'anon',
        `publishableKey precisa ter papel anon, encontrado "${carga.role}".`);
    }
  }

  assert.doesNotMatch(config, /service[_-]?role|sb_secret_|URLSCAN|postgres(?:ql)?:\/\//i);
});
