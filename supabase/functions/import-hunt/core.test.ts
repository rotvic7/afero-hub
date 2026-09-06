import { assertEquals, assertExists } from 'jsr:@std/assert@1.0.14';
import { handleImportHunt } from './core.ts';
import { CsvValidationError } from '../_shared/hunter-csv.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';

function requestWith(file: File, headers: HeadersInit = {}): Request {
  const form = new FormData();
  form.set('workspace_id', WORKSPACE_ID);
  form.set('file', file);
  return new Request('http://localhost/import-hunt', { method: 'POST', headers, body: form });
}

function requestFor(workspaceId: string, file: File): Request {
  const form = new FormData();
  form.set('workspace_id', workspaceId);
  form.set('file', file);
  return new Request('http://localhost/import-hunt', { method: 'POST', body: form });
}

function makeFakes(options: { role?: string; duplicate?: unknown; importError?: unknown } = {}) {
  const calls = { userSelect: 0, adminRpc: [] as Array<{ name: string; args: unknown }>, adminUpload: 0, adminRemove: 0 };
  const adminStorage = {
    from: () => ({
      upload: async () => { calls.adminUpload += 1; return { error: null }; },
      remove: async () => { calls.adminRemove += 1; return { error: null }; }
    })
  };
  const context: any = {
    userClaims: { id: USER_ID, exp: Math.floor(Date.now() / 1000) + 60 },
    supabase: {
      rpc: async () => ({ data: options.role ?? 'editor', error: null }),
      from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => {
        calls.userSelect += 1;
        return { data: options.duplicate ?? null, error: null };
      } }) }) }) })
    },
    supabaseAdmin: {
      storage: adminStorage,
      rpc: async (name: string, args: unknown) => {
        calls.adminRpc.push({ name, args });
        if (name === 'consume_import_rate_limit') return { data: true, error: null };
        return { data: null, error: options.importError ?? null };
      }
    }
  };
  return { context, calls };
}

const deps = {
  allowedOrigins: new Set(['http://localhost:4377']),
  randomUUID: () => '33333333-3333-4333-8333-333333333333',
  now: () => new Date('2026-09-01T12:00:00Z'),
  sha256: async () => 'a'.repeat(64),
  parseHunterCsv: async () => ({ rows: [{ title: 'private title' }], meta: { totalRows: 1, acceptedRows: 1, duplicateRows: 0 } })
};

Deno.test('rejects absent or expired identity before it reads the body', async () => {
  const { context, calls } = makeFakes();
  context.userClaims = {};
  const response = await handleImportHunt(requestWith(new File(['x'], 'hunt.csv', { type: 'text/csv' })), context, deps);
  assertEquals(response.status, 401);
  assertEquals(calls.userSelect, 0);

  const expired = makeFakes();
  expired.context.userClaims.exp = Math.floor(Date.now() / 1000) - 1;
  const expiredResponse = await handleImportHunt(requestWith(new File(['x'], 'hunt.csv', { type: 'text/csv' })), expired.context, deps);
  assertEquals(expiredResponse.status, 401);
  assertEquals(expired.calls.userSelect, 0);
});

Deno.test('validates origin, role and file before Storage', async () => {
  const forbidden = makeFakes();
  const response = await handleImportHunt(requestWith(new File(['x'], 'hunt.csv', { type: 'text/csv' }), { origin: 'https://evil.example' }), forbidden.context, deps);
  assertEquals(response.status, 403);
  assertEquals(forbidden.calls.adminUpload, 0);

  const viewer = makeFakes({ role: 'viewer' });
  const viewerResponse = await handleImportHunt(requestWith(new File(['x'], 'hunt.csv', { type: 'text/csv' })), viewer.context, deps);
  assertEquals(viewerResponse.status, 403);
  assertEquals(viewer.calls.adminUpload, 0);

  const invalidWorkspace = makeFakes();
  const invalidWorkspaceResponse = await handleImportHunt(requestFor('not-a-uuid', new File(['csv'], 'hunt.csv', { type: 'text/csv' })), invalidWorkspace.context, deps);
  assertEquals(invalidWorkspaceResponse.status, 400);
  assertEquals(invalidWorkspace.calls.adminUpload, 0);

  const invalidExtension = makeFakes();
  const invalidExtensionResponse = await handleImportHunt(requestWith(new File(['csv'], 'hunt.txt', { type: 'text/plain' })), invalidExtension.context, deps);
  assertEquals(invalidExtensionResponse.status, 415);
  assertEquals(invalidExtension.calls.adminUpload, 0);

  const invalidMime = makeFakes();
  const invalidMimeResponse = await handleImportHunt(requestWith(new File(['csv'], 'hunt.csv', { type: 'application/pdf' })), invalidMime.context, deps);
  assertEquals(invalidMimeResponse.status, 415);
  assertEquals(invalidMime.calls.adminUpload, 0);

  const empty = makeFakes();
  const emptyResponse = await handleImportHunt(requestWith(new File([], 'hunt.csv', { type: 'text/csv' })), empty.context, deps);
  assertEquals(emptyResponse.status, 413);
  assertEquals(empty.calls.adminUpload, 0);

  const oversized = makeFakes();
  const oversizedResponse = await handleImportHunt(requestWith(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'hunt.csv', { type: 'text/csv' })), oversized.context, deps);
  assertEquals(oversizedResponse.status, 413);
  assertEquals(oversized.calls.adminUpload, 0);
});

Deno.test('rejects parser failures before quota and Storage', async () => {
  const { context, calls } = makeFakes();
  const invalidParserDeps = {
    ...deps,
    parseHunterCsv: async () => { throw new CsvValidationError('malformed_csv', 'private line detail'); }
  };
  const response = await handleImportHunt(requestWith(new File(['csv'], 'hunt.csv', { type: 'text/csv' })), context, invalidParserDeps);
  const body = await response.json() as { error: string; code: string };
  assertEquals(response.status, 422);
  assertEquals(body.code, 'malformed_csv');
  assertEquals(body.error, 'O CSV não passou na validação.');
  assertEquals(calls.adminRpc.length, 0);
  assertEquals(calls.adminUpload, 0);
});

Deno.test('returns duplicate before quota or Storage', async () => {
  const duplicate = { id: '44444444-4444-4444-8444-444444444444', rows_received: 2, rows_imported: 2, rows_rejected: 0 };
  const { context, calls } = makeFakes({ duplicate });
  const response = await handleImportHunt(requestWith(new File(['csv'], 'hunt.csv', { type: 'text/csv' })), context, deps);
  const body = await response.json() as { duplicate: boolean };
  assertEquals(response.status, 200);
  assertEquals(body.duplicate, true);
  assertEquals(calls.adminRpc.length, 0);
  assertEquals(calls.adminUpload, 0);
});

Deno.test('uses admin quota, Storage and import RPC, then cleans up a SQL failure', async () => {
  const { context, calls } = makeFakes({ importError: { message: 'private SQL failure' } });
  const response = await handleImportHunt(requestWith(new File(['csv'], 'hunt.csv', { type: 'text/csv' })), context, deps);
  const body = await response.json() as { code: string; request_id: string };
  assertEquals(response.status, 503);
  assertEquals(body.code, 'database_import_failed');
  assertExists(body.request_id);
  assertEquals(calls.adminRpc[0], { name: 'consume_import_rate_limit', args: { p_user_id: USER_ID } });
  assertEquals(calls.adminRpc[1]?.name, 'import_hunt');
  assertEquals(calls.adminUpload, 1);
  assertEquals(calls.adminRemove, 1);
});
