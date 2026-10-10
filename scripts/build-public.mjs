import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const marker = '.afero-public-build';
const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));

// Only browser-deliverable pages and assets belong in the Vercel output.
const publicFiles = Object.freeze([
  { source: 'lp-afero-hub-vendas.html', target: 'index.html' },
  { source: 'index.html', target: 'hub.html' },
  { source: 'supabase/functions/_shared/hunter-csv.js', target: 'afero-csv-core.js' },
  { source: 'logo-afero-new', target: 'assets/images/afero-logo.png' },
  { source: 'video/afero-hub-ad/public/fonts/manrope-600.ttf', target: 'assets/fonts/manrope-600.ttf' },
  ...[
  'lp-afero-hub-vendas.html',
  'guia-funil-afero-hub.html',
  'privacidade.html',
  'robots.txt',
  'sitemap.xml',
  'afero-cloud-config.js',
  'afero-cloud.js',
  'afero-auth-challenge.js',
  'afero-panel.css',
  'afero-csv.js',
  'afero-csv-worker.js',
  'assets/afero-logo-transparent.webp',
  'assets/afero-mark-transparent.webp',
  'assets/fonts/Inter-Variable.woff2',
  'assets/fonts/Unbounded-Variable.woff2',
  'afero-live-map-shelf.js',
  'editorial-motion.js',
  'afero-tokens.css',
  'editorial.css',
  'orbitra-atlas.css',
  'orbitra-shelf.css',
  'vendor/three.min.js',
  'vendor/gsap.min.js',
  'vendor/ScrollTrigger.min.js',
  'vendor/supabase.js',
  'assets/afero-vendas.css',
  'assets/afero-vendas.js',
  'assets/afero-vendas-config.js',
  'assets/afero-vendas-tracking.js',
  'assets/afero-consent.css',
  'afero-checkout.js',
  'assets/vendor/gsap.min.js',
  'assets/fonts/Satoshi-Variable.woff2',
  'prints/hub-catalogo.webp',
  'prints/hub-console.webp',
  'prints/hub-filtros.webp',
  'prints/hub-grade.webp',
  'prints/hub-mobile-grade.webp',
  'prints/hub-mobile.webp',
  'prints/hub-raiox.webp',
  'prints/hub-terminal.webp',
  'prints/mod-console.webp',
  'prints/mod-filtros.webp',
  'prints/mod-raiox.webp',
  'prints/lp-confronto-metodos.jpg',
  'prints/lp-dualidade-caminhos.jpg',
  'prints/lp-operador-radar.jpg'
  ].map((path) => ({ source: path, target: path }))
]);

function executableInlineScripts(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter((match) =>
    !/\bsrc\s*=/i.test(match[1]) && !/\btype\s*=\s*["'](?:application\/ld\+json|application\/json)["']/i.test(match[1]) && match[2].trim());
}
function inlineAsset(target, number) { return `assets/page-scripts/${target.replace(/\.html$/, '')}-${number}.js`; }
const inlinePaths = publicFiles.filter(({ target }) => target.endsWith('.html')).flatMap(({ source, target }) =>
  executableInlineScripts(readFileSync(join(root, source), 'utf8')).map((_, index) => inlineAsset(target, index + 1)));
export const publicPaths = Object.freeze([...publicFiles.map(({ target }) => target), ...inlinePaths]);
export const publicSourcePaths = Object.freeze(publicFiles.map(({ source }) => source));

function publishedHtml(html, source) {
  // Source pages keep working locally; published links follow the public routes.
  const links = { 'index.html': '/hub', 'lp-afero-hub-vendas.html': '/' };
  html = html.replace(/\bhref=(["'])(index\.html|lp-afero-hub-vendas\.html)([?#][^"']*)?\1/g,
    (_, quote, page, suffix = '') => `href=${quote}${links[page]}${suffix}${quote}`);
  if (source === 'lp-afero-hub-vendas.html') {
    html = html.replaceAll('video/afero-hub-ad/public/fonts/manrope-600.ttf', 'assets/fonts/manrope-600.ttf')
      .replaceAll("url('logo-afero-new')", "url('assets/images/afero-logo.png')");
  }
  return html;
}

function externalizeScripts(html, target, output) {
  let number = 0;
  for (const match of executableInlineScripts(html)) {
    const asset = inlineAsset(target, ++number);
    mkdirSync(dirname(join(output, asset)), { recursive: true });
    writeFileSync(join(output, asset), match[2]);
    html = html.replace(match[0], `<script${match[1]} src="/${asset}"></script>`);
  }
  return html;
}

export function verifyPublicAssets(outputDir) {
  const output = resolve(outputDir);
  for (const file of publicPaths.filter((path) => /\.(?:html|css)$/.test(path))) {
    const text = readFileSync(join(output, file), 'utf8')
      .replace(/<script\b([^>]*)>[\s\S]*?<\/script>/gi, '<script$1></script>');
    const resources = file.endsWith('.html')
      ? [...text.matchAll(/\b(?:src|href|poster)=["']([^"']+)["']/gi)].map((match) => match[1])
      : [];
    resources.push(...[...text.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)/gi)]
      .map((match) => match[1] ?? match[2] ?? match[3]));
    for (const value of resources) {
      const resource = value.trim();
      if (/^(?:file:|[a-z]:[\\/])/i.test(resource)) throw new Error(`Local computer path: ${file} -> ${resource}`);
      if (/^(?:https?:|data:|#|mailto:|tel:|\/\/)/i.test(resource)) continue;
      const url = new URL(resource, `https://public.invalid/${file}`);
      const route = (vercel.rewrites || []).find(({ source }) => source === url.pathname);
      const pathname = route ? route.destination : url.pathname === '/' ? '/index.html' : url.pathname;
      const asset = resolve(output, `.${decodeURIComponent(pathname)}`);
      if (!isInside(output, asset) || !existsSync(asset)) throw new Error(`Missing public dependency: ${file} -> ${resource}`);
    }
  }
}

function isInside(base, candidate) {
  const path = relative(base, candidate);
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

export function buildPublic(outputDir = join(root, vercel.outputDirectory)) {
  const output = resolve(outputDir);
  const ownershipMarker = `${output}.${marker}`;
  if (!isInside(root, output) && !isInside(tmpdir(), output)) {
    throw new Error('Output must be a child directory of the workspace or temporary directory.');
  }
  for (const { source } of publicFiles) {
    if (!existsSync(join(root, source))) throw new Error(`Missing public asset: ${source}`);
  }
  if (existsSync(output)) {
    if (!existsSync(ownershipMarker) || readFileSync(ownershipMarker, 'utf8') !== 'afero-public-build\n') {
      throw new Error(`Refusing to replace an unowned output directory: ${output}`);
    }
    rmSync(output, { recursive: true, force: true });
  }
  mkdirSync(output, { recursive: true });
  for (const { source, target } of publicFiles) {
    const destination = join(output, target);
    mkdirSync(dirname(destination), { recursive: true });
    if (target.endsWith('.html')) {
      writeFileSync(destination, externalizeScripts(publishedHtml(readFileSync(join(root, source), 'utf8'), source), target, output));
    } else {
      cpSync(join(root, source), destination);
    }
  }
  writeFileSync(ownershipMarker, 'afero-public-build\n');
  verifyPublicAssets(output);
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputDir = process.argv[2] ? resolve(root, process.argv[2]) : join(root, vercel.outputDirectory);
  console.log(`Public site ready: ${buildPublic(outputDir)}`);
}
