import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  CsvValidationError,
  canonicalizeOfferUrl,
  extractLegacyHyperlink,
  parseHunterCsv
} from '../supabase/functions/_shared/hunter-csv.js';

test('normalizes the current Hunter CSV and removes spreadsheet formulas', async () => {
  const csv = [
    'prioridade,score,vezes_vista,visto_desde,url,oferta,ads_ativos,nicho,dominio,titulo,idioma,pais,data_scan,idade_dias,construtor_novo,query,motivos,screenshot,preview',
    'S Elite,12,4,2026-08-01,https://www.example.com/oferta/?utm_source=meta#top,"=HYPERLINK(""https://example.com/oferta/"",""Abrir oferta"")","=HYPERLINK(""https://facebook.com/ads/library/?q=oferta1"",""Ads"")",Emagrecimento,example.com,"Método, Rotina Leve",pt,BR,2026-08-21,20,sim,combo_hotmart_utmify,"sinal_duplo, reincidente",https://urlscan.io/screenshots/a.png,https://urlscan.io/result/a'
  ].join('\n');

  const result = await parseHunterCsv(csv);
  assert.equal(result.meta.totalRows, 1);
  assert.equal(result.rows[0].url_final, 'https://example.com/oferta');
  assert.equal(result.rows[0].domain, 'example.com');
  assert.equal(result.rows[0].title, 'Método, Rotina Leve');
  assert.equal(result.rows[0].priority, 'S');
  assert.equal(result.rows[0].signals.ads_search_url, 'https://facebook.com/ads/library/?q=oferta1');
  assert.equal(result.rows[0].signals.double_signal, true);
  assert.match(result.rows[0].fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(result.rows).includes('HYPERLINK'), false);
});

test('parses quoted line breaks without splitting the offer', async () => {
  const csv = 'titulo,dominio,url,score,query,motivos\n"Oferta em\nduas linhas",example.test,https://example.test/venda,7,gateway_hotmart,"pixel, checkout"';
  const result = await parseHunterCsv(csv);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].title, 'Oferta em duas linhas');
  assert.deepEqual(result.rows[0].signals.motives, ['pixel', 'checkout']);
});

test('rejects spreadsheet formulas outside legacy hyperlink columns', async () => {
  const csv = 'titulo,dominio,url,score\n=WEBSERVICE("https://evil.test"),example.test,https://example.test,8';
  await assert.rejects(() => parseHunterCsv(csv), (error) => {
    assert.ok(error instanceof CsvValidationError);
    assert.equal(error.code, 'formula_not_allowed');
    return true;
  });
});

test('rejects unsafe URLs and unknown columns', async () => {
  await assert.rejects(
    () => parseHunterCsv('titulo,dominio,url,score\nTeste,example.test,javascript:alert(1),8'),
    (error) => error instanceof CsvValidationError && error.code === 'unsafe_url'
  );
  await assert.rejects(
    () => parseHunterCsv('titulo,dominio,url,score,senha\nTeste,example.test,https://example.test,8,segredo'),
    (error) => error instanceof CsvValidationError && error.code === 'unknown_header'
  );
});

test('enforces row and byte limits before returning normalized data', async () => {
  const twoRows = 'titulo,dominio,url,score\nA,a.test,https://a.test,8\nB,b.test,https://b.test,7';
  await assert.rejects(
    () => parseHunterCsv(twoRows, { maxRows: 1 }),
    (error) => error instanceof CsvValidationError && error.code === 'too_many_rows'
  );
  await assert.rejects(
    () => parseHunterCsv(twoRows, { maxBytes: 12 }),
    (error) => error instanceof CsvValidationError && error.code === 'file_too_large'
  );
});

test('rejects rows with a different number of columns than the header', async () => {
  await assert.rejects(
    () => parseHunterCsv('titulo,dominio,url,score\nTeste,example.test,https://example.test'),
    (error) => error instanceof CsvValidationError && error.code === 'malformed_row'
  );
  await assert.rejects(
    () => parseHunterCsv('titulo,dominio,url,score\nTeste,example.test,https://example.test,8,extra'),
    (error) => error instanceof CsvValidationError && error.code === 'malformed_row'
  );
});

test('enforces the column limit on a final row without a trailing newline', async () => {
  await assert.rejects(
    () => parseHunterCsv('titulo,dominio,url,score\nTeste,example.test,https://example.test,8,extra', { maxColumns: 4 }),
    (error) => error instanceof CsvValidationError && error.code === 'too_many_columns'
  );
});

test('canonical URL and legacy formula helpers accept only the intended formats', () => {
  assert.equal(canonicalizeOfferUrl('https://WWW.Example.com/produto/?utm_campaign=x&b=2&a=1#cta'), 'https://example.com/produto?a=1&b=2');
  assert.equal(extractLegacyHyperlink('=HYPERLINK("https://example.test/path","Abrir")'), 'https://example.test/path');
  assert.throws(() => extractLegacyHyperlink('=WEBSERVICE("https://example.test")'), /HYPERLINK/);
});

