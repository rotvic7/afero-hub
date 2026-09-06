'use strict';

const STORAGE_KEY = 'toolkit-entregaveis.demo.v1';

const ITEMS = Object.freeze([
  Object.freeze({ id: 'dia-1', day: 'DIA 01', title: 'Escolha uma tensão real', detail: 'Transforme uma dúvida recorrente em pauta.' }),
  Object.freeze({ id: 'dia-2', day: 'DIA 02', title: 'Declare sua posição', detail: 'Escreva a ideia que você quer defender.' }),
  Object.freeze({ id: 'dia-3', day: 'DIA 03', title: 'Mostre o processo', detail: 'Abra os bastidores de uma decisão prática.' }),
  Object.freeze({ id: 'dia-4', day: 'DIA 04', title: 'Ensine um recorte', detail: 'Resolva uma etapa pequena com clareza.' }),
  Object.freeze({ id: 'dia-5', day: 'DIA 05', title: 'Use uma prova concreta', detail: 'Apresente resultado, demonstração ou evidência.' }),
  Object.freeze({ id: 'dia-6', day: 'DIA 06', title: 'Responda uma objeção', detail: 'Remova um motivo comum para adiar a ação.' }),
  Object.freeze({ id: 'dia-7', day: 'DIA 07', title: 'Convide para o próximo passo', detail: 'Feche a semana com uma chamada específica.' })
]);

function createInitialState() {
  return {
    items: ITEMS,
    completedIds: []
  };
}

function normalizeSavedState(value) {
  const initial = createInitialState();
  if (!value || !Array.isArray(value.completedIds)) {
    return initial;
  }

  const requestedIds = new Set(
    value.completedIds.filter((id) => typeof id === 'string')
  );

  return {
    items: ITEMS,
    completedIds: ITEMS
      .map((item) => item.id)
      .filter((id) => requestedIds.has(id))
  };
}

function reduceState(state, action) {
  if (!action || typeof action.type !== 'string') {
    return state;
  }

  if (action.type === 'reset') {
    return {
      ...state,
      completedIds: []
    };
  }

  if (action.type !== 'toggle-item') {
    return state;
  }

  const itemExists = state.items.some((item) => item.id === action.id);
  if (!itemExists) {
    return state;
  }

  const isCompleted = state.completedIds.includes(action.id);
  return {
    ...state,
    completedIds: isCompleted
      ? state.completedIds.filter((id) => id !== action.id)
      : [...state.completedIds, action.id]
  };
}

function getProgress(state) {
  const completed = state.completedIds.length;
  const total = state.items.length;
  return {
    completed,
    total,
    percentage: total === 0 ? 0 : Math.round((completed / total) * 100)
  };
}

function loadState(storage) {
  if (!storage || typeof storage.getItem !== 'function') {
    return createInitialState();
  }

  try {
    const savedValue = storage.getItem(STORAGE_KEY);
    if (!savedValue) {
      return createInitialState();
    }
    return normalizeSavedState(JSON.parse(savedValue));
  } catch (_error) {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch (_removeError) {
      // A sessão continua em memória quando o armazenamento está indisponível.
    }
    return createInitialState();
  }
}

function saveState(storage, state) {
  if (!storage || typeof storage.setItem !== 'function') {
    return false;
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({
      completedIds: state.completedIds
    }));
    return true;
  } catch (_error) {
    return false;
  }
}

function createLessonButton(documentRef, item, completed) {
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.className = 'lesson-card';
  button.dataset.action = 'toggle-item';
  button.dataset.itemId = item.id;
  button.setAttribute('aria-pressed', String(completed));
  button.setAttribute('aria-label', `${item.day}: ${item.title}. ${completed ? 'Concluída' : 'Pendente'}.`);

  const day = documentRef.createElement('span');
  day.className = 'lesson-day';
  day.textContent = item.day;

  const copy = documentRef.createElement('span');
  copy.className = 'lesson-copy';

  const title = documentRef.createElement('strong');
  title.textContent = item.title;

  const detail = documentRef.createElement('span');
  detail.textContent = item.detail;

  const check = documentRef.createElement('span');
  check.className = 'lesson-check';
  check.setAttribute('aria-hidden', 'true');
  check.textContent = '✓';

  copy.append(title, detail);
  button.append(day, copy, check);
  return button;
}

function render(documentRef, state, message = '') {
  const lessonList = documentRef.getElementById('lessonList');
  const progressValue = documentRef.getElementById('progressValue');
  const progressLabel = documentRef.getElementById('progressLabel');
  const progressFraction = documentRef.getElementById('progressFraction');
  const statusMessage = documentRef.getElementById('statusMessage');

  if (!lessonList || !progressValue || !progressLabel || !progressFraction || !statusMessage) {
    return false;
  }

  const progress = getProgress(state);
  const fragment = documentRef.createDocumentFragment();

  for (const item of state.items) {
    fragment.append(createLessonButton(
      documentRef,
      item,
      state.completedIds.includes(item.id)
    ));
  }

  lessonList.replaceChildren(fragment);
  progressValue.max = progress.total;
  progressValue.value = progress.completed;
  progressValue.textContent = `${progress.completed} de ${progress.total}`;
  progressLabel.textContent = `${progress.completed} de ${progress.total} etapas concluídas`;
  progressFraction.textContent = `${progress.completed}/${progress.total}`;
  statusMessage.textContent = message;
  return true;
}

function installCopyDeterrent(documentRef) {
  documentRef.addEventListener('contextmenu', (event) => event.preventDefault());
  documentRef.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    const blockedSingle = event.ctrlKey && ['u', 's', 'c', 'a'].includes(key);
    const blockedDevTools = event.ctrlKey && event.shiftKey && ['i', 'j', 'c'].includes(key);
    const blockedFunctionKey = event.key === 'F12';

    if (blockedSingle || blockedDevTools || blockedFunctionKey) {
      event.preventDefault();
    }
  });
}

function boot(documentRef, storage) {
  if (!documentRef) {
    return null;
  }

  let state = loadState(storage);
  const lessonList = documentRef.getElementById('lessonList');
  const resetButton = documentRef.getElementById('resetProgress');

  if (!lessonList || !resetButton) {
    return null;
  }

  const commit = (action, successMessage) => {
    state = reduceState(state, action);
    const persisted = saveState(storage, state);
    const message = persisted
      ? successMessage
      : 'O progresso funciona nesta sessão, mas o navegador não permitiu salvá-lo.';
    render(documentRef, state, message);
  };

  lessonList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="toggle-item"]');
    if (!button || !lessonList.contains(button)) {
      return;
    }
    commit(
      { type: 'toggle-item', id: button.dataset.itemId },
      'Progresso atualizado neste navegador.'
    );
  });

  resetButton.addEventListener('click', () => {
    commit({ type: 'reset' }, 'Progresso reiniciado.');
  });

  installCopyDeterrent(documentRef);
  render(documentRef, state);

  return {
    getState: () => state
  };
}

const api = {
  createInitialState,
  normalizeSavedState,
  reduceState,
  getProgress,
  loadState,
  saveState,
  boot
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

if (typeof window !== 'undefined') {
  window.ToolkitEntregaveisDemo = api;
  window.addEventListener('DOMContentLoaded', () => {
    boot(window.document, window.localStorage);
  }, { once: true });
}
