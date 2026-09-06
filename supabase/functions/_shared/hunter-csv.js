const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_ROWS = 10_000;
const DEFAULT_MAX_COLUMNS = 64;
const MAX_CELL_LENGTH = 4_000;

const LEGACY_FORMULA_HEADERS = new Set(['oferta', 'ads_ativos', 'screenshot', 'preview']);
const ALLOWED_HEADERS = new Set([
  'prioridade', 'score', 'vezes_vista', 'visto_desde', 'url', 'oferta', 'ads_ativos',
  'nicho', 'dominio', 'titulo', 'idioma', 'pais', 'data_scan', 'idade_dias',
  'construtor_novo', 'query', 'motivos', 'screenshot', 'preview', 'gateway',
  'rastreador', 'engine_version', 'versao_motor', 'grupo', 'inedita', 'escalado',
  'mrr', 'billing_tech_detected', 'subscription_verified', 'saas_classificacao',
  'preco_mensal', 'preco_anual', 'trial_detectado', 'plano_gratis', 'pricing_url',
  'evidencias_saas', 'pixel_ads', 'vsl_player', 'funil_quiz', 'sinal_duplo',
  'status_url', 'http_status'
]);
const TRACKING_PARAMETERS = new Set(['fbclid', 'gclid', 'msclkid', 'ttclid', 'ref', 'referrer']);
const GATEWAYS = new Set(['hotmart', 'kiwify', 'cakto', 'kirvano', 'eduzz']);
const TRACKERS = new Set(['utmify', 'rdstation', 'rd_station', 'meta', 'facebook', 'google', 'tiktok']);
const VSL_PLAYERS = new Set(['vturb', 'panda']);

export class CsvValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'CsvValidationError';
    this.code = code;
    this.details = details;
  }
}

function byteLength(value) {
  if (value instanceof Uint8Array) return value.byteLength;
  return new TextEncoder().encode(String(value ?? '')).byteLength;
}

function decode(value) {
  if (value instanceof Uint8Array) return new TextDecoder('utf-8', { fatal: true }).decode(value);
  return String(value ?? '');
}

function parseCsvMatrix(text, maxRows, maxColumns) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else quoted = false;
      } else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(cell);
      cell = '';
      if (row.length > maxColumns) throw new CsvValidationError('too_many_columns', `O CSV excede ${maxColumns} colunas.`);
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.length > maxColumns) throw new CsvValidationError('too_many_columns', `O CSV excede ${maxColumns} colunas.`);
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      cell = '';
      if (rows.length - 1 > maxRows) throw new CsvValidationError('too_many_rows', `O CSV excede ${maxRows} linhas.`);
    } else cell += character;

    if (cell.length > MAX_CELL_LENGTH) throw new CsvValidationError('cell_too_large', `Uma célula excede ${MAX_CELL_LENGTH} caracteres.`);
  }

  if (quoted) throw new CsvValidationError('malformed_csv', 'O CSV termina dentro de um campo entre aspas.');
  if (cell !== '' || row.length) {
    row.push(cell);
    if (row.length > maxColumns) throw new CsvValidationError('too_many_columns', `O CSV excede ${maxColumns} colunas.`);
    if (row.some((value) => value !== '')) rows.push(row);
  }
  if (rows.length - 1 > maxRows) throw new CsvValidationError('too_many_rows', `O CSV excede ${maxRows} linhas.`);
  return rows;
}

