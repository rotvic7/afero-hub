const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createProject, createServer } = require('../local-server.cjs');

function request(port, method, route) {
  return fetch(`http://127.0.0.1:${port}${route}`, { method }).then(async (response) => ({ status: response.status, body: await response.json() }));
}

test('local API lists a generated project and approves its copy for the page stage', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hunter-hub-api-'));
  const project = createProject({
    rootDir: root,
    offer: { title: 'Oferta de teste', url: 'https://example.test/oferta' },
    brief: { projectName: 'Fluxo API', audience: 'Público de teste', problem: 'Problema de teste', promise: 'Promessa de teste', rightsConfirmed: true }
  });
  const statePath = path.join(project.path, 'projeto.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  state.status = 'copy-em-revisao';
  state.artifacts.copy = 'resultados/copy/copy-v1.md';
  fs.writeFileSync(path.join(project.path, state.artifacts.copy), '# Copy de teste\n', 'utf8');
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

  const app = createServer({ rootDir: root });
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  const { port } = app.address();
  try {
    const listed = await request(port, 'GET', '/api/projects');
    assert.equal(listed.status, 200);
    assert.equal(listed.body.projects[0].slug, project.slug);
    assert.equal(listed.body.projects[0].status, 'copy-em-revisao');

    const approved = await request(port, 'POST', `/api/projects/${project.slug}/approve-copy`);
    assert.equal(approved.status, 200);
    assert.equal(approved.body.project.status, 'pagina-pronta-para-execucao');

    const updated = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.ok(updated.approvals.copy);
    assert.equal(updated.status, 'pagina-pronta-para-execucao');
  } finally {
    await new Promise((resolve) => app.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
