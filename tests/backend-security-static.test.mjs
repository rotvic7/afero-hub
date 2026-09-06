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

test('pins and serves the browser Supabase SDK locally', async () => {
  const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(pkg.dependencies['@supabase/supabase-js'], '2.57.4');
  assert.equal(pkg.devDependencies.supabase, '2.39.2');
  assert.match(html, /vendor\/supabase\.js/);
  assert.doesNotMatch(html, /cdn[^"']*supabase|unpkg[^"']*supabase|jsdelivr[^"']*supabase/i);
});

test('keeps browser configuration public and cloud closed by default', async () => {
  const config = await readFile(new URL('../afero-cloud-config.js', import.meta.url), 'utf8');
  assert.match(config, /supabaseUrl:\s*''/);
  assert.match(config, /publishableKey:\s*''/);
  assert.doesNotMatch(config, /service[_-]?role|sb_secret_|URLSCAN|postgres(?:ql)?:\/\//i);
});
