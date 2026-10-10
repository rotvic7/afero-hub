(function (global) {
  'use strict';
  const source = new URL('afero-csv-worker.js?v=1', document.currentScript.src);
  let active = null;
  let generation = 0;
  function cancel() {
    generation++;
    if (!active) return;
    active.worker.terminate();
    active.reject(new DOMException('Importação substituída.', 'AbortError'));
    active = null;
  }
  async function read(file) {
    cancel();
    const ownGeneration = generation;
    if (!file || !/\.csv$/i.test(file.name)) throw new Error('Selecione o arquivo .csv da caçada.');
    if (!file.size || file.size > 5 * 1024 * 1024) throw new Error('O CSV deve ter até 5 MiB.');
    if (source.protocol === 'file:') throw new Error('Para importar CSV, abra o hub pelo endereço HTTP do servidor local.');
    const buffer = await file.arrayBuffer();
    if (ownGeneration !== generation) throw new DOMException('Importação substituída.', 'AbortError');
    return new Promise((resolve, reject) => {
      let worker;
      try { worker = new Worker(source, { type: 'module' }); }
      catch { reject(new Error('Não foi possível iniciar a leitura do CSV neste navegador. Abra o hub pelo servidor local ou pelo site.')); return; }
      active = { worker, reject };
      function finish() { worker.terminate(); if (active && active.worker === worker) active = null; }
      const rows = [];
      worker.onmessage = ({ data }) => {
        if (data.rows) { rows.push(...data.rows); return; }
        finish();
        if (data.error) { const error = new Error(data.error.message); error.code = data.error.code; reject(error); }
        else resolve({ rows, meta: data.meta });
      };
      worker.onerror = () => { finish(); reject(new Error('Não foi possível processar o CSV. Tente novamente.')); };
      worker.postMessage(buffer, [buffer]);
    });
  }
  global.AferoCSV = Object.freeze({ read, cancel });
}(window));
