const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createProject } = require('../local-server.cjs');

test('createProject exports a review-ready local project for Codex and Claude Code', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hunter-hub-'));
  try {
    const project = createProject({
      rootDir: root,
      offer: {
        title: 'Confirmação do pedido | Corpo Conectado',
        url: 'https://corpoconectado1.acervodosaber.online/',
        domain: 'acervodosaber.online',
        tier: 'A',
        score: 7,
        signals: 'gateway_hotmart | tracker_utmify',
        screenshot: 'https://example.test/capture.png',
        videoReference: 'https://scripts.converteai.net/example/player.js'
      },
      brief: {
        projectName: 'Corpo Conectado Remodelado',
        productName: 'Corpo Conectado',
        audience: 'Pessoas que buscam reconectar corpo e rotina',
        problem: 'Dificuldade de manter hábitos consistentes',
        promise: 'Uma rotina guiada para reconectar corpo e rotina',
        angle: 'adaptar',
        tone: 'direto e acolhedor',
        cta: 'QUERO COMEÇAR',
        videoMode: 'preservar',
        requiredSections: 'Hero, benefícios, vídeo, FAQ',
        rightsConfirmed: true
      }
    });

    assert.equal(project.slug, 'corpo-conectado-remodelado');
    assert.equal(project.status, 'copy-pronta-para-execucao');
    assert.ok(fs.existsSync(path.join(project.path, 'AGENTS.md')));
    assert.ok(fs.existsSync(path.join(project.path, 'CLAUDE.md')));
    assert.ok(fs.existsSync(path.join(project.path, 'INICIAR.md')));
    assert.ok(fs.existsSync(path.join(project.path, 'contexto', 'briefing.md')));
    assert.ok(fs.existsSync(path.join(project.path, 'workflow', 'AGENTE-COPY.md')));
    assert.ok(fs.existsSync(path.join(project.path, 'workflow', 'AGENTE-PAGINA.md')));
    assert.ok(fs.existsSync(path.join(project.path, 'resultados', 'copy')));
    assert.ok(fs.existsSync(path.join(project.path, 'resultados', 'pagina')));

    const state = JSON.parse(fs.readFileSync(path.join(project.path, 'projeto.json'), 'utf8'));
    const briefing = fs.readFileSync(path.join(project.path, 'contexto', 'briefing.md'), 'utf8');
    const codex = fs.readFileSync(path.join(project.path, 'AGENTS.md'), 'utf8');

    assert.equal(state.checkout.principal, '');
    assert.equal(state.checkout.secundario, '');
    assert.equal(state.offer.score, 7);
    assert.match(briefing, /Vídeo: preservar/);
    assert.match(briefing, /Checkout principal: será criado depois/);
    assert.match(codex, /copy-pronta-para-execucao/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('createProject rejects a project without confirmed asset rights', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hunter-hub-'));
  try {
    assert.throws(() => createProject({
      rootDir: root,
      offer: { title: 'Oferta', url: 'https://example.test' },
      brief: { projectName: 'Projeto sem autorização', rightsConfirmed: false }
    }), /Confirme o direito de uso/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
