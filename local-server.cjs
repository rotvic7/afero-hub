const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');

const HUB_DIR = __dirname;
const PROJECTS_DIR = 'projetos';
const MAX_BODY_BYTES = 250_000;

function slugify(value) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return normalized || 'projeto-sem-nome';
}

function cleanText(value, max = 4000) {
  return String(value || '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

function required(value, label) {
  const cleaned = cleanText(value);
  if (!cleaned) throw new Error(`${label} é obrigatório.`);
  return cleaned;
}

function safeUrl(value) {
  const cleaned = cleanText(value, 2000);
  if (!cleaned) return '';
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('protocol');
    return parsed.href;
  } catch {
    throw new Error('A URL da oferta ou do ativo é inválida.');
  }
}

function ensureInside(base, candidate) {
  const relative = path.relative(base, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Caminho de projeto inválido.');
  return candidate;
}

function readTemplate(name) {
  return fs.readFileSync(path.join(HUB_DIR, 'workflow', name), 'utf8');
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function projectsRoot(rootDir) {
  return path.join(path.resolve(rootDir), PROJECTS_DIR);
}

function projectDirectory(rootDir, slug) {
  const normalized = slugify(slug);
  if (normalized !== slug) throw new Error('Identificador de projeto inválido.');
  const root = projectsRoot(rootDir);
  return ensureInside(root, path.join(root, normalized));
}

function readProject(rootDir, slug) {
  const projectPath = projectDirectory(rootDir, slug);
  const statePath = path.join(projectPath, 'projeto.json');
  if (!fs.existsSync(statePath)) throw new Error('Projeto não encontrado.');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  return { projectPath, statePath, state };
}

function projectSummary(state) {
  return {
    slug: state.slug,
    path: state.path,
    status: state.status,
    createdAt: state.createdAt,
    title: state.brief && state.brief.projectName,
    offerTitle: state.offer && state.offer.title,
    artifacts: state.artifacts || {},
    approvals: state.approvals || {}
  };
}

function listProjects(rootDir) {
  const root = projectsRoot(rootDir);
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      try { return readProject(rootDir, entry.name).state; } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .map(projectSummary);
}

function advanceProject(rootDir, slug, stage) {
  const { projectPath, statePath, state } = readProject(rootDir, slug);
  const transitions = {
    copy: { from: 'copy-em-revisao', to: 'pagina-pronta-para-execucao', artifact: 'copy', approval: 'copy' },
    page: { from: 'pagina-em-revisao', to: 'pronto-para-exportar', artifact: 'page', approval: 'page' }
  };
  const transition = transitions[stage];
  if (!transition) throw new Error('Etapa de aprovação inválida.');
  if (state.status !== transition.from) throw new Error(`Este projeto está em ${state.status}. A aprovação atual não está disponível.`);
  const artifact = state.artifacts && state.artifacts[transition.artifact];
  if (!artifact) throw new Error('O agente ainda não registrou o artefato desta etapa.');
  const artifactPath = ensureInside(projectPath, path.resolve(projectPath, artifact));
  if (!fs.existsSync(artifactPath)) throw new Error('O arquivo da etapa não foi encontrado.');

  state.status = transition.to;
  state.approvals = state.approvals || {};
  state.approvals[transition.approval] = new Date().toISOString();
  writeText(statePath, `${JSON.stringify(state, null, 2)}\n`);
  return projectSummary(state);
}

function markdownBrief(project) {
  const { offer, brief } = project;
  return `# Briefing do projeto\n\n` +
    `## Direção\n\n` +
    `- Projeto: ${brief.projectName}\n` +
    `- Produto: ${brief.productName}\n` +
    `- Público: ${brief.audience}\n` +
    `- Problema: ${brief.problem}\n` +
    `- Promessa: ${brief.promise}\n` +
    `- Ângulo: ${brief.angle}\n` +
    `- Tom: ${brief.tone}\n` +
    `- CTA: ${brief.cta}\n` +
    `- Seções obrigatórias: ${brief.requiredSections}\n\n` +
    `## Ativos e regras\n\n` +
    `- Vídeo: ${brief.videoMode}\n` +
    `- Referência do vídeo: ${offer.videoReference || 'nenhuma'}\n` +
    `- Checkout principal: será criado depois\n` +
    `- Checkout secundário: será criado depois\n` +
    `- Direito de uso confirmado: sim\n\n` +
    `## Oferta de referência\n\n` +
    `- Título: ${offer.title}\n` +
    `- URL: ${offer.url}\n` +
    `- Domínio: ${offer.domain || 'não informado'}\n` +
    `- Tier e score: ${offer.tier || 'sem tier'} · ${offer.score ?? 'sem score'}\n` +
    `- Sinais: ${offer.signals || 'sem sinais'}\n`;
}

function offerReference(project) {
  const { offer } = project;
  return `# Oferta de referência\n\n` +
    `Esta oferta foi selecionada no Caçador de Ofertas como referência de pesquisa.\n\n` +
    `- Título: ${offer.title}\n` +
    `- URL: ${offer.url}\n` +
    `- Screenshot: ${offer.screenshot || 'não disponível'}\n` +
    `- Sinais técnicos: ${offer.signals || 'não disponível'}\n\n` +
    `Use este material para entender estrutura, contexto e hipóteses. A nova oferta precisa de mensagem, marca e provas próprias.\n`;
}

function adapter(project, platform) {
  const instructionFile = platform === 'codex' ? 'AGENTS.md' : 'CLAUDE.md';
  return `# Hunter Hub · ${platform === 'codex' ? 'Codex' : 'Claude Code'}\n\n` +
    `Você está no projeto local \`${project.slug}\`.\n\n` +
    `1. Leia \`projeto.json\` e \`workflow/PROCESSO.md\`.\n` +
    `2. O estado atual é \`${project.status}\`.\n` +
    `3. Leia os arquivos necessários em \`contexto/\`.\n` +
    `4. Execute somente a etapa autorizada.\n` +
    `5. Salve o resultado em \`resultados/\` e atualize \`projeto.json\` como definido pelo agente.\n\n` +
    `Nunca publique, faça deploy ou preencha checkout.\n\n` +
    `Este arquivo é o adaptador ${instructionFile} do processo central.\n`;
}

function starter(project) {
  return `# Como iniciar\n\n` +
    `Abra esta pasta no terminal e inicie sua ferramenta:\n\n` +
    `\`\`\`powershell\ncd "${project.path}"\ncodex\n\`\`\`\n\n` +
    `ou\n\n` +
    `\`\`\`powershell\ncd "${project.path}"\nclaude\n\`\`\`\n\n` +
    `Depois, diga: \"Leia o arquivo de instruções e execute a próxima etapa autorizada.\"\n\n` +
    `Estado inicial: \`${project.status}\`.\n`;
}

function createProject(input) {
  const rootDir = path.resolve(input && input.rootDir ? input.rootDir : HUB_DIR);
  const offerInput = (input && input.offer) || {};
  const briefInput = (input && input.brief) || {};
  if (briefInput.rightsConfirmed !== true) throw new Error('Confirme o direito de uso dos ativos antes de criar o projeto.');

  const projectName = required(briefInput.projectName, 'Nome do projeto');
  const project = {
    schemaVersion: 1,
    slug: slugify(projectName),
    path: '',
    createdAt: new Date().toISOString(),
    status: 'copy-pronta-para-execucao',
    offer: {
      title: required(offerInput.title, 'Título da oferta'),
      url: safeUrl(required(offerInput.url, 'URL da oferta')),
      domain: cleanText(offerInput.domain, 300),
      tier: cleanText(offerInput.tier, 20),
      score: Number.isFinite(Number(offerInput.score)) ? Number(offerInput.score) : null,
      signals: cleanText(offerInput.signals, 500),
      screenshot: safeUrl(offerInput.screenshot),
      videoReference: safeUrl(offerInput.videoReference)
    },
    brief: {
      projectName,
      productName: cleanText(briefInput.productName) || projectName,
      audience: required(briefInput.audience, 'Público'),
      problem: required(briefInput.problem, 'Problema'),
      promise: required(briefInput.promise, 'Promessa'),
      angle: cleanText(briefInput.angle, 100) || 'adaptar',
      tone: cleanText(briefInput.tone, 300) || 'direto',
      cta: cleanText(briefInput.cta, 200) || 'QUERO COMEÇAR',
      videoMode: cleanText(briefInput.videoMode, 40) || 'sem-video',
      requiredSections: cleanText(briefInput.requiredSections, 1000) || 'Hero, benefícios, oferta, FAQ',
      rightsConfirmed: true
    },
    checkout: { principal: '', secundario: '' },
    approvals: { copy: null, page: null },
    artifacts: { copy: '', page: '' }
  };

  const root = projectsRoot(rootDir);
  const projectPath = ensureInside(root, path.join(root, project.slug));
  if (fs.existsSync(projectPath)) throw new Error('Já existe um projeto com este nome. Altere o nome para criar outra versão.');
  project.path = projectPath;

  fs.mkdirSync(path.join(projectPath, 'contexto'), { recursive: true });
  fs.mkdirSync(path.join(projectPath, 'workflow'), { recursive: true });
  fs.mkdirSync(path.join(projectPath, 'resultados', 'copy'), { recursive: true });
  fs.mkdirSync(path.join(projectPath, 'resultados', 'pagina'), { recursive: true });

  writeText(path.join(projectPath, 'projeto.json'), `${JSON.stringify(project, null, 2)}\n`);
  writeText(path.join(projectPath, 'contexto', 'briefing.md'), markdownBrief(project));
  writeText(path.join(projectPath, 'contexto', 'oferta-original.md'), offerReference(project));
  writeText(path.join(projectPath, 'contexto', 'diagnostico.json'), `${JSON.stringify(project.offer, null, 2)}\n`);
  writeText(path.join(projectPath, 'contexto', 'video.json'), `${JSON.stringify({ mode: project.brief.videoMode, reference: project.offer.videoReference, rightsConfirmed: true }, null, 2)}\n`);
  writeText(path.join(projectPath, 'workflow', 'PROCESSO.md'), readTemplate('PROCESSO.md'));
  writeText(path.join(projectPath, 'workflow', 'AGENTE-COPY.md'), readTemplate('AGENTE-COPY.md'));
  writeText(path.join(projectPath, 'workflow', 'AGENTE-PAGINA.md'), readTemplate('AGENTE-PAGINA.md'));
  writeText(path.join(projectPath, 'AGENTS.md'), adapter(project, 'codex'));
  writeText(path.join(projectPath, 'CLAUDE.md'), adapter(project, 'claude'));
  writeText(path.join(projectPath, 'INICIAR.md'), starter(project));

  return { slug: project.slug, path: project.path, status: project.status };
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('O formulário excede o limite permitido.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw new Error('Dados do formulário inválidos.'); }
}

function respond(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' }[ext] || 'application/octet-stream';
}

async function serveStatic(res, pathname) {
  const requestPath = pathname === '/' ? '/index.html' : pathname;
  const decoded = decodeURIComponent(requestPath);
  const target = ensureInside(HUB_DIR, path.resolve(HUB_DIR, `.${decoded}`));
  try {
    const stat = await fsp.stat(target);
    if (!stat.isFile()) throw new Error('not-file');
    res.writeHead(200, { 'Content-Type': mimeType(target), 'Cache-Control': 'no-store' });
    fs.createReadStream(target).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Arquivo não encontrado.');
  }
}

function createServer(options = {}) {
  const rootDir = path.resolve(options.rootDir || HUB_DIR);
  return http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'GET' && requestUrl.pathname === '/api/health') return respond(res, 200, { local: true });
    if (req.method === 'GET' && requestUrl.pathname === '/api/projects') return respond(res, 200, { projects: listProjects(rootDir) });
    if (req.method === 'POST' && requestUrl.pathname === '/api/projects') {
      try {
        const body = await readJsonBody(req);
        return respond(res, 201, { project: createProject({ ...body, rootDir }) });
      }
      catch (error) { return respond(res, 400, { error: error.message || 'Não foi possível criar o projeto.' }); }
    }
    const approval = requestUrl.pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/approve-(copy|page)$/);
    if (req.method === 'POST' && approval) {
      try { return respond(res, 200, { project: advanceProject(rootDir, approval[1], approval[2]) }); }
      catch (error) { return respond(res, 400, { error: error.message || 'Não foi possível aprovar a etapa.' }); }
    }
    if (req.method === 'GET') return serveStatic(res, requestUrl.pathname);
    return respond(res, 405, { error: 'Método não permitido.' });
  });
}

if (require.main === module) {
  const port = Number(process.env.HUNTER_HUB_PORT || 4377);
  createServer().listen(port, '127.0.0.1', () => {
    console.log(`Hunter Hub local em http://127.0.0.1:${port}/index.html`);
  });
}

module.exports = { createProject, createServer, slugify };
