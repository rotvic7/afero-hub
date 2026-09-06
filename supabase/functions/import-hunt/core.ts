import { CsvValidationError, parseHunterCsv } from '../_shared/hunter-csv.js';

const BUCKET = 'cacadas_csv';
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_FILE_BYTES + 256 * 1024;
const EDIT_ROLES = new Set(['owner', 'admin', 'editor']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CSV_MIME_TYPES = new Set(['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel']);

export type ImportContext = {
  userClaims?: { id?: unknown; exp?: unknown };
  supabase: any;
  supabaseAdmin: any;
};

export type ImportDeps = {
  parseHunterCsv: typeof parseHunterCsv;
  sha256: (bytes: Uint8Array) => Promise<string>;
  randomUUID: () => string;
  now: () => Date;
  allowedOrigins: Set<string>;
};

class HttpError extends Error {
  constructor(public code: string, public message: string, public status = 400) {
    super(message);
    this.name = 'HttpError';
  }
}

function configuredOrigins(): Set<string> {
  return new Set(
    String(Deno.env.get('ALLOWED_ORIGINS') || 'http://127.0.0.1:4377,http://localhost:4377')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const defaultDeps: ImportDeps = {
  parseHunterCsv,
  sha256,
  randomUUID: () => crypto.randomUUID(),
  now: () => new Date(),
  allowedOrigins: configuredOrigins()
};

function json(payload: unknown, status: number, requestId: string): Response {
  return Response.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Request-Id': requestId
    }
  });
}

function fail(code: string, message: string, status = 400): HttpError {
  return new HttpError(code, message, status);
}

function publicError(error: unknown, requestId: string, userId: string, workspaceId: string): Response {
  const known = error instanceof HttpError ? error : null;
  const parserError = error instanceof CsvValidationError;
  const status = parserError ? 422 : known?.status ?? 500;
  const code = parserError ? error.code : known?.code ?? 'internal_error';
  const message = parserError
    ? 'O CSV não passou na validação.'
    : status < 500 ? known?.message : 'Não foi possível importar a caçada.';

  if (status >= 500) {
    console.error(JSON.stringify({ request_id: requestId, user_id: userId, workspace_id: workspaceId, code }));
  }
  return json({ error: message, code, request_id: requestId }, status, requestId);
}

function verifiedUserId(context: ImportContext, now: Date): string {
  const userId = String(context.userClaims?.id || '').trim().toLowerCase();
  const exp = context.userClaims?.exp;
  if (!UUID_PATTERN.test(userId) || (exp !== undefined && (!Number.isInteger(exp) || Number(exp) <= Math.floor(now.getTime() / 1000)))) {
    throw fail('authentication_required', 'Sessão inválida.', 401);
  }
  return userId;
}

function isCsvFile(file: FormDataEntryValue | null): file is File {
  return typeof File !== 'undefined' && file instanceof File;
}