test('normalizes explicit signals without treating VSL or quiz as gateways or trackers', async () => {
  const csv = [
    'titulo,dominio,url,score,grupo,inedita,escalado,mrr,pixel_ads,vsl_player,funil_quiz,vezes_vista,query,motivos,ads_ativos',
    'VSL sem pixel,vsl.test,https://vsl.test/venda?produto=7&utm_source=x,8,info,sim,sim,, ,sim,,4,vsl_vturb,vsl_player,',
    'Quiz com pixel,quiz.test,https://quiz.test/?offer=9,9,info,,sim,,sim,,sim,2,pixel_typebot_meta,"pixel_ads, funil_quiz","=HYPERLINK(""https://facebook.com/ads/library/?q=quiz"",""Pesquisar"")"'
  ].join('\n');

  const result = await parseHunterCsv(csv);
  const [vsl, quiz] = result.rows;
  assert.equal(vsl.url_final, 'https://vsl.test/venda?produto=7');
  assert.equal(vsl.signals.group, 'info');
  assert.equal(vsl.signals.novel, true);
  assert.equal(vsl.signals.vsl_player, true);
  assert.equal(vsl.signals.pixel_ads, false);
  assert.equal(vsl.signals.scaled, false);
  assert.deepEqual(vsl.signals.gateways, []);
  assert.deepEqual(vsl.signals.trackers, []);
  assert.equal(quiz.signals.funnel_quiz, true);
  assert.equal(quiz.signals.pixel_ads, true);
  assert.equal(quiz.signals.scaled, true);
  assert.equal(quiz.signals.ads_search_url.includes('facebook.com/ads/library'), true);
  assert.deepEqual(Object.keys(quiz.signals).sort(), [
    'group', 'novel', 'scaled', 'billing_tech_detected', 'subscription_verified',
    'saas_classification', 'monthly_price', 'annual_price', 'trial_detected', 'free_plan',
    'pricing_url', 'saas_evidence', 'pixel_ads', 'vsl_player', 'funnel_quiz',
    'gateway', 'gateways', 'tracker', 'trackers', 'double_signal', 'times_seen',
    'language', 'country', 'age_days', 'new_builder', 'query', 'queries', 'motives',
    'url_status', 'http_status', 'ads_search_url'
  ].sort());
});

test('accepts the v4 signal contract, consolidated queries and safely restores spreadsheet text', async () => {
  const csv = [
    'titulo,dominio,url,score,grupo,inedita,billing_tech_detected,subscription_verified,sinal_duplo,vsl_player,funil_quiz,query,motivos,engine_version',
    "'+360 Atividades,example.test,https://example.test/pricing,8,saas_br,sim,sim,sim,sim,sim,sim,saasg_chargebee | combo_vturb_utmify,billing_tech_detected | pricing | trial,4.0"
  ].join('\n');
  const result = await parseHunterCsv(csv);
  const row = result.rows[0];
  assert.equal(row.title, '+360 Atividades');
  assert.equal(row.signals.billing_tech_detected, true);
  assert.equal(row.signals.subscription_verified, true);
  assert.equal(row.signals.double_signal, true);
  assert.equal(row.signals.vsl_player, true);
  assert.equal(row.signals.funnel_quiz, true);
  assert.deepEqual(row.signals.queries, ['combo_vturb_utmify', 'saasg_chargebee']);
  assert.deepEqual(row.signals.motives, ['billing_tech_detected', 'pricing', 'trial']);
  assert.equal(result.meta.engineVersion, '4.0');
});

test('infers legacy query signals with their explicit semantics', async () => {
  const csv = [
    'titulo,dominio,url,score,query,vezes_vista',
    'VTurb,v.test,https://v.test,8,combo_vturb,3',
    'Panda,p.test,https://p.test,8,combo_panda,3',
    'Typebot,t.test,https://t.test,8,combo_typebot,3',
    'Tracker,u.test,https://u.test,8,tracker_utmify,1',
    'RD Station,r.test,https://r.test,8,tracker_rdstation,1',
    'Pixel,pixel.test,https://pixel.test,8,pixel_meta,1',
    'Gateway,h.test,https://h.test,8,gateway_hotmart,1',
    'Checkout,k.test,https://k.test,8,checkout_kiwify,1',
    'Cakto,c.test,https://c.test,8,gateway_cakto,1',
    'Kirvano,i.test,https://i.test,8,gateway_kirvano,1',
    'Eduzz,e.test,https://e.test,8,gateway_eduzz,1'
  ].join('\n');

  const result = await parseHunterCsv(csv);
  assert.equal(result.rows[0].signals.vsl_player, true);
  assert.equal(result.rows[0].signals.gateway, '');
  assert.equal(result.rows[1].signals.vsl_player, true);
  assert.equal(result.rows[1].signals.tracker, '');
  assert.equal(result.rows[2].signals.funnel_quiz, true);
  assert.equal(result.rows[3].signals.tracker, 'utmify');
  assert.equal(result.rows[4].signals.tracker, 'rdstation');
  assert.equal(result.rows[5].signals.tracker, 'meta');
  assert.equal(result.rows[6].signals.gateway, 'hotmart');
  assert.equal(result.rows[7].signals.gateway, 'kiwify');
  assert.equal(result.rows[8].signals.gateway, 'cakto');
  assert.equal(result.rows[9].signals.gateway, 'kirvano');
  assert.equal(result.rows[10].signals.gateway, 'eduzz');
});

test('does not let escalado or ads search URL claim active advertising', async () => {
  const csv = [
    'titulo,dominio,url,score,escalado,ads_ativos,vezes_vista',
    'Só biblioteca,ads.test,https://ads.test,7,sim,https://facebook.com/ads/library/?q=x,5'
  ].join('\n');

  const result = await parseHunterCsv(csv);
  assert.equal(result.rows[0].signals.pixel_ads, false);
  assert.equal(result.rows[0].signals.scaled, false);
  assert.equal(result.rows[0].signals.ads_search_url, 'https://facebook.com/ads/library/?q=x');
});

test('matches the shared URL canonicalization fixture', async () => {
  const fixture = JSON.parse(await readFile(new URL('./fixtures/url-canonicalization.json', import.meta.url), 'utf8'));
  fixture.forEach(({ input, expected }) => assert.equal(canonicalizeOfferUrl(input), expected));
});