function cleanText(value, maxLength = 500) {
  return String(value ?? '').replace(/\0/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function restoreSpreadsheetText(value) {
  const text = String(value ?? '');
  return /^'\s*[=+\-@]/.test(text) ? text.slice(1) : text;
}

function assertNoFormula(header, value, line) {
  if (!/^\s*[=+\-@]/.test(value)) return;
  if (LEGACY_FORMULA_HEADERS.has(header) && /^\s*=HYPERLINK\(/i.test(value)) return;
  throw new CsvValidationError('formula_not_allowed', `Fórmula não permitida na coluna ${header}.`, { line, header });
}

export function extractLegacyHyperlink(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (!text.startsWith('=')) return text;
  const match = text.match(/^=HYPERLINK\(\s*"((?:""|[^"])*)"\s*[,;]/i);
  if (!match) throw new CsvValidationError('formula_not_allowed', 'Somente fórmulas HYPERLINK legadas são aceitas nestas colunas.');
  return match[1].replace(/""/g, '"');
}

function parseHttpUrl(value, label, allowEmpty = true) {
  const cleaned = cleanText(value, 2_000);
  if (!cleaned && allowEmpty) return '';
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('protocol');
    if (!parsed.hostname || parsed.username || parsed.password) throw new Error('host');
    return parsed;
  } catch {
    throw new CsvValidationError('unsafe_url', `${label} contém uma URL inválida ou insegura.`);
  }
}

export function canonicalizeOfferUrl(value) {
  const parsed = parseHttpUrl(value, 'A oferta', false);
  parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  parsed.hash = '';
  [...parsed.searchParams.keys()].forEach((key) => {
    if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMETERS.has(key.toLowerCase())) parsed.searchParams.delete(key);
  });
  parsed.searchParams.sort();
  if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  return parsed.toString().replace(/\?$/, '').replace(/\/$/, (match) => parsed.pathname === '/' && !parsed.search ? match : '');
}

function optionalHttpUrl(value, label) {
  const extracted = extractLegacyHyperlink(value);
  const parsed = parseHttpUrl(extracted, label, true);
  return parsed ? parsed.href : '';
}

function tierFromScore(score) {
  if (score >= 9) return 'S';
  if (score >= 6) return 'A';
  if (score >= 3) return 'B';
  return 'C';
}

function parseBooleanFlag(value) {
  return /^(1|true|sim|yes)$/i.test(cleanText(value, 12));
}