export async function handleImportHunt(request: Request, context: ImportContext, suppliedDeps?: Partial<ImportDeps>): Promise<Response> {
  const deps = { ...defaultDeps, ...suppliedDeps };
  const requestId = deps.randomUUID();
  let userId = '';
  let workspaceId = '';
  let uploadedPath = '';

  try {
    if (request.method !== 'POST') throw fail('method_not_allowed', 'Método não permitido.', 405);
    userId = verifiedUserId(context, deps.now());

    const origin = request.headers.get('origin');
    if (origin && !deps.allowedOrigins.has(origin)) throw fail('origin_forbidden', 'Origem não autorizada.', 403);
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (!Number.isFinite(contentLength) || contentLength > MAX_REQUEST_BYTES) {
      throw fail('file_too_large', 'O arquivo excede 5 MiB.', 413);
    }

    const form = await request.formData();
    workspaceId = String(form.get('workspace_id') || '').trim().toLowerCase();
    if (!UUID_PATTERN.test(workspaceId)) throw fail('invalid_workspace', 'Workspace inválido.', 400);

    const { data: role, error: roleError } = await context.supabase.rpc('workspace_role', {
      target_workspace: workspaceId
    });
    if (roleError || typeof role !== 'string' || !EDIT_ROLES.has(role)) {
      throw fail('workspace_forbidden', 'Você não pode importar neste workspace.', 403);
    }

    const file = form.get('file');
    if (!isCsvFile(file)) throw fail('missing_file', 'Envie um arquivo CSV.', 400);
    if (!/\.csv$/i.test(file.name) || (file.type && !CSV_MIME_TYPES.has(file.type))) {
      throw fail('invalid_file_type', 'Envie um arquivo CSV válido.', 415);
    }
    if (file.size < 1 || file.size > MAX_FILE_BYTES) throw fail('file_too_large', 'O arquivo excede 5 MiB.', 413);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const checksum = await deps.sha256(bytes);
    const { data: existing, error: existingError } = await context.supabase
      .from('hunts')
      .select('id, rows_received, rows_imported, rows_rejected')
      .eq('workspace_id', workspaceId)
      .eq('sha256', checksum)
      .maybeSingle();
    if (existingError) throw fail('duplicate_check_failed', 'Não foi possível verificar esta caçada.', 503);
    if (existing) {
      return json({
        hunt_id: existing.id,
        duplicate: true,
        rows_received: existing.rows_received,
        rows_imported: existing.rows_imported,
        rows_rejected: existing.rows_rejected,
        request_id: requestId
      }, 200, requestId);
    }

    const parsed = await deps.parseHunterCsv(bytes);
    const { data: quotaAllowed, error: quotaError } = await context.supabaseAdmin.rpc('consume_import_rate_limit', { p_user_id: userId });
    if (quotaError) throw fail('quota_check_failed', 'Não foi possível validar o limite de segurança.', 503);
    if (!quotaAllowed) throw fail('rate_limited', 'Muitas importações em sequência. Tente novamente mais tarde.', 429);

    uploadedPath = `${workspaceId}/hunts/${deps.randomUUID()}.csv`;
    const { error: uploadError } = await context.supabaseAdmin.storage.from('cacadas_csv').upload(uploadedPath, file, {
      cacheControl: '0', contentType: 'text/csv; charset=utf-8', upsert: false
    });
    if (uploadError) throw fail('storage_upload_failed', 'Não foi possível guardar o CSV.', 503);

    const importArgs = {
      p_workspace_id: workspaceId,
      p_actor_user_id: userId,
      p_file_path: uploadedPath,
      p_file_name: file.name.slice(0, 255),
      p_sha256: checksum,
      p_engine_version: parsed.meta.engineVersion || null,
      p_rows: parsed.rows
    };
    const { data: imported, error: importError } = await context.supabaseAdmin.rpc('import_hunt', importArgs);
    if (importError) throw fail('database_import_failed', 'O CSV foi validado, mas a importação não foi concluída.', 503);

    if (imported?.duplicate) {
      const { error: duplicateCleanupError } = await context.supabaseAdmin.storage.from('cacadas_csv').remove([uploadedPath]);
      if (duplicateCleanupError) {
        throw fail('storage_cleanup_failed', 'Não foi possível concluir a limpeza da importação.', 503);
      }
      uploadedPath = '';
    }
    return json({
      ...imported,
      parser: {
        rows_read: parsed.meta.totalRows,
        rows_unique: parsed.meta.acceptedRows,
        rows_repeated_in_file: parsed.meta.duplicateRows
      },
      request_id: requestId
    }, imported?.duplicate ? 200 : 201, requestId);
  } catch (error: unknown) {
    if (uploadedPath) {
      try {
        await context.supabaseAdmin.storage.from('cacadas_csv').remove([uploadedPath]);
      } catch {
        console.error(JSON.stringify({ request_id: requestId, user_id: userId, workspace_id: workspaceId, code: 'storage_cleanup_failed' }));
      }
    }
    return publicError(error, requestId, userId, workspaceId);
  }
}
