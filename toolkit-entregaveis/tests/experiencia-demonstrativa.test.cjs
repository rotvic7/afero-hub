const test = require('node:test');
const assert = require('node:assert/strict');
const demo = require('../assets/demonstracao/experiencia-demonstrativa.js');

test('estado inicial começa sem itens concluídos', () => {
  const state = demo.createInitialState();
  const progress = demo.getProgress(state);

  assert.deepEqual(state.completedIds, []);
  assert.equal(progress.completed, 0);
  assert.equal(progress.total, 7);
  assert.equal(progress.percentage, 0);
});

test('toggle-item adiciona e remove somente um identificador válido', () => {
  const initial = demo.createInitialState();
  const checked = demo.reduceState(initial, { type: 'toggle-item', id: 'dia-1' });
  const unchecked = demo.reduceState(checked, { type: 'toggle-item', id: 'dia-1' });
  const ignored = demo.reduceState(initial, { type: 'toggle-item', id: 'inexistente' });

  assert.deepEqual(checked.completedIds, ['dia-1']);
  assert.deepEqual(initial.completedIds, []);
  assert.deepEqual(unchecked.completedIds, []);
  assert.deepEqual(ignored, initial);
});

test('reset limpa o progresso e preserva o catálogo', () => {
  const state = {
    ...demo.createInitialState(),
    completedIds: ['dia-1', 'dia-2']
  };
  const reset = demo.reduceState(state, { type: 'reset' });

  assert.deepEqual(reset.completedIds, []);
  assert.deepEqual(reset.items, state.items);
  assert.notEqual(reset, state);
});

test('normalização remove identificadores desconhecidos e duplicados', () => {
  const state = demo.normalizeSavedState({
    completedIds: ['dia-1', 'inexistente', 'dia-1', 8]
  });

  assert.deepEqual(state.completedIds, ['dia-1']);
  assert.equal(state.items.length, 7);
});

test('falha no armazenamento mantém a experiência utilizável', () => {
  const brokenStorage = {
    getItem() { throw new Error('indisponível'); },
    setItem() { throw new Error('indisponível'); },
    removeItem() { throw new Error('indisponível'); }
  };

  assert.deepEqual(demo.loadState(brokenStorage).completedIds, []);
  assert.equal(demo.saveState(brokenStorage, demo.createInitialState()), false);
});

test('estado corrompido é removido antes de restaurar o início', () => {
  const memory = new Map([['toolkit-entregaveis.demo.v1', '{quebrado']]);
  const storage = {
    getItem(key) { return memory.get(key) ?? null; },
    setItem(key, value) { memory.set(key, value); },
    removeItem(key) { memory.delete(key); }
  };

  const state = demo.loadState(storage);

  assert.deepEqual(state.completedIds, []);
  assert.equal(memory.has('toolkit-entregaveis.demo.v1'), false);
});