function hasValue(value) {
  return cleanText(value, 12) !== '';
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function inferSignalsFromQuery(query) {
  const queries = cleanText(query, 500).toLowerCase().split('|').map((item) => item.trim()).filter(Boolean);
  const gateways = [];
  const trackers = [];
  let vslPlayer = false;
  let funnelQuiz = false;
  let pixelAds = false;
  let explicitCombo = false;
  queries.forEach((singleQuery) => {
    const parts = singleQuery.split('_').filter(Boolean);
    const startsGateway = parts[0] === 'gateway' || parts[0] === 'checkout';
    const startsTracker = parts[0] === 'tracker' || parts[0] === 'pixel';
    const candidates = startsGateway || startsTracker ? parts.slice(1) : parts.slice(parts[0] === 'combo' ? 1 : 0);
    const candidateName = candidates.join('_');
    explicitCombo = explicitCombo || parts[0] === 'combo';
    pixelAds = pixelAds || parts[0] === 'pixel';
    if (startsGateway && GATEWAYS.has(candidateName)) gateways.push(candidateName);
    if (startsTracker && candidateName) trackers.push(candidateName);
    candidates.forEach((part) => {
      if (GATEWAYS.has(part)) gateways.push(part);
      if (TRACKERS.has(part)) trackers.push(part);
      if (VSL_PLAYERS.has(part)) vslPlayer = true;
      if (part === 'typebot') funnelQuiz = true;
    });
  });

  const normalizedGateways = uniqueSorted(gateways);
  const normalizedTrackers = uniqueSorted(trackers);
  const independentSignals = Number(normalizedGateways.length > 0) + Number(normalizedTrackers.length > 0) + Number(vslPlayer) + Number(funnelQuiz);
  return {
    gateway: normalizedGateways[0] || '',
    gateways: normalizedGateways,
    tracker: normalizedTrackers[0] || '',
    trackers: normalizedTrackers,
    vsl_player: vslPlayer,
    funnel_quiz: funnelQuiz,
    pixel_ads: pixelAds,
    double_signal: explicitCombo || independentSignals >= 2,
    queries: uniqueSorted(queries)
  };
}

function normalizeSignals(raw, query) {
  const inferred = inferSignalsFromQuery(query);
  const timesSeen = Math.max(1, Number.parseInt(cleanText(raw.vezes_vista, 12), 10) || 1);
  const gateway = cleanText(raw.gateway, 80) || inferred.gateway;
  const tracker = cleanText(raw.rastreador, 80) || inferred.tracker;
  const gateways = uniqueSorted([...inferred.gateways, gateway]);
  const trackers = uniqueSorted([...inferred.trackers, tracker]);
  const pixelAds = hasValue(raw.pixel_ads) ? parseBooleanFlag(raw.pixel_ads) : inferred.pixel_ads;
  const vslPlayer = hasValue(raw.vsl_player) ? parseBooleanFlag(raw.vsl_player) : inferred.vsl_player;
  const funnelQuiz = hasValue(raw.funil_quiz) ? parseBooleanFlag(raw.funil_quiz) : inferred.funnel_quiz;
  const doubleSignal = hasValue(raw.sinal_duplo) ? parseBooleanFlag(raw.sinal_duplo) : inferred.double_signal;
  const billingTechDetected = hasValue(raw.billing_tech_detected)
    ? parseBooleanFlag(raw.billing_tech_detected)
    : parseBooleanFlag(raw.mrr);

  return {
    group: cleanText(raw.grupo, 80),
    novel: parseBooleanFlag(raw.inedita),
    scaled: pixelAds && (timesSeen >= 2 || doubleSignal),
    billing_tech_detected: billingTechDetected,
    subscription_verified: parseBooleanFlag(raw.subscription_verified),
    saas_classification: cleanText(raw.saas_classificacao, 80),
    monthly_price: cleanText(raw.preco_mensal, 80),
    annual_price: cleanText(raw.preco_anual, 80),
    trial_detected: parseBooleanFlag(raw.trial_detectado),
    free_plan: parseBooleanFlag(raw.plano_gratis),
    pricing_url: optionalHttpUrl(raw.pricing_url, 'Página de preços'),
    saas_evidence: cleanText(raw.evidencias_saas, 800).split(/\s*\|\s*/).filter(Boolean).slice(0, 24),
    pixel_ads: pixelAds,
    vsl_player: vslPlayer,
    funnel_quiz: funnelQuiz,
    gateway: gateways[0] || '',
    gateways,
    tracker: trackers[0] || '',
    trackers,
    double_signal: doubleSignal,
    times_seen: timesSeen,
    language: cleanText(raw.idioma, 20),
    country: cleanText(raw.pais, 8),
    age_days: Math.max(0, Number.parseInt(cleanText(raw.idade_dias, 12), 10) || 0),
    new_builder: parseBooleanFlag(raw.construtor_novo),
    query,
    queries: inferred.queries,
    motives: cleanText(raw.motivos, 800).split(/\s*(?:\||,)\s*/).map((item) => item.trim()).filter(Boolean).slice(0, 24),
    url_status: cleanText(raw.status_url, 40),
    http_status: cleanText(raw.http_status, 12)
  };
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeHeaders(rawHeaders) {
  const headers = rawHeaders.map((header) => cleanText(header.replace(/^\uFEFF/, ''), 100).toLowerCase());
  if (headers.some((header) => !header)) throw new CsvValidationError('empty_header', 'O CSV contém uma coluna sem nome.');
  if (new Set(headers).size !== headers.length) throw new CsvValidationError('duplicate_header', 'O CSV contém nomes de coluna repetidos.');
  const unknown = headers.filter((header) => !ALLOWED_HEADERS.has(header));
  if (unknown.length) throw new CsvValidationError('unknown_header', `Coluna não reconhecida: ${unknown[0]}.`, { header: unknown[0] });
  if (!headers.includes('score')) throw new CsvValidationError('missing_header', 'A coluna score é obrigatória.');
  if (!headers.includes('url') && !headers.includes('oferta')) throw new CsvValidationError('missing_header', 'A coluna url ou oferta é obrigatória.');
  if (!headers.includes('titulo') && !headers.includes('dominio')) throw new CsvValidationError('missing_header', 'A coluna titulo ou dominio é obrigatória.');
  return headers;
}

async function normalizeRow(raw, line) {
  Object.entries(raw).forEach(([header, value]) => assertNoFormula(header, value, line));
  const rawUrl = cleanText(raw.url, 2_000) || extractLegacyHyperlink(raw.oferta);
  const urlFinal = canonicalizeOfferUrl(rawUrl);
  const parsedUrl = new URL(urlFinal);
  const score = Number.parseInt(cleanText(raw.score, 12), 10);
  if (!Number.isInteger(score) || score < 0 || score > 100) throw new CsvValidationError('invalid_score', `Score inválido na linha ${line}.`, { line });
  const title = cleanText(restoreSpreadsheetText(raw.titulo), 240) || cleanText(raw.dominio, 253) || parsedUrl.hostname;
  const query = cleanText(raw.query, 200);
  const fingerprint = await sha256(`${parsedUrl.hostname}|${urlFinal}`.toLowerCase());
  const adsSearchUrl = optionalHttpUrl(raw.ads_ativos, 'Biblioteca de anúncios');
  const signals = normalizeSignals(raw, query);

  return {
    fingerprint,
    domain: parsedUrl.hostname,
    url_final: urlFinal,
    title,
    niche: cleanText(raw.nicho, 120) || 'outros',
    priority: tierFromScore(score),
    score,
    screenshot_url: optionalHttpUrl(raw.screenshot, 'Screenshot'),
    preview_url: optionalHttpUrl(raw.preview, 'Preview'),
    ads_url: adsSearchUrl,
    source_seen_at: cleanText(raw.data_scan || raw.visto_desde, 40),
    signals: { ...signals, ads_search_url: adsSearchUrl }
  };
}

export async function parseHunterCsv(input, options = {}) {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;
  const maxColumns = options.maxColumns ?? DEFAULT_MAX_COLUMNS;
  if (byteLength(input) > maxBytes) throw new CsvValidationError('file_too_large', `O CSV excede ${maxBytes} bytes.`);

  let text;
  try { text = decode(input).replace(/^\uFEFF/, ''); }
  catch { throw new CsvValidationError('invalid_encoding', 'O arquivo precisa estar em UTF-8.'); }
  const matrix = parseCsvMatrix(text, maxRows, maxColumns);
  if (matrix.length < 2) throw new CsvValidationError('empty_csv', 'O CSV não contém ofertas.');
  const headers = normalizeHeaders(matrix[0]);
  const normalized = [];

  for (let index = 1; index < matrix.length; index += 1) {
    const values = matrix[index];
    if (values.length !== headers.length) {
      throw new CsvValidationError(
        'malformed_row',
        `A linha ${index + 1} tem ${values.length} colunas; o cabeçalho tem ${headers.length}.`,
        { line: index + 1, expectedColumns: headers.length, actualColumns: values.length }
      );
    }
    const raw = {};
    headers.forEach((header, column) => { raw[header] = values[column] ?? ''; });
    normalized.push(await normalizeRow(raw, index + 1));
  }

  const unique = new Map();
  normalized.forEach((row) => {
    const previous = unique.get(row.fingerprint);
    if (!previous || row.score > previous.score) unique.set(row.fingerprint, row);
  });
  const rows = [...unique.values()];
  return {
    rows,
    meta: {
      totalRows: normalized.length,
      acceptedRows: rows.length,
      duplicateRows: normalized.length - rows.length,
      headers,
      engineVersion: cleanText(matrix[1][headers.indexOf('engine_version')] || matrix[1][headers.indexOf('versao_motor')], 80)
    }
  };
}
